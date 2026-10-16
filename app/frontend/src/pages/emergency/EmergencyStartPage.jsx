import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Hand, HandMetal, LayoutGrid, Loader2, PlayCircle } from 'lucide-react'
import { emergencyApi, lastSessionId } from '../../features/emergency/api'
import { DemoTag, ErrorNote, Hint, Notice } from '../../features/emergency/components'

const MODES = [
  { id: 'BUTTONS', title: 'Tap what you need', text: 'Large buttons: medical, police, fire, accident, rescue. Fastest when signing is hard.', icon: LayoutGrid },
  { id: 'SIGN', title: 'Sign it', text: 'Sign word by word; each sign is shown so you can check and correct it.', icon: HandMetal },
  { id: 'GESTURE', title: 'Use my gesture', text: 'One personal gesture you set up earlier sends its prepared message.', icon: Hand },
]

export default function EmergencyStartPage() {
  const navigate = useNavigate()
  const [config, setConfig] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)
  const resume = lastSessionId()

  useEffect(() => {
    emergencyApi.config().then(setConfig).catch((e) => setError(e.message))
  }, [])

  const start = async (mode, scenarioId = null) => {
    setBusy(scenarioId || mode)
    setError(null)
    try {
      const session = await emergencyApi.createSession(mode, scenarioId)
      navigate(`/emergency/session/${session.id}`)
    } catch (e) {
      setError(e.message)
      setBusy(null)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-extrabold text-rose-700 sm:text-4xl">Emergency communication</h1>
        <p className="mt-1 max-w-2xl text-sl-ink-700">
          Tell SignLine what is happening in the way that is easiest for you. You will see what SignLine understood,
          can correct anything, and nothing is shared until you confirm it.
        </p>
      </div>
      <Notice />
      <ErrorNote error={error} onClose={() => setError(null)} />
      {resume && (
        <Link to={`/emergency/session/${resume}`} className="flex min-h-12 items-center justify-between rounded-sl border-2 border-rose-700 bg-rose-50 px-4 text-sm font-bold text-rose-800">
          Continue my current emergency report <span aria-hidden="true">→</span>
        </Link>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {MODES.map(({ id, title, text, icon: Icon }) => (
          <button key={id} type="button" disabled={Boolean(busy)} onClick={() => start(id)}
                  className="flex flex-col items-start gap-2 rounded-sl-lg border-2 border-sl-ink bg-white p-5 text-left shadow-sl-sm transition-colors hover:bg-rose-50 disabled:opacity-60">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-sl-ink bg-rose-600 text-white">
              {busy === id ? <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" /> : <Icon className="h-6 w-6" aria-hidden="true" />}
            </span>
            <span className="font-display text-xl font-extrabold">{title}</span>
            <span className="text-sm text-sl-ink-600">{text}</span>
          </button>
        ))}
      </div>
      <Hint>
        Live camera recognition is not connected to emergency mode yet: the SignLine model does not know most emergency signs
        (help, chest, pain, fire, accident…). In demo mode, signs come from the simulated recogniser below or from the sign list.
      </Hint>

      {config?.demo_mode && (
        <section className="rounded-sl-lg border border-sl-cream-300 bg-white p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg font-extrabold">Demo scenarios</h2>
            <DemoTag>Simulated recognition</DemoTag>
          </div>
          <p className="mb-3 text-sm text-sl-ink-600">
            Each scenario replays a fixed sign sequence with fixed confidence values, so you can see every step of the flow.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {config.scenarios.map((s) => (
              <li key={s.id}>
                <button type="button" disabled={Boolean(busy)} onClick={() => start(s.id === 'E_GESTURE' ? 'GESTURE' : 'SIGN', s.id)}
                        className="flex h-full w-full items-start gap-3 rounded-sl border-2 border-sl-cream-300 bg-sl-cream-50 p-3 text-left hover:border-sl-ink disabled:opacity-60">
                  {busy === s.id ? <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin" aria-hidden="true" />
                    : <PlayCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" aria-hidden="true" />}
                  <span>
                    <span className="block text-sm font-bold">{s.id[0]}. {s.title}</span>
                    <span className="block text-xs text-sl-ink-600">{s.description}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-sm">
        <Link to="/emergency/gestures" className="font-bold underline underline-offset-2">Set up my emergency gestures and needs</Link>
        {' · '}
        <Link to="/emergency/about" className="font-bold underline underline-offset-2">How this works and its limits</Link>
      </p>
    </div>
  )
}
