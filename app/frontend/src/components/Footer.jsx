import React from 'react'
import { Sparkles, Heart, Shield, Accessibility, ArrowUp } from 'lucide-react'
import { useAccessibility } from '../context/AccessibilityContext'

export default function Footer({ onNavigate }) {
  const { setIsModalOpen } = useAccessibility()

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <footer className="border-t border-mudra-lavender-200/80 bg-white/70 backdrop-blur-md relative z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 lg:gap-12">
          
          {/* Col 1: Brand & Tagline */}
          <div className="md:col-span-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-mudra-indigo-900 flex items-center justify-center text-mudra-ivory-50">
                <Sparkles className="w-4 h-4 text-mudra-peach-300" />
              </div>
              <span className="font-display font-bold text-xl text-mudra-indigo-900">
                MUDRA
              </span>
            </div>

            <p className="text-xs sm:text-sm text-mudra-indigo-600 leading-relaxed max-w-sm">
              AI-powered Indian Sign Language (ISL) learning and real-time communication platform bridging ISL, natural text, and speech.
            </p>

            <div className="text-xs font-semibold text-mudra-lavender-700">
              Where Every Sign Finds a Voice.
            </div>
          </div>

          {/* Col 2: Navigation Links */}
          <div className="md:col-span-3 space-y-3">
            <div className="font-display font-bold text-xs uppercase tracking-wider text-mudra-indigo-900">
              Platform Modules
            </div>
            <ul className="space-y-2 text-xs sm:text-sm">
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('home')}
                  className="text-mudra-indigo-600 hover:text-mudra-lavender-700 transition-colors"
                >
                  Home Overview
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('communicate')}
                  className="text-mudra-indigo-600 hover:text-mudra-lavender-700 transition-colors flex items-center gap-1.5"
                >
                  <span>Real-Time Communicator</span>
                  <span className="text-[10px] bg-mudra-peach-100 text-mudra-peach-warm px-1.5 py-0.2 rounded-full font-bold">2-Way</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('learn')}
                  className="text-mudra-indigo-600 hover:text-mudra-lavender-700 transition-colors"
                >
                  ISL Dictionary & Lessons
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('practice')}
                  className="text-mudra-indigo-600 hover:text-mudra-lavender-700 transition-colors flex items-center gap-1.5"
                >
                  <span>AI Sign Coach</span>
                  <span className="text-[10px] bg-mudra-lavender-100 text-mudra-lavender-700 px-1.5 py-0.2 rounded-full font-bold">Feedback</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('progress')}
                  className="text-mudra-indigo-600 hover:text-mudra-lavender-700 transition-colors"
                >
                  Student Progress Dashboard
                </button>
              </li>
            </ul>
          </div>

          {/* Col 3: Accessibility & Inclusion */}
          <div className="md:col-span-4 space-y-3">
            <div className="font-display font-bold text-xs uppercase tracking-wider text-mudra-indigo-900">
              Accessibility & Ethics
            </div>
            <p className="text-xs text-mudra-indigo-600 leading-relaxed">
              Camera video never leaves your device. For recognition, hand and body landmark coordinates are sent to the MUDRA server; signs you record on the Record page are stored there. Not yet audited against WCAG.
            </p>
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-mudra-lavender-700 hover:underline"
              >
                <Accessibility className="w-3.5 h-3.5" />
                <span>Customize Accessibility Preferences</span>
              </button>
            </div>
          </div>

        </div>

        {/* Bottom copyright and back-to-top */}
        <div className="mt-12 pt-6 border-t border-mudra-lavender-200/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-mudra-indigo-500">
          <div className="flex items-center gap-2">
            <span>© 2026 MUDRA AI. National Hackathon Prototype.</span>
          </div>

          <button
            type="button"
            onClick={scrollToTop}
            className="flex items-center gap-1 text-mudra-indigo-600 hover:text-mudra-lavender-700 transition-colors"
          >
            <span>Back to top</span>
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>
    </footer>
  )
}
