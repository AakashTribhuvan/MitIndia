import { describe, expect, it } from 'vitest'
import { assignHands, atRest, bestMatch, compareFrames, describe as label, frameFeatures, palmNormal, shapeVector, signingFrames } from '../handFeatures'

// A flat open hand at (cx, cy) in image coordinates; spread scales finger spacing; curl pulls tips in.
function hand(cx, cy, { spread = 1, curl = 0 } = {}) {
  const pts = Array.from({ length: 21 }, () => [cx, cy, 0])
  const fingers = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]]
  fingers.forEach((idx, f) => {
    const dx = (f - 2) * 0.012 * spread
    idx.forEach((p, j) => {
      const len = (j + 1) * 0.02 * (j === 3 ? 1 - curl : 1)
      pts[p] = [cx + dx * (j + 1) / 2, cy - len, 0]
    })
  })
  pts[9] = [cx, cy - 0.04, 0]
  return pts
}
function pose(lsx = 0.6, rsx = 0.4, y = 0.5) {
  const p = Array.from({ length: 33 }, () => [0.5, 0.5, 0, 1])
  p[11] = [lsx, y, 0, 1]; p[12] = [rsx, y, 0, 1]
  p[15] = [0.65, 0.7, 0, 1]; p[16] = [0.35, 0.7, 0, 1]
  return p
}

describe('handFeatures', () => {
  it('assigns hands to the signer\'s left/right by the nearest pose wrist', () => {
    const [l, r] = assignHands([hand(0.35, 0.7), hand(0.65, 0.7)], pose())
    expect(l[0][0]).toBeCloseTo(0.65 * 4 / 3)
    expect(r[0][0]).toBeCloseTo(0.35 * 4 / 3)
  })

  it('scores the same pose as identical and a different hand shape lower', () => {
    const a = frameFeatures([hand(0.35, 0.6)], pose())
    const same = compareFrames(a, a)
    expect(same.shape).toBeCloseTo(1)
    expect(same.palm).toBeCloseTo(1)
    expect(same.position).toBeCloseTo(1)
    const fist = frameFeatures([hand(0.35, 0.6, { curl: 0.9, spread: 0.2 })], pose())
    expect(compareFrames(fist, a).shape).toBeLessThan(0.8)
    const elsewhere = frameFeatures([hand(0.35, 0.95)], pose())
    expect(compareFrames(elsewhere, a).position).toBeLessThan(same.position)
  })

  it('counts a missing hand against two-handed examples and picks the closest example frame', () => {
    const both = frameFeatures([hand(0.35, 0.6), hand(0.65, 0.6)], pose())
    const one = frameFeatures([hand(0.35, 0.6)], pose())
    const c = compareFrames(one, both)
    expect(c.handsMatch).toBe(false)
    expect(c.shape).toBeLessThan(0.6)
    const far = frameFeatures([hand(0.35, 0.95, { curl: 0.9 })], pose())
    expect(bestMatch(one, [far, one]).shape).toBeCloseTo(1)
  })

  it('has stable building blocks and wording', () => {
    expect(shapeVector(hand(0.5, 0.5))).toHaveLength(9)
    const n = palmNormal(hand(0.5, 0.5), false)
    expect(Math.hypot(...n)).toBeCloseTo(1, 1)
    expect(label(0.9).level).toBe('good')
    expect(label(0.7).level).toBe('mid')
    expect(label(0.2).level).toBe('low')
    expect(label(null).level).toBe('none')
  })

  it("treats hands down by the hips as resting and ignores the example's rest frames", () => {
    const raised = frameFeatures([hand(0.35, 0.45)], pose())
    const resting = frameFeatures([hand(0.35, 0.95)], pose())
    expect(atRest(raised)).toBe(false)
    expect(atRest(resting)).toBe(true)
    expect(signingFrames([resting, raised, resting])).toEqual([raised])
    expect(signingFrames([resting])).toEqual([resting]) // nothing raised: keep everything
  })
})
