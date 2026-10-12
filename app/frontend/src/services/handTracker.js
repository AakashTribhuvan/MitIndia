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
 */

import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision'

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
    return await factory.createFromOptions(vision, { ...options, baseOptions: { ...options.baseOptions, delegate: 'GPU' } })
  } catch (gpuError) {
    console.warn('GPU delegate unavailable, falling back to CPU:', gpuError)
    return factory.createFromOptions(vision, { ...options, baseOptions: { ...options.baseOptions, delegate: 'CPU' } })
  }
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
  }

  /**
   * Loads the hand and pose landmarkers once (shared by Practice and Communicate).
   */
  async initialize() {
    if (this.handLandmarker && this.poseLandmarker) return this
    if (this.initializationPromise) return this.initializationPromise

    this.initializationPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_PATH)
      this.handLandmarker = await createWithFallback(HandLandmarker, vision, {
        baseOptions: { modelAssetPath: HAND_MODEL },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      })
      this.poseLandmarker = await createWithFallback(PoseLandmarker, vision, {
        baseOptions: { modelAssetPath: POSE_MODEL },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5
      })
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
  async startCamera(videoElement, onResults) {
    if (!videoElement) throw new Error('Video element is required')

    this.videoElement = videoElement
    this.onResultsCallback = onResults

    await this.initialize()

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 }, facingMode: 'user' },
      audio: false
    })
    this.stream = stream
    this.videoElement.srcObject = stream
    await this.videoElement.play()

    this.isTracking = true
    this.lastVideoTime = -1
    this._processVideoLoop()
    return true
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
        const hands = this.handLandmarker.detectForVideo(video, timestamp)
        // The body moves slowly: pose every other frame halves its cost and keeps hands at full rate
        this.frameCount = (this.frameCount || 0) + 1
        if (this.frameCount % 2 === 1 || !this.lastPose) {
          this.lastPose = this.poseLandmarker.detectForVideo(video, timestamp)
        }
        const pose = this.lastPose
        const dt = this.lastFrameAt ? (timestamp - this.lastFrameAt) / 1000 : 0
        this.lastFrameAt = timestamp
        if (dt > 0) this.fps = this.fps ? 0.9 * this.fps + 0.1 / dt : 1 / dt
        this.onResultsCallback?.({
          multiHandLandmarks: hands.landmarks || [],
          multiHandedness: (hands.handedness || hands.handednesses || []).map((categories) => ({
            label: categories?.[0]?.categoryName,
            score: categories?.[0]?.score ?? 0
          })),
          poseLandmarks: pose.landmarks?.[0] || null,
          width: video.videoWidth,
          height: video.videoHeight,
          timestamp,
          fps: this.fps || 0
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
    this.lastPose = null
    this.lastFrameAt = 0
    this.fps = 0

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
      ctx.arc(x, y, isFingertip ? 7 : isWrist ? 6 : 4.5, 0, 2 * Math.PI)
      ctx.fillStyle = isFingertip
        ? 'rgba(249, 115, 22, 0.35)'
        : 'rgba(139, 92, 246, 0.25)'
      ctx.fill()

      // Inner solid node
      ctx.beginPath()
      ctx.arc(x, y, isFingertip ? 4.5 : isWrist ? 4 : 3, 0, 2 * Math.PI)
      ctx.fillStyle = isFingertip ? '#F97316' : '#8B5CF6'
      ctx.strokeStyle = '#FFFFFF'
      ctx.lineWidth = 1.5
      ctx.fill()
      ctx.stroke()
    })

    ctx.restore()
  }
}

export const handTracker = new HandTrackerService()
export default handTracker
