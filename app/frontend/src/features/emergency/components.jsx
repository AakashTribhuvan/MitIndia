import { Link, Outlet } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, CheckCircle2, Circle, Info, Phone } from 'lucide-react'
import Logo from '../../components/brand/Logo'
import { EMERGENCY_NUMBER, PROVENANCE } from './api'

/** Layout for the emergency and responder pages: no sign-in needed for emergency users. */
export function EmergencyLayout({ responder = false }) {
  return (
    <div className="min-h-screen bg-sl-cream">
      <a href="#em-main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-full focus:bg-white focus:px-4 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b-2 border-sl-ink bg-sl-cream-50">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
          <Link to="/" className="flex items-center gap-2" aria-label="Back to SignLine">
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            <Logo size={30} />
          </Link>
          <span className={`rounded-full border-2 border-sl-ink px-3 py-1 text-xs font-extrabold uppercase tracking-wide ${responder ? 'bg-sl-purple text-white' : 'bg-rose-600 text-white'}`}>
            {responder ? 'Responder desk' : 'Emergency'}
          </span>
        </div>
      </header>
      <main id="em-main" className="mx-auto max-w-5xl px-4 pb-16 pt-4">
        <Outlet />
      </main>
    </div>
  )
}

/** Always-visible prototype notice. */
export function Notice({ compact = false }) {
  return (
    <div role="note" className={`flex items-start gap-3 rounded-sl border-2 border-sl-ink bg-sl-sun-100 ${compact ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm'}`}>
      <Phone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        <strong>Prototype, demo mode.</strong> SignLine Emergency contacts no one: reports reach only the SignLine demo responder desk
        inside this app. In a real emergency in India, call <strong>{EMERGENCY_NUMBER}</strong>.
      </p>
    </div>
  )
}

export function DemoTag({ children = 'Simulated' }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-sl-sky-700/30 bg-sl-sky-100 px-2 py-0.5 text-[11px] font-bold text-sl-sky-700">
      <span aria-hidden="true">◆</span>{children}
    </span>
  )
}

export function ProvenanceTag({ value }) {
  const p = PROVENANCE[value] || PROVENANCE.SYSTEM_GENERATED
  return (
    <span title={p.label} className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${p.cls}`}>
      {p.short}<span className="sr-only">: {p.label}</span>
    </span>
  )
}

export function ErrorNote({ error, onClose }) {
  if (!error) return null
  return (
    <div role="alert" className="flex items-start gap-3 rounded-sl border-2 border-rose-700 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="flex-1">{error}</p>
      {onClose && <button type="button" onClick={onClose} className="text-xs font-bold underline">Dismiss</button>}
    </div>
  )
}

export function Hint({ children }) {
  return (
    <p className="flex items-start gap-2 text-xs text-sl-ink-600">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{children}
    </p>
  )
}

/** Status timeline: every step that happened, in order (text + icon, not colour alone). */
export function StatusTimeline({ history, viewer = 'user' }) {
  return (
    <ol className="space-y-2">
      {history.map((h, i) => (
        <li key={`${h.to}-${i}`} className="flex items-start gap-3 text-sm">
          {i === history.length - 1
            ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sl-green-700" aria-hidden="true" />
            : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-sl-ink-400" aria-hidden="true" />}
          <div>
            <p className={i === history.length - 1 ? 'font-bold' : ''}>{h.label}</p>
            <p className="text-xs text-sl-ink-600">
              {new Date(h.at).toLocaleTimeString()} · {h.actor === 'RESPONDER' ? 'responder' : h.actor === 'USER' ? (viewer === 'user' ? 'you' : 'user') : 'system'}
              {h.reason ? ` · ${h.reason}` : ''}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}

export function Section({ title, aside, children, className = '' }) {
  return (
    <section className={`rounded-sl-lg border border-sl-cream-300 bg-white p-4 sm:p-5 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-extrabold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function confidenceText(c) {
  return c == null ? 'selected' : `${Math.round(c * 100)}%`
}
