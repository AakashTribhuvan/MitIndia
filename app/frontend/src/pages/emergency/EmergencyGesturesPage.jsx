import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, FlaskConical, Pencil, Trash2 } from 'lucide-react'
import Button from '../../components/ui/Button'
import { emergencyApi } from '../../features/emergency/api'
import { ErrorNote, Hint, ProvenanceTag, Section } from '../../features/emergency/components'

const EMPTY = { name: '', description: '', intent: 'REQUEST_MEDICAL_HELP', message: '', enabled: true, require_confirmation: true, cooldown_s: 10 }
const intentLabel = (id) => id.replaceAll('_', ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())

/** Personal emergency gestures (a mapping to an intent and message, not a trained recogniser) and communication needs. */
export default function EmergencyGesturesPage() {
  const [config, setConfig] = useState(null)
  const [gestures, setGestures] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState(null)
  const [needs, setNeeds] = useState([])
  const [tested, setTested] = useState(null)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(null)

  useEffect(() => {
    emergencyApi.config().then(setConfig).catch((e) => setError(e.message))
    emergencyApi.gestures().then(setGestures).catch((e) => setError(e.message))
    emergencyApi.preferences().then((p) => setNeeds(p.communication_needs)).catch(() => {})
  }, [])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? Number(e.target.value) : e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      if (editingId) {
        const g = await emergencyApi.updateGesture(editingId, form)
        setGestures((gs) => gs.map((x) => (x.id === g.id ? g : x)))
      } else {
        const g = await emergencyApi.createGesture(form)
        setGestures((gs) => [...gs, g])
      }
      setForm(EMPTY)
      setEditingId(null)
    } catch (err) { setError(err.message) }
  }

  const remove = async (g) => {
    if (!window.confirm(`Delete the gesture “${g.name}”?`)) return
    try { await emergencyApi.deleteGesture(g.id); setGestures((gs) => gs.filter((x) => x.id !== g.id)) } catch (err) { setError(err.message) }
  }

  const toggleNeed = async (need) => {
    const next = needs.includes(need) ? needs.filter((n) => n !== need) : [...needs, need]
    setNeeds(next)
    try { await emergencyApi.savePreferences({ communication_needs: next }); setSaved('Saved') } catch (err) { setError(err.message) }
  }

  return (
    <div className="space-y-4">
      <div>
        <Link to="/emergency" className="inline-flex items-center gap-1 text-sm font-bold text-sl-ink-600 hover:text-sl-ink">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Emergency
        </Link>
        <h1 className="font-display text-2xl font-extrabold sm:text-3xl">My emergency gestures and needs</h1>
        <p className="text-sm text-sl-ink-600">Saved on this device only (no account needed).</p>
      </div>
      <ErrorNote error={error} onClose={() => setError(null)} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={editingId ? 'Edit gesture' : 'New gesture'}>
          <form onSubmit={submit} className="space-y-3">
            <Hint>
              A gesture here is a shortcut you choose, such as “two taps on the chest”. Camera detection of personal gestures is not
              built yet: in an emergency you tap the gesture’s card, and its message is added to your report as said by you.
            </Hint>
            <label className="block text-sm font-bold">Name
              <input required maxLength={80} value={form.name} onChange={set('name')} placeholder="My Medical SOS"
                     className="mt-1 min-h-11 w-full rounded-sl border-2 border-sl-ink bg-white px-3 font-normal" />
            </label>
            <label className="block text-sm font-bold">How you make it (for you)
              <input maxLength={500} value={form.description} onChange={set('description')} placeholder="Closed fist on the chest, twice"
                     className="mt-1 min-h-11 w-full rounded-sl border-2 border-sl-ink bg-white px-3 font-normal" />
            </label>
            <label className="block text-sm font-bold">What it means
              <select value={form.intent} onChange={set('intent')} className="mt-1 min-h-11 w-full rounded-sl border-2 border-sl-ink bg-white px-2 font-normal">
                {(config?.intents || []).map((i) => <option key={i.id} value={i.id}>{intentLabel(i.id)} ({i.category_label})</option>)}
              </select>
            </label>
            <label className="block text-sm font-bold">Message for responders
              <textarea required maxLength={500} rows={3} value={form.message} onChange={set('message')}
                        placeholder="I need medical assistance. Please communicate with me using text."
                        className="mt-1 w-full rounded-sl border-2 border-sl-ink bg-white p-2 font-normal" />
            </label>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.enabled} onChange={set('enabled')} className="h-5 w-5" /> Turned on</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.require_confirmation} onChange={set('require_confirmation')} className="h-5 w-5" /> Ask before using</label>
              <label className="flex items-center gap-2">Wait between uses
                <input type="number" min={0} max={3600} value={form.cooldown_s} onChange={set('cooldown_s')} className="h-9 w-20 rounded border-2 border-sl-ink px-2" /> s
              </label>
            </div>
            <div className="flex gap-2">
              <Button type="submit">{editingId ? 'Save changes' : 'Add gesture'}</Button>
              {editingId && <Button variant="ghost" onClick={() => { setEditingId(null); setForm(EMPTY) }}>Cancel</Button>}
            </div>
          </form>
        </Section>

        <div className="space-y-4">
          <Section title="Your gestures">
            {!gestures.length ? <p className="text-sm text-sl-ink-600">None yet.</p> : (
              <ul className="space-y-2">
                {gestures.map((g) => (
                  <li key={g.id} className="rounded-sl border-2 border-sl-ink bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold">{g.name} {!g.enabled && <span className="text-xs font-normal text-sl-ink-600">(off)</span>}</p>
                        {g.description && <p className="text-xs text-sl-ink-600">{g.description}</p>}
                        <p className="mt-1 text-sm">{g.category_label}: “{g.message}”</p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-sl-cream-200" onClick={() => { setTested(null); emergencyApi.testGesture(g.id).then(setTested).catch((e) => setError(e.message)) }}>
                          <FlaskConical className="h-4 w-4" aria-hidden="true" /><span className="sr-only">Test {g.name}</span>
                        </button>
                        <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-sl-cream-200"
                                onClick={() => { setEditingId(g.id); setForm({ name: g.name, description: g.description, intent: g.intent, message: g.message, enabled: g.enabled, require_confirmation: g.require_confirmation, cooldown_s: g.cooldown_s }) }}>
                          <Pencil className="h-4 w-4" aria-hidden="true" /><span className="sr-only">Edit {g.name}</span>
                        </button>
                        <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-rose-50" onClick={() => remove(g)}>
                          <Trash2 className="h-4 w-4 text-rose-700" aria-hidden="true" /><span className="sr-only">Delete {g.name}</span>
                        </button>
                      </div>
                    </div>
                    {tested?.gesture.id === g.id && (
                      <div className="mt-2 flex items-start justify-between gap-2 rounded-sl bg-sl-sky-100 p-2 text-xs">
                        <span>Test only, nothing sent. A report would say: <strong>{tested.would_report.category_label}</strong>, “{tested.would_report.message}”</span>
                        <ProvenanceTag value={tested.would_report.provenance} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="How responders should communicate with me" aside={saved && <span className="text-xs text-sl-green-700">{saved}</span>}>
            <p className="mb-2 text-sm text-sl-ink-600">Added to every report you confirm. Only what you choose here.</p>
            <div className="flex flex-col gap-2">
              {(config?.communication_needs || []).map((n) => (
                <label key={n} className="flex min-h-11 items-center gap-3 rounded-sl border border-sl-cream-300 px-3 text-sm">
                  <input type="checkbox" className="h-5 w-5" checked={needs.includes(n)} onChange={() => toggleNeed(n)} /> {n}
                </label>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}
