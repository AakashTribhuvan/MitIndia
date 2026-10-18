/**
 * MUDRA Hand Tracker Service
 * MediaPipe Tasks (HandLandmarker + PoseLandmarker) on the webcam, matching the
 * landmark pipeline used to train the recognition model. Models and WASM are served
 * locally from /models and /wasm, so no camera data or model download leaves the device.
 *
 * Results passed to onResults:
 *   multiHandLandmarks  Array<Array<{x,y,z}>>   up to 2 hands, 21 points each
 *   multiHandedness     Array<{label, score}>   MediaPipe labels (assume a mirrored image)
 *   poseLandmarks       Array<{x,y,z,visibility}> | null   33 body points
 *   width, height       video size in pixels
 *   diag                {cameraFps, trackingFps, inferenceMs, delegate}: what limits the frame rate
 */

import { FaceLandmarker, FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision'

const WASM_PATH = '/wasm'
const HAND_MODEL = '/models/hand_landmarker.task'
const POSE_MODEL = '/models/pose_landmarker_lite.task'

// MediaPipe Hand Connection Pairs
export const HAND_CONNECTIONS = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Ring
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Palm Base Knuckle Bridge
  [5, 9], [9, 13], [13, 17]
]

// Upper-body pose connections (shoulders, arms, face outline)
export const POSE_CONNECTIONS = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24]
]

async function createWithFallback(factory, vision, options) {
  try {
    const landmarker = await factory.createFromOptions(vision, { ...options, baseOptions: { ...options.baseOptions, delegate: 'GPU' } })
    return { landmarker, delegate: 'GPU' }
  } catch (gpuError) {
    console.warn('GPU delegate unavailable, falling back to CPU:', gpuError)
    const landmarker = await factory.createFromOptions(vision, { ...options, baseOptions: { ...options.baseOptions, delegate: 'CPU' } })
    return { landmarker, delegate: 'CPU' }
  }
}

const ema = (prev, value, k = 0.1) => (prev ? (1 - k) * prev + k * value : value)

// Resolutions offered in the UI (the browser may negotiate another size; the video reports the real one)
export const CAMERA_RESOLUTIONS = { 480: { width: 640, height: 480 }, 720: { width: 1280, height: 720 } }

/** Why the camera could not start, from the getUserMedia error name. */
export function cameraErrorKind(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'not_found'
    case 'NotReadableError':
    case 'AbortError':
      return 'in_use'
    default:
      return 'unknown'
  }
}

export function cameraErrorMessage(error, messages) {
  const kind = cameraErrorKind(error)
  const message = messages[kind]
  if (kind !== 'unknown') return message

  const detail = [error?.name, error?.message].filter(Boolean).join(': ').slice(0, 200)
  return detail ? `${message} (${detail})` : message
}

const BLACK_LUMA = 8 // mean brightness (0-255) below which a frame counts as black
const FROZEN_S = 3 // no new video frame for this long = frozen feed
// Damp landmark jitter before drawing or sending a frame to the recognizer.
const LANDMARK_CURRENT_WEIGHT = 0.55
const POSE_TRACK_POINTS = [2, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 23, 24]

function smoothPoint(previous, current) {
  return {
    x: previous.x * (1 - LANDMARK_CURRENT_WEIGHT) + current.x * LANDMARK_CURRENT_WEIGHT,
    y: previous.y * (1 - LANDMARK_CURRENT_WEIGHT) + current.y * LANDMARK_CURRENT_WEIGHT,
    z: (previous.z ?? 0) * (1 - LANDMARK_CURRENT_WEIGHT) + (current.z ?? 0) * LANDMARK_CURRENT_WEIGHT,
    ...(current.visibility == null ? {} : { visibility: current.visibility })
  }
}

function smoothLandmarks(previous, current) {
  if (!previous || previous.length !== current.length) return current.map((point) => ({ ...point }))
  return current.map((point, index) => smoothPoint(previous[index], point))
}

