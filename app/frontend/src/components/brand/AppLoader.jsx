import { Hand, Volume2 } from 'lucide-react'
import Logo from './Logo'
import { TAGLINE } from './tagline'

const H_PATH = 'M10 70 C 60 10, 110 10, 150 55 S 230 100, 270 40'
const V_PATH = 'M30 4 C 4 30, 56 50, 30 86'

function prefersReducedMotion() {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
      document.documentElement.classList.contains('reduced-motion')
  } catch {
    return false
  }
}

/**
 * A dashed "bridge" that draws itself (a solid copy of the path, animated, masks the dashed line),
 * with a dot travelling along it once it is drawn. Static when motion is reduced.
 */
function Bridge({ d, viewBox, width, height, className, id }) {
  const reduced = prefersReducedMotion()
  return (
    <svg viewBox={viewBox} width={width} height={height} className={className} aria-hidden="true">
      <defs>
        <mask id={`${id}-mask`}>
          <path d={d} fill="none" stroke="white" strokeWidth="10" strokeLinecap="round" pathLength="1"
                strokeDasharray="1" strokeDashoffset="0" className="animate-sl-draw" />
        </mask>
      </defs>
      <path d={d} fill="none" stroke="var(--sl-purple)" strokeWidth="4" strokeLinecap="round" strokeDasharray="10 9"
            mask={`url(#${id}-mask)`} />
      <circle r="6" fill="var(--sl-green)" stroke="var(--sl-ink)" strokeWidth="2">
        {reduced ? null : <animateMotion dur="2.2s" begin="2s" repeatCount="indefinite" path={d} />}
      </circle>
    </svg>
  )
}

function VoiceBars() {
  return (
    <span className="flex h-7 items-end gap-1" aria-hidden="true">
      {[0, 0.2, 0.4, 0.1].map((delay, i) => (
        <span key={i} className="w-1.5 rounded-full bg-sl-green-600 animate-wave" style={{ height: 10, animationDelay: `${delay}s` }} />
      ))}
    </span>
  )
}

/**
 * Start-up screen: a Deaf signer and a hearing person, connected by a bridge of meaning.
 * Shown only while the app initialises (see useStartup in App.jsx); every animation stops with
 * reduced motion, leaving the finished picture.
 */
export default function AppLoader({ leaving = false, failed = false, onRetry, onSkip }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`sl-motion fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-y-auto bg-sl-cream px-4 py-8 text-center transition-opacity duration-300 ${leaving ? 'opacity-0' : 'opacity-100'}`}
    >
      <div className="animate-sl-fade-up">
        <Logo size={52} />
      </div>
      <p className="animate-sl-fade-up mt-3 font-display text-lg font-bold text-sl-ink sm:text-xl" style={{ animationDelay: '0.3s' }}>
        {TAGLINE[0]} <span className="text-sl-purple-700">{TAGLINE[1]}</span>
      </p>

      <div className="mt-8 grid w-full max-w-4xl grid-cols-1 items-center gap-3 sm:grid-cols-[1fr_auto_1fr] sm:gap-4">
        <div className="animate-sl-in-left rounded-sl-lg border-2 border-sl-ink bg-sl-purple-50 p-4 text-left shadow-sl-sm sm:p-5">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-sl-ink bg-sl-purple text-white">
            <Hand className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="mt-3 text-xs font-bold uppercase tracking-wider text-sl-purple-700">Visual expression</p>
          <p className="font-display text-xl font-extrabold text-sl-ink">Deaf signer</p>
          <p className="mt-1 hidden text-sm text-sl-ink-600 sm:block">Signs with hand shapes, movement and facial expressions.</p>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-sl-ink-200 bg-white px-3 py-1 text-sm">
            <span className="h-2 w-2 rounded-full bg-sl-purple" aria-hidden="true" /> Signs: <strong className="text-sl-purple-700">HELLO</strong>
          </p>
        </div>

        <div className="flex flex-col items-center px-2">
          <Bridge id="h" d={H_PATH} viewBox="0 0 280 110" width="260" height="102" className="hidden sm:block" />
          <Bridge id="v" d={V_PATH} viewBox="0 0 60 90" width="48" height="72" className="sm:hidden" />
          <p className="animate-sl-fade-up text-xs font-bold uppercase tracking-[0.18em] text-sl-purple-700" style={{ animationDelay: '1.7s' }}>
            Meaning connected
          </p>
          <p className="animate-sl-fade-up mt-1 font-display text-lg font-extrabold text-sl-ink" style={{ animationDelay: '1.9s' }}>
            Your meaning finds a voice.
          </p>
          <div className="animate-sl-fade-up mt-2" style={{ animationDelay: '2.1s' }}><VoiceBars /></div>
        </div>

        <div className="animate-sl-in-right rounded-sl-lg border-2 border-sl-ink bg-sl-green-50 p-4 text-left shadow-sl-sm sm:p-5">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-sl-ink bg-sl-green text-sl-ink">
            <Volume2 className="h-6 w-6" aria-hidden="true" />
          </span>
          <p className="mt-3 text-xs font-bold uppercase tracking-wider text-sl-green-700">Spoken words</p>
          <p className="font-display text-xl font-extrabold text-sl-ink">Hearing person</p>
          <p className="mt-1 hidden text-sm text-sl-ink-600 sm:block">Hears or reads the words in their own language.</p>
          <div className="animate-sl-fade-up mt-3 rounded-sl border border-sl-ink-200 bg-white px-3 py-2" style={{ animationDelay: '2.3s' }}>
            <p className="text-[11px] font-bold uppercase tracking-wider text-sl-ink-600">Speech out</p>
            <p className="font-bold text-sl-ink">“Hello, nice to meet you!”</p>
          </div>
        </div>
      </div>

      <p className="mt-8 max-w-xs text-sm text-sl-ink-600">Bridging the gap between signs and understanding.</p>
      {failed ? (
        <div className="mt-5 space-y-3">
          <p className="text-sm font-semibold text-rose-700">SignLine could not start.</p>
          <button type="button" onClick={onRetry} className="rounded-full border-2 border-sl-ink bg-white px-5 py-2 text-sm font-bold">
            Try again
          </button>
        </div>
      ) : (
        <div className="mt-5 h-1.5 w-40 overflow-hidden rounded-full bg-sl-cream-300" aria-hidden="true">
          <div className="h-full w-2/5 rounded-full bg-sl-green-600 animate-sl-progress" />
        </div>
      )}
      {!failed && onSkip && (
        <button type="button" onClick={onSkip}
                className="mt-4 rounded-full border-2 border-sl-ink bg-white px-4 py-1.5 text-sm font-bold hover:bg-sl-cream-200">
          Skip intro
        </button>
      )}
      <span className="sr-only">{failed ? 'SignLine could not start' : 'Loading SignLine'}</span>
    </div>
  )
}
