import { describe, expect, it } from 'vitest'
import { CURRICULUM } from '../curriculum'
import { BADGES, LESSONS, RULES, emptyState, lessonStatus, level, nextLesson, recordLesson, streak } from '../progress'
import { buildLessonSteps, isCorrect } from '../quiz'

const ok = (words) => words.map((word) => ({ word, correct: true }))

describe('curriculum', () => {
  it('covers the 314 model words exactly once', () => {
    const words = CURRICULUM.flatMap((s) => s.units.flatMap((u) => u.lessons.flat()))
    expect(words.length).toBe(314)
    expect(new Set(words).size).toBe(314)
    expect(LESSONS.every((l) => l.words.length >= 3 && l.words.length <= 5)).toBe(true)
  })
})

describe('progress', () => {
  it('unlocks lessons in order and only when passed', () => {
    let s = emptyState()
    expect(lessonStatus(s, LESSONS[0])).toBe('available')
    expect(lessonStatus(s, LESSONS[1])).toBe('locked')
    const failed = recordLesson(s, LESSONS[0].id, [{ word: 'A', correct: true }, { word: 'B', correct: false }, { word: 'C', correct: false }], [])
    expect(failed.passed).toBe(false)
    expect(lessonStatus(failed.state, LESSONS[1])).toBe('locked')
    s = recordLesson(s, LESSONS[0].id, ok(LESSONS[0].words), LESSONS[0].words).state
    expect(lessonStatus(s, LESSONS[0])).toBe('completed')
    expect(nextLesson(s).id).toBe(LESSONS[1].id)
  })

  it('gives XP per correct answer plus a bonus only on the first pass', () => {
    const words = LESSONS[0].words
    const first = recordLesson(emptyState(), LESSONS[0].id, ok(words), words)
    expect(first.earned).toBe(words.length * RULES.xpPerCorrect + RULES.lessonBonus)
    const again = recordLesson(first.state, LESSONS[0].id, ok(words), words)
    expect(again.earned).toBe(words.length * RULES.xpPerCorrect)
    expect(level(RULES.xpPerLevel + 5)).toEqual({ level: 2, into: 5, size: RULES.xpPerLevel })
  })

  it('counts a streak of consecutive practice days, surviving until the day ends', () => {
    const s = { ...emptyState(), days: { '2026-10-13': 10, '2026-10-14': 20, '2026-10-15': 5 } }
    expect(streak(s, '2026-10-15')).toBe(3)
    expect(streak(s, '2026-10-16')).toBe(3) // nothing yet today: yesterday's streak still counts
    expect(streak(s, '2026-10-17')).toBe(0)
  })

  it('awards badges once, from real results', () => {
    const words = LESSONS[0].words
    const r = recordLesson(emptyState(), LESSONS[0].id, ok(words), words)
    const ids = r.newBadges.map((b) => b.id)
    expect(ids).toContain('first_lesson')
    expect(ids).toContain('perfect')
    const again = recordLesson(r.state, LESSONS[0].id, ok(words), words)
    expect(again.newBadges.map((b) => b.id)).not.toContain('first_lesson')
    expect(BADGES.every((b) => typeof b.test === 'function')).toBe(true)
  })
})

describe('quiz', () => {
  it('builds learn steps then quiz steps whose answer is among the options', () => {
    const lesson = LESSONS[3]
    const steps = buildLessonSteps(lesson, () => true, ['HELLO', 'THANK_YOU'], 7)
    const learn = steps.filter((s) => s.type === 'learn')
    expect(learn.map((s) => s.word)).toEqual(lesson.words)
    for (const s of steps.filter((x) => x.type === 'name')) {
      expect(s.options).toContain(s.word)
      expect(new Set(s.options).size).toBe(s.options.length)
      expect(isCorrect(s, s.word)).toBe(true)
    }
    for (const s of steps.filter((x) => x.type === 'truefalse')) {
      expect(isCorrect(s, s.claim === s.word)).toBe(true)
    }
  })

  it('skips words without a recorded example', () => {
    const lesson = LESSONS[0]
    const steps = buildLessonSteps(lesson, (w) => w !== lesson.words[0], [], 1)
    expect(steps.some((s) => s.word === lesson.words[0])).toBe(false)
  })
})

describe('library tracks (letters and phrases)', () => {
  it('teaches all 26 letters once and keeps phrases unique', () => {
    const letters = LESSONS.filter((l) => l.track === 'alphabet').flatMap((l) => l.words)
    expect(letters).toEqual([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((c) => `LETTER_${c}`))
    const phrases = LESSONS.filter((l) => l.track === 'phrases').flatMap((l) => l.words)
    expect(phrases.length).toBeGreaterThan(90)
    expect(new Set(phrases).size).toBe(phrases.length)
  })

  it('opens the first lesson of every track without passing the word path', () => {
    const s = emptyState()
    for (const track of ['words', 'alphabet', 'phrases']) {
      const lessons = LESSONS.filter((l) => l.track === track)
      expect(lessonStatus(s, lessons[0])).toBe('available')
      expect(lessonStatus(s, lessons[1])).toBe('locked')
    }
    const firstLetters = LESSONS.find((l) => l.track === 'alphabet')
    const after = recordLesson(s, firstLetters.id, ok(firstLetters.words), firstLetters.words).state
    expect(lessonStatus(after, LESSONS.filter((l) => l.track === 'alphabet')[1])).toBe('available')
    expect(lessonStatus(after, LESSONS[1])).toBe('locked') // the word path is unaffected
  })

  it('draws quiz options from the same track', () => {
    const lesson = LESSONS.find((l) => l.track === 'alphabet')
    const steps = buildLessonSteps(lesson, () => true, [], 3)
    for (const step of steps.filter((x) => x.options)) expect(step.options.every((o) => o.startsWith('LETTER_'))).toBe(true)
  })
})