function palmNormal(worldLandmarks, handedness) {
  if (!worldLandmarks || worldLandmarks.length < 18) return null
  const wrist = worldLandmarks[0]
  const index = worldLandmarks[5]
  const pinky = worldLandmarks[17]
  const a = [index.x - wrist.x, index.y - wrist.y, index.z - wrist.z]
  const b = [pinky.x - wrist.x, pinky.y - wrist.y, pinky.z - wrist.z]
  const normal = [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ]
  const length = Math.hypot(...normal)
  if (length <= 1e-8) return null
  // The index-to-pinky winding reverses between anatomical hands. Canonicalize that
  // winding so equal palm poses do not look like opposite directions on the right hand.
  const sideSign = handedness === 'Right' ? -1 : 1
  return normal.map((value) => value / length * sideSign)
}

class HandTrackerService {
  constructor() {
    this.handLandmarker = null
    this.poseLandmarker = null
    this.videoElement = null
    this.stream = null
    this.isTracking = false
    this.animationFrameId = null
    this.onResultsCallback = null
    this.initializationPromise = null
    this.lastVideoTime = -1
    this.lastTimestamp = 0
    this.delegate = null // 'GPU' or 'CPU' (CPU if either landmarker fell back)
    this.cameraFps = 0 // frames the camera delivers
    this.inferenceMs = 0 // hand + pose time per processed frame
    this.healthTimer = null
    this.onIssueCallback = null // called with 'black' | 'frozen' | null when the feed's health changes
    this.issue = null
    this.smoothedHands = new Map()
    this.smoothedWorldHands = new Map()
    this.smoothedPose = null
  }

