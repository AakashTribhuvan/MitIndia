/**
 * Status of a feature or a number, never colour alone (text + icon shape).
 * live = real data from the system; demo = works but not secured/real; unavailable = not built or not
 * reachable; placeholder = layout only.
 */
const STYLES = {
  live: { cls: 'bg-sl-sun-100 text-sl-sun-700 border-sl-sun-700/30', dot: '●', text: 'Live' },
  demo: { cls: 'bg-sl-sky-100 text-sl-sky-700 border-sl-sky-700/30', dot: '◆', text: 'Demo' },
  unavailable: { cls: 'bg-sl-cream-200 text-sl-ink-600 border-sl-ink-200', dot: '○', text: 'Not available' },
  placeholder: { cls: 'bg-sl-pink-100 text-sl-pink-700 border-sl-pink-700/30', dot: '▢', text: 'Coming soon' },
  error: { cls: 'bg-rose-50 text-rose-700 border-rose-700/30', dot: '!', text: 'Error' },
}

export default function StatusPill({ status = 'live', children, className = '' }) {
  const s = STYLES[status] || STYLES.unavailable
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${s.cls} ${className}`}>
      <span aria-hidden="true">{s.dot}</span>
      {children || s.text}
    </span>
  )
}
