import { useEffect, useRef, useState } from 'react'
import { CaseSensitive, Delete, Hand, MessagesSquare, Sparkles, Square, Video, X } from 'lucide-react'
import { PHRASE_MAX_SECONDS, letterSpeller, phraseRecorder } from '../../services/libraryClient'

export const INPUT_MODES = [
  { id: 'words', label: 'Dynamic', icon: Hand },
  { id: 'static', label: 'Static', icon: Hand },
  { id: 'spell', label: 'Alphabet', icon: CaseSensitive },
  { id: 'phrase', label: 'Phrase', icon: MessagesSquare },
  { id: 'auto', label: 'Auto', icon: Sparkles },
]

/** Words / Spell / Phrase switch for the Communicate page. */
export function InputModeSwitch({ mode, onChange }) {
  return (
    <div role="tablist" aria-label="What are you signing?" className="grid grid-cols-3 gap-1 rounded-2xl border-2 border-sl-ink bg-white p-1 sm:grid-cols-5">
      {INPUT_MODES.map(({ id, label, icon: Icon }) => (
        <button key={id} role="tab" type="button" aria-selected={mode === id} onClick={() => onChange(id)}
                className={`flex min-h-10 items-center justify-center gap-1.5 rounded-full text-sm font-bold ${mode === id ? 'bg-sl-ink text-white' : 'text-sl-ink hover:bg-sl-cream-200'}`}>
          <Icon className="h-4 w-4" aria-hidden="true" /> {label}
        </button>
      ))}
    </div>
  )
}

/**
 * Fingerspelling: letters are added when one hand shape is held steadily; the spelled word goes to the
 * sentence with "Add word". Recognition comes from the alphabet-photo model (see the accuracy note).
 */