  /** Video inputs ({deviceId, label}); labels are empty until camera permission has been granted. */
  async listCameras() {
    if (!navigator.mediaDevices?.enumerateDevices) return []
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.filter((d) => d.kind === 'videoinput').map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }))
  }

  /** Label and size of the running camera, for diagnostics. */
  cameraInfo() {
    const track = this.stream?.getVideoTracks?.()[0]
    const s = track?.getSettings?.() || {}
    return { label: track?.label || '', width: s.width || 0, height: s.height || 0, frameRate: s.frameRate || 0 }
  }

  /**
   * Loads the hand and pose landmarkers once (shared by Practice and Communicate).
   */
  async initialize() {
    if (this.handLandmarker && this.poseLandmarker) return this
    if (this.initializationPromise) return this.initializationPromise

    this.initializationPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_PATH)
      const hands = await createWithFallback(HandLandmarker, vision, {
        baseOptions: { modelAssetPath: HAND_MODEL },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.25,
        minHandPresenceConfidence: 0.25,
        minTrackingConfidence: 0.25
      })
      const pose = await createWithFallback(PoseLandmarker, vision, {
        baseOptions: { modelAssetPath: POSE_MODEL },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.35,
        minPosePresenceConfidence: 0.35,
        minTrackingConfidence: 0.35
      })
      this.handLandmarker = hands.landmarker
      this.poseLandmarker = pose.landmarker
      this.delegate = hands.delegate === 'GPU' && pose.delegate === 'GPU' ? 'GPU' : 'CPU'
      return this
    })().catch((error) => {
      this.initializationPromise = null
      console.error('Failed to initialize MediaPipe landmarkers:', error)
      throw error
    })

    return this.initializationPromise
  }

  /**
   * Starts user webcam and landmark tracking
   */
  async startCamera(videoElement, onResults, { deviceId = '', resolution = 480, onIssue = null } = {}) {
    if (!videoElement) throw new Error('Video element is required')

    this.videoElement = videoElement
    this.onResultsCallback = onResults
    this.onIssueCallback = onIssue

    await this.initialize()

    if (!navigator.mediaDevices?.getUserMedia) {
      const err = new Error('This browser cannot open a camera (needs a secure page: localhost or https).')
      err.name = 'NotFoundError'
      throw err
    }
    const size = CAMERA_RESOLUTIONS[resolution] || CAMERA_RESOLUTIONS[480]
    const video = { width: { ideal: size.width }, height: { ideal: size.height }, frameRate: { ideal: 30 } }
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { ...video, deviceId: { exact: deviceId } } : { ...video, facingMode: 'user' },
        audio: false
      })
    } catch (error) {
      if (!deviceId || error?.name !== 'OverconstrainedError') throw error
      // the remembered camera is gone (unplugged / renamed): fall back to the default camera
      stream = await navigator.mediaDevices.getUserMedia({ video: { ...video, facingMode: 'user' }, audio: false })
    }
    this.stream = stream
    this.videoElement.srcObject = stream
    await this.videoElement.play()

    this.isTracking = true
    this.smoothedHands.clear()
    this.smoothedWorldHands.clear()
    this.smoothedPose = null
    this.lastVideoTime = -1
    this._countCameraFrames()
    this._watchHealth()
    this._processVideoLoop()
    return true
  }

  /**
   * Checks the feed every second: a camera can deliver frames that are black (lens cover, privacy
   * shutter, another app holding the sensor) or stop delivering frames at all (frozen driver).
   */
  _watchHealth() {
    clearInterval(this.healthTimer)
    const probe = document.createElement('canvas')
    probe.width = 32
    probe.height = 24
    const ctx = probe.getContext('2d', { willReadFrequently: true })
    let lastTime = -1
    let lastChange = performance.now()
    this.issue = null
    this.healthTimer = setInterval(() => {
      const video = this.videoElement
      if (!this.isTracking || !video) return
      const now = performance.now()
      if (video.currentTime !== lastTime) {
        lastTime = video.currentTime
        lastChange = now
      }
      let issue = null
      if (now - lastChange > FROZEN_S * 1000) {
        issue = 'frozen'
      } else if (ctx && video.readyState >= 2) {
        ctx.drawImage(video, 0, 0, probe.width, probe.height)
        const px = ctx.getImageData(0, 0, probe.width, probe.height).data
        let sum = 0
        for (let i = 0; i < px.length; i += 4) sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
        if (sum / (px.length / 4) < BLACK_LUMA) issue = 'black'
      }
      if (issue !== this.issue) {
        this.issue = issue
        this.onIssueCallback?.(issue)
      }
    }, 1000)
  }

  /**
   * Counts the frames the camera delivers, independent of how many are tracked: a webcam in a dim
   * room lowers its own frame rate, which no amount of GPU fixes.
   */
  _countCameraFrames() {
    const video = this.videoElement
    if (!video?.requestVideoFrameCallback) {
      this.cameraFps = this.stream?.getVideoTracks?.()[0]?.getSettings?.().frameRate || 0
      return
    }
    let last = 0
    const onFrame = (now) => {
      if (!this.isTracking || this.videoElement !== video) return
      if (last) this.cameraFps = ema(this.cameraFps, 1000 / Math.max(now - last, 1))
      last = now
      video.requestVideoFrameCallback(onFrame)
    }
    video.requestVideoFrameCallback(onFrame)
  }

  /**
   * Continuous processing loop: one hand + pose inference per new video frame.
   */
  _processVideoLoop() {
    if (!this.isTracking || !this.videoElement) return

    const video = this.videoElement
    if (video.readyState >= 2 && !video.paused && video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = video.currentTime
      // Landmarkers require strictly increasing timestamps
      const timestamp = Math.max(Math.round(performance.now()), this.lastTimestamp + 1)
      this.lastTimestamp = timestamp
      try {
        const started = performance.now()
        const hands = this.handLandmarker.detectForVideo(video, timestamp)
        // The body moves slowly: pose every other frame halves its cost and keeps hands at full rate
        this.frameCount = (this.frameCount || 0) + 1
        if (this.frameCount % 2 === 1 || !this.lastPose) {
          this.lastPose = this.poseLandmarker.detectForVideo(video, timestamp)
        }
        const pose = this.lastPose
        this.inferenceMs = ema(this.inferenceMs, performance.now() - started)
        const dt = this.lastFrameAt ? (timestamp - this.lastFrameAt) / 1000 : 0
        this.lastFrameAt = timestamp
        if (dt > 0) this.fps = ema(this.fps, 1 / dt)
        const rawHands = hands.landmarks || []
        const rawWorldHands = hands.worldLandmarks || []
        const handedness = (hands.handedness || hands.handednesses || []).map((categories) => ({
            label: categories?.[0]?.categoryName,
            score: categories?.[0]?.score ?? 0
          }))
        const currentHandKeys = new Set()
        const multiHandWorldLandmarks = rawHands.map((_, index) => {
          const key = handedness[index]?.label || `hand-${index}`
          const world = rawWorldHands[index]
          if (!world) return null
          const smoothed = smoothLandmarks(this.smoothedWorldHands.get(key), world)
          this.smoothedWorldHands.set(key, smoothed)
          return smoothed
        })
        const multiHandLandmarks = rawHands.map((landmarks, index) => {
          const key = handedness[index]?.label || `hand-${index}`
          currentHandKeys.add(key)
          const smoothed = smoothLandmarks(this.smoothedHands.get(key), landmarks)
          this.smoothedHands.set(key, smoothed)
          return smoothed
        })
        for (const key of this.smoothedHands.keys()) {
          if (!currentHandKeys.has(key)) this.smoothedHands.delete(key)
        }
        for (const key of this.smoothedWorldHands.keys()) {
          if (!currentHandKeys.has(key)) this.smoothedWorldHands.delete(key)
        }
        const rawPose = pose.landmarks?.[0] || null
        this.smoothedPose = rawPose ? smoothLandmarks(this.smoothedPose, rawPose) : null
        this.onResultsCallback?.({
          multiHandLandmarks,
          multiHandWorldLandmarks,
          palmDirections: multiHandWorldLandmarks.map((hand, index) => palmNormal(hand, handedness[index]?.label)),
          multiHandedness: handedness,
          poseLandmarks: this.smoothedPose,
          width: video.videoWidth,
          height: video.videoHeight,
          timestamp,
          fps: this.fps || 0,
          diag: {
            cameraFps: Math.round(this.cameraFps || 0),
            trackingFps: Math.round(this.fps || 0),
            inferenceMs: Math.round(this.inferenceMs || 0),
            delegate: this.delegate,
            camera: this.stream?.getVideoTracks?.()[0]?.label || ''
          }
        })
      } catch (err) {
        console.warn('Frame processing exception:', err)
      }
    }

    this.animationFrameId = requestAnimationFrame(() => this._processVideoLoop())
  }

  /**
   * Stops camera stream and tracking loop
   */
  stopCamera() {
    this.isTracking = false
    clearInterval(this.healthTimer)
    this.healthTimer = null
    this.issue = null
    this.lastPose = null
    this.smoothedHands.clear()
    this.smoothedWorldHands.clear()
    this.smoothedPose = null
    this.lastFrameAt = 0
    this.fps = 0
    this.cameraFps = 0
    this.inferenceMs = 0

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null
    }
  }

  /**
   * Renders the upper-body pose as a faint guide behind the hands.
   */
  drawPose(ctx, poseLandmarks, width, height, mirror = true) {
    if (!ctx || !poseLandmarks || poseLandmarks.length < 25) return

    ctx.save()
    if (mirror) {
      ctx.translate(width, 0)
      ctx.scale(-1, 1)
    }
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.strokeStyle = 'rgba(253, 186, 116, 0.55)'
    POSE_CONNECTIONS.forEach(([i, j]) => {
      const p1 = poseLandmarks[i]
      const p2 = poseLandmarks[j]
      if (!p1 || !p2 || (p1.visibility ?? 1) < 0.5 || (p2.visibility ?? 1) < 0.5) return
      ctx.beginPath()
      ctx.moveTo(p1.x * width, p1.y * height)
      ctx.lineTo(p2.x * width, p2.y * height)
      ctx.stroke()
    })
    POSE_TRACK_POINTS.forEach((index) => {
      const point = poseLandmarks[index]
      if (!point || (point.visibility ?? 1) < 0.35) return
      ctx.beginPath()
      ctx.arc(point.x * width, point.y * height, [11, 12, 23, 24].includes(index) ? 2.5 : 1.8, 0, 2 * Math.PI)
      ctx.fillStyle = [7, 8].includes(index) ? '#60A5FA'
        : [2, 5, 9, 10].includes(index) ? '#F472B6' : '#FDE047'
      ctx.fill()
    })
    ctx.restore()
  }

  /** Draw detailed eye and lip contours from FaceLandmarker; ears come from PoseLandmarker. */
  drawFace(ctx, faceLandmarks, width, height, mirror = true) {
    if (!ctx || !faceLandmarks?.length) return
    ctx.save()
    if (mirror) {
      ctx.translate(width, 0)
      ctx.scale(-1, 1)
    }
    ctx.strokeStyle = 'rgba(244, 114, 182, 0.72)'
    ctx.lineWidth = 1.1
    FaceLandmarker.FACE_LANDMARKS_CONTOURS.forEach(({ start, end }) => {
      const first = faceLandmarks[start]
      const second = faceLandmarks[end]
      if (!first || !second) return
      ctx.beginPath()
      ctx.moveTo(first.x * width, first.y * height)
      ctx.lineTo(second.x * width, second.y * height)
      ctx.stroke()
    })
    ctx.restore()
  }

  /** Show a projected cue for the palm-plane normal estimated from world hand landmarks. */
  drawPalmDirections(ctx, hands, directions, width, height, mirror = true) {
    if (!ctx || !hands?.length || !directions?.length) return
    ctx.save()
    if (mirror) {
      ctx.translate(width, 0)
      ctx.scale(-1, 1)
    }
    directions.forEach((normal, index) => {
      const hand = hands[index]
      if (!normal || !hand || Math.hypot(...normal) < 0.1) return
      const origin = {
        x: (hand[0].x + (hand[5].x + hand[17].x) / 2) * width / 2,
        y: (hand[0].y + (hand[5].y + hand[17].y) / 2) * height / 2
      }
      const planarLength = Math.hypot(normal[0], normal[1])
      ctx.strokeStyle = '#F43F5E'
      ctx.fillStyle = '#F43F5E'
      ctx.lineWidth = 3
      if (planarLength >= 0.08) {
        const endX = origin.x + normal[0] / planarLength * 34
        const endY = origin.y - normal[1] / planarLength * 34
        ctx.beginPath()
        ctx.moveTo(origin.x, origin.y)
        ctx.lineTo(endX, endY)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(endX, endY, 4, 0, 2 * Math.PI)
        ctx.fill()
      } else {
        ctx.beginPath()
        ctx.arc(origin.x, origin.y, 8, 0, 2 * Math.PI)
        ctx.fill()
      }
      ctx.font = '10px sans-serif'
      ctx.fillStyle = '#FFFFFF'
      ctx.lineWidth = 2
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)'
      const directionLabel = `palm n=(${normal.map((value) => value.toFixed(1)).join(',')})`
      ctx.strokeText(directionLabel, origin.x + 5, origin.y + 15)
      ctx.fillText(directionLabel, origin.x + 5, origin.y + 15)
    })
    ctx.restore()
  }

  /**
   * Renders high-fidelity MUDRA-styled hand skeleton on HTML5 canvas
   */
  drawSkeleton(ctx, landmarks, width, height, mirror = true) {
    if (!ctx || !landmarks || landmarks.length < 21) return

    ctx.save()
    if (mirror) {
      ctx.translate(width, 0)
      ctx.scale(-1, 1)
    }

    // 1. Draw Bone Connections with elegant gradient stroke
    ctx.lineWidth = 3.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    HAND_CONNECTIONS.forEach(([i, j]) => {
      const p1 = landmarks[i]
      const p2 = landmarks[j]
      if (!p1 || !p2) return

      const x1 = p1.x * width
      const y1 = p1.y * height
      const x2 = p2.x * width
      const y2 = p2.y * height

      // Gradient from Soft Lavender to Peach
      const gradient = ctx.createLinearGradient(x1, y1, x2, y2)
      gradient.addColorStop(0, 'rgba(139, 92, 246, 0.85)') // #8B5CF6
      gradient.addColorStop(1, 'rgba(253, 186, 116, 0.90)') // #FDBA74

      ctx.strokeStyle = gradient
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    })

    // 2. Draw Keypoint Nodes (Joint Dots)
    landmarks.forEach((p, idx) => {
      const x = p.x * width
      const y = p.y * height

      const isFingertip = [4, 8, 12, 16, 20].includes(idx)
      const isWrist = idx === 0

      // Outer soft glow aura
      ctx.beginPath()
      ctx.arc(x, y, isFingertip ? 3.5 : isWrist ? 3 : 2.4, 0, 2 * Math.PI)
      ctx.fillStyle = isFingertip
        ? 'rgba(249, 115, 22, 0.35)'
        : 'rgba(139, 92, 246, 0.25)'
      ctx.fill()

      // Inner solid node
      ctx.beginPath()
      ctx.arc(x, y, isFingertip ? 2.4 : isWrist ? 2 : 1.6, 0, 2 * Math.PI)
      ctx.fillStyle = isFingertip ? '#F97316' : '#8B5CF6'
      ctx.strokeStyle = '#FFFFFF'
      ctx.lineWidth = 0.9
      ctx.fill()
      ctx.stroke()
    })

    ctx.restore()
  }
}

export const handTracker = new HandTrackerService()
export default handTracker
