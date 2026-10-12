import React, { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
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
export default function SignReference({ sign, testCorrect, testClips, onClose }) {
  const canvasRef = useRef(null)
  const [clip, setClip] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setClip(null)
    setError(null)
    fetch(`${API_BASE_URL}/reference/${encodeURIComponent(sign)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('No example available for this word'))))
      .then((body) => !cancelled && setClip(body))
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [sign])

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

    let i = 0
    let last = 0
    let raf = 0
    const step = 1000 / (clip.fps || 15)
    const draw = (now) => {
      raf = requestAnimationFrame(draw)
      if (now - last < step) return
      last = now
      const f = clip.frames[i]
      i = (i + 1) % clip.frames.length
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (f.pose) {
        ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 3
        for (const [a, b] of UPPER_POSE_CONNECTIONS) line(project(f.pose[a]), project(f.pose[b]))
        ctx.fillStyle = '#64748b'
        const [nx, ny] = project(f.pose[0])
        ctx.beginPath(); ctx.arc(nx, ny, 6, 0, Math.PI * 2); ctx.fill()
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
      })
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [clip])

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
        <canvas ref={canvasRef} width={320} height={240} className="w-full rounded-xl bg-mudra-indigo-950" />
      )}
      <p className="text-[11px] text-mudra-indigo-600">
        A real training example, mirrored like your camera. Purple = signer's left hand, orange = right hand.
        {testClips ? ` In tests the model got this word right ${testCorrect} of ${testClips} times.` : ''}
      </p>
    </div>
  )
}
