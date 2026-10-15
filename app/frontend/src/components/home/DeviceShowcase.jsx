import React, { useState, useEffect } from 'react'
import { 
  Laptop, 
  Tablet, 
  Smartphone, 
  Camera, 
  CheckCircle2, 
  Sparkles, 
  Users, 
  GraduationCap, 
  MessageSquare,
  ShieldCheck,
  Zap,
  ArrowRight
} from 'lucide-react'

export default function DeviceShowcase({ onNavigate }) {
  const [activeDevice, setActiveDevice] = useState('laptop')

  const deviceContexts = [
    {
      id: 'laptop',
      name: 'Laptop & Desktop',
      icon: Laptop,
      contextLabel: 'Classroom & Online Meetings',
      contextIcon: GraduationCap,
      headline: 'Full-screen interpretation in classrooms and remote calls.',
      description: 'Join Zoom lectures, telemedicine sessions, or workplace webinars. MUDRA runs in the browser with your built-in webcam; recognition needs the MUDRA server (no meeting-app integration yet).',
      useCases: ['University & School Classrooms', 'Telehealth & Doctor Consultations', 'Remote Workplace Meetings'],
      frameStyle: 'aspect-[16/10] max-w-xl',
      cameraBadge: 'Built-in Web Camera • 720p/1080p',
      screenPreview: {
        title: 'Online Biology Lecture • Signer Interpreting',
        signToken: 'HELLO',
        sentence: 'Hello.',
        userRole: 'Student in Lecture'
      }
    },
    {
      id: 'tablet',
      name: 'Tablet',
      icon: Tablet,
      contextLabel: 'Hands-Free Learning & Coaching',
      contextIcon: Users,
      headline: 'Prop it on your desk for interactive sign coaching.',
      description: 'Perfect for hands-free interactive practice sessions at home or school. Large tactile controls, 3D avatar demonstrations, and live landmark similarity coaching give students immediate confidence.',
      useCases: ['After-school ISL Practice', 'Teacher-Student 1-on-1 Feedback', 'Library & Study Desks'],
      frameStyle: 'aspect-[4/3] max-w-md',
      cameraBadge: 'Front-Facing Tablet Camera',
      screenPreview: {
        title: 'MUDRA Practice Studio • Hand Tracking',
        signToken: 'THANK YOU',
        sentence: 'Thank you.',
        userRole: 'Independent Learner'
      }
    },
    {
      id: 'phone',
      name: 'Smartphone',
      icon: Smartphone,
      contextLabel: 'Everyday On-the-Go Conversations',
      contextIcon: MessageSquare,
      headline: 'Pocket communicator wherever you go.',
      description: 'Hold up your phone at a metro ticket counter, pharmacy, or grocery store. Instant ISL-to-speech bridges spontaneous conversations with hearing individuals in seconds.',
      useCases: ['Metro Stations & Bus Counters', 'Pharmacy & Grocery Stores', 'Spontaneous Face-to-Face Chats'],
      frameStyle: 'aspect-[9/16] max-w-[280px]',
      cameraBadge: 'Mobile Phone Camera • Ultra-Portable',
      screenPreview: {
        title: 'MUDRA Pocket Communicator • Live Voice',
        signToken: 'GOOD MORNING',
        sentence: 'Good morning.',
        userRole: 'Citizen on the Move'
      }
    }
  ]

  const current = deviceContexts.find((d) => d.id === activeDevice) || deviceContexts[0]

  return (
    <section className="py-20 sm:py-28 relative overflow-hidden bg-gradient-to-b from-transparent via-white/70 to-transparent">
      
      {/* Ambient background glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/2 left-1/4 w-80 h-80 rounded-full bg-mudra-lavender-200/20 blur-3xl"></div>
        <div className="absolute bottom-10 right-1/4 w-72 h-72 rounded-full bg-mudra-peach-200/20 blur-3xl"></div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 space-y-12">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-100/90 border border-emerald-300 text-emerald-800 text-xs font-semibold tracking-wide shadow-xs">
            <Camera className="w-3.5 h-3.5 text-emerald-600" />
            <span>NO SPECIAL HARDWARE • NO GLOVES • NO SENSORS</span>
          </div>

          <h2 className="font-display font-extrabold text-3xl sm:text-4xl lg:text-5xl text-mudra-indigo-950 tracking-tight">
            Your camera is <span className="text-gradient">enough.</span>
          </h2>

          <p className="text-sm sm:text-base text-mudra-indigo-600/90 max-w-2xl mx-auto leading-relaxed">
            Whether you are in a classroom, on a remote call, or speaking with someone face-to-face, MUDRA works seamlessly with the standard camera already built into your device.
          </p>

          {/* Interactive Device Form Factor Tabs */}
          <div className="pt-2 flex justify-center">
            <div className="inline-flex p-1.5 rounded-2xl bg-white/90 border border-mudra-lavender-200 shadow-md gap-1.5">
              {deviceContexts.map((device) => {
                const Icon = device.icon
                const isSelected = activeDevice === device.id
                return (
                  <button
                    key={device.id}
                    type="button"
                    onClick={() => setActiveDevice(device.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-mudra-indigo-900 text-white shadow-md ring-2 ring-mudra-lavender-400 scale-102'
                        : 'text-mudra-indigo-700 hover:bg-mudra-lavender-50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{device.name}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Dynamic Transforming Device Stage */}
        <div className="max-w-5xl mx-auto">
          <div className="glass-card rounded-3xl p-6 sm:p-10 border border-white shadow-2xl bg-gradient-to-br from-white via-white to-mudra-lavender-50/50">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              
              {/* Left Column: Device Mockup Frame with Live Screen UI */}
              <div className="lg:col-span-7 flex justify-center items-center min-h-[380px] sm:min-h-[440px]">
                
                {/* Transforming Device Enclosure */}
                <div className={`w-full ${current.frameStyle} transition-all duration-500 ease-out bg-mudra-indigo-950 rounded-3xl p-3 sm:p-4 shadow-2xl border-4 border-mudra-indigo-800/90 relative flex flex-col justify-between overflow-hidden`}>
                  
                  {/* Glowing Active Camera Notch */}
                  <div className="flex justify-center items-center gap-2 mb-2 z-20">
                    <div className="w-2.5 h-2.5 rounded-full bg-mudra-indigo-800 border border-mudra-indigo-700"></div>
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></div>
                    <span className="text-[9px] font-mono text-mudra-indigo-300 font-semibold">
                      {current.cameraBadge}
                    </span>
                  </div>

                  {/* Inner Screen Display */}
                  <div className="w-full flex-1 bg-mudra-indigo-900/90 rounded-2xl p-4 flex flex-col justify-between text-white relative overflow-hidden border border-mudra-indigo-700/60">
                    
                    {/* Screen Header */}
                    <div className="flex items-center justify-between text-[10px] text-mudra-indigo-300 z-10">
                      <span className="font-mono font-bold text-mudra-peach-300">{current.screenPreview.title}</span>
                      <span className="bg-white/10 text-mudra-indigo-200 px-2 py-0.5 rounded-full font-mono font-bold">
                        Illustration
                      </span>
                    </div>

                    {/* Camera Feed Visual / Landmark Mesh */}
                    <div className="relative my-3 flex-1 min-h-[140px] rounded-xl bg-mudra-indigo-950/80 border border-mudra-indigo-800 flex items-center justify-center overflow-hidden">
                      {/* Grid */}
                      <div className="absolute inset-0 bg-[radial-gradient(#6D28D9_1px,transparent_1px)] [background-size:12px_12px] opacity-30"></div>

                      {/* Simulated Hand Silhouette with MediaPipe Points */}
                      <div className="relative z-10 flex flex-col items-center justify-center text-center p-2">
                        <div className="w-12 h-12 rounded-2xl bg-mudra-lavender-800/60 border border-mudra-lavender-500/40 flex items-center justify-center text-2xl shadow-lg mb-1.5 animate-pulse">
                          👋
                        </div>
                        <span className="text-[11px] font-mono font-bold text-mudra-lavender-200">
                          Example sign: {current.screenPreview.signToken}
                        </span>
                      </div>
                    </div>

                    {/* Synthesized Voice Banner */}
                    <div className="p-2.5 rounded-xl bg-white/10 backdrop-blur-md border border-white/10 flex items-center justify-between gap-2 z-10">
                      <div className="min-w-0">
                        <div className="text-[9px] uppercase font-mono text-mudra-peach-300 font-bold">
                          Spoken output (example):
                        </div>
                        <div className="text-xs font-semibold text-white truncate">
                          "{current.screenPreview.sentence}"
                        </div>
                      </div>
                      <div className="p-1.5 rounded-lg bg-mudra-lavender-600 text-white shrink-0 shadow-xs">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                    </div>

                  </div>

                </div>

              </div>

              {/* Right Column: Context & Human Story */}
              <div className="lg:col-span-5 space-y-5">
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-xl bg-mudra-lavender-100 text-mudra-lavender-700">
                      <current.contextIcon className="w-4 h-4" />
                    </span>
                    <span className="text-xs font-bold font-mono text-mudra-lavender-700 uppercase tracking-wider">
                      {current.contextLabel}
                    </span>
                  </div>

                  <h3 className="font-display font-extrabold text-2xl sm:text-3xl text-mudra-indigo-950 leading-tight">
                    {current.headline}
                  </h3>

                  <p className="text-xs sm:text-sm text-mudra-indigo-700 leading-relaxed">
                    {current.description}
                  </p>
                </div>

                {/* Practical Use Cases */}
                <div className="space-y-2.5 pt-2 border-t border-mudra-lavender-200/60">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-mudra-indigo-500 font-display">
                    Real-World Scenarios:
                  </div>
                  <div className="space-y-1.5">
                    {current.useCases.map((useCase, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs text-mudra-indigo-900">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="font-medium">{useCase}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Direct Action CTA */}
                <div className="pt-3">
                  <button
                    type="button"
                    onClick={() => onNavigate('communicate')}
                    className="btn-primary py-3 px-6 text-xs font-bold flex items-center gap-2 shadow-md cursor-pointer"
                  >
                    <span>Test Camera Stream</span>
                    <ArrowRight className="w-3.5 h-3.5" />
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
