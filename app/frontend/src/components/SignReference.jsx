import React, { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, X } from 'lucide-react'
import { HAND_CONNECTIONS, POSE_CONNECTIONS } from '../services/handTracker'
import { API_BASE_URL } from '../services/signRecognizer'

// Upper-body pose points worth drawing (face, shoulders, arms)
const POSE_POINTS = [0, 2, 5, 7, 8, 11, 12, 13, 14, 15, 16]
const UPPER_POSE_CONNECTIONS = POSE_CONNECTIONS.filter(([a, b]) => POSE_POINTS.includes(a) && POSE_POINTS.includes(b))
const HAND_COLOURS = ['#7c3aed', '#f97316'] // signer's left, right

/**
 * Plays one real training example of a sign as a moving skeleton (landmarks only, no video),
 * mirrored like the user's own camera view so it can be copied directly.
 */
export default function SignReference({ sign, testCorrect, testClips, onClose, bare = false, onAvailability, staticTracking = false, staticPose = false }) {
  const canvasRef = useRef(null)
  const [clip, setClip] = useState(null)
  const [error, setError] = useState(null)
  const [playing, setPlaying] = useState(true)
  const [frameIndex, setFrameIndex] = useState(0)
  const frameIndexRef = useRef(0)
  const playingRef = useRef(true)

  useEffect(() => { playingRef.current = playing }, [playing])

  useEffect(() => {
    frameIndexRef.current = 0
    setFrameIndex(0)
    setPlaying(true)
  }, [clip])

  useEffect(() => {
    let cancelled = false
    setClip(null)
    setError(null)
    const routes = staticTracking ? ['static-reference'] : staticPose ? ['reference', 'static-reference'] : ['reference']
    const load = async (index = 0) => {
      const r = await fetch(`${API_BASE_URL}/${routes[index]}/${encodeURIComponent(sign)}`)
      if (r.ok) return r.json()
      const body = await r.json().catch(() => ({}))
      if (index + 1 < routes.length) return load(index + 1)
      throw new Error(body.detail || 'No tracked reference clip is available for this word.')
    }
    load()
      .then((body) => { if (!cancelled) { setClip(body); onAvailability?.(true) } })
      .catch((err) => { if (!cancelled) { setError(err.message); onAvailability?.(false) } })
    return () => {
      cancelled = true
    }
  }, [sign, staticTracking, staticPose])

  useEffect(() => {
    if (!clip || !canvasRef.current) return undefined
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const aspect = clip.width && clip.height ? clip.width / clip.height : 4 / 3
    // Fit the whole clip's upper body into the canvas (pixel space, aspect-correct)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    const toPx = (p) => [p[0] * aspect, p[1]]
    for (const f of clip.frames) {
      const pts = [...(f.pose ? POSE_POINTS.map((i) => f.pose[i]) : []), ...f.hands.filter(Boolean).flat()]
      for (const p of pts) {
        const [x, y] = toPx(p)
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y)
      }
    }
    const pad = 0.08
    const scale = Math.min(canvas.width / ((maxX - minX) * (1 + 2 * pad)), canvas.height / ((maxY - minY) * (1 + 2 * pad)))
    const offX = (canvas.width - (maxX - minX) * scale) / 2
    const offY = (canvas.height - (maxY - minY) * scale) / 2
    const project = (p) => {
      const [x, y] = toPx(p)
      return [canvas.width - (offX + (x - minX) * scale), offY + (y - minY) * scale] // mirrored
    }
    const line = (a, b) => {
      ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke()
    }

    let last = 0
    let drawnIndex = -1
    let raf = 0
    const step = 1000 / (clip.fps || 15)
    const draw = (now) => {
      raf = requestAnimationFrame(draw)
      if (playingRef.current && now - last >= step) {
        last = now
        frameIndexRef.current = (frameIndexRef.current + 1) % clip.frames.length
        setFrameIndex(frameIndexRef.current)
      }
      const index = frameIndexRef.current
      if (index === drawnIndex) return
      drawnIndex = index
      const f = clip.frames[index]
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (f.pose) {
        ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 3
        for (const [a, b] of UPPER_POSE_CONNECTIONS) line(project(f.pose[a]), project(f.pose[b]))
        const facePoints = [
          [2, 'eye', '#facc15'], [5, 'eye', '#facc15'],
          [7, 'ear', '#a78bfa'], [8, 'ear', '#a78bfa'],
          [9, 'mouth', '#fb7185'], [10, 'mouth', '#fb7185']
        ]
        for (const [index, , colour] of facePoints) {
          if ((f.pose[index]?.[3] ?? 0) < 0.2) continue
          const [x, y] = project(f.pose[index])
          ctx.fillStyle = colour
          ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill()
        }
        ctx.fillStyle = '#64748b'
        const [nx, ny] = project(f.pose[0])
        ctx.beginPath(); ctx.arc(nx, ny, 5, 0, Math.PI * 2); ctx.fill()
      }
      f.hands.forEach((hand, h) => {
        if (!hand) return
        ctx.strokeStyle = HAND_COLOURS[h]; ctx.lineWidth = 2.5
        for (const [a, b] of HAND_CONNECTIONS) line(project(hand[a]), project(hand[b]))
        ctx.fillStyle = HAND_COLOURS[h]
        for (const p of hand) {
          const [x, y] = project(p)
          ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill()
        }
        const normal = f.palmDirections?.[h]
        if (normal) {
          const [ox, oy] = project([
            (hand[0][0] + (hand[5][0] + hand[17][0]) / 2) / 2,
            (hand[0][1] + (hand[5][1] + hand[17][1]) / 2) / 2
          ])
          const planar = Math.hypot(normal[0], normal[1])
          if (planar > 0.08) {
            const ex = ox - normal[0] / planar * 28 // project() mirrors the x direction
            const ey = oy - normal[1] / planar * 28
            ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 3
            ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke()
            ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(ex, ey, 3, 0, 2 * Math.PI); ctx.fill()
          }
        }
      })
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [clip])

  const moveFrame = (delta) => {
    setPlaying(false)
    const next = Math.max(0, Math.min((clip?.frames.length || 1) - 1, frameIndexRef.current + delta))
    frameIndexRef.current = next
    setFrameIndex(next)
  }

  if (bare) {
    // Player only (quizzes: no word name, no caption)
    return error ? (
      <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{error}</p>
    ) : (
      <canvas ref={canvasRef} width={320} height={240} role="img" aria-label="Sign example (skeleton animation)"
              className="w-full rounded-xl bg-sl-ink" />
    )
  }

  const trackingMetrics = clip?.kind === 'static-landmark-example' ? clip.frames?.[0]?.metrics : null
  const faceDistances = trackingMetrics?.nearest_face_regions || {}
  const formatDistance = (value) => (Number.isFinite(value) ? `${value.toFixed(2)} shoulder widths` : 'not available')

  return (
    <div className="rounded-2xl border border-mudra-lavender-200 bg-white p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-mudra-indigo-900">How to sign "{clip?.label || sign}"</span>
        <button type="button" onClick={onClose} aria-label="Close example" className="text-mudra-indigo-500 hover:text-mudra-indigo-900">
          <X className="w-4 h-4" />
        </button>
      </div>
      {error ? (
        <p className="text-xs text-amber-800">{error}</p>
      ) : (
        <>
          <canvas ref={canvasRef} width={480} height={360} role="img" aria-label={`Tracked bone-segment animation for ${clip?.label || sign}`} className="w-full rounded-xl bg-mudra-indigo-950" />
          {clip && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-mudra-indigo-700">Reference video · tracked bone segments</span>
                <span className="text-[11px] tabular-nums text-mudra-indigo-600">{frameIndex + 1} / {clip.frames.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => { frameIndexRef.current = 0; setFrameIndex(0); setPlaying(true) }}
                        aria-label="Restart sign example" title="Restart" className="rounded-lg p-2 text-mudra-indigo-700 hover:bg-mudra-lavender-100">
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => moveFrame(-1)} aria-label="Previous frame"
                        className="rounded-lg p-2 text-mudra-indigo-700 hover:bg-mudra-lavender-100">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => setPlaying((value) => !value)} aria-label={playing ? 'Pause sign example' : 'Play sign example'}
                        className="rounded-lg p-2 text-mudra-indigo-700 hover:bg-mudra-lavender-100">
                  {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <button type="button" onClick={() => moveFrame(1)} aria-label="Next frame"
                        className="rounded-lg p-2 text-mudra-indigo-700 hover:bg-mudra-lavender-100">
                  <ChevronRight className="h-4 w-4" />
                </button>
                <input type="range" min="0" max={Math.max(clip.frames.length - 1, 0)} value={frameIndex}
                       aria-label="Scrub sign example" onChange={(event) => {
                         const next = Number(event.target.value)
                         frameIndexRef.current = next
                         setFrameIndex(next)
                         setPlaying(false)
                       }} className="min-w-0 flex-1 accent-violet-600" />
              </div>
            </div>
          )}
        </>
      )}
      <p className="text-[11px] text-mudra-indigo-600">
        {clip?.kind === 'static-landmark-example'
          ? 'Held-out static tracker example. Yellow = eyes, purple = ears, pink = mouth, red arrow = palm direction.'
          : `Tracked skeleton from this sign's ${clip?.source || 'training'} reference video, mirrored like your camera. Purple = signer's left hand, orange = right hand; gray = shoulders and arms.`}
        {testClips ? ` In tests the model got this word right ${testCorrect} of ${testClips} times.` : ''}
      </p>
      {trackingMetrics && (
        <p className="text-[11px] text-mudra-indigo-700">
          Tracker: {trackingMetrics.hands} hand(s), {trackingMetrics.extended_fingers} extended finger(s); wrist to torso {formatDistance(trackingMetrics.wrist_to_torso)}; nearest eye {formatDistance(faceDistances.eyes)}, ear {formatDistance(faceDistances.ears)}, mouth {formatDistance(faceDistances.mouth)}.
        </p>
      )}
    </div>
  )
}
