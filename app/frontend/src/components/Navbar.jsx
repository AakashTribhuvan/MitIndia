import React, { useState, useEffect } from 'react'
import { 
  Menu, 
  X, 
  Sparkles, 
  Sliders, 
  ArrowRight,
  Hand,
  BookOpen,
  Camera,
  Activity,
  Award,
  Video
} from 'lucide-react'
import { useAccessibility } from '../context/AccessibilityContext'

export default function Navbar({ activeTab, onNavigate }) {
  const [isScrolled, setIsScrolled] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { setIsModalOpen, highContrast, setHighContrast } = useAccessibility()

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 20) {
        setIsScrolled(true)
      } else {
        setIsScrolled(false)
      }
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const navItems = [
    { id: 'home', label: 'Home', icon: Sparkles },
    { id: 'communicate', label: 'Communicate', icon: Camera, badge: 'Live AI' },
    { id: 'learn', label: 'Learn', icon: BookOpen },
    { id: 'practice', label: 'Practice', icon: Hand, badge: 'AI Coach' },
    { id: 'progress', label: 'Progress', icon: Award },
    { id: 'record', label: 'Record', icon: Video },
  ]

  const handleNavClick = (id) => {
    onNavigate(id)
    setMobileMenuOpen(false)
  }

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
        isScrolled
          ? 'bg-mudra-ivory-50/90 backdrop-blur-md border-b border-mudra-lavender-200/60 shadow-sm py-3'
          : 'bg-mudra-ivory-50/60 backdrop-blur-sm border-b border-transparent py-4'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Brand Logo */}
        <button
          type="button"
          onClick={() => handleNavClick('home')}
          className="flex items-center gap-2.5 group text-left focus:outline-none"
        >
          {/* Custom MUDRA Glowing Orbit & Gesture Motif */}
          <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-tr from-mudra-indigo-700 via-mudra-lavender-600 to-mudra-peach-400 p-[1.5px] shadow-sm group-hover:shadow-glow-lavender transition-all duration-300">
            <div className="w-full h-full bg-mudra-indigo-800 rounded-[14px] flex items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-tr from-mudra-lavender-500/20 to-mudra-peach-400/20"></div>
              <svg className="w-5 h-5 text-mudra-ivory-50 relative z-10 transition-transform duration-300 group-hover:scale-110" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"></path>
                <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"></path>
                <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"></path>
                <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"></path>
              </svg>
            </div>
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-display font-bold text-xl sm:text-2xl tracking-tight text-mudra-indigo-900 group-hover:text-mudra-lavender-700 transition-colors">
                MUDRA
              </span>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-mudra-lavender-500 animate-pulse"></span>
            </div>
            <span className="text-[10px] sm:text-[11px] font-medium text-mudra-indigo-400 tracking-wide hidden sm:block -mt-1">
              Where Every Sign Finds a Voice
            </span>
          </div>
        </button>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-1 bg-white/70 backdrop-blur-md p-1.5 rounded-2xl border border-mudra-lavender-200/70 shadow-xs">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`relative px-3.5 py-1.5 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-gradient-to-r from-mudra-lavender-600 to-mudra-lavender-700 text-white shadow-xs'
                    : 'text-mudra-indigo-600 hover:text-mudra-indigo-900 hover:bg-mudra-lavender-50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-mudra-indigo-400'}`} />
                <span>{item.label}</span>
                {item.badge && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-mudra-peach-100 text-mudra-peach-warm'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {/* Right Actions: Accessibility & CTA */}
        <div className="hidden lg:flex items-center gap-2.5">
          {/* Accessibility Settings Trigger */}
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="p-2 rounded-xl text-mudra-indigo-500 hover:text-mudra-lavender-600 hover:bg-mudra-lavender-50 transition-colors border border-transparent hover:border-mudra-lavender-200"
            title="Accessibility Settings"
            aria-label="Open accessibility settings"
          >
            <Sliders className="w-4 h-4" />
          </button>

          {/* Try MUDRA CTA */}
          <button
            type="button"
            onClick={() => handleNavClick('communicate')}
            className="btn-primary py-2 px-4 text-sm"
          >
            <span>Try MUDRA</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Mobile Menu & Accessibility Toggle */}
        <div className="flex items-center gap-1.5 md:hidden">
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="p-2 rounded-xl text-mudra-indigo-600 hover:bg-mudra-lavender-50"
            title="Accessibility"
            aria-label="Accessibility settings"
          >
            <Sliders className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-xl text-mudra-indigo-700 hover:bg-mudra-lavender-50 transition-colors"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden px-4 pt-3 pb-6 bg-mudra-ivory-50/98 backdrop-blur-xl border-b border-mudra-lavender-200/80 shadow-xl animate-fadeIn">
          <div className="flex flex-col gap-1.5">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = activeTab === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl text-left text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-mudra-lavender-600 text-white shadow-sm'
                      : 'text-mudra-indigo-800 hover:bg-mudra-lavender-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-mudra-indigo-500'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : 'bg-mudra-peach-100 text-mudra-peach-warm'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              )
            })}

            <div className="pt-3 mt-2 border-t border-mudra-lavender-200/60 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  onNavigate('communicate')
                  setMobileMenuOpen(false)
                }}
                className="btn-primary w-full py-2.5 text-sm"
              >
                <span>Try MUDRA</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
