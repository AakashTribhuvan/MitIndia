import React from 'react'
import { Users, Heart, GraduationCap, Building2, Quote, Sparkles } from 'lucide-react'

export default function ImpactSection() {
  const personas = [
    {
      title: 'Deaf & Hard-of-Hearing Signers',
      role: 'Express freely & autonomously',
      quote: 'Goal: sign at a counter or in class and have the words spoken aloud, without an interpreter.',
      badge: 'ISL Native User',
      color: 'lavender'
    },
    {
      title: 'Hearing Family & Friends',
      role: 'Connect with loved ones',
      quote: 'Goal: learn everyday ISL words with the 3D avatar and short practice sessions.',
      badge: 'Parent & Learner',
      color: 'peach'
    },
    {
      title: 'Educators & Inclusive Schools',
      role: 'Standardized ISL curriculum',
      quote: 'Goal: give students feedback on hand shape while they practise (rule-based coach, 8 signs today).',
      badge: 'Educator',
      color: 'gold'
    }
  ]

  return (
    <section className="py-20 sm:py-28 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-mudra-lavender-100 border border-mudra-lavender-300 text-mudra-lavender-700 text-xs font-semibold tracking-wide">
            <Users className="w-3.5 h-3.5 text-mudra-lavender-600" />
            <span>Built For Both Worlds</span>
          </div>

          <h2 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl text-mudra-indigo-900 tracking-tight">
            Designed for <span className="text-gradient">every voice & every sign.</span>
          </h2>

          <p className="text-mudra-indigo-600/80 text-base sm:text-lg max-w-2xl mx-auto">
            True accessibility is not one-sided. MUDRA empowers both visual signers seeking effortless expression and hearing allies learning to connect.
          </p>
        </div>

        {/* Intended users (no user studies yet: these are goals, not testimonials) */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          {personas.map((p, idx) => (
            <div
              key={idx}
              className="glass-card rounded-3xl p-6 sm:p-7 flex flex-col justify-between border border-white hover:border-mudra-lavender-300 shadow-lg hover:shadow-xl transition-all duration-300 relative group"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-mudra-lavender-100 text-mudra-lavender-800 font-mono">
                    {p.badge}
                  </span>
                  <Quote className="w-5 h-5 text-mudra-lavender-300 group-hover:text-mudra-lavender-500 transition-colors" />
                </div>

                <h3 className="font-display font-bold text-lg text-mudra-indigo-900 mb-1">
                  {p.title}
                </h3>
                <div className="text-xs font-medium text-mudra-peach-warm mb-4">
                  {p.role}
                </div>

                <p className="text-xs sm:text-sm text-mudra-indigo-700/90 leading-relaxed">
                  {p.quote}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-mudra-lavender-200/60 text-[11px] text-mudra-indigo-500">
                Intended use: not yet tested with users
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  )
}
