import { useId, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Labelled input with error and hint text; passwords get a show/hide button. */
export function Field({ label, error, hint, type = 'text', ...input }) {
  const id = useId()
  const [show, setShow] = useState(false)
  const isPassword = type === 'password'
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold text-sl-ink">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && show ? 'text' : type}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
          className={`min-h-12 w-full rounded-sl border-2 bg-white px-4 text-base text-sl-ink placeholder:text-sl-ink-400 ${error ? 'border-rose-600' : 'border-sl-ink'} ${isPassword ? 'pr-12' : ''}`}
          {...input}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Hide password' : 'Show password'}
            className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full hover:bg-sl-cream-200"
          >
            {show ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
          </button>
        )}
      </div>
      {hint && !error && <p id={`${id}-hint`} className="mt-1 text-xs text-sl-ink-600">{hint}</p>}
      {error && <p id={`${id}-err`} className="mt-1 text-sm font-semibold text-rose-700">⚠ {error}</p>}
    </div>
  )
}
