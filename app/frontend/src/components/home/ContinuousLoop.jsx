import React, { useState } from 'react'
import { 
  BookOpen, 
  Hand, 
  CheckCircle2, 
  TrendingUp, 
  Zap, 
  ArrowRight,
  Sparkles,
  CheckCircle
} from 'lucide-react'

export default function ContinuousLoop({ onNavigate }) {
  const steps = [
    {
      id: 'learn',
      num: '01',
      title: 'LEARN',
      subtitle: 'Understand ISL Anatomy',
      icon: BookOpen,
      desc: 'Master the hand shapes, spatial orientation, movement dynamics, and facial markers for authentic Indian Sign Language.',
      previewTag: 'Dictionary & Grammar',
      color: 'lavender',
      actionRoute: 'learn'
    },
    {
      id: 'practice',
      num: '02',
      title: 'PRACTICE',
      subtitle: 'Real-Time Camera Feedback',
      icon: Hand,
      desc: 'Sign in front of your regular webcam. MUDRA extracts 21 landmark hand coordinates in real time without special hardware.',
      previewTag: 'Zero-Hardware AI',
      color: 'indigo',
      actionRoute: 'practice'
    },
    {
      id: 'feedback',
      num: '03',
      title: 'GET FEEDBACK',
      subtitle: 'Multi-Vector Coaching',
      icon: CheckCircle2,
      desc: 'Receive nuanced advice beyond right/wrong: shape curvature, chest alignment, and motion speed tips to perfect your posture.',
      previewTag: 'Constructive AI Coach',
      color: 'peach',
      actionRoute: 'practice'
    },
    {
      id: 'improve',
      num: '04',
      title: 'IMPROVE',
      subtitle: 'Track Your Practice',
      icon: TrendingUp,
      desc: 'The Progress page keeps your practice sessions and similarity scores on this device so you can see which signs need more work.',
      previewTag: 'Practice History',
      color: 'gold',
      actionRoute: 'progress'
    },
    {
      id: 'communicate',
      num: '05',
      title: 'COMMUNICATE',
      subtitle: 'Fluid 2-Way Real-Time Bridge',
      icon: Zap,
      desc: 'Put your knowledge to work: spontaneous sign-to-speech for Deaf users and speech-to-sign visual guidance for hearing listeners.',
      previewTag: 'Universal Connection',
      color: 'purple',
      actionRoute: 'communicate'
    }
  ]

  const [activeStep, setActiveStep] = useState(steps[0])

  return (
    <section className="py-20 sm:py-28 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-mudra-lavender-100 border border-mudra-lavender-300 text-mudra-lavender-700 text-xs font-semibold tracking-wide">
            <Sparkles className="w-3.5 h-3.5 text-mudra-lavender-600" />
            <span>The Complete Ecosystem</span>
          </div>

          <h2 className="font-display font-bold text-3xl sm:text-4xl lg:text-5xl text-mudra-indigo-900 tracking-tight">
            More than a classifier. <br />
            A <span className="text-gradient">continuous learning loop.</span>
          </h2>

          <p className="text-mudra-indigo-600/80 text-base sm:text-lg max-w-2xl mx-auto">
            Isolated sign recognition apps fail because communication requires continuous mastery. MUDRA unites curriculum, AI coaching, and real-time dialogue into one fluid cycle.
          </p>
        </div>

        {/* The 5-Stage Interactive Progression Loop */}
        <div className="mt-14">
          {/* Loop Steps Grid / Timeline */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4">
            {steps.map((step, idx) => {
              const Icon = step.icon
              const isSelected = activeStep.id === step.id
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setActiveStep(step)}
                  className={`text-left p-4 sm:p-5 rounded-2xl transition-all duration-300 border relative ${
                    isSelected
                      ? 'bg-white shadow-xl border-mudra-lavender-400 scale-[1.03] z-10'
                      : 'bg-white/60 hover:bg-white/90 border-mudra-lavender-200/70 opacity-80 hover:opacity-100'
                  }`}
                >
                  {/* Top Step Number & Icon */}
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-xs font-mono font-bold ${
                      isSelected ? 'text-mudra-lavender-700' : 'text-mudra-indigo-400'
                    }`}>
                      {step.num}
                    </span>
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                      isSelected
                        ? 'bg-mudra-lavender-600 text-white'
                        : 'bg-mudra-lavender-100 text-mudra-lavender-700'
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                  </div>

                  <h3 className="font-display font-bold text-sm sm:text-base text-mudra-indigo-900 mb-1">
                    {step.title}
                  </h3>
                  <p className="text-[11px] text-mudra-indigo-500 font-medium line-clamp-2">
                    {step.subtitle}
                  </p>

                  {/* Active Indicator Bar */}
                  {isSelected && (
                    <div className="absolute bottom-0 left-4 right-4 h-1 bg-gradient-to-r from-mudra-lavender-500 to-mudra-peach-400 rounded-full" />
                  )}
                </button>
              )
            })}
          </div>

          {/* Active Step Deep-Dive Showcase Box */}
          <div className="mt-8">
            <div className="glass-card rounded-3xl p-6 sm:p-10 border border-white shadow-2xl relative overflow-hidden bg-gradient-to-br from-white/95 via-white/85 to-mudra-lavender-50/50">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                
                {/* Left Step Information */}
                <div className="lg:col-span-7 space-y-4">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-mudra-lavender-100 text-mudra-lavender-800 text-xs font-bold font-mono">
                    <span>STEP {activeStep.num} OF 05</span>
                    <span>•</span>
                    <span>{activeStep.previewTag}</span>
                  </div>

                  <h3 className="font-display font-extrabold text-2xl sm:text-3xl text-mudra-indigo-900">
                    {activeStep.title}: {activeStep.subtitle}
                  </h3>

                  <p className="text-mudra-indigo-600 text-base sm:text-lg leading-relaxed">
                    {activeStep.desc}
                  </p>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => onNavigate(activeStep.actionRoute)}
                      className="btn-primary py-2.5 px-5 text-sm inline-flex items-center gap-2"
                    >
                      <span>Explore {activeStep.title} Module</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Right Interactive Visual Simulation */}
                <div className="lg:col-span-5">
                  <div className="bg-mudra-indigo-900 rounded-2xl p-5 sm:p-6 text-white border border-mudra-indigo-700 shadow-xl space-y-3">
                    <div className="flex items-center justify-between border-b border-mudra-indigo-700/60 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        <span className="text-xs font-bold uppercase tracking-wider text-mudra-peach-300 font-display">
                          {activeStep.title} In Action
                        </span>
                      </div>
                      <span className="text-[11px] text-mudra-indigo-300 font-mono">MUDRA Core</span>
                    </div>

                    {activeStep.id === 'learn' && (
                      <div className="space-y-3 pt-1">
                        <div className="p-3 rounded-xl bg-mudra-indigo-800/80 border border-mudra-indigo-700 text-xs space-y-1">
                          <div className="text-mudra-peach-300 font-semibold">Vocabulary Card: WATER (जल / पानी)</div>
                          <div className="text-mudra-indigo-200">Hand Shape: W-form • Location: Lower Chin • Movement: Double Tap</div>
                        </div>
                        <div className="text-[11px] text-mudra-indigo-300 flex items-center gap-2">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Includes 3D motion vector demonstration</span>
                        </div>
                      </div>
                    )}

                    {activeStep.id === 'practice' && (
                      <div className="space-y-3 pt-1">
                        <div className="p-3 rounded-xl bg-mudra-indigo-800/80 border border-mudra-indigo-700 text-xs space-y-1">
                          <div className="text-mudra-lavender-300 font-semibold">Landmark Mesh Tracking</div>
                          <div className="text-mudra-indigo-200">21 hand keypoints per hand, tracked in the browser</div>
                        </div>
                        <div className="text-[11px] text-mudra-indigo-300 flex items-center gap-2">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Calculated instantly on client camera feed</span>
                        </div>
                      </div>
                    )}

                    {activeStep.id === 'feedback' && (
                      <div className="space-y-2 pt-1">
                        <div className="flex justify-between text-xs font-mono">
                          <span className="text-emerald-300">✓ Hand shape score</span>
                          <span className="text-emerald-300">✓ Position score</span>
                        </div>
                        <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs">
                          Example tip: "Raise your hand a little higher."
                        </div>
                      </div>
                    )}

                    {activeStep.id === 'improve' && (
                      <div className="space-y-3 pt-1">
                        <div className="p-3 rounded-xl bg-mudra-indigo-800/80 border border-mudra-indigo-700 text-xs space-y-1">
                          <div className="text-mudra-peach-300 font-semibold">Practice history</div>
                          <div className="text-mudra-indigo-200">Each session's similarity score is saved on this device</div>
                        </div>
                        <div className="text-[11px] text-mudra-indigo-300 flex items-center gap-2">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Stored locally, nothing uploaded</span>
                        </div>
                      </div>
                    )}

                    {activeStep.id === 'communicate' && (
                      <div className="space-y-3 pt-1">
                        <div className="p-3 rounded-xl bg-mudra-indigo-800/80 border border-mudra-indigo-700 text-xs space-y-1">
                          <div className="text-mudra-lavender-300 font-semibold">Spontaneous Real-Time Pipeline</div>
                          <div className="text-mudra-indigo-200">Sign &rarr; recognised word &rarr; sentence &rarr; speech</div>
                        </div>
                        <div className="text-[11px] text-mudra-indigo-300 flex items-center gap-2">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Bi-directional audio synthesis enabled</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>

      </div>
    </section>
  )
}
