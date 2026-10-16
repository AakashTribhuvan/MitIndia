/**
 * Game Mode progress: XP, levels, daily goal, streak, badges and lesson unlocking.
 *
 * Everything is derived from real lesson results recorded on this device (localStorage, one key per
 * demo profile name). Nothing is sent anywhere and no camera data is involved. Pure functions take and
 * return plain state objects so they can be tested without a browser.
 */
import { CURRICULUM } from './curriculum'
import { LIBRARY_CURRICULUM } from './libraryCurriculum'

export const RULES = {
  xpPerCorrect: 10,
  lessonBonus: 20, // once per lesson, when it is first passed
  passShare: 0.6, // share of correct answers needed to pass (and unlock the next lesson)
  dailyGoalXp: 50,
  xpPerLevel: 150,
}

export const BADGES = [
  { id: 'first_lesson', title: 'First steps', text: 'Pass your first lesson.', test: (s) => passedCount(s) >= 1 },
  { id: 'five_lessons', title: 'Getting going', text: 'Pass 5 lessons.', test: (s) => passedCount(s) >= 5 },
  { id: 'greetings', title: 'Say hello', text: 'Pass every Greetings lesson.', test: (s) => unitPassed(s, 'greetings') },
  { id: 'beginner', title: 'Beginner complete', text: 'Pass every Beginner lesson.', test: (s) => sectionPassed(s, 'beginner') },
  { id: 'words_25', title: '25 words', text: 'Learn 25 different words.', test: (s) => Object.keys(s.words).length >= 25 },
  { id: 'words_100', title: '100 words', text: 'Learn 100 different words.', test: (s) => Object.keys(s.words).length >= 100 },
  { id: 'streak_3', title: '3-day streak', text: 'Practise 3 days in a row.', test: (s, today) => streak(s, today) >= 3 },
  { id: 'streak_7', title: '7-day streak', text: 'Practise 7 days in a row.', test: (s, today) => streak(s, today) >= 7 },
  { id: 'perfect', title: 'Sharp eyes', text: 'Finish a lesson with every answer right.', test: (s) => Object.values(s.lessons).some((l) => l.perfect) },
]

/**
 * Words (the 314-word path) plus the library tracks: fingerspelling letters and phrases. Each track is its
 * own path: its first lesson is open from the start, then each lesson unlocks the next one in that track.
 */
export const FULL_CURRICULUM = [...CURRICULUM.map((s) => ({ ...s, track: 'words' })), ...LIBRARY_CURRICULUM]

/** All lessons in path order: {id, words, track, sectionId, sectionTitle, unitId, unitTitle, number, index}. */
export const LESSONS = FULL_CURRICULUM.flatMap((section) =>
  section.units.flatMap((unit) =>
    unit.lessons.map((words, i) => ({
      id: `${unit.id}-${i + 1}`, words, track: section.track, sectionId: section.id, sectionTitle: section.title,
      unitId: unit.id, unitTitle: unit.title, number: i + 1, unitLessons: unit.lessons.length,
    })))).map((l, index) => ({ ...l, index }))

// the lesson before each one in its own track (null for a track's first lesson)
const PREVIOUS_IN_TRACK = {}
LESSONS.reduce((last, l) => { PREVIOUS_IN_TRACK[l.id] = last[l.track] || null; return { ...last, [l.track]: l.id } }, {})

export const LESSON_BY_ID = Object.fromEntries(LESSONS.map((l) => [l.id, l]))

export function emptyState() {
  return { version: 1, xp: 0, lessons: {}, days: {}, words: {}, badges: {} }
}

export function dayKey(date = new Date()) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function passedCount(s) {
  return Object.values(s.lessons).filter((l) => l.passed).length
}
function unitPassed(s, unitId) {
  return LESSONS.filter((l) => l.unitId === unitId).every((l) => s.lessons[l.id]?.passed)
}
function sectionPassed(s, sectionId) {
  return LESSONS.filter((l) => l.sectionId === sectionId).every((l) => s.lessons[l.id]?.passed)
}

/** completed | available | locked. A lesson unlocks when the one before it in its track is passed. */
export function lessonStatus(s, lesson) {
  if (s.lessons[lesson.id]?.passed) return 'completed'
  const previous = PREVIOUS_IN_TRACK[lesson.id]
  if (!previous || s.lessons[previous]?.passed) return 'available'
  return 'locked'
}

export function nextLesson(s) {
  return LESSONS.find((l) => lessonStatus(s, l) === 'available') || null
}

/** Consecutive days with practice, ending today (or yesterday, so a streak survives until midnight). */
export function streak(s, today = dayKey()) {
  const has = (k) => (s.days[k] || 0) > 0
  const d = new Date(`${today}T12:00:00`)
  if (!has(today)) d.setDate(d.getDate() - 1)
  let n = 0
  while (has(dayKey(d))) {
    n += 1
    d.setDate(d.getDate() - 1)
  }
  return n
}

export function level(xp) {
  return { level: Math.floor(xp / RULES.xpPerLevel) + 1, into: xp % RULES.xpPerLevel, size: RULES.xpPerLevel }
}

/**
 * Records a finished lesson. Returns {state, earned, passed, newBadges}.
 * `answers`: [{word, correct}] for the quiz steps; `learned`: words shown in learn steps.
 */
export function recordLesson(s, lessonId, answers, learned, now = new Date()) {
  const today = dayKey(now)
  const correct = answers.filter((a) => a.correct).length
  const total = answers.length
  const passed = total > 0 && correct / total >= RULES.passShare
  const prev = s.lessons[lessonId]
  const firstPass = passed && !prev?.passed
  const earned = correct * RULES.xpPerCorrect + (firstPass ? RULES.lessonBonus : 0)
  const words = { ...s.words }
  for (const w of learned) words[w] = (words[w] || 0) + 1
  const next = {
    ...s,
    xp: s.xp + earned,
    days: { ...s.days, [today]: (s.days[today] || 0) + earned },
    words,
    lessons: {
      ...s.lessons,
      [lessonId]: {
        attempts: (prev?.attempts || 0) + 1,
        passed: Boolean(prev?.passed || passed),
        best: Math.max(prev?.best || 0, total ? correct / total : 0),
        perfect: Boolean(prev?.perfect || (total > 0 && correct === total)),
        lastAt: now.toISOString(),
      },
    },
  }
  const newBadges = BADGES.filter((b) => !next.badges[b.id] && b.test(next, today))
  next.badges = { ...next.badges, ...Object.fromEntries(newBadges.map((b) => [b.id, now.toISOString()])) }
  return { state: next, earned, passed, newBadges }
}

// ---- storage (per demo profile; failures leave progress in memory only)
const keyFor = (name) => `signline_progress_v1:${(name || 'guest').toLowerCase()}`

export function loadProgress(name) {
  try {
    const s = JSON.parse(localStorage.getItem(keyFor(name)) || 'null')
    return s && s.version === 1 ? { ...emptyState(), ...s } : emptyState()
  } catch {
    return emptyState()
  }
}

export function saveProgress(name, s) {
  try {
    localStorage.setItem(keyFor(name), JSON.stringify(s))
    return true
  } catch {
    return false
  }
}

export function resetProgress(name) {
  try { localStorage.removeItem(keyFor(name)) } catch { /* nothing stored */ }
}
