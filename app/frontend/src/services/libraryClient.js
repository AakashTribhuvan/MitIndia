import { API_BASE_URL, toFrame } from './signRecognizer'

/**
 * Fingerspelling and phrase recognition (POST /letters/predict, /phrases/predict). Landmarks only.
 *
 * letterSpeller: while active, sends the last few frames ~4 times a second. A letter is accepted when the
 * same confident letter comes back ACCEPT_POLLS times in a row; the same letter is accepted again only
 * after the hand shape changes or the hands leave the view (so a held letter is not repeated).
 * phraseRecorder: records frames between start() and stop() (max MAX_PHRASE_S) and asks for the top guesses.
 */
const POLL_MS = 250
const FRAMES_PER_POLL = 4
const ACCEPT_POLLS = 3
const MAX_PHRASE_S = 6
const MIN_PHRASE_FRAMES = 8
const PHRASE_END_HOLD_S = 1.2
const PHRASE_FINAL_POSE_S = 0.3

async function post(path, body) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

const slim = (results) => {
  const f = toFrame(results, 0)
  return { hands: f.hands.map((h) => ({ landmarks: h.landmarks })), pose: f.pose }
}

class LetterSpeller {
  constructor() {
    this.active = false
    this.frames = []
    this.frameTimes = []
    this.size = { width: 640, height: 480 }
    this.timer = null
    this.inFlight = false
    this.streak = { letter: null, count: 0 }
    this.released = true
    this.lastAccepted = null
    this.confidenceFloor = 0
    this.onGuess = null // (result) every poll
    this.onLetter = null // (letter) when a letter is accepted
    this.onError = null
  }

  start() {
    if (this.active) return
    this.active = true
    this.frames = []
    this.frameTimes = []
    this.streak = { letter: null, count: 0 }
    this.released = true
    this.lastAccepted = null
    this.timer = setInterval(() => this._poll(), POLL_MS)
  }

  setConfidenceFloor(value) {
    this.confidenceFloor = Math.max(0, Math.min(1, Number(value) || 0))
  }

  stop() {
    this.active = false
    clearInterval(this.timer)
    this.timer = null
    this.frames = []
  }

  addFrame(results) {
    if (!this.active) return
    if (results.width && results.height) this.size = { width: results.width, height: results.height }
    this.frames.push(slim(results))
    if (this.frames.length > FRAMES_PER_POLL) this.frames.shift()
  }

  async _poll() {
    if (!this.active || this.inFlight || !this.frames.length) return
    const frames = this.frames.slice()
    if (!frames.some((f) => f.hands.length)) {
      this.streak = { letter: null, count: 0 }
      this.released = true // hands out of view: the next letter may repeat the last one
      this.onGuess?.({ status: 'no_hands', letter: null, top_k: [] })
      return
    }
    this.inFlight = true
    try {
      const r = await post('/letters/predict', { frames, ...this.size, top_k: 3 })
      if (!this.active) return
      this.onGuess?.(r)
      const letter = r.status === 'ok' && r.confidence >= this.confidenceFloor ? r.letter : null
      if (letter && letter === this.streak.letter) this.streak.count += 1
      else this.streak = { letter, count: letter ? 1 : 0 }
      if (letter !== this.lastAccepted) this.released = true
      if (letter && this.streak.count >= ACCEPT_POLLS && (this.released || letter !== this.lastAccepted)) {
        this.lastAccepted = letter
        this.released = false
        this.streak = { letter, count: 0 }
        this.onLetter?.(letter)
      }
    } catch (e) {
      this.onError?.(e)
    } finally {
      this.inFlight = false
    }
  }
}

class PhraseRecorder {
  constructor() {
    this.recording = false
    this.frames = []
    this.size = { width: 640, height: 480 }
    this.startedAt = 0
    this.onAutoStop = null
    this.previousHands = null
    this.previousAt = 0
    this.lastMotionAt = 0
    this.lastMotionFrame = 0
    this.motionSeen = false
  }

  start() {
    this.recording = true
    this.frames = []
    this.startedAt = performance.now()
    this.previousHands = null
    this.previousAt = this.startedAt
    this.lastMotionAt = this.startedAt
    this.lastMotionFrame = 0
    this.motionSeen = false
  }

  addFrame(results) {
    if (!this.recording) return
    if (results.width && results.height) this.size = { width: results.width, height: results.height }
    const frame = slim(results)
    const now = performance.now()
    const hands = frame.hands.map((hand) => hand.landmarks)
    if (this.previousHands && hands.length === this.previousHands.length && hands.length) {
      const meanMotion = hands.reduce((sum, hand, index) => {
        const previous = this.previousHands[index]
        if (!previous) return sum
        return sum + hand.reduce((distance, point, pointIndex) => {
          const old = previous[pointIndex]
          return distance + Math.hypot(point[0] - old[0], point[1] - old[1])
        }, 0) / hand.length
      }, 0) / hands.length
      const dt = Math.max((now - this.previousAt) / 1000, 1 / 60)
      if (meanMotion / dt >= 0.08) {
        this.motionSeen = true
        this.lastMotionAt = now
        this.lastMotionFrame = this.frames.length
      }
    }
    this.previousHands = hands
    this.previousAt = now
    this.frames.push(frame)
    this.frameTimes.push(now)
    if (this.motionSeen && now - this.lastMotionAt >= PHRASE_END_HOLD_S * 1000) this.onAutoStop?.('pause')
    else if (now - this.startedAt > MAX_PHRASE_S * 1000) this.onAutoStop?.('limit')
  }

  cancel() {
    this.recording = false
    this.frames = []
  }

  /** Stop and classify; resolves to the /phrases/predict result, or {status: 'too_short'}. */
  async stop() {
    this.recording = false
    let frames = this.frames.slice(-256)
    const times = this.frameTimes.slice(-256)
    const lastMotionTime = this.frameTimes[this.lastMotionFrame]
    this.frames = []
    this.frameTimes = []
    if (this.motionSeen) {
      const motionAt = lastMotionTime ?? times[times.length - 1]
      const cut = times.findIndex((time) => time > motionAt + PHRASE_FINAL_POSE_S * 1000)
      const end = cut < 0 ? frames.length : cut
      if (end >= MIN_PHRASE_FRAMES) frames = frames.slice(0, end)
    }
    if (frames.length < MIN_PHRASE_FRAMES || !frames.some((f) => f.hands.length)) return { status: 'too_short', top_k: [] }
    return post('/phrases/predict', { frames, ...this.size, top_k: 5 })
  }
}

export const letterSpeller = new LetterSpeller()
export const phraseRecorder = new PhraseRecorder()
export const PHRASE_MAX_SECONDS = MAX_PHRASE_S

/** /library: letters and phrases beyond the word model, fetched once per page load. */
let libraryCache = null
export function fetchLibrary() {
  if (!libraryCache) {
    libraryCache = fetch(`${API_BASE_URL}/library`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((body) => ({ status: 'online', ...body }))
      .catch(() => {
        libraryCache = null
        return { status: 'offline', letters: [], phrases: [], models: {} }
      })
  }
  return libraryCache
}

export const isLetter = (sign) => typeof sign === 'string' && sign.startsWith('LETTER_')
export const letterOf = (sign) => sign.replace(/^LETTER_/, '')