export function SpellPanel({ cameraActive, onCommitWord, accuracy, confidenceFloor = 0 }) {
  const [guess, setGuess] = useState(null)
  const [letters, setLetters] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    letterSpeller.setConfidenceFloor(confidenceFloor)
    letterSpeller.onGuess = (r) => {
      const accepted = r.status === 'ok' && r.confidence >= confidenceFloor
      setGuess({ ...r, status: accepted ? 'ok' : r.status === 'no_hands' ? 'no_hands' : 'uncertain', letter: accepted ? r.letter : null })
      setError(null)
    }
    letterSpeller.onLetter = (L) => setLetters((s) => (s + L).slice(0, 40))
    letterSpeller.onError = () => setError('The recognition server is not reachable.')
    letterSpeller.start()
    return () => {
      letterSpeller.stop()
      letterSpeller.onGuess = letterSpeller.onLetter = letterSpeller.onError = null
    }
  }, [confidenceFloor])

  const top = guess?.top_k || []
  const commit = () => { if (letters) { onCommitWord(letters); setLetters('') } }

  return (
    <div className="space-y-4" aria-live="polite">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-sl-ink-600">Letter now</p>
        <div className="mt-1 flex items-end gap-3">
          <span className="font-display text-5xl font-extrabold leading-none">
            {!cameraActive ? '–' : guess?.status === 'ok' ? guess.letter : guess?.status === 'no_hands' ? '…' : '?'}
          </span>
          <span className="pb-1 text-sm text-sl-ink-600">
            {!cameraActive ? 'Start the camera' : guess?.status === 'no_hands' ? 'Show your hands'
              : guess?.status === 'ok' ? 'Hold it to add' : top.length ? `Maybe ${top.map((t) => t.label).join(', ')}` : 'Make a letter shape'}
          </span>
        </div>
        {top.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {top.map((t) => (
              <button key={t.letter} type="button" onClick={() => setLetters((s) => (s + t.letter).slice(0, 40))}
                      className="rounded-full border border-sl-cream-300 bg-white px-2.5 py-1 text-xs font-bold hover:border-sl-ink">
                + {t.letter} <span className="font-mono text-sl-ink-400">{Math.round(t.confidence * 100)}%</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-sl-ink-600">Spelled word</p>
        <div className="mt-1 flex min-h-12 items-center rounded-sl border-2 border-sl-ink bg-sl-cream-50 px-3 font-mono text-2xl font-bold tracking-[0.25em]">
          {letters || <span className="font-sans text-sm font-normal tracking-normal text-sl-ink-400">Letters appear here</span>}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={commit} disabled={!letters} className="btn-primary min-h-10 px-4 text-sm disabled:opacity-50">Add word to sentence</button>
          <button type="button" onClick={() => setLetters((s) => s.slice(0, -1))} disabled={!letters}
                  className="inline-flex min-h-10 items-center gap-1 rounded-full border-2 border-sl-ink px-3 text-sm font-bold disabled:opacity-50">
            <Delete className="h-4 w-4" aria-hidden="true" /> Delete letter
          </button>
          <button type="button" onClick={() => setLetters('')} disabled={!letters} className="min-h-10 px-3 text-sm font-bold underline disabled:opacity-50">Clear</button>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <p className="text-[11px] text-sl-ink-600">
        Hold each letter still for about a second; lower your hands to repeat a letter. Tap a guess to add it yourself.
        {accuracy ? ` Letter model: ${Math.round(accuracy.test_top1 * 100)}% right on held-out photos (${Math.round(accuracy.test_top3 * 100)}% in its top 3); not yet measured on webcams.` : ''}
      </p>
    </div>
  )
}

/**
 * Phrases: record one phrase, then choose it from the model's top guesses (the phrase model is right about
 * half the time on held-out videos, so it never adds a phrase on its own).
 */
export function PhrasePanel({ cameraActive, onCommitPhrase, accuracy }) {
  const [state, setState] = useState('idle') // idle | countdown | recording | checking | result | error
  const [count, setCount] = useState(3)
  const [result, setResult] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const timers = useRef([])

  const clearTimers = () => { timers.current.forEach(clearInterval); timers.current = [] }
  useEffect(() => () => { clearTimers(); phraseRecorder.cancel(); phraseRecorder.onAutoStop = null }, [])

  const finish = async () => {
    if (!phraseRecorder.recording) return // Done and the time limit can both fire
    clearTimers()
    setState('checking')
    try {
      const r = await phraseRecorder.stop()
      setResult(r)
      setState('result')
    } catch {
      setState('error')
    }
  }

  const begin = () => {
    setResult(null)
    setCount(3)
    setState('countdown')
    let n = 3
    const c = setInterval(() => {
      n -= 1
      setCount(n)
      if (n <= 0) {
        clearInterval(c)
        phraseRecorder.onAutoStop = finish
        phraseRecorder.start()
        setElapsed(0)
        setState('recording')
        const t0 = performance.now()
        timers.current.push(setInterval(() => setElapsed((performance.now() - t0) / 1000), 200))
      }
    }, 1000)
    timers.current.push(c)
  }

  const cancel = () => { clearTimers(); phraseRecorder.cancel(); setState('idle') }
  const top = (result?.top_k || []).slice(0, 3)

  return (
    <div className="space-y-4" aria-live="polite">
      {state === 'idle' || state === 'result' || state === 'error' ? (
        <button type="button" onClick={begin} disabled={!cameraActive} className="btn-primary min-h-12 w-full text-base disabled:opacity-50">
          <Video className="h-5 w-5" aria-hidden="true" /> {state === 'result' ? 'Sign another phrase' : 'Sign a phrase'}
        </button>
      ) : state === 'countdown' ? (
        <div className="flex min-h-12 items-center justify-between rounded-sl border-2 border-sl-ink bg-sl-sun-100 px-4">
          <span className="font-bold">Get ready… {count}</span>
          <button type="button" onClick={cancel} className="text-sm font-bold underline"><X className="inline h-4 w-4" aria-hidden="true" /> Cancel</button>
        </div>
      ) : state === 'recording' ? (
        <div className="space-y-2">
          <div className="flex min-h-12 items-center justify-between rounded-sl border-2 border-rose-700 bg-rose-50 px-4">
            <span className="font-bold text-rose-800">● Signing… {elapsed.toFixed(1)} / {PHRASE_MAX_SECONDS} s</span>
            <button type="button" onClick={finish} className="inline-flex min-h-9 items-center gap-1 rounded-full border-2 border-sl-ink bg-white px-3 text-sm font-bold">
              <Square className="h-4 w-4" aria-hidden="true" /> Done
            </button>
          </div>
          <p className="text-xs text-sl-ink-600">Sign the whole phrase once. It trims extra still frames after your hands settle; press Done sooner if you prefer. Maximum {PHRASE_MAX_SECONDS} s.</p>
        </div>
      ) : (
        <p className="flex min-h-12 items-center rounded-sl border-2 border-sl-ink bg-white px-4 font-bold">Checking…</p>
      )}

      {state === 'result' && (
        result.status === 'too_short' || result.status === 'no_hands' ? (
          <p className="rounded-sl bg-sl-cream-200 p-3 text-sm">No hands were seen long enough. Try again with both hands in view.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-bold">Which phrase did you sign?</p>
            {top.map((t) => (
              <button key={t.sign} type="button" onClick={() => { onCommitPhrase(t.sign); setState('idle'); setResult(null) }}
                      className="flex min-h-12 w-full items-center justify-between gap-3 rounded-sl border-2 border-sl-ink bg-white px-4 text-left font-bold hover:bg-sl-green-50">
                <span>{t.label}</span><span className="font-mono text-xs text-sl-ink-400">{Math.round(t.confidence * 100)}%</span>
              </button>
            ))}
            <button type="button" onClick={() => { setState('idle'); setResult(null) }} className="text-sm font-bold underline">None of these</button>
          </div>
        )
      )}
      {state === 'error' && <p role="alert" className="text-sm text-rose-700">The recognition server is not reachable.</p>}
      <p className="text-[11px] text-sl-ink-600">
        Phrases come from the team’s sentence videos; you always choose from the top guesses.
        {accuracy ? ` Phrase model: ${Math.round(accuracy.test_top1 * 100)}% first guess, ${Math.round(accuracy.test_top5 * 100)}% in its top 5 on held-out videos.` : ''}
      </p>
    </div>
  )
}
