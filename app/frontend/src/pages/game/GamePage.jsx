import { Link } from 'react-router-dom'
import { Check, Flame, Lock, Play, Star, Trophy, Zap } from 'lucide-react'
import Card from '../../components/ui/Card'
import StatusPill from '../../components/ui/StatusPill'
import { DoodleSparkle, DoodleSquiggle } from '../../components/brand/Doodles'
import { BADGES, FULL_CURRICULUM, LESSONS, RULES, dayKey, lessonStatus, level, nextLesson, streak } from '../../features/game/progress'
import { useGameProgress } from '../../features/game/useGameProgress'
import { useVocabulary } from '../../features/vocabulary'

const OFFSETS = [0, 56, 84, 56, 0, -56, -84, -56] // zig-zag of the path (px), like a winding trail

export function GameStats({ progress }) {
  const today = dayKey()
  const lv = level(progress.xp)
  const todayXp = progress.days[today] || 0
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card className="p-4">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-sl-ink-600"><Flame className="h-4 w-4 text-sl-green" aria-hidden="true" /> Streak</p>
        <p className="mt-1 font-display text-2xl font-extrabold">{streak(progress, today)} {streak(progress, today) === 1 ? 'day' : 'days'}</p>
      </Card>
      <Card className="p-4">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-sl-ink-600"><Zap className="h-4 w-4 text-sl-purple" aria-hidden="true" /> XP</p>
        <p className="mt-1 font-display text-2xl font-extrabold">{progress.xp}</p>
      </Card>
      <Card className="p-4">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-sl-ink-600"><Star className="h-4 w-4 text-sl-sun-700" aria-hidden="true" /> Level {lv.level}</p>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-sl-cream-200" role="progressbar" aria-label={`Level ${lv.level} progress`}
             aria-valuemin={0} aria-valuemax={lv.size} aria-valuenow={lv.into}>
          <div className="h-full rounded-full bg-sl-purple" style={{ width: `${(lv.into / lv.size) * 100}%` }} />
        </div>
        <p className="mt-1 text-xs text-sl-ink-600">{lv.into} / {lv.size} XP</p>
      </Card>
      <Card className="p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-sl-ink-600">Daily goal</p>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-sl-cream-200" role="progressbar" aria-label="Daily goal"
             aria-valuemin={0} aria-valuemax={RULES.dailyGoalXp} aria-valuenow={Math.min(todayXp, RULES.dailyGoalXp)}>
          <div className="h-full rounded-full bg-sl-green" style={{ width: `${Math.min(100, (todayXp / RULES.dailyGoalXp) * 100)}%` }} />
        </div>
        <p className="mt-1 text-xs text-sl-ink-600">{Math.min(todayXp, RULES.dailyGoalXp)} / {RULES.dailyGoalXp} XP today{todayXp >= RULES.dailyGoalXp ? ' · done ✓' : ''}</p>
      </Card>
    </div>
  )
}

function Node({ lesson, status, offset, isNext, label }) {
  const base = 'relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-sl-ink transition-transform'
  const look = status === 'completed'
    ? 'bg-sl-sun shadow-sl-sm'
    : status === 'available'
      ? 'bg-sl-green text-sl-ink shadow-sl hover:-translate-y-0.5'
      : 'bg-sl-cream-200 text-sl-ink-400 border-sl-ink-200'
  const name = `Lesson ${lesson.number}: ${lesson.words.map(label).join(', ')}`
  const icon = status === 'completed' ? <Check className="h-7 w-7" aria-hidden="true" />
    : status === 'available' ? <Play className="h-7 w-7 translate-x-0.5" aria-hidden="true" />
      : <Lock className="h-6 w-6" aria-hidden="true" />
  return (
    <li className="flex flex-col items-center" style={{ transform: `translateX(${offset}px)` }}>
      {isNext && <span className="mb-1 rounded-full border-2 border-sl-ink bg-white px-3 py-0.5 text-xs font-extrabold uppercase">Start</span>}
      {status === 'locked' ? (
        <span className={`${base} ${look}`} title={`${name} (locked)`}>
          {icon}<span className="sr-only">{name}: locked, pass the previous lesson first</span>
        </span>
      ) : (
        <Link to={`/app/game/lesson/${lesson.id}`} className={`${base} ${look}`} title={name}>
          {icon}<span className="sr-only">{name}: {status === 'completed' ? 'completed, practise again' : 'start'}</span>
        </Link>
      )}
      <span className="mt-1 max-w-[9rem] truncate text-center text-xs font-semibold text-sl-ink-600">{lesson.words.slice(0, 2).map(label).join(', ')}…</span>
    </li>
  )
}

