import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { Notice, ProvenanceTag, Section } from '../../features/emergency/components'

export default function EmergencyAboutPage() {
  return (
    <div className="space-y-4">
      <div>
        <Link to="/emergency" className="inline-flex items-center gap-1 text-sm font-bold text-sl-ink-600 hover:text-sl-ink">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Emergency
        </Link>
        <h1 className="font-display text-2xl font-extrabold sm:text-3xl">How SignLine Emergency works</h1>
      </div>
      <Notice />
      <div className="grid gap-4 md:grid-cols-2">
        <Section title="The steps">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm">
            <li>You tell SignLine what is happening: buttons, signs, or your own gesture.</li>
            <li>Every sign is shown with how sure the recogniser was. You can correct or remove any of them.</li>
            <li>Fixed, written rules (no AI guessing) turn what you said into a short report, for example “You reported chest pain.”</li>
            <li>SignLine asks at most a few short questions, only when the answer changes the report. All can be skipped.</li>
            <li>You review the report. Nothing is shared until you confirm it.</li>
            <li>You choose to share it. You see whether it was delivered, acknowledged and resolved.</li>
          </ol>
        </Section>
        <Section title="Where each fact comes from">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2"><ProvenanceTag value="USER_REPORTED" /> signed, tapped, typed or answered by you</li>
            <li className="flex items-center gap-2"><ProvenanceTag value="AI_INFERRED" /> SignLine’s interpretation, with the rule that produced it</li>
            <li className="flex items-center gap-2"><ProvenanceTag value="USER_CONFIRMED" /> what you confirmed on the review screen</li>
            <li className="flex items-center gap-2"><ProvenanceTag value="SYSTEM_GENERATED" /> ids, times and statuses</li>
          </ul>
        </Section>
        <Section title="Limits (please read)">
          <ul className="list-disc space-y-1.5 pl-5 text-sm">
            <li>It is a prototype. It does not contact police, ambulance, fire services or any phone number.</li>
            <li>“Delivered” means delivered to the SignLine demo responder desk inside this app, nothing more.</li>
            <li>Live camera recognition is not connected to emergency mode: the current SignLine model does not know most emergency signs.
              Demo signs come from a simulated recogniser with fixed confidence values.</li>
            <li>It never diagnoses. A report repeats what you said; it does not decide how serious it is.</li>
          </ul>
        </Section>
        <Section title="Privacy">
          <ul className="list-disc space-y-1.5 pl-5 text-sm">
            <li>No camera video or images are stored.</li>
            <li>Location is shared only when you choose to; your browser asks for permission first.</li>
            <li>No account is needed: your gestures and needs are tied to this device only.</li>
            <li>Usage statistics contain only counts and categories, never your signs, messages or location.</li>
            <li>Reports are deleted after the retention period set by the operator (30 days by default).</li>
          </ul>
        </Section>
      </div>
    </div>
  )
}
