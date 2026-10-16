import { useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, Check, Lightbulb, RotateCcw, X } from 'lucide-react'
import SignReference from '../../components/SignReference'
import SignPracticeCamera from '../../components/practice/SignPracticeCamera'
import Button from '../../components/ui/Button'
import Card from '../../components/ui/Card'
import StatusPill from '../../components/ui/StatusPill'
import { DoodleSparkle } from '../../components/brand/Doodles'
import { LESSON_BY_ID, LESSONS, RULES, lessonStatus, recordLesson } from '../../features/game/progress'
import { buildLessonSteps, isCorrect } from '../../features/game/quiz'
import { useGameProgress } from '../../features/game/useGameProgress'
import { useVocabulary } from '../../features/vocabulary'

function Feedback({ correct, answer }) {
  return (
    <div role="status" className={`flex items-start gap-3 rounded-sl border-2 p-4 ${correct ? 'border-sl-sun-700 bg-sl-sun-100' : 'border-rose-700 bg-rose-50'}`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-sl-ink ${correct ? 'bg-sl-sun' : 'bg-rose-200'}`}>
        {correct ? <Check className="h-5 w-5" aria-hidden="true" /> : <X className="h-5 w-5" aria-hidden="true" />}
      </span>
      <p className="font-semibold">{correct ? 'Correct!' : 'Not quite.'} {!correct && <>The answer is <strong>{answer}</strong>.</>}</p>
    </div>
  )
}

export default function GameLessonPage() {
  const { lessonId } = useParams()
  const navigate = useNavigate()
  const lesson = LESSON_BY_ID[lessonId]
  const { progress, update, saved } = useGameProgress()
  const vocab = useVocabulary()
  const seed = useRef(Date.now() % 100000).current
  const learnedBefore = useMemo(
    () => (lesson ? Object.keys(progress.words).filter((w) => !lesson.words.includes(w)) : []),
    [lesson, progress.words],
  )
  const steps = useMemo(
    () => (lesson && vocab.status !== 'loading' ? buildLessonSteps(lesson, vocab.hasExample, learnedBefore, seed) : []),
    // steps are fixed once the vocabulary has loaded
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lesson, vocab.status, seed],
  )
  const [index, setIndex] = useState(0)
  const [answer, setAnswer] = useState(null)
  const [checked, setChecked] = useState(false)
  const [answers, setAnswers] = useState([])
  const [result, setResult] = useState(null)
  const [practice, setPractice] = useState(false) // camera practice during learn steps

  if (!lesson) return <Navigate to="/app/game" replace />
  if (lessonStatus(progress, lesson) === 'locked' && !result) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 text-center">
        <h1 className="font-display text-2xl font-extrabold">This lesson is locked</h1>
        <p className="mt-2 text-sl-ink-600">Pass the lesson before it to unlock this one.</p>
        <Link to="/app/game" className="btn-secondary mt-6 inline-flex">Back to the path</Link>
      </div>
    )
  }

  if (vocab.status === 'loading') return <p role="status" className="px-6 py-12 text-center text-sl-ink-600">Preparing the lesson…</p>
  if (vocab.status === 'offline') {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 text-center">
        <StatusPill status="error">Recognition server offline</StatusPill>
        <h1 className="mt-3 font-display text-2xl font-extrabold">Lessons need the sign examples</h1>
        <p className="mt-2 text-sl-ink-600">The recorded sign examples come from the SignLine server. Start it (start_all.bat) and try again.</p>
        <Link to="/app/game" className="btn-secondary mt-6 inline-flex">Back to the path</Link>
      </div>
    )
  }

  const step = steps[index]
  const quizCount = steps.filter((s) => s.type !== 'learn').length
  const pct = steps.length ? Math.round((index / steps.length) * 100) : 0
  const L = vocab.label

  const finish = (allAnswers) => {
    const learned = steps.filter((s) => s.type === 'learn').map((s) => s.word)
    const r = recordLesson(progress, lesson.id, allAnswers, learned)
    update(r.state)
    setResult({ ...r, correct: allAnswers.filter((a) => a.correct).length, total: allAnswers.length })
  }

  const next = () => {
    const all = step.type === 'learn' ? answers : [...answers, { word: step.word, correct: isCorrect(step, answer) }]
    setAnswers(all)
    setAnswer(null)
    setChecked(false)
    if (index + 1 >= steps.length) finish(all)
    else setIndex(index + 1)
  }

  if (result) {
    const nextL = LESSONS[lesson.index + 1]
    return (
      <div className="sl-motion mx-auto max-w-xl px-4 py-10 text-center">
        <Card outlined className="relative p-8">
          <DoodleSparkle className="absolute -left-3 -top-3 text-sl-purple" size={30} />
          <DoodleSparkle className="absolute -right-2 top-10 text-sl-green" size={22} />
          <p className="text-sm font-bold uppercase tracking-wider text-sl-green-700">{result.passed ? 'Lesson complete' : 'Lesson finished'}</p>
          <h1 className="mt-2 font-display text-3xl font-extrabold">{result.correct} of {result.total} right</h1>
          <p className="mt-2 text-lg font-bold text-sl-purple-700">+{result.earned} XP</p>
          {!result.passed && (
            <p className="mt-3 text-sl-ink-600">Get at least {Math.round(RULES.passShare * 100)}% right to unlock the next lesson. Practise once more.</p>
          )}
          {result.newBadges.length > 0 && (
            <div className="mt-5 space-y-2">
              <p className="text-sm font-bold">New badge{result.newBadges.length > 1 ? 's' : ''}!</p>
              {result.newBadges.map((b) => (
                <p key={b.id} className="mx-auto inline-flex items-center gap-2 rounded-full border-2 border-sl-ink bg-sl-sun px-4 py-1.5 font-bold">
                  ✓ {b.title}
                </p>
              ))}
            </div>
          )}
          {!saved && <p className="mt-3 text-sm text-rose-700">Progress could not be saved in this browser (storage is blocked).</p>}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {result.passed && nextL ? (
              <Button onClick={() => navigate(`/app/game/lesson/${nextL.id}`, { replace: true })}>Next lesson <ArrowRight className="h-4 w-4" aria-hidden="true" /></Button>
            ) : (
              <Button onClick={() => { setResult(null); setIndex(0); setAnswers([]); setAnswer(null); setChecked(false) }}><RotateCcw className="h-4 w-4" aria-hidden="true" /> Try again</Button>
            )}
            <Button variant="outline" onClick={() => navigate('/app/game')}>Back to the path</Button>
          </div>
        </Card>
      </div>
    )
  }

  if (!step) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12 text-center">
        <h1 className="font-display text-2xl font-extrabold">No examples for this lesson</h1>
        <p className="mt-2 text-sl-ink-600">None of these words has a recorded example on this server.</p>
        <Link to="/app/game" className="btn-secondary mt-6 inline-flex">Back to the path</Link>
      </div>
    )
  }

  const correctAnswer = step.type === 'truefalse' ? (step.claim === step.word ? 'Yes' : 'No') : L(step.word)

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:py-10">
      <div className="flex items-center gap-3">
        <Link to="/app/game" aria-label="Leave the lesson" className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-sl-ink bg-white">
          <X className="h-5 w-5" aria-hidden="true" />
        </Link>
        <div className="h-3 flex-1 overflow-hidden rounded-full border-2 border-sl-ink bg-white" role="progressbar"
             aria-label="Lesson progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className="sl-motion h-full bg-sl-green transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-sm font-bold text-sl-ink-600">{index + 1}/{steps.length}</span>
      </div>

      <p className="mt-6 text-sm font-bold uppercase tracking-wider text-sl-ink-600">
        {lesson.unitTitle} · lesson {lesson.number} {step.review && '· review'}
      </p>

      {step.type === 'learn' ? (
        <section aria-live="polite" className="mt-2 space-y-4">
          <h1 className="font-display text-3xl font-extrabold">New sign: {L(step.word)}</h1>
          <SignReference key={step.word} sign={step.word} bare />
          <p className="text-sm text-sl-ink-600">A real recorded example, mirrored like your camera. Watch it a few times and copy it.</p>
          <label className="flex items-center justify-between gap-3 rounded-sl border-2 border-sl-ink bg-sl-green-50 px-4 py-3">
            <span><span className="block font-bold">Practise with camera</span>
              <span className="block text-sm text-sl-ink-600">See how close your hands are to the example, and let SignLine check your sign.</span></span>
            <input type="checkbox" role="switch" checked={practice} onChange={(e) => setPractice(e.target.checked)} className="h-6 w-6 shrink-0 accent-sl-green" />
          </label>
          {practice && <SignPracticeCamera sign={step.word} label={L(step.word)} kind={vocab.entry(step.word)?.kind} />}
          <Card className="flex items-start gap-3 bg-sl-cream-50 p-4">
            <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-sl-green-700" aria-hidden="true" />
            <p className="text-sm"><strong>{step.tip.kind}:</strong> {step.tip.text}</p>
          </Card>
          <Button size="lg" className="w-full" onClick={next}>Continue</Button>
        </section>
      ) : (
        <section aria-live="polite" className="mt-2 space-y-4">
          <h1 className="font-display text-3xl font-extrabold">
            {step.type === 'name' ? 'Which word is this sign?' : <>Does this sign mean “{L(step.claim)}”?</>}
          </h1>
          <SignReference key={`${index}-${step.word}`} sign={step.word} bare />
          <fieldset disabled={checked} className="grid gap-3 sm:grid-cols-2">
            <legend className="sr-only">Choose an answer</legend>
            {(step.type === 'name' ? step.options : [true, false]).map((opt) => {
              const text = step.type === 'name' ? L(opt) : opt ? 'Yes' : 'No'
              const chosen = answer === opt
              const right = checked && isCorrect(step, opt)
              return (
                <button
                  key={String(opt)}
                  type="button"
                  aria-pressed={chosen}
                  onClick={() => setAnswer(opt)}
                  className={`min-h-12 rounded-sl border-2 px-4 py-3 text-left font-bold transition-colors ${
                    right ? 'border-sl-sun-700 bg-sl-sun-100'
                      : chosen && checked ? 'border-rose-700 bg-rose-50'
                        : chosen ? 'border-sl-ink bg-sl-purple-50 shadow-sl-sm'
                          : 'border-sl-cream-300 bg-white hover:border-sl-ink'}`}
                >
                  {text} {right && <span className="sr-only">(correct answer)</span>}
                </button>
              )
            })}
          </fieldset>
          {checked && <Feedback correct={isCorrect(step, answer)} answer={correctAnswer} />}
          {!checked ? (
            <Button size="lg" className="w-full" disabled={answer === null} onClick={() => setChecked(true)}>Check</Button>
          ) : (
            <Button size="lg" className="w-full" onClick={next}>Continue</Button>
          )}
          <p className="text-center text-xs text-sl-ink-600">{quizCount} questions in this lesson · {RULES.xpPerCorrect} XP per right answer</p>
        </section>
      )}
    </div>
  )
}
