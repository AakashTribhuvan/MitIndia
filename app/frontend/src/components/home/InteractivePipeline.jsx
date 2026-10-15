import React, { useState } from 'react'
import { Volume2, CheckCircle2, ArrowRight, Sparkles } from 'lucide-react'
import MudraAvatarViewer from '../avatar/MudraAvatarViewer'

/**
 * MUDRA Interactive Live Pipeline
 *
 * Avatar-centric demonstration of the ISL → Understanding → Voice flow.
 * No technical dashboards, no fake AI metrics, no landmark panels.
 * The 3D avatar is the visual hero.
 */

const DEMO_SIGNS = [
  {
    id: 'HELLO',
    label: 'HELLO',
    emoji: '👋',
    meaning: 'Hello, nice to meet you!',
    hindi: 'नमस्ते',
  },
  {
    id: 'WATER',
    label: 'WATER',
    emoji: '💧',
    meaning: 'Please give me some water.',
    hindi: 'पानी दीजिए',
  },
  {
    id: 'THANK_YOU',
    label: 'THANK YOU',
    emoji: '✨',
    meaning: 'Thank you very much.',
    hindi: 'धन्यवाद',
  },
  {
    id: 'HELP',
    label: 'HELP',
    emoji: '🤟',
    meaning: 'I need help, please.',
    hindi: 'मदद चाहिए',
  },
]

