import React, { useState, useEffect, useRef } from 'react'
import { 
  BookOpen, 
  Hand, 
  Search, 
  ArrowRight, 
  Sparkles, 
  CheckCircle2, 
  Play, 
  Pause, 
  RotateCcw, 
  ChevronLeft, 
  ChevronRight, 
  ExternalLink,
  Info,
  ShieldCheck,
  Eye,
  Type
} from 'lucide-react'
import { 
  ISL_VOCABULARY_LEXICON, 
  ISLRTC_DICTIONARY_URL, 
  parseSentenceToISLSteps, 
  findISLLexiconItem 
} from '../services/islDictionary'
import MudraAvatarViewer from '../components/avatar/MudraAvatarViewer'

export default function LearnPage({ onNavigate, onSelectPracticeSign }) {
  // Freeform sentence state
  const [sentenceInput, setSentenceInput] = useState('HELLO WATER THANK YOU')
  const [parsedSteps, setParsedSteps] = useState([])
  const [activeStepIndex, setActiveStepIndex] = useState(0)
  const [isPlayingSentence, setIsPlayingSentence] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Parse sentence on mount or input submission
  const handleParseSentence = (textToParse = sentenceInput) => {
    const steps = parseSentenceToISLSteps(textToParse)
    setParsedSteps(steps)
    setActiveStepIndex(0)
    setIsPlayingSentence(false)
  }

  useEffect(() => {
    handleParseSentence('HELLO WATER THANK YOU')
  }, [])

  // Word-by-word playback sequencer
  useEffect(() => {
    let timer = null
    if (isPlayingSentence && parsedSteps.length > 0) {
      const currentStep = parsedSteps[activeStepIndex]
      // Dynamic duration: whole words ~1800ms, fingerspelled ~2400ms
      const duration = currentStep?.status === 'fingerspelling' ? 2400 : 1800

      timer = setTimeout(() => {
        if (activeStepIndex < parsedSteps.length - 1) {
          setActiveStepIndex((prev) => prev + 1)
        } else {
          setIsPlayingSentence(false)
        }
      }, duration)
    }

    return () => clearTimeout(timer)
  }, [isPlayingSentence, activeStepIndex, parsedSteps])

  const activeStep = parsedSteps[activeStepIndex] || parsedSteps[0] || {
    rawText: 'HELLO',
    normalized: 'HELLO',
    status: 'verified_word',
    animationCode: 'HELLO',
    lexiconItem: ISL_VOCABULARY_LEXICON[0]
  }

  // Handle manual selection from dictionary
  const handleSelectDictionaryItem = (item) => {
    setSentenceInput(item.word)
    const steps = parseSentenceToISLSteps(item.word)
    setParsedSteps(steps)
    setActiveStepIndex(0)
    setIsPlayingSentence(false)
    window.scrollTo({ top: 120, behavior: 'smooth' })
  }

  const handleStartPractice = (signId) => {
    if (onSelectPracticeSign) {
      onSelectPracticeSign(signId)
    }
    onNavigate('practice')
  }

  const filteredLexicon = ISL_VOCABULARY_LEXICON.filter((sign) => {
    const matchesCategory = selectedCategory === 'all' || sign.category === selectedCategory
    const matchesSearch = sign.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          sign.hindi.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          sign.description.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  const categories = [
    { id: 'all', label: 'All Verified Signs' },
    { id: 'Greetings', label: 'Greetings' },
    { id: 'Essentials', label: 'Everyday Needs' },
    { id: 'Emergency', label: 'Emergency' },
    { id: 'Responses', label: 'Responses' },
    { id: 'Pronouns', label: 'Pronouns' },
    { id: 'Feelings', label: 'Feelings' }
  ]

  return (
    <div className="pt-6 lg:pt-10 pb-24 lg:pb-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
      
      {/* Header with ISLRTC Reference Citation */}
      <div className="text-center max-w-3xl mx-auto space-y-3">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-mudra-lavender-100 border border-mudra-lavender-300 text-mudra-lavender-700 text-xs font-semibold tracking-wide shadow-xs">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>ISLRTC Official Lexicon Standard (Indian Sign Language)</span>
        </div>

        <h1 className="font-display font-extrabold text-3xl sm:text-4xl lg:text-5xl text-mudra-indigo-900 tracking-tight">
          Learn ISL <span className="text-gradient">Word-by-Word with 3D Avatar.</span>
        </h1>

        <p className="text-sm sm:text-base text-mudra-indigo-600/80 max-w-2xl mx-auto">
          Type any sentence or choose authentic Indian Sign Language gestures. Watch our 3D instructor demonstrate step-by-step according to ISLRTC standards.
        </p>
      </div>

      {/* SECTION 1: SENTENCE BUILDER & TEXT-TO-ISL 3D DEMONSTRATOR */}
      <div className="max-w-5xl mx-auto glass-card rounded-3xl p-6 sm:p-8 border border-white shadow-2xl space-y-6">
        
        {/* Input Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold font-display uppercase tracking-wider text-mudra-indigo-700 flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5 text-mudra-lavender-600" />
              <span>Type Sentence or Words:</span>
            </label>
            <span className="text-[11px] text-mudra-indigo-400 font-mono">
              Whole-Word ISL + A-Z Fingerspelling
            </span>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleParseSentence(sentenceInput)
            }}
            className="flex flex-col sm:flex-row gap-3"
          >
            <input
              type="text"
              value={sentenceInput}
              onChange={(e) => setSentenceInput(e.target.value)}
              placeholder="e.g. 'I NEED WATER', 'HELLO WATER THANK YOU', 'NAMASTE YOU'..."
              className="flex-1 px-4 py-3 rounded-2xl bg-white border border-mudra-lavender-200 text-sm font-semibold text-mudra-indigo-950 focus:outline-none focus:border-mudra-lavender-500 shadow-inner"
            />
            <button
              type="submit"
              className="btn-primary py-3 px-6 text-xs font-bold whitespace-nowrap flex items-center justify-center gap-2 shadow-md cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>SHOW IN ISL</span>
            </button>
          </form>
        </div>

        {/* Word-by-Word Sequential Stepper Pipeline */}
        {parsedSteps.length > 0 && (
          <div className="space-y-3 pt-3 border-t border-mudra-lavender-200/60">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-mudra-indigo-800 font-display">
                Sentence Sequence:
              </span>
              <span className="text-[11px] text-mudra-indigo-500 font-mono">
                Word {activeStepIndex + 1} of {parsedSteps.length}
              </span>
            </div>

            {/* Stepper Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              {parsedSteps.map((step, idx) => {
                const isActive = activeStepIndex === idx
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setActiveStepIndex(idx)
                      setIsPlayingSentence(false)
                    }}
                    className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      isActive
                        ? 'bg-mudra-indigo-900 text-white shadow-md ring-2 ring-mudra-lavender-400 scale-105'
                        : step.status === 'verified_word'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                        : step.status === 'fingerspelling'
                        ? 'bg-mudra-lavender-50 text-mudra-lavender-800 border border-mudra-lavender-200 hover:bg-mudra-lavender-100'
                        : 'bg-gray-100 text-gray-600 border border-gray-200'
                    }`}
                  >
                    <span>{step.normalized}</span>
                    {step.status === 'verified_word' && (
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    )}
                  </button>
                )
              })}
            </div>

            {/* Step Status Banner */}
            <div className={`p-3 rounded-2xl text-xs flex items-center justify-between ${
              activeStep?.status === 'verified_word'
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                : activeStep?.status === 'fingerspelling'
                ? 'bg-mudra-lavender-50 text-mudra-lavender-900 border border-mudra-lavender-200'
                : 'bg-amber-50 text-amber-900 border border-amber-200'
            }`}>
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 shrink-0 text-mudra-lavender-600" />
                <span>
                  {activeStep?.status === 'verified_word'
                    ? `Verified Whole-Word ISL Sign: "${activeStep.normalized}"`
                    : activeStep?.status === 'fingerspelling'
                    ? `Whole-word sign unavailable for "${activeStep.rawText}". Demonstrating via ISL Fingerspelling (${activeStep.letters?.join('-')}).`
                    : `ISL gesture not supported yet for "${activeStep.rawText}".`}
                </span>
              </div>

              {activeStep?.lexiconItem?.sourceUrl && (
                <a
                  href={activeStep.lexiconItem.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] font-bold text-mudra-lavender-700 hover:underline flex items-center gap-1 shrink-0 ml-2"
                >
                  <span>ISLRTC Source</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        )}

        {/* 3D AVATAR DEMONSTRATOR STAGE */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center pt-2">
          
          {/* Left Column: Sign Details & Mechanics */}
          <div className="lg:col-span-6 space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 rounded-full bg-mudra-peach-100 text-mudra-peach-warm text-[10px] font-mono font-bold uppercase tracking-wider border border-mudra-peach-200">
                  {activeStep?.status === 'verified_word' ? 'Verified ISL Sign' : 'ISL Fingerspelling'}
                </span>
                {activeStep?.lexiconItem && (
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                    {activeStep.lexiconItem.category}
                  </span>
                )}
              </div>

              <h2 className="font-display font-black text-3xl sm:text-4xl text-mudra-indigo-950">
                {activeStep?.lexiconItem?.label || activeStep?.normalized}
              </h2>
              {activeStep?.lexiconItem?.hindi && (
                <div className="text-sm font-medium text-mudra-indigo-500 mt-0.5">
                  ({activeStep.lexiconItem.hindi})
                </div>
              )}

              <p className="text-xs sm:text-sm text-mudra-indigo-700 mt-2 leading-relaxed">
                {activeStep?.lexiconItem?.description ||
                  `Fingerspelled letter-by-letter using standard Indian Sign Language manual alphabet postures.`}
              </p>
            </div>

            {/* Anatomy Guidelines */}
            {activeStep?.lexiconItem && (
              <div className="space-y-2 text-xs bg-mudra-ivory-100/90 p-4 rounded-2xl border border-mudra-lavender-200">
                <div className="font-bold text-mudra-indigo-900 uppercase tracking-wider text-[10px]">
                  ISLRTC Sign Anatomy Breakdown:
                </div>
                <div><strong className="text-mudra-indigo-900">1. Hand Shape:</strong> <span className="text-mudra-indigo-700">{activeStep.lexiconItem.handShapeDesc}</span></div>
                <div><strong className="text-mudra-indigo-900">2. Spatial Position:</strong> <span className="text-mudra-indigo-700">{activeStep.lexiconItem.positionDesc}</span></div>
                <div><strong className="text-mudra-indigo-900">3. Dynamics:</strong> <span className="text-mudra-indigo-700">{activeStep.lexiconItem.movementDesc}</span></div>
              </div>
            )}

            {/* Playback Controls & CTA */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPlayingSentence(!isPlayingSentence)}
                  className="btn-primary py-2.5 px-4 text-xs font-bold flex items-center gap-1.5 shadow-md cursor-pointer"
                >
                  {isPlayingSentence ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isPlayingSentence ? 'Pause Sentence' : 'Play Full Sentence'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveStepIndex(Math.max(0, activeStepIndex - 1))}
                  disabled={activeStepIndex === 0}
                  className="p-2.5 rounded-xl bg-white border border-mudra-lavender-200 text-mudra-indigo-700 hover:bg-mudra-lavender-50 disabled:opacity-40 cursor-pointer"
                  title="Previous word"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setActiveStepIndex(Math.min(parsedSteps.length - 1, activeStepIndex + 1))}
                  disabled={activeStepIndex >= parsedSteps.length - 1}
                  className="p-2.5 rounded-xl bg-white border border-mudra-lavender-200 text-mudra-indigo-700 hover:bg-mudra-lavender-50 disabled:opacity-40 cursor-pointer"
                  title="Next word"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* YOUR TURN CTA */}
              <button
                type="button"
                onClick={() => handleStartPractice(activeStep?.lexiconItem?.id || activeStep?.normalized)}
                className="self-start inline-flex w-fit max-w-full items-center justify-center gap-2 rounded-[0.875rem] bg-mudra-indigo-900 px-4 py-2.5 text-xs font-display font-bold text-white shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg cursor-pointer"
              >
                <Hand className="w-4 h-4 text-mudra-peach-300" />
                <span>Practice {activeStep?.lexiconItem?.label || activeStep?.normalized} (Your Turn)</span>
                <ArrowRight className="w-4 h-4 text-mudra-peach-300" />
              </button>
            </div>
          </div>

          {/* Right Column: 3D Avatar Player */}
          <div className="lg:col-span-6 flex justify-center">
            <MudraAvatarViewer
              signText={activeStep?.animationCode || activeStep?.normalized || 'HELLO'}
              className="w-full max-w-md h-[360px] sm:h-[400px]"
            />
          </div>

        </div>

      </div>

      {/* SECTION 2: VERIFIED ISL DICTIONARY EXPLORER */}
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display font-bold text-2xl text-mudra-indigo-950">
              Avatar Sign Lexicon
            </h2>
            <p className="text-xs text-mudra-indigo-600">
              Click any sign below to instantly load its 3D demonstration in the studio.
            </p>
          </div>

          {/* ISLRTC External Citation */}
          <a
            href={ISLRTC_DICTIONARY_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-mudra-lavender-200 text-xs font-semibold text-mudra-lavender-700 hover:bg-mudra-lavender-50 transition-colors shadow-xs"
          >
            <span>islrtc.nic.in Dictionary</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Filter Bar & Search */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 flex-wrap">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCategory(c.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  selectedCategory === c.id
                    ? 'bg-mudra-lavender-600 text-white shadow-xs'
                    : 'bg-white text-mudra-indigo-700 border border-mudra-lavender-200 hover:bg-mudra-lavender-50'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-mudra-indigo-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search ISL vocabulary..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-white border border-mudra-lavender-200 text-xs text-mudra-indigo-900 focus:outline-none focus:border-mudra-lavender-500 shadow-xs"
            />
          </div>
        </div>

        {/* Dictionary Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredLexicon.map((item) => {
            const isSelected = activeStep?.lexiconItem?.id === item.id
            return (
              <div
                key={item.id}
                onClick={() => handleSelectDictionaryItem(item)}
                className={`glass-card rounded-2xl p-4 border transition-all flex flex-col justify-between cursor-pointer ${
                  isSelected
                    ? 'border-mudra-lavender-500 shadow-md ring-2 ring-mudra-lavender-400/30'
                    : 'border-white hover:border-mudra-lavender-300 shadow-sm hover:shadow-md'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-md bg-mudra-lavender-100 text-mudra-lavender-700">
                      {item.category}
                    </span>
                    <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      <span>Avatar</span>
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2">
                    <h3 className="font-display font-bold text-base text-mudra-indigo-900">{item.label}</h3>
                    <span className="text-xs text-mudra-indigo-400">({item.hindi})</span>
                  </div>

                  <p className="text-xs text-mudra-indigo-600 mt-1 line-clamp-2">
                    {item.description}
                  </p>

                  <div className="mt-2.5 p-2 rounded-lg bg-mudra-ivory-100 text-[11px] text-mudra-indigo-700 font-mono">
                    📍 {item.positionDesc}
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-mudra-lavender-200/60 flex items-center justify-between">
                  <span className="text-[10px] text-mudra-lavender-700 font-bold flex items-center gap-1">
                    <Eye className="w-3 h-3" />
                    <span>Watch in 3D</span>
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleStartPractice(item.id)
                    }}
                    className="text-xs font-bold text-mudra-indigo-700 hover:text-mudra-lavender-700 flex items-center gap-1 cursor-pointer"
                  >
                    <span>Practice</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

      </div>

    </div>
  )
}
