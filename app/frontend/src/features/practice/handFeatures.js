/**
 * Live practice feedback: compares the learner's hands with the recorded example of the same word.
 *
 * Three aspects, each 0..1, measured against the example frame that is closest to the live pose (signs
 * move, so the learner may be at any moment of it):
 *   shape     finger extension and spread (relative to palm size)
 *   position  wrist position relative to the shoulders (in shoulder widths)
 *   palm      direction the palm faces
 * These are geometric comparisons for guidance; they are not a recognition result or a grade.
 *
 * Landmarks: MediaPipe image coordinates of the unmirrored video. Hands as 21 x [x, y, z] arrays,
 * pose as 33 x [x, y, z, visibility]. Slot 0 = signer's left hand, slot 1 = right (as the server does).
 */

const WRIST = 0
const MIDDLE_MCP = 9
const INDEX_MCP = 5
const PINKY_MCP = 17
const TIPS = [4, 8, 12, 16, 20]
const POSE_L_SHOULDER = 11
const POSE_R_SHOULDER = 12
const POSE_L_WRIST = 15
const POSE_R_WRIST = 16

const toArr = (p) => (Array.isArray(p) ? p : [p.x, p.y, p.z ?? 0, p.visibility ?? 1])
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], (a[2] || 0) - (b[2] || 0)]
const norm = (v) => Math.hypot(v[0], v[1], v[2])
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const clamp01 = (x) => Math.max(0, Math.min(1, x))

/** Scale x (and z) by width/height so geometry is not distorted on wide frames. */
function aspectFix(points, aspect) {
  return points.map((p) => [p[0] * aspect, p[1], (p[2] || 0) * aspect, p[3]])
}

/** Body reference: shoulder centre and width, or null when shoulders are not reliably visible. */
export function bodyFrame(pose, aspect = 4 / 3) {
  if (!pose || pose.length < 17) return null
  const p = aspectFix(pose.map(toArr), aspect)
  const l = p[POSE_L_SHOULDER]
  const r = p[POSE_R_SHOULDER]
  if ((l[3] ?? 1) < 0.5 || (r[3] ?? 1) < 0.5) return null
  const w = dist2(l, r)
  if (w < 1e-4) return null
  return { cx: (l[0] + r[0]) / 2, cy: (l[1] + r[1]) / 2, w, lw: p[POSE_L_WRIST], rw: p[POSE_R_WRIST] }
}

/** Put up to two detected hands into [left, right] slots by the nearest pose wrist (else by image side). */
export function assignHands(hands, pose, aspect = 4 / 3) {
  const slots = [null, null]
  const list = (hands || []).filter((h) => h && h.length >= 21).map((h) => aspectFix(h.map(toArr), aspect))
  const body = bodyFrame(pose, aspect)
  const used = new Set()
  if (body && body.lw && body.rw) {
    for (const [slot, pw] of [[0, body.lw], [1, body.rw]]) {
      let best = -1
      let bestD = Infinity
      list.forEach((h, i) => {
        if (used.has(i)) return
        const d = dist2(h[WRIST], pw)
        if (d < bestD) { bestD = d; best = i }
      })
      if (best >= 0 && bestD < body.w * 1.2) { slots[slot] = list[best]; used.add(best) }
    }
  }
  // Fallback: in the unmirrored image the signer's left hand is on the right side of the picture
  list.forEach((h, i) => {
    if (used.has(i)) return
    const slot = body ? (h[WRIST][0] > body.cx ? 0 : 1) : (h[WRIST][0] > 0.5 * aspect ? 0 : 1)
    if (!slots[slot]) slots[slot] = h
    else if (!slots[1 - slot]) slots[1 - slot] = h
  })
  return slots
}

/** Finger extension (5) and adjacent fingertip spread (4), in palm-size units. */
export function shapeVector(hand) {
  const palm = dist2(hand[WRIST], hand[MIDDLE_MCP]) || 1e-6
  const ext = TIPS.map((t) => dist2(hand[WRIST], hand[t]) / palm)
  const spread = [0, 1, 2, 3].map((i) => dist2(hand[TIPS[i]], hand[TIPS[i + 1]]) / palm)
  return [...ext, ...spread]
}

