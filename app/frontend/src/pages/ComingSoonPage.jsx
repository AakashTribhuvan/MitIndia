import { Link } from 'react-router-dom'
import Card from '../components/ui/Card'
import StatusPill from '../components/ui/StatusPill'
import { DoodleSparkle } from '../components/brand/Doodles'

/** Honest placeholder for a section that is planned but not built yet (no fake content). */
export default function ComingSoonPage({ title, eyebrow, children, links = [] }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-16">
      <Card outlined className="relative p-8">
        <DoodleSparkle className="absolute -right-3 -top-3 text-sl-purple" size={30} />
        <div className="flex flex-wrap items-center gap-3">
          {eyebrow && <span className="text-sm font-bold uppercase tracking-wider text-sl-ink-600">{eyebrow}</span>}
          <StatusPill status="placeholder" />
        </div>
        <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-sl-ink">{title}</h1>
        <div className="mt-4 space-y-3 text-sl-ink-700">{children}</div>
        {links.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-3">
            {links.map((l) => (
              <Link key={l.to} to={l.to} className="rounded-full border-2 border-sl-ink bg-white px-5 py-2 text-sm font-bold hover:bg-sl-cream-200">
                {l.label}
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
