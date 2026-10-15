import React, { createContext, useContext, useState, useEffect } from 'react'

const AccessibilityContext = createContext()

export function AccessibilityProvider({ children }) {
  const [highContrast, setHighContrast] = useState(() => {
    return localStorage.getItem('mudra_high_contrast') === 'true'
  })
  const [reducedMotion, setReducedMotion] = useState(() => {
    return localStorage.getItem('mudra_reduced_motion') === 'true' || 
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })
  const [fontSize, setFontSize] = useState(() => {
    return localStorage.getItem('mudra_font_size') || 'normal' // 'normal', 'large', 'xlarge'
  })
  const [speechRate, setSpeechRate] = useState(() => {
    const saved = parseFloat(localStorage.getItem('mudra_speech_rate'))
    return Number.isFinite(saved) && saved > 0 ? saved : 1.0
  })
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem('mudra_high_contrast', highContrast)
    if (highContrast) {
      document.documentElement.classList.add('high-contrast')
    } else {
      document.documentElement.classList.remove('high-contrast')
    }
  }, [highContrast])

  useEffect(() => {
    localStorage.setItem('mudra_reduced_motion', reducedMotion)
    if (reducedMotion) {
      document.documentElement.classList.add('reduced-motion')
    } else {
      document.documentElement.classList.remove('reduced-motion')
    }
  }, [reducedMotion])

  useEffect(() => {
    localStorage.setItem('mudra_speech_rate', String(speechRate))
  }, [speechRate])

  useEffect(() => {
    localStorage.setItem('mudra_font_size', fontSize)
    document.documentElement.classList.remove('text-size-large', 'text-size-xlarge')
    if (fontSize === 'large') {
      document.documentElement.classList.add('text-size-large')
    } else if (fontSize === 'xlarge') {
      document.documentElement.classList.add('text-size-xlarge')
    }
  }, [fontSize])

  return (
    <AccessibilityContext.Provider
      value={{
        highContrast,
        setHighContrast,
        reducedMotion,
        setReducedMotion,
        fontSize,
        setFontSize,
        speechRate,
        setSpeechRate,
        isModalOpen,
        setIsModalOpen
      }}
    >
      {children}
    </AccessibilityContext.Provider>
  )
}

export function useAccessibility() {
  const context = useContext(AccessibilityContext)
  if (!context) {
    throw new Error('useAccessibility must be used within an AccessibilityProvider')
  }
  return context
}
