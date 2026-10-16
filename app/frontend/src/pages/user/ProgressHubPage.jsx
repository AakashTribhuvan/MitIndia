import { Link } from 'react-router-dom'
import Card from '../../components/ui/Card'
import { CURRICULUM } from '../../features/game/curriculum'
import { BADGES, LESSONS, dayKey, nextLesson } from '../../features/game/progress'
import { useGameProgress } from '../../features/game/useGameProgress'
import { GameStats } from '../game/GamePage'
import ProgressPage from '../ProgressPage'

function lastDays(n) {
  const out = []
  const d = new Date()
  for (let i = n - 1; i >= 0; i -= 1) {
    const x = new Date(d)
    x.setDate(d.getDate() - i)
    out.push(dayKey(x))
  }
  return out
}

export default function ProgressHubPage(props) {
  const { progress } = useGameProgress()
  const days = lastDays(14)
  const max = Math.max(10, ...days.map((k) => progress.days[k] || 0))
  const passed = Object.values(progress.lessons).filter((l) => l.passed).length
  const next = nextLesson(progress)
  const empty = Object.keys(progress.lessons).length === 0

  return (
    <div>
      <div className="mx-auto max-w-6xl space-y-8 px-4 pt-6 sm:px-6 lg:pt-10">
        <header>
          <p className="text-sm font-bold uppercase tracking-wider text-sl-green-700">Progress</p>
          <h1 className="font-display text-4xl font-extrabold tracking-tight">How you are doing</h1>
          <p className="mt-2 text-sl-ink-600">From your Game Mode lessons on this device. Nothing is uploaded.</p>
        </header>

        {empty ? (
          <Card outlined className="p-6">
            <h2 className="font-display text-2xl font-extrabold">No lessons yet</h2>
            <p className="mt-2 text-sl-ink-600">Finish your first Game Mode lesson and your progress, streak and badges appear here.</p>
            <Link to={next ? `/app/game/lesson/${next.id}` : '/app/game'} className="btn-primary mt-4 inline-flex">Start the first lesson</Link>
          </Card>
        ) : (
          <>
            <GameStats progress={progress} />
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="p-5">
                <h2 className="font-display text-lg font-bold">XP in the last 14 days</h2>
                <div className="mt-4 flex h-40 items-end gap-1.5" role="img"
                     aria-label={`XP per day: ${days.map((k) => `${k} ${progress.days[k] || 0}`).join(', ')}`}>
                  {days.map((k) => (
                    <div key={k} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                      <div className="w-full rounded-t-md bg-sl-purple" style={{ height: `${((progress.days[k] || 0) / max) * 100}%`, minHeight: progress.days[k] ? 4 : 0 }} />
                      <span className="text-[10px] text-sl-ink-600">{k.slice(8)}</span>
                    </div>
                  ))}
                </div>
              </Card>
              <Card className="p-5">
                <h2 className="font-display text-lg font-bold">Lessons passed</h2>
                <p className="mt-1 text-sm text-sl-ink-600">{passed} of {LESSONS.length} · {Object.keys(progress.words).length} words learned</p>
                <ul className="mt-4 space-y-3">
                  {CURRICULUM.map((s) => {
                    const ls = LESSONS.filter((l) => l.sectionId === s.id)
                    const n = ls.filter((l) => progress.lessons[l.id]?.passed).length
                    return (
                      <li key={s.id}>
                        <div className="flex justify-between text-sm font-semibold"><span>{s.title}</span><span>{n} / {ls.length}</span></div>
                        <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-sl-cream-200">
                          <div className="h-full rounded-full bg-sl-green" style={{ width: `${(n / ls.length) * 100}%` }} />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </Card>
            </div>
            <Card className="p-5">
              <h2 className="font-display text-lg font-bold">Badges</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {BADGES.map((b) => (
                  <li key={b.id} className={`rounded-full border-2 px-3 py-1 text-sm font-bold ${progress.badges[b.id] ? 'border-sl-ink bg-sl-sun' : 'border-sl-cream-300 bg-white text-sl-ink-400'}`}>
                    {progress.badges[b.id] ? '✓ ' : ''}{b.title}<span className="sr-only">{progress.badges[b.id] ? ' (earned)' : ' (not yet)'}</span>
                  </li>
                ))}
              </ul>
              {next && <p className="mt-4 text-sm">Next up: <Link className="font-bold underline underline-offset-4" to={`/app/game/lesson/${next.id}`}>{next.unitTitle}, lesson {next.number}</Link></p>}
            </Card>
          </>
        )}
        <h2 className="font-display text-2xl font-extrabold">Practice coach history</h2>
      </div>
      <ProgressPage {...props} />
    </div>
  )
}
