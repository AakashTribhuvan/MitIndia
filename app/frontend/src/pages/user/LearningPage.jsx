import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import SignReference from '../../components/SignReference'
import SignPracticeCamera from '../../components/practice/SignPracticeCamera'
import Card from '../../components/ui/Card'
import StatusPill from '../../components/ui/StatusPill'
import { FULL_CURRICULUM, LESSONS, lessonStatus } from '../../features/game/progress'
import { useGameProgress } from '../../features/game/useGameProgress'
import { useVocabulary } from '../../features/vocabulary'
import LearnPage from '../LearnPage'

const UNITS = FULL_CURRICULUM.flatMap((s) => s.units.map((u) => ({ ...u, section: s.title })))
const LESSON_OF = Object.fromEntries(LESSONS.flatMap((l) => l.words.map((w) => [w, l])))

function WordLibrary() {
  const vocab = useVocabulary()
  const { progress } = useGameProgress()
  const [query, setQuery] = useState('')
  const [unit, setUnit] = useState('all')
  const [open, setOpen] = useState(null)
  const [practice, setPractice] = useState(false)

  const words = useMemo(() => {
    const q = query.trim().toLowerCase()
    return UNITS.filter((u) => unit === 'all' || u.id === unit)
      .flatMap((u) => u.lessons.flat().map((w) => ({ sign: w, unit: u })))
      .filter((w) => !q || vocab.label(w.sign).toLowerCase().includes(q))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, unit, vocab.status])

  const openInfo = open ? vocab.entry(open) : null

  return (
    <section aria-label="Word library" className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search words, letters and phrases</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-sl-ink-400" aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search words, letters and phrases…"
                 className="min-h-12 w-full rounded-full border-2 border-sl-ink bg-white pl-12 pr-4" />
        </label>
        <label>
          <span className="sr-only">Topic</span>
          <select value={unit} onChange={(e) => setUnit(e.target.value)}
                  className="min-h-12 w-full rounded-full border-2 border-sl-ink bg-white px-4 font-semibold sm:w-64">
            <option value="all">All topics</option>
            {UNITS.map((u) => <option key={u.id} value={u.id}>{u.section} · {u.title}</option>)}
          </select>
        </label>
      </div>

      {vocab.status === 'offline' && (
        <p className="rounded-sl border-2 border-dashed border-sl-ink-200 p-3 text-sm text-sl-ink-600">
          The SignLine server is offline, so sign examples cannot be shown. Start it with start_all.bat.
        </p>
      )}

      {practice && open && (
        <div className="space-y-2">
          <SignPracticeCamera sign={open} label={vocab.label(open)} kind={openInfo?.kind} />
          <button type="button" onClick={() => setPractice(false)} className="text-sm font-bold underline underline-offset-4">Close practice</button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" aria-label={`${words.length} words`}>
          {words.map(({ sign, unit: u }) => {
            const lesson = LESSON_OF[sign]
            const done = lesson && lessonStatus(progress, lesson) === 'completed'
            return (
              <li key={sign}>
                <button type="button" onClick={() => setOpen(sign)} aria-pressed={open === sign}
                        className={`flex h-full w-full flex-col items-start rounded-sl border-2 p-3 text-left transition-colors ${open === sign ? 'border-sl-ink bg-sl-green-50 shadow-sl-sm' : 'border-sl-cream-300 bg-white hover:border-sl-ink'}`}>
                  <span className="font-display font-bold">{vocab.label(sign)}</span>
                  <span className="mt-0.5 text-xs text-sl-ink-600">{u.title}</span>
                  {done && <span className="mt-2 text-xs font-bold text-sl-sun-700">✓ lesson passed</span>}
                </button>
              </li>
            )
          })}
          {words.length === 0 && <li className="col-span-full text-sl-ink-600">No word matches “{query}”.</li>}
        </ul>

        <aside className="lg:sticky lg:top-6 lg:self-start" aria-live="polite">
          {open ? (
            <Card outlined className="space-y-3 p-4">
              <h2 className="font-display text-2xl font-extrabold">{vocab.label(open)}</h2>
              <SignReference key={open} sign={open} testCorrect={openInfo?.test_correct} testClips={openInfo?.test_clips} onClose={() => { setOpen(null); setPractice(false) }} />
              <button type="button" onClick={() => { setPractice(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="btn-secondary w-full">
                Practise with camera
              </button>
              {LESSON_OF[open] && (
                <Link to={`/app/game/lesson/${LESSON_OF[open].id}`} className="btn-primary w-full">
                  Practise in Game Mode ({LESSON_OF[open].unitTitle}, lesson {LESSON_OF[open].number})
                </Link>
              )}
              <p className="text-xs text-sl-ink-600">Lessons unlock in order within words, letters and phrases; if this one is locked, pass the earlier lessons first.</p>
              {openInfo?.kind === 'letter' && <p className="text-xs text-sl-ink-600">Letter example: a still hand shape from the alphabet photos.</p>}
            </Card>
          ) : (
            <Card className="p-5 text-sm text-sl-ink-600">Choose a word, letter or phrase to watch a real recorded example of its sign.</Card>
          )}
        </aside>
      </div>
    </section>
  )
}

export default function LearningPage(props) {
  const [tab, setTab] = useState('library')
  return (
    <div>
      <div className="mx-auto max-w-6xl space-y-6 px-4 pt-6 sm:px-6 lg:pt-10">
        <header>
          <p className="text-sm font-bold uppercase tracking-wider text-sl-green-700">Learning</p>
          <h1 className="font-display text-4xl font-extrabold tracking-tight">Learn ISL words, letters and phrases</h1>
          <p className="mt-2 max-w-2xl text-sl-ink-600">
            Every word SignLine recognises, the fingerspelling alphabet and everyday phrases, each with a real recorded example.
            For a guided path with quizzes, use Game Mode.
          </p>
        </header>
        <div role="tablist" aria-label="Learning sections" className="inline-flex rounded-full border-2 border-sl-ink bg-white p-1">
          {[['library', 'Sign library'], ['avatar', 'Avatar studio']].map(([id, text]) => (
            <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)}
                    className={`min-h-10 rounded-full px-5 text-sm font-bold ${tab === id ? 'bg-sl-ink text-white' : 'text-sl-ink'}`}>
              {text}
            </button>
          ))}
        </div>
      </div>
      {tab === 'library' ? (
        <div className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 lg:pb-16"><WordLibrary /></div>
      ) : (
        <div>
          <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
            <StatusPill status="demo">Sign descriptions not yet checked by an ISL signer</StatusPill>
          </div>
          <LearnPage {...props} />
        </div>
      )}
    </div>
  )
}