export default function InteractivePipeline({ onNavigate }) {
  const [activeSign, setActiveSign] = useState(DEMO_SIGNS[0])
  const [understood, setUnderstood] = useState(true)
  const [isSpeaking, setIsSpeaking] = useState(false)

  const handleSelectSign = (sign) => {
    if (sign.id === activeSign.id) return
    setUnderstood(false)
    setActiveSign(sign)
    // Brief pause, then show "UNDERSTOOD" again
    setTimeout(() => setUnderstood(true), 400)
  }

  const handleSpeak = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(activeSign.meaning)
      utterance.rate = 0.95
      utterance.pitch = 1.05
      setIsSpeaking(true)
      utterance.onend = () => setIsSpeaking(false)
      utterance.onerror = () => setIsSpeaking(false)
      window.speechSynthesis.speak(utterance)
    } else {
      // Graceful fallback
      setIsSpeaking(true)
      setTimeout(() => setIsSpeaking(false), 1500)
    }
  }

  return (
    <section className="py-20 sm:py-28 relative overflow-hidden bg-gradient-to-b from-transparent via-mudra-lavender-50/40 to-transparent">
      <style>{`
        .interactive-pipeline-card .pipeline-connector {
          opacity: 0;
          transform: scaleX(0.7);
          transform-origin: left center;
          transition: opacity 0.45s ease, transform 0.65s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .interactive-pipeline-card .pipeline-connector.is-understood {
          opacity: 1;
          transform: scaleX(1);
        }
        .interactive-pipeline-card .pipeline-meaning {
          transition: opacity 0.35s ease, transform 0.35s ease;
        }
        .interactive-pipeline-card .pipeline-meaning.is-changing {
          opacity: 0;
          transform: translateY(6px);
        }
        @keyframes pipeline-understood-pulse {
          0% { transform: scale(0.98); }
          55% { transform: scale(1.035); }
          100% { transform: scale(1); }
        }
        .interactive-pipeline-card .pipeline-understood-pulse {
          animation: pipeline-understood-pulse 0.65s ease-out;
        }
        @media (prefers-reduced-motion: reduce) {
          .interactive-pipeline-card .pipeline-connector,
          .interactive-pipeline-card .pipeline-meaning,
          .interactive-pipeline-card .pipeline-understood-pulse {
            transition: none;
            animation: none;
          }
        }
      `}</style>
      
      {/* Soft ambient background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 left-8 w-96 h-96 rounded-full bg-mudra-lavender-200/18 blur-3xl" />
        <div className="absolute bottom-12 right-12 w-80 h-80 rounded-full bg-mudra-peach-200/12 blur-3xl" />
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section header */}
        <div className="text-center space-y-3 mb-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-mudra-lavender-100 border border-mudra-lavender-300 text-mudra-lavender-700 text-xs font-semibold tracking-wide shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-mudra-lavender-500" />
            <span>HOW MUDRA COMMUNICATES</span>
          </div>

          <h2 className="font-display font-extrabold text-3xl sm:text-4xl lg:text-5xl text-mudra-indigo-950 tracking-tight">
            Turn a sign into <span className="text-gradient">something everyone</span> can understand.
          </h2>

          <p className="text-sm sm:text-base text-mudra-indigo-600/80 max-w-xl mx-auto">
            Select any sign below and watch MUDRA understand, demonstrate, and speak it — bridging every conversation.
          </p>
        </div>

        {/* Sign selector chips */}
        <div className="flex items-center justify-center gap-2 flex-wrap mb-8">
          {DEMO_SIGNS.map((s) => {
            const isSelected = activeSign.id === s.id
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => handleSelectSign(s)}
                className={`px-5 py-2.5 rounded-2xl text-sm font-bold transition-all flex items-center gap-2 cursor-pointer ${
                  isSelected
                    ? 'bg-mudra-indigo-900 text-white shadow-lg ring-2 ring-mudra-lavender-400 scale-105'
                    : 'bg-white text-mudra-indigo-800 border border-mudra-lavender-200 hover:bg-mudra-lavender-50 hover:border-mudra-lavender-300'
                }`}
              >
                <span>{s.emoji}</span>
                <span>{s.label}</span>
              </button>
            )
          })}
        </div>

        {/* Main pipeline card */}
        <div className="interactive-pipeline-card glass-card rounded-3xl border border-mudra-lavender-200/80 shadow-xl overflow-hidden bg-mudra-ivory-50/80">
          <div className="grid grid-cols-1 lg:grid-cols-2">
            
            {/* LEFT: 3D Avatar visualization */}
            <div className="relative flex flex-col bg-mudra-ivory-50/90 border-b border-mudra-lavender-200/70 lg:border-b-0 lg:border-r">
              
              {/* Compact understanding status */}
              <div className="flex items-center justify-end px-5 pt-5 pb-1 sm:px-6">
                {/* UNDERSTOOD badge */}
                <div className={`pipeline-understood-pulse flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all duration-300 ${
                  understood
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-white text-mudra-indigo-300 border border-mudra-lavender-200'
                }`}>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>DEMO</span>
                </div>
              </div>

              {/* 3D Avatar — tall, dominant */}
              <div className="flex-1 min-h-[280px] sm:min-h-[340px] relative px-3 sm:px-5">
                <MudraAvatarViewer
                  signText={activeSign.id}
                  className="w-full h-full border-none shadow-none"
                />
              </div>

            </div>

            {/* RIGHT: Meaning & Voice */}
            <div className="relative flex flex-col justify-between p-6 sm:p-8 space-y-7 bg-white/70">
              <div className={`pipeline-connector absolute left-0 top-1/2 hidden h-px w-10 -translate-x-1/2 bg-gradient-to-r from-mudra-lavender-300 to-mudra-peach-300 shadow-[0_0_12px_rgba(139,92,246,0.28)] lg:block ${understood ? 'is-understood' : ''}`} aria-hidden="true" />
              
              {/* Meaning card */}
              <div className="space-y-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-mudra-lavender-700 font-display">
                  WHAT IT MEANS
                </div>

                <div className={`pipeline-meaning ${understood ? '' : 'is-changing'}`}>
                  <blockquote className="font-display font-extrabold text-2xl sm:text-3xl text-mudra-indigo-950 leading-snug">
                    "{activeSign.meaning}"
                  </blockquote>
                </div>

                <div className="flex items-start gap-3 p-4 rounded-2xl bg-mudra-lavender-50/80 border border-mudra-lavender-200/80">
                  <div className="text-2xl leading-none">{activeSign.emoji}</div>
                  <div>
                    <div className="text-xs font-bold text-mudra-indigo-800 mb-0.5">
                      ISL SIGN: {activeSign.label}
                    </div>
                    <div className="text-xs text-mudra-indigo-600 leading-relaxed">
                      Demonstration: the avatar performs the sign and the example meaning is spoken. Live recognition is on the Communicate page.
                    </div>
                  </div>
                </div>
              </div>

              {/* Speak button */}
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleSpeak}
                  disabled={!understood}
                  className={`w-full py-3.5 px-6 rounded-2xl font-display font-bold text-sm flex items-center justify-center gap-2.5 shadow-lg transition-all cursor-pointer ${
                    isSpeaking
                      ? 'bg-mudra-lavender-700 text-white scale-[1.02] shadow-glow-lavender'
                      : 'bg-mudra-indigo-900 hover:bg-mudra-indigo-800 text-white disabled:opacity-40'
                  }`}
                >
                  <Volume2 className={`w-4 h-4 text-mudra-peach-300 ${isSpeaking ? 'animate-bounce' : ''}`} />
                  <span>{isSpeaking ? 'Speaking...' : '🔊 Speak'}</span>
                </button>

                <p className="text-[11px] text-center text-mudra-indigo-400 leading-relaxed">
                  {typeof window !== 'undefined' && 'speechSynthesis' in window
                    ? 'Browser voice synthesis active.'
                    : 'Browser speech not available. Try Chrome or Edge.'}
                </p>
              </div>

              {/* CTA to full experience */}
              <div className="pt-4 border-t border-mudra-lavender-200/60 flex items-center justify-between text-xs">
                <span className="text-mudra-indigo-500">Want to use your real camera?</span>
                <button
                  type="button"
                  onClick={() => onNavigate('communicate')}
                  className="font-bold text-mudra-lavender-700 hover:text-mudra-lavender-900 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <span>Open Full Hub</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

            </div>

          </div>
        </div>

      </div>
    </section>
  )
}
