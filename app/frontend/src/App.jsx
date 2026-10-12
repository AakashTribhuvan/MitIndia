import React, { useState, useRef } from 'react'
import { AccessibilityProvider } from './context/AccessibilityContext'
import IntroLoader from './components/IntroLoader'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import AccessibilityModal from './components/AccessibilityModal'
import HomePage from './pages/HomePage'
import CommunicatePage from './pages/CommunicatePage'
import LearnPage from './pages/LearnPage'
import PracticePage from './pages/PracticePage'
import ProgressPage from './pages/ProgressPage'
import RecordPage from './pages/RecordPage'

export default function App() {
  /**
   * Intro gate via useRef (not sessionStorage / localStorage):
   *
   * - Fresh page load / Ctrl+R: JS re-executes → App re-mounts →
   *   hasShownIntroRef.current starts as false → showIntro = true → intro plays.
   *
   * - SPA navigation (Home → Learn → Home): App never unmounts →
   *   hasShownIntroRef.current stays true → showIntro stays false → no replay.
   *
   * The useState lazy initializer only runs once on mount, so this is stable.
   */
  const hasShownIntroRef = useRef(false)
  const [showIntro, setShowIntro] = useState(() => !hasShownIntroRef.current)

  const [activeTab, setActiveTab] = useState('home')
  const [selectedPracticeSign, setSelectedPracticeSign] = useState('HELLO')

  const handleIntroComplete = () => {
    hasShownIntroRef.current = true
    setShowIntro(false)
  }

  const handleNavigate = (tabId, signId = null) => {
    if (signId) {
      setSelectedPracticeSign(signId)
    }
    setActiveTab(tabId)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <AccessibilityProvider>
      <div className="min-h-screen flex flex-col relative text-mudra-indigo font-sans">
        
        {/* First-load Fullscreen Cinematic Brand Preloader */}
        {showIntro && (
          <IntroLoader onComplete={handleIntroComplete} />
        )}

        {/* Global Navigation */}
        <Navbar
          activeTab={activeTab}
          onNavigate={handleNavigate}
        />

        {/* Main Routed Content */}
        <main className="flex-1">
          {activeTab === 'home' && <HomePage onNavigate={handleNavigate} />}
          {activeTab === 'communicate' && <CommunicatePage />}
          {activeTab === 'learn' && (
            <LearnPage 
              onNavigate={handleNavigate}
              onSelectPracticeSign={(sign) => setSelectedPracticeSign(sign)}
            />
          )}
          {activeTab === 'practice' && (
            <PracticePage 
              targetSignId={selectedPracticeSign}
              onNavigate={handleNavigate}
            />
          )}
          {activeTab === 'progress' && <ProgressPage onNavigate={handleNavigate} />}
          {activeTab === 'record' && <RecordPage />}
        </main>

        {/* Global Footer */}
        <Footer
          onNavigate={handleNavigate}
        />

        {/* Accessibility Control Drawer */}
        <AccessibilityModal />

      </div>
    </AccessibilityProvider>
  )
}
