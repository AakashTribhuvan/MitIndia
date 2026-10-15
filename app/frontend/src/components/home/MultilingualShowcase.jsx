import React, { useState } from 'react'
import { Languages, Volume2, Sparkles } from 'lucide-react'
import { ISL_VOCABULARY_LEXICON } from '../../services/islDictionary'

export default function MultilingualShowcase() {
  const [activeSignId, setActiveSignId] = useState('WATER')
  const [speakingIndex, setSpeakingIndex] = useState(null) // 'en' | 'hi' | 'mr' | null

  // Core signs to showcase
  const showcaseSigns = ISL_VOCABULARY_LEXICON.filter(item => 
    ['HELLO', 'NAMASTE', 'WATER', 'THANK_YOU', 'HELP'].includes(item.id)
  )

  const activeSign = showcaseSigns.find(s => s.id === activeSignId) || showcaseSigns[0]

  const speakTranslation = (text, langCode, key) => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = langCode
    utterance.rate = 0.9
    
    setSpeakingIndex(key)
    utterance.onend = () => setSpeakingIndex(null)
    utterance.onerror = () => setSpeakingIndex(null)
    window.speechSynthesis.speak(utterance)
  }

  return (
    <section className="py-20 sm:py-28 relative overflow-hidden bg-gradient-to-b from-transparent via-mudra-lavender-50/20 to-transparent">
      {/* Background ambient light */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-mudra-lavender-300/10 blur-3xl"></div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-14">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-mudra-lavender-100 border border-mudra-lavender-300 text-mudra-lavender-700 text-xs font-semibold tracking-wide shadow-xs">
            <Languages className="w-3.5 h-3.5 text-mudra-lavender-600" />
            <span>Multilingual Understanding Bridge</span>
          </div>

          <h2 className="font-display font-extrabold text-3xl sm:text-4xl lg:text-5xl text-mudra-indigo-900 tracking-tight leading-tight">
            Your sign. <span className="text-gradient">Your language.</span>
          </h2>

          <p className="text-mudra-indigo-600/80 text-base sm:text-lg max-w-2xl mx-auto">
            Recognised words are spoken in English, हिंदी or मराठी. Full Hindi and Marathi sentences exist for a set of common phrases; other words are read out as the English word.
          </p>
        </div>

        {/* Showcase Grid */}
        <div className="max-w-4xl mx-auto glass-card rounded-3xl p-6 sm:p-10 border border-white shadow-xl bg-white/70 backdrop-blur-md">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-stretch">
            
            {/* Left side: Interactive selector & Description */}
            <div className="md:col-span-5 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <span className="text-xs font-bold font-display uppercase tracking-wider text-mudra-indigo-500">
                  Select a sign gesture
                </span>

                <div className="flex flex-col gap-2">
                  {showcaseSigns.map((sign) => {
                    const isActive = sign.id === activeSignId
                    return (
                      <button
                        key={sign.id}
                        type="button"
                        onClick={() => {
                          setActiveSignId(sign.id)
                          window.speechSynthesis?.cancel()
                          setSpeakingIndex(null)
                        }}
                        className={`p-3 rounded-2xl text-left border transition-all flex items-center justify-between text-xs sm:text-sm font-semibold cursor-pointer ${
                          isActive
                            ? 'bg-mudra-indigo-900 text-white border-mudra-indigo-950 shadow-md scale-[1.02]'
                            : 'bg-white text-mudra-indigo-800 border-mudra-lavender-100 hover:bg-mudra-lavender-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-base">👋</span>
                          <span>{sign.label}</span>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-mono ${
                          isActive ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-800'
                        }`}>
                          Verified
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* ISL Description box */}
              <div className="p-4 rounded-2xl bg-mudra-ivory-100 border border-mudra-lavender-200/60 text-xs space-y-1">
                <div className="font-bold text-mudra-indigo-900 font-display flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-mudra-lavender-600" />
                  <span>Gesture Mechanics:</span>
                </div>
                <p className="text-mudra-indigo-700 italic">
                  "{activeSign.description}"
                </p>
              </div>
            </div>

            {/* Right side: Multilingual Translations */}
            <div className="md:col-span-7 flex flex-col justify-center space-y-5">
              <span className="text-xs font-bold font-display uppercase tracking-wider text-mudra-indigo-500">
                Spoken Translations output
              </span>

              <div className="space-y-4">
                {/* English */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-mudra-lavender-50/50 to-white border border-mudra-lavender-200/60 flex items-center justify-between hover:shadow-md transition-all group">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-mudra-lavender-700 tracking-wider uppercase font-mono">
                      English (India)
                    </span>
                    <p className="font-display font-semibold text-base sm:text-lg text-mudra-indigo-950">
                      "{activeSign.translations.en}"
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => speakTranslation(activeSign.translations.en, 'en-IN', 'en')}
                    className={`p-3 rounded-xl border transition-all ${
                      speakingIndex === 'en'
                        ? 'bg-mudra-lavender-600 text-white border-mudra-lavender-700 animate-pulse'
                        : 'bg-white border-mudra-lavender-100 text-mudra-lavender-700 hover:bg-mudra-lavender-100 hover:text-mudra-lavender-800'
                    }`}
                    title="Play Speech"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Hindi */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-mudra-peach-50/40 to-white border border-mudra-peach-200/60 flex items-center justify-between hover:shadow-md transition-all group">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-mudra-peach-warm tracking-wider uppercase font-mono">
                      Hindi / हिन्दी
                    </span>
                    <p className="font-display font-semibold text-base sm:text-lg text-mudra-indigo-950">
                      "{activeSign.translations.hi}"
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => speakTranslation(activeSign.translations.hi, 'hi-IN', 'hi')}
                    className={`p-3 rounded-xl border transition-all ${
                      speakingIndex === 'hi'
                        ? 'bg-mudra-peach-500 text-white border-mudra-peach-600 animate-pulse'
                        : 'bg-white border-mudra-peach-200 text-mudra-peach-warm hover:bg-mudra-peach-100 hover:text-mudra-peach-500'
                    }`}
                    title="Hindi Speech"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Marathi */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-mudra-gold-50/40 to-white border border-mudra-gold-200/60 flex items-center justify-between hover:shadow-md transition-all group">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-mudra-gold-600 tracking-wider uppercase font-mono">
                      Marathi / मराठी
                    </span>
                    <p className="font-display font-semibold text-base sm:text-lg text-mudra-indigo-950">
                      "{activeSign.translations.mr}"
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => speakTranslation(activeSign.translations.mr, 'mr-IN', 'mr')}
                    className={`p-3 rounded-xl border transition-all ${
                      speakingIndex === 'mr'
                        ? 'bg-mudra-gold-500 text-white border-mudra-gold-600 animate-pulse'
                        : 'bg-white border-mudra-gold-200 text-mudra-gold-600 hover:bg-mudra-gold-100 hover:text-mudra-gold-700'
                    }`}
                    title="Marathi Speech"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

            </div>

          </div>
        </div>

      </div>
    </section>
  )
}