/** Unit palm normal; the sign is flipped for the left hand so both hands use the same convention. */
export function palmNormal(hand, isLeft) {
  const a = sub(hand[INDEX_MCP], hand[WRIST])
  const b = sub(hand[PINKY_MCP], hand[WRIST])
  const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
  const len = norm(n) || 1e-6
  const s = isLeft ? -1 : 1
  return [s * n[0] / len, s * n[1] / len, s * n[2] / len]
}

/** Per-frame features: for each slot {shape, pos, palm} or null. */
export function frameFeatures(hands, pose, aspect = 4 / 3) {
  const body = bodyFrame(pose, aspect)
  const slots = assignHands(hands, pose, aspect)
  return {
    hasBody: Boolean(body),
    hands: slots.map((h, slot) => (h ? {
      shape: shapeVector(h),
      pos: body ? [(h[WRIST][0] - body.cx) / body.w, (h[WRIST][1] - body.cy) / body.w] : null,
      palm: palmNormal(h, slot === 0),
    } : null)),
  }
}

/** Similarities (0..1) between one live frame and one example frame; null if nothing comparable. */
export function compareFrames(live, ref) {
  const slots = [0, 1].filter((s) => ref.hands[s])
  if (!slots.length) return null
  let shape = 0
  let position = 0
  let palm = 0
  let nPos = 0
  for (const s of slots) {
    const L = live.hands[s]
    const R = ref.hands[s]
    if (!L) continue // missing hand counts as 0 for that hand
    const d = L.shape.reduce((acc, v, i) => acc + Math.abs(v - R.shape[i]), 0) / L.shape.length
    shape += clamp01(1 - d / 0.6)
    if (L.pos && R.pos) {
      position += clamp01(1 - Math.hypot(L.pos[0] - R.pos[0], L.pos[1] - R.pos[1]) / 1.2)
      nPos += 1
    }
    palm += clamp01((L.palm[0] * R.palm[0] + L.palm[1] * R.palm[1] + L.palm[2] * R.palm[2] + 1) / 2)
  }
  return {
    shape: shape / slots.length,
    position: nPos ? position / slots.length : null,
    palm: palm / slots.length,
    handsMatch: slots.every((s) => live.hands[s]), // every hand the example uses is visible
  }
}

/** Best-matching example frame for a live frame: returns the similarities at that frame. */
export function bestMatch(live, refFrames) {
  let best = null
  let bestScore = -1
  for (const ref of refFrames) {
    const c = compareFrames(live, ref)
    if (!c) continue
    const score = c.shape * 0.5 + (c.position ?? c.shape) * 0.3 + c.palm * 0.2
    if (score > bestScore) { bestScore = score; best = c }
  }
  return best
}

function slotFeatures(h, slot, body, aspect) {
  if (!h) return null
  const hh = aspectFix(h.map(toArr), aspect)
  return {
    shape: shapeVector(hh),
    pos: body ? [(hh[WRIST][0] - body.cx) / body.w, (hh[WRIST][1] - body.cy) / body.w] : null,
    palm: palmNormal(hh, slot === 0),
  }
}

/** Features for every frame of a /reference clip (its hands are already in [left, right] slots). */
export function referenceFeatures(clip) {
  const aspect = clip.width && clip.height ? clip.width / clip.height : 4 / 3
  return clip.frames
    .map((f) => {
      const body = bodyFrame(f.pose, aspect)
      const slots = f.hands && f.hands.length === 2 ? f.hands : [null, null]
      return { hasBody: Boolean(body), hands: slots.map((h, s) => slotFeatures(h, s, body, aspect)) }
    })
    .filter((f) => f.hands.some(Boolean))
}

/** Hands this far below the shoulder line (shoulder widths) count as resting, not signing. */
export const REST_BELOW = 1.3

/** True when every visible hand is down at rest (or no hand is visible). Needs a body reference. */
export function atRest(frame) {
  const hs = frame.hands.filter(Boolean)
  if (!hs.length) return true
  return hs.every((h) => h.pos && h.pos[1] > REST_BELOW)
}

/** The signing part of an example: frames with a raised hand (falls back to all frames). */
export function signingFrames(frames) {
  const active = frames.filter((f) => !atRest(f))
  return active.length ? active : frames
}

export function describe(score) {
  if (score == null) return { text: 'Not measured', level: 'none' }
  if (score >= 0.8) return { text: 'Close to the example', level: 'good' }
  if (score >= 0.6) return { text: 'Getting there', level: 'mid' }
  return { text: 'Different from the example', level: 'low' }
}