export default function GamePage() {
  const { progress } = useGameProgress()
  const { label } = useVocabulary()
  const next = nextLesson(progress)
  const earned = BADGES.filter((b) => progress.badges[b.id])

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-6 lg:py-10">
      <header className="relative">
        <DoodleSparkle className="absolute -top-2 right-4 text-sl-purple" size={26} />
        <p className="text-sm font-bold uppercase tracking-wider text-sl-green-700">Game Mode</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Your learning path</h1>
        <p className="mt-2 max-w-2xl text-sl-ink-600">
          {LESSONS.length} short lessons covering all words SignLine knows, the fingerspelling alphabet and everyday phrases (each path unlocks on its own). Each lesson shows real recorded examples, then
          checks that you can recognise them. Progress is saved in this browser.
        </p>
        {next && (
          <Link to={`/app/game/lesson/${next.id}`} className="btn-primary mt-4 inline-flex">
            <Play className="h-4 w-4" aria-hidden="true" /> {progress.lessons[next.id] ? 'Continue' : 'Start'}: {next.unitTitle}, lesson {next.number}
          </Link>
        )}
        <nav aria-label="Learning paths" className="mt-4 flex flex-wrap gap-2 text-sm">
          {[['words', 'Words'], ['alphabet', 'Fingerspelling A–Z'], ['phrases', 'Everyday phrases']].map(([track, text]) => {
            const first = FULL_CURRICULUM.find((s) => s.track === track)
            return first && (
              <a key={track} href={`#sec-${first.id}`} className="rounded-full border-2 border-sl-ink bg-white px-3 py-1 font-bold hover:bg-sl-cream-200">{text}</a>
            )
          })}
        </nav>
      </header>

      <GameStats progress={progress} />

      <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-10">
          {FULL_CURRICULUM.map((section) => (
            <section key={section.id} aria-labelledby={`sec-${section.id}`}>
              <h2 id={`sec-${section.id}`} className="flex items-center gap-3 font-display text-2xl font-extrabold">
                {section.title}
                <DoodleSquiggle className="text-sl-green" width={50} />
              </h2>
              <div className="mt-4 space-y-8">
                {section.units.map((unit) => {
                  const lessons = LESSONS.filter((l) => l.unitId === unit.id)
                  const done = lessons.filter((l) => progress.lessons[l.id]?.passed).length
                  return (
                    <Card key={unit.id} className="p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-display text-lg font-bold">{unit.title}</h3>
                        <span className="text-sm font-semibold text-sl-ink-600">{done} / {lessons.length} lessons</span>
                      </div>
                      <ol className="mt-5 flex flex-col items-center gap-5" aria-label={`${unit.title} lessons`}>
                        {lessons.map((l, i) => (
                          <Node key={l.id} lesson={l} status={lessonStatus(progress, l)} offset={OFFSETS[i % OFFSETS.length]}
                                isNext={next?.id === l.id} label={label} />
                        ))}
                      </ol>
                    </Card>
                  )
                })}
              </div>
            </section>
          ))}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card outlined className="p-5">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold"><Trophy className="h-5 w-5" aria-hidden="true" /> Badges</h2>
            <ul className="mt-3 space-y-2">
              {BADGES.map((b) => (
                <li key={b.id} className={`flex items-start gap-2 text-sm ${progress.badges[b.id] ? '' : 'opacity-60'}`}>
                  <span aria-hidden="true" className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-sl-ink text-[10px] ${progress.badges[b.id] ? 'bg-sl-sun' : 'bg-white'}`}>
                    {progress.badges[b.id] ? '✓' : ''}
                  </span>
                  <span><strong>{b.title}</strong> · {b.text}<span className="sr-only">{progress.badges[b.id] ? ' (earned)' : ' (not yet earned)'}</span></span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-sl-ink-600">{earned.length} of {BADGES.length} earned</p>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-bold">Leaderboard</h2>
              <StatusPill status="unavailable" />
            </div>
            <p className="mt-2 text-sm text-sl-ink-600">
              Leaderboards need real accounts to compare learners fairly. Sign-in is a demo for now, so there is no one to rank
              against, and SignLine will not invent other players.
            </p>
          </Card>
        </aside>
      </div>
    </div>
  )
}
