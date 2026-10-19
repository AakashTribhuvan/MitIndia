import React, { useState, useRef, useEffect, useCallback } from 'react'
import { InputModeSwitch, PhrasePanel, SpellPanel } from '../components/communicate/LibraryModes'
import { fetchLibrary, letterSpeller, phraseRecorder } from '../services/libraryClient'
import { 
  Camera, 
  CameraOff, 
  Play, 
  Pause, 
  RotateCcw, 
  Volume2, 
  Sparkles, 
  CheckCircle2, 
  Copy, 
  Radio, 
  Info,
  Layers,
  AlertCircle,
  Mic,
  MicOff,
  Send,
  ArrowRightLeft,
  FlipHorizontal
} from 'lucide-react'
import handTracker, { cameraErrorMessage } from '../services/handTracker'
import signRecognizer, { API_BASE_URL, staticPoseRecognizer } from '../services/signRecognizer'
import faceExpressionTracker from '../services/faceExpressionTracker'
import { classifyISLSign } from '../services/islClassifier'
import { ISL_VOCABULARY_LEXICON, buildMultilingualSentence, findISLLexiconItem, predictNextSigns, readableSign } from '../services/islDictionary'
import { analyzeExpression, FACE_UNAVAILABLE_EXPRESSION, INITIAL_EXPRESSION } from '../services/expressionAnalyzer'
import MudraAvatarViewer from '../components/avatar/MudraAvatarViewer'
import SignReference from '../components/SignReference'
import ModelVideoExamplePanel from '../components/communicate/ModelVideoExamplePanel'
import { useAccessibility } from '../context/AccessibilityContext'

const AUTO_SPEAK_PAUSE_MS = 3000
const LOW_FPS = 15
// Per-browser camera preferences (localStorage can be unavailable: then nothing is remembered)
function readPref(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}
function writePref(key, value) {
  try { localStorage.setItem(key, String(value)) } catch { /* not remembered */ }
}
const CAMERA_ERRORS = {
  denied: 'Camera permission was denied. Allow the camera for this site (the camera icon in the address bar), then try again.',
  not_found: 'No camera was found. Connect or enable a webcam, then try again.',
  in_use: 'The camera is in use by another app (Zoom, Teams, Camera…) or blocked by the system. Close that app, then try again.',
  unknown: 'The camera or hand tracker could not be started. Try again, then share the technical detail if it persists.'
}
// Signs islClassifier.js can detect (offline fallback)
const RULE_SIGNS = ['HELLO', 'WATER', 'NAMASTE', 'THANK_YOU', 'YES', 'NO', 'PEACE', 'HELP']
// Close-up framing: shoulders wider than this share of the frame, or lower than this height, leave no room for the hands
const FRAMING = { maxShoulderWidth: 0.6, maxShoulderY: 0.72 }

export default function CommunicatePage() {
  // Mode toggle: 'sign-to-speech' (ISL -> Voice) vs 'speech-to-sign' (Voice/Text -> 3D ISL Avatar)
  const [activeMode, setActiveMode] = useState('sign-to-speech')

  // --- Mode A (Sign to Speech) State ---
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const faceLandmarksRef = useRef(null)

  const [cameraActive, setCameraActive] = useState(false)
  const [cameraLoading, setCameraLoading] = useState(false)
  const [cameraError, setCameraError] = useState(null)
  const [cameraIssue, setCameraIssue] = useState(null) // 'black' | 'frozen' while the camera runs
  const [cameras, setCameras] = useState([])
  const [cameraId, setCameraId] = useState(() => readPref('mudra_camera_id', ''))
  const [cameraRes, setCameraRes] = useState(() => Number(readPref('mudra_camera_res', '480')) || 480)
  const [mirrored, setMirrored] = useState(() => readPref('mudra_camera_mirrored', 'true') !== 'false')
  const [trackerVisibility, setTrackerVisibility] = useState({ hands: true, body: true, face: true, palm: true })
  const mirroredRef = useRef(mirrored)
  const trackerVisibilityRef = useRef(trackerVisibility)
  mirroredRef.current = mirrored
  trackerVisibilityRef.current = trackerVisibility
  const [isPaused, setIsPaused] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [copied, setCopied] = useState(false)

  const [currentDetection, setCurrentDetection] = useState({
    sign: 'UNKNOWN',
    confidence: 0,
    isUnknown: true,
    metadata: null
  })

  const [recognizedTokens, setRecognizedTokens] = useState([])
  const [sentenceDraftTokens, setSentenceDraftTokens] = useState([])
  const [generatedSentence, setGeneratedSentence] = useState('')
  const [selectedLang, setSelectedLang] = useState('en')
  const [faceStatus, setFaceStatus] = useState('initializing')
  const [blinkToAccept, setBlinkToAccept] = useState(false)
  const [blinkAccepted, setBlinkAccepted] = useState(false)
  const [expression, setExpression] = useState(INITIAL_EXPRESSION)
  const sentenceContextTokens = sentenceDraftTokens.length ? sentenceDraftTokens : recognizedTokens
  const nextWordSuggestions = predictNextSigns(sentenceContextTokens)
  const sentenceDraftRef = useRef(sentenceDraftTokens)
  const recognizedTokensRef = useRef(recognizedTokens)
  const blinkToAcceptRef = useRef(blinkToAccept)
  const blinkClosedRef = useRef(false)
  const lastBlinkAtRef = useRef(0)
  const acceptPredictedSignRef = useRef(() => {})
  const nextWordSuggestionsRef = useRef(nextWordSuggestions)
  sentenceDraftRef.current = sentenceDraftTokens
  recognizedTokensRef.current = recognizedTokens
  blinkToAcceptRef.current = blinkToAccept
  nextWordSuggestionsRef.current = nextWordSuggestions

  const stableSignRef = useRef({ sign: null, count: 0 })
  const lastCommittedSignRef = useRef(null)
  const expressionHistoryRef = useRef([])
  const expressionPendingRef = useRef({ tone: null, count: 0 })
  const smoothedConfidenceRef = useRef(0)
  const [suggestions, setSuggestions] = useState([])
  // Framing check: the model was trained on signers seen from the waist up
  const [framing, setFraming] = useState(null) // null | 'no_shoulders' | 'too_close'
  const [trackerFps, setTrackerFps] = useState(0)
  const [trackerDiag, setTrackerDiag] = useState(null) // {cameraFps, trackingFps, inferenceMs, delegate}
  const framingRef = useRef({ frames: 0, noShoulders: 0, tooClose: 0 })
  // Speak the sentence automatically after a pause in signing
  const [autoSpeak, setAutoSpeak] = useState(() => {
    try {
      return window.localStorage.getItem('mudra.autoSpeak') !== 'off'
    } catch {
      return true
    }
  })
  const autoSpeakTimerRef = useRef(null)
  const lastSpokenRef = useRef('')
  const sentenceRef = useRef('')
  const [modelState, setModelState] = useState({ status: signRecognizer.status, info: null, error: null })
  const [recognitionModels, setRecognitionModels] = useState([
    { id: 'sequence', name: 'MUDRA word sequence' },
    { id: 'intro_static', name: 'Expanded introduction (static pose)' },
  ])
  const [staticRecognitionModel, setStaticRecognitionModel] = useState('intro_static')
  const [recognitionModel, setRecognitionModel] = useState(() => {
    const saved = readPref('mudra.recognition_model_v4', 'common_word_video')
    return saved === 'auto' ? 'common_word_video' : saved
  })
  const dynamicModels = recognitionModels.filter((model) => !['intro_static', 'top10_v2', 'signline_intro_video'].includes(model.id))
  const staticModels = recognitionModels.filter((model) => ['intro_static', 'top10_v2'].includes(model.id))
  const effectiveRecognitionModel = dynamicModels.some((model) => model.id === recognitionModel) ? recognitionModel : 'sequence'
  const selectedRecognitionModel = recognitionModels.find((model) => model.id === effectiveRecognitionModel)
  const selectedStaticModel = staticModels.find((model) => model.id === staticRecognitionModel)
  // Words the camera model knows, so people can check a word before signing it
  const [vocab, setVocab] = useState([])
  const { speechRate } = useAccessibility()
  const [vocabQuery, setVocabQuery] = useState('')
  // Quick-add chips: online, the app words the model does not know; offline, the signs the rule engine detects
  const chipSigns = modelState.status === 'online'
    ? ISL_VOCABULARY_LEXICON.filter((v) => !vocab.length || !vocab.some((w) => w.sign === v.id))
    : ISL_VOCABULARY_LEXICON.filter((v) => RULE_SIGNS.includes(v.id))
  const [vocabOpen, setVocabOpen] = useState(false)
  const [referenceSign, setReferenceSign] = useState(null) // word whose training example is shown
  const [isl500TestCases, setIsl500TestCases] = useState({ cases: [], accuracy: null, sample_count: 0 })
  const [isl500TestCaseId, setIsl500TestCaseId] = useState('')
  const [isl500TestCasesError, setIsl500TestCasesError] = useState('')
  const [commonWordTestCases, setCommonWordTestCases] = useState({ cases: [], accuracy: null, sample_count: 0 })
  const [commonWordTestCaseId, setCommonWordTestCaseId] = useState('')
  const [commonWordTestCasesError, setCommonWordTestCasesError] = useState('')
  // Dynamic words, held static poses, fingerspelling, phrases, or all three sign classifiers together.
  const [inputMode, setInputMode] = useState('words')
  const inputModeRef = useRef('words')
  const [libraryModels, setLibraryModels] = useState({})
  const [autoResults, setAutoResults] = useState({})
  const [confidenceFloor, setConfidenceFloor] = useState(() => Number(readPref('mudra.confidence_floor_v1', '0.65')) || 0.65)
  const confidenceFloorRef = useRef(confidenceFloor)
  confidenceFloorRef.current = confidenceFloor
  const autoResultsRef = useRef({})
  const autoChoiceTimerRef = useRef(null)
  const autoCommittedRef = useRef(false)
  const queueAutoCandidateRef = useRef(null)
  const staticOnlineRef = useRef(false)
  const [staticModelOnline, setStaticModelOnline] = useState(false)
  useEffect(() => { fetchLibrary().then((l) => setLibraryModels(l.models || {})) }, [])
  const changeInputMode = (mode) => {
    inputModeRef.current = mode
    setInputMode(mode)
    setSentenceDraftTokens([])
    signRecognizer.reset() // drop a half-finished word segment
    staticPoseRecognizer.reset()
    autoResultsRef.current = {}
    setAutoResults({})
    autoCommittedRef.current = false
    clearTimeout(autoChoiceTimerRef.current)
    setSuggestions([])
  }
  useEffect(() => {
    signRecognizer.setModel(effectiveRecognitionModel)
    writePref('mudra.recognition_model_v4', recognitionModel)
  }, [recognitionModel, effectiveRecognitionModel])
  useEffect(() => writePref('mudra.confidence_floor_v1', confidenceFloor), [confidenceFloor])
  useEffect(() => { letterSpeller.setConfidenceFloor(confidenceFloor) }, [confidenceFloor])
  useEffect(() => {
    if (modelState.status !== 'online') return
    let active = true
    fetch(`${API_BASE_URL}/models`)
      .then((response) => {
        if (!response.ok) throw new Error(`Model list request failed (${response.status}).`)
        return response.json()
      })
      .then((payload) => {
        if (!active) return
        const models = payload.models || []
        setRecognitionModels(models)
        const availableDynamic = models.filter((model) => !['intro_static', 'top10_v2', 'signline_intro_video'].includes(model.id))
        const availableStatic = models.filter((model) => ['intro_static', 'top10_v2'].includes(model.id))
        setStaticRecognitionModel((current) => availableStatic.some((model) => model.id === current)
          ? current : availableStatic[0]?.id || 'intro_static')
        if (!availableDynamic.some((model) => model.id === recognitionModel)) {
          setRecognitionModel(availableDynamic.find((model) => model.id === 'common_word_video')?.id || availableDynamic.find((model) => model.id === 'isl500_video')?.id || availableDynamic.find((model) => model.id === 'sequence')?.id || availableDynamic[0]?.id || 'sequence')
        }
      })
      .catch((error) => console.warn('Could not load recognition model list:', error))
    return () => { active = false }
  }, [modelState.status])
  useEffect(() => {
    if (modelState.status !== 'online' || !['isl500_video', 'common_word_video'].includes(effectiveRecognitionModel)) return
    let active = true
    const commonWords = effectiveRecognitionModel === 'common_word_video'
    const base = commonWords ? '/common-word/test-cases' : '/isl500/test-cases'
    fetch(`${API_BASE_URL}${base}`)
      .then((response) => {
        if (!response.ok) throw new Error(`Test videos are unavailable (${response.status}).`)
        return response.json()
      })
      .then((payload) => {
        if (!active) return
        const cases = payload.cases || []
        if (commonWords) {
          setCommonWordTestCases({ ...payload, cases })
          setCommonWordTestCaseId((current) => cases.some((item) => item.id === current) ? current : cases[0]?.id || '')
          setCommonWordTestCasesError(cases.length ? '' : 'No held-out test videos are available on this server.')
        } else {
          setIsl500TestCases({ ...payload, cases })
          setIsl500TestCaseId((current) => cases.some((item) => item.id === current) ? current : cases[0]?.id || '')
          setIsl500TestCasesError(cases.length ? '' : 'No held-out test videos are available on this server.')
        }
      })
      .catch((error) => {
        if (!active) return
        if (commonWords) setCommonWordTestCasesError(error.message)
        else setIsl500TestCasesError(error.message)
      })
    return () => { active = false }
  }, [modelState.status, effectiveRecognitionModel])
  useEffect(() => {
    if (modelState.status !== 'online') return
    fetch(`${API_BASE_URL}/labels?model=${encodeURIComponent(effectiveRecognitionModel)}`)
      .then((r) => r.json())
      .then((body) => setVocab(body.labels || []))
      .catch(() => setVocab([]))
  }, [modelState.status, effectiveRecognitionModel])
  const vocabMatches = vocabQuery.trim()
    ? vocab.filter((v) => v.label.toLowerCase().includes(vocabQuery.trim().toLowerCase()))
    : vocab
  const isCommonWordVideoModel = effectiveRecognitionModel === 'common_word_video'
  const activeModelTestCases = isCommonWordVideoModel ? commonWordTestCases : isl500TestCases
  const activeModelTestCaseId = isCommonWordVideoModel ? commonWordTestCaseId : isl500TestCaseId
  const activeModelTestCasesError = isCommonWordVideoModel ? commonWordTestCasesError : isl500TestCasesError
  const setActiveModelTestCaseId = isCommonWordVideoModel ? setCommonWordTestCaseId : setIsl500TestCaseId
  const changeRecognitionModel = (model) => {
    setRecognitionModel(model)
    signRecognizer.setModel(model)
    setSuggestions([])
    lastModelSignRef.current = null
    setCurrentDetection({ sign: 'UNKNOWN', confidence: 0, isUnknown: true, status: 'ready', source: 'model', metadata: null })
  }
  const modelOnlineRef = useRef(false)
  const lastModelSignRef = useRef(null)
  const lastHandSeenRef = useRef(0)
  const isPausedRef = useRef(isPaused)
  useEffect(() => {
    isPausedRef.current = isPaused
  }, [isPaused])

  // Automatically keep constructed sentence synchronized with tokens and chosen language
  useEffect(() => {
    const sentenceTokens = sentenceDraftTokens.length ? sentenceDraftTokens : recognizedTokens
    setGeneratedSentence(buildMultilingualSentence(sentenceTokens, selectedLang))
  }, [recognizedTokens, sentenceDraftTokens, selectedLang])

  useEffect(() => {
    sentenceRef.current = generatedSentence
  }, [generatedSentence])

  useEffect(() => {
    try {
      window.localStorage.setItem('mudra.autoSpeak', autoSpeak ? 'on' : 'off')
    } catch {
      /* storage unavailable: the choice is just not remembered */
    }
  }, [autoSpeak])

  useEffect(() => {
    faceExpressionTracker.setBlinkAssist(blinkToAccept)
  }, [blinkToAccept])

  // After each new word, wait for a pause (no new sign starting) and then speak the whole sentence once
  useEffect(() => {
    clearTimeout(autoSpeakTimerRef.current)
    if (!autoSpeak || (recognizedTokens.length === 0 && sentenceDraftTokens.length === 0)) return undefined
    autoSpeakTimerRef.current = setTimeout(() => {
      const text = sentenceRef.current
      if (text && text !== lastSpokenRef.current) speakText(text)
    }, AUTO_SPEAK_PAUSE_MS)
    return () => clearTimeout(autoSpeakTimerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recognizedTokens, sentenceDraftTokens, autoSpeak])

  const replaceLastToken = useCallback((sign) => {
    setRecognizedTokens((prev) => (prev.length ? [...prev.slice(0, -1), sign] : [sign]))
  }, [])

  const commitToken = useCallback((sign) => {
    setRecognizedTokens((prev) => (prev.length > 0 && prev[prev.length - 1] === sign ? prev : [...prev, sign]))
  }, [])

  queueAutoCandidateRef.current = (kind, result) => {
    const sign = kind === 'alphabet' ? result.letter : (result.sign || result.top_k?.[0]?.sign)
    if (result.status !== 'ok' || !sign) return
    const previous = autoResultsRef.current[kind]
    if (autoCommittedRef.current) {
      if (previous?.sign === sign) return
      autoCommittedRef.current = false
      autoResultsRef.current = {}
    }
    const label = kind === 'alphabet' ? sign : (result.label || result.top_k?.[0]?.label || readableSign(sign))
    const confidence = Number(result.confidence || result.top_k?.[0]?.confidence || 0)
    const candidate = { kind, sign, label, confidence, accepted: confidence >= confidenceFloorRef.current }
    autoResultsRef.current = { ...autoResultsRef.current, [kind]: candidate }
    setAutoResults(autoResultsRef.current)
    if (previous?.sign === sign && previous.accepted === candidate.accepted) return
    clearTimeout(autoChoiceTimerRef.current)
    autoChoiceTimerRef.current = setTimeout(() => {
      if (inputModeRef.current !== 'auto' || autoCommittedRef.current) return
      const best = Object.values(autoResultsRef.current).filter((item) => item.accepted)
        .sort((a, b) => b.confidence - a.confidence)[0]
      if (!best) return
      autoCommittedRef.current = true
      setAutoResults({ ...autoResultsRef.current, winner: best })
      setCurrentDetection({
        sign: best.sign,
        label: best.label,
        confidence: Math.round(best.confidence * 100),
        isUnknown: false,
        status: 'ok',
        source: `auto-${best.kind}`,
        metadata: findISLLexiconItem(best.sign),
      })
      commitToken(best.sign)
    }, 1400)
  }

  const acceptPredictedSign = (sign) => {
    const context = sentenceDraftRef.current.length ? sentenceDraftRef.current : recognizedTokensRef.current
    if (!nextWordSuggestions.includes(sign) || !context.length) return
    setSentenceDraftTokens([...context, sign])
    setBlinkAccepted(true)
    setTimeout(() => setBlinkAccepted(false), 1200)
  }
  acceptPredictedSignRef.current = acceptPredictedSign

  const addCurrentSignToSentence = () => {
    const current = currentDetection.sign
    if (!current || current === 'UNKNOWN') return
    setSentenceDraftTokens((previous) => [...(previous.length ? previous : []), current])
  }

  // Trained recognition model (backend /predict). Falls back to the rule engine when offline.
  useEffect(() => {
    signRecognizer.onStatusChange = (state) => {
      modelOnlineRef.current = state.status === 'online'
      setModelState(state)
    }
    signRecognizer.onPrediction = (p) => {
      if (isPausedRef.current) return
      if (inputModeRef.current === 'auto') {
        queueAutoCandidateRef.current?.('dynamic', p)
        return
      }
      const top = p.top_k?.[0]
      // Fully automatic: a confident result is added; an unsure one is added too (its best guess) when the
      // model clears the user-set confidence floor, with runner-ups offered as optional replacements.
      const confidence = Number(p.confidence || top?.confidence || 0)
      const confident = p.status === 'ok' && confidence >= confidenceFloorRef.current
      const unsure = p.model !== 'intro_static' && !confident && (p.status === 'uncertain' || p.status === 'no_sign' || p.status === 'ok') &&
        (p.stats?.hand_rate ?? 1) >= 0.5 && top && top.confidence >= confidenceFloorRef.current
      const added = confident ? { sign: p.sign, label: p.label } : unsure ? { sign: top.sign, label: top.label } : null
      setCurrentDetection({
        sign: added ? added.sign : 'UNKNOWN',
        label: added ? added.label : null,
        candidate: top ? top.label : null,
        confidence: Math.round((confident ? confidence : top?.confidence ?? 0) * 100),
        isUnknown: !added,
        status: confident ? 'ok' : unsure ? 'unsure' : (p.stats?.hand_rate ?? 0) >= 0.5 ? 'missed' : p.status,
        source: p.custom ? 'custom' : 'model',
        metadata: added ? findISLLexiconItem(added.sign) : null
      })
      // The server classified one complete sign (start -> end), so each sign adds at most one word
      if (added) {
        if (inputModeRef.current === 'words') {
          setRecognizedTokens([added.sign])
        } else commitToken(added.sign)
      }
      // Unsure: the other likely words can replace the one just added (optional, nothing to click otherwise)
      setSuggestions(unsure ? (p.top_k || []).slice(1, 3) : [])
    }
    signRecognizer.onProvisional = (guess) => {
      if (isPausedRef.current) return
      setCurrentDetection((prev) => (prev.status === 'signing' ? { ...prev, candidate: guess.label } : prev))
    }
    signRecognizer.onActivity = (state) => {
      if (isPausedRef.current) return
      if (state === 'signing') {
        if (inputModeRef.current === 'auto') {
          autoResultsRef.current = {}
          setAutoResults({})
          autoCommittedRef.current = false
          clearTimeout(autoChoiceTimerRef.current)
        }
        clearTimeout(autoSpeakTimerRef.current) // still signing: the sentence is not finished
        setCurrentDetection({ sign: 'UNKNOWN', confidence: 0, isUnknown: true, status: 'signing', source: 'model', metadata: null })
      } else if (state === 'idle') {
        // too short to be a sign: go back to waiting instead of staying on "Signing…"
        setCurrentDetection((prev) => (prev.status === 'signing'
          ? { sign: 'UNKNOWN', confidence: 0, isUnknown: true, status: 'too_short', source: 'model', metadata: null }
          : prev))
      }
    }
    staticPoseRecognizer.setModel(staticRecognitionModel)
    staticPoseRecognizer.onStatusChange = ({ status }) => {
      staticOnlineRef.current = status === 'online'
      setStaticModelOnline(staticOnlineRef.current)
    }
    staticPoseRecognizer.onPrediction = (p) => {
      if (isPausedRef.current) return
      if (inputModeRef.current === 'auto') {
        queueAutoCandidateRef.current?.('static', p)
        return
      }
      if (inputModeRef.current !== 'static') return
      const top = p.top_k?.[0]
      const sign = p.status === 'ok' && Number(p.confidence || 0) >= confidenceFloorRef.current ? p.sign : null
      setCurrentDetection({ sign: sign || 'UNKNOWN', label: sign ? (p.label || top?.label) : null,
        candidate: top?.label || null, confidence: Math.round((p.confidence || 0) * 100),
        isUnknown: !sign, status: sign ? 'ok' : p.status === 'ok' ? 'uncertain' : (p.status || 'missed'),
        source: 'static', metadata: sign ? findISLLexiconItem(sign) : null })
      if (sign) commitToken(sign)
    }
    signRecognizer.connect()
    staticPoseRecognizer.connect()
    return () => {
      signRecognizer.onPrediction = null
      signRecognizer.onActivity = null
      signRecognizer.onProvisional = null
      signRecognizer.onStatusChange = null
      signRecognizer.reset()
      staticPoseRecognizer.onPrediction = null
      staticPoseRecognizer.onStatusChange = null
      staticPoseRecognizer.reset()
    }
  }, [commitToken, staticRecognitionModel])

  useEffect(() => {
    if (inputMode !== 'auto') return undefined
    letterSpeller.onGuess = (result) => queueAutoCandidateRef.current?.('alphabet', result)
    letterSpeller.start()
    return () => {
      letterSpeller.stop()
      letterSpeller.onGuess = null
    }
  }, [inputMode])

  useEffect(() => {
    let active = true
    faceExpressionTracker.initialize()
      .then(() => {
        if (active) setFaceStatus('ready')
      })
      .catch((error) => {
        console.error('Face Landmarker initialization failed:', error)
        if (active) {
          setFaceStatus('error')
          setExpression({ ...FACE_UNAVAILABLE_EXPRESSION, reason: 'Facial analysis unavailable' })
        }
      })

    return () => {
      active = false
      faceExpressionTracker.close()
    }
  }, [])

  const resetExpression = (status = 'ready') => {
    expressionHistoryRef.current = []
    expressionPendingRef.current = { tone: null, count: 0 }
    smoothedConfidenceRef.current = 0
    setFaceStatus(status)
    setExpression(status === 'error' ? FACE_UNAVAILABLE_EXPRESSION : INITIAL_EXPRESSION)
  }

  const handleFaceResults = (result) => {
    const faceDetected = Boolean(result.faceLandmarks?.length)
    faceLandmarksRef.current = result.faceLandmarks?.[0] || null
    const categories = result.faceBlendshapes?.[0]?.categories || []

    const blendshapes = Object.fromEntries(categories.map(({ categoryName, score }) => [categoryName, score]))
    const blinkLevel = ((blendshapes.eyeBlinkLeft || 0) + (blendshapes.eyeBlinkRight || 0)) / 2
    if (blinkLevel >= 0.72) {
      if (!blinkClosedRef.current && performance.now() - lastBlinkAtRef.current > 650) {
        lastBlinkAtRef.current = performance.now()
        if (blinkToAcceptRef.current && nextWordSuggestionsRef.current.length) {
          acceptPredictedSignRef.current(nextWordSuggestionsRef.current[0])
        }
      }
      blinkClosedRef.current = true
    } else if (blinkLevel <= 0.28) {
      blinkClosedRef.current = false
    }

    if (!faceDetected) {
      expressionHistoryRef.current = []
      expressionPendingRef.current = { tone: null, count: 0 }
      blinkClosedRef.current = false
      setFaceStatus('not-detected')
      setExpression(FACE_UNAVAILABLE_EXPRESSION)
      return
    }

    const prediction = analyzeExpression(categories)
    if (!prediction.available) {
      setFaceStatus('insufficient')
      setExpression(prediction)
      return
    }

    expressionHistoryRef.current = [...expressionHistoryRef.current, prediction.tone].slice(-15)
    const counts = expressionHistoryRef.current.reduce((map, tone) => {
      map[tone] = (map[tone] || 0) + 1
      return map
    }, {})
    const dominantTone = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0]
    const pending = expressionPendingRef.current

    if (dominantTone === pending.tone) {
      pending.count += 1
    } else {
      pending.tone = dominantTone
      pending.count = 1
    }

    if (pending.count >= 4 || expression.tone === dominantTone) {
      smoothedConfidenceRef.current = smoothedConfidenceRef.current
        ? smoothedConfidenceRef.current * 0.7 + prediction.confidence * 0.3
        : prediction.confidence
      setFaceStatus('detected')
      setExpression({
        ...prediction,
        tone: dominantTone,
        confidence: smoothedConfidenceRef.current
      })
    }
  }

  const handleFaceError = (error) => {
    console.error('Face Landmarker runtime error:', error)
    faceExpressionTracker.stop()
    setFaceStatus('error')
    setExpression({ ...FACE_UNAVAILABLE_EXPRESSION, reason: error?.message || 'Facial analysis unavailable' })
  }

  // --- Mode B (Speech / Text to 3D Avatar) State ---
  const [textInput, setTextInput] = useState('HELLO NAMASTE')
  const [activeAvatarText, setActiveAvatarText] = useState('HELLO NAMASTE')
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef(null)

  const fpsShownAtRef = useRef(0)
  function setTrackerFpsThrottled(fps, diag) {
    const now = performance.now()
    if (now - fpsShownAtRef.current < 1000) return
    fpsShownAtRef.current = now
    setTrackerFps(Math.round(fps))
    if (diag) {
      setTrackerDiag(diag)
      // Tracking (not the camera) is the bottleneck: give the hands the GPU time the face tracker uses
      faceExpressionTracker.setSlow(diag.cameraFps > 0 && diag.trackingFps < Math.min(diag.cameraFps - 3, LOW_FPS))
    }
  }

  // Why the frame rate is low: the camera itself (dim light) or the tracking (CPU / busy GPU)
  const slowReason = !trackerDiag || trackerFps <= 0 || trackerFps >= LOW_FPS ? null
    : trackerDiag.cameraFps > 0 && trackerDiag.cameraFps < LOW_FPS && trackerDiag.trackingFps >= trackerDiag.cameraFps - 3 ? 'camera'
    : 'tracking'


  // Framing check over ~2 s windows: shoulders visible, and room below them for the hands
  function updateFraming(results) {
    const f = framingRef.current
    const pose = results.poseLandmarks
    const ls = pose?.[11]
    const rs = pose?.[12]
    const visible = (pt) => pt && (pt.visibility ?? 1) >= 0.5 && pt.x >= 0 && pt.x <= 1 && pt.y >= 0 && pt.y <= 1
    f.frames += 1
    if (!visible(ls) || !visible(rs)) {
      f.noShoulders += 1
    } else if (Math.abs(ls.x - rs.x) > FRAMING.maxShoulderWidth || (ls.y + rs.y) / 2 > FRAMING.maxShoulderY) {
      f.tooClose += 1
    }
    if (f.frames >= 60) {
      setFraming(f.noShoulders > 0.5 * f.frames ? 'no_shoulders' : f.tooClose > 0.5 * f.frames ? 'too_close' : null)
      framingRef.current = { frames: 0, noShoulders: 0, tooClose: 0 }
    }
  }

  // Handle MediaPipe tracking results
  const handleMediaPipeResults = useCallback((results) => {
    if (isPausedRef.current) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const hasHands = results.multiHandLandmarks && results.multiHandLandmarks.length > 0
    updateFraming(results)
    if (results.fps) setTrackerFpsThrottled(results.fps, results.diag)
    if (trackerVisibilityRef.current.body) handTracker.drawPose(ctx, results.poseLandmarks, canvas.width, canvas.height, mirroredRef.current)
    if (trackerVisibilityRef.current.face) handTracker.drawFace(ctx, faceLandmarksRef.current, canvas.width, canvas.height, mirroredRef.current)
    if (hasHands && trackerVisibilityRef.current.hands) {
      results.multiHandLandmarks.forEach((landmarks) => {
        handTracker.drawSkeleton(ctx, landmarks, canvas.width, canvas.height, mirroredRef.current)
      })
    }
    if (hasHands && trackerVisibilityRef.current.palm) {
      handTracker.drawPalmDirections(ctx, results.multiHandLandmarks, results.palmDirections,
        canvas.width, canvas.height, mirroredRef.current)
    }

    // Dedicated modes; Auto sends each landmark frame to all three sign classifiers.
    if (inputModeRef.current === 'spell' || inputModeRef.current === 'phrase') {
      if (inputModeRef.current === 'spell') letterSpeller.addFrame(results)
      else phraseRecorder.addFrame(results)
      return
    }

    if (inputModeRef.current === 'auto') letterSpeller.addFrame(results)

    if ((inputModeRef.current === 'static' || inputModeRef.current === 'auto') && staticOnlineRef.current) {
      staticPoseRecognizer.addFrame(results)
    }

    if (inputModeRef.current === 'static') return

    // Trained model path: stream landmarks; predictions arrive via signRecognizer.onPrediction
    if (modelOnlineRef.current) {
      const now = performance.now()
      if (hasHands) {
        lastHandSeenRef.current = now
      } else if (now - lastHandSeenRef.current > 800) {
        // Hands lowered for a while: show the resting state (segmentation itself runs on the server)
        setCurrentDetection((prev) => (prev.status === 'no_hands' || prev.status === 'ok' ? prev : {
          sign: 'UNKNOWN', confidence: 0, isUnknown: true, status: 'no_hands', source: 'model', metadata: null
        }))
        if (inputModeRef.current === 'auto' && autoCommittedRef.current) {
          autoResultsRef.current = {}
          setAutoResults({})
          autoCommittedRef.current = false
        }
      }
      if (inputModeRef.current === 'words' || inputModeRef.current === 'auto') signRecognizer.addFrame(results)
      return
    }

    if (inputModeRef.current === 'auto') return

    // Offline fallback: rule-based hand-shape matching for 8 static signs
    if (hasHands) {
      const primaryHand = results.multiHandLandmarks[0]
      const classification = { ...classifyISLSign(primaryHand, results.multiHandLandmarks), source: 'rules' }
      setCurrentDetection(classification)

      // Buffer commitment on stable hold (14 frames = ~450ms)
      if (!classification.isUnknown && classification.sign !== 'UNKNOWN') {
        if (stableSignRef.current.sign === classification.sign) {
          stableSignRef.current.count += 1
          if (stableSignRef.current.count >= 14) {
            if (lastCommittedSignRef.current !== classification.sign) {
              setRecognizedTokens([classification.sign])
              lastCommittedSignRef.current = classification.sign
            }
          }
        } else {
          stableSignRef.current = { sign: classification.sign, count: 1 }
        }
      } else {
        stableSignRef.current = { sign: null, count: 0 }
        lastCommittedSignRef.current = null
      }
    } else {
      setCurrentDetection({
        sign: 'UNKNOWN',
        confidence: 0,
        isUnknown: true,
        source: 'rules',
        metadata: null
      })
      stableSignRef.current = { sign: null, count: 0 }
      lastCommittedSignRef.current = null
    }
  }, [])

  useEffect(() => {
    handTracker.listCameras().then(setCameras).catch(() => setCameras([]))
  }, [])

  const handleStartCamera = async () => {
    setCameraLoading(true)
    setCameraError(null)
    setCameraIssue(null)
    faceLandmarksRef.current = null
    try {
      if (videoRef.current) {
        await handTracker.startCamera(videoRef.current, handleMediaPipeResults, {
          deviceId: cameraId, resolution: cameraRes, onIssue: setCameraIssue
        })
        setCameraActive(true)
        handTracker.listCameras().then(setCameras).catch(() => {}) // labels appear once permission is granted
        try {
          await faceExpressionTracker.start(videoRef.current, handleFaceResults, handleFaceError)
        } catch (error) {
          handleFaceError(error)
        }
      }
    } catch (err) {
      console.error('Camera startup failed:', err)
      setCameraError(cameraErrorMessage(err, CAMERA_ERRORS))
      setCameraActive(false)
    } finally {
      setCameraLoading(false)
    }
  }

  const handleStopCamera = () => {
    handTracker.stopCamera()
    faceLandmarksRef.current = null
    setCameraIssue(null)
    signRecognizer.reset()
    lastModelSignRef.current = null
    faceExpressionTracker.stop()
    setCameraActive(false)
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    }
    setCurrentDetection({
      sign: 'UNKNOWN',
      confidence: 0,
      isUnknown: true,
      metadata: null
    })
    resetExpression('ready')
  }

  const handleSpeakSentence = () => speakText(generatedSentence)

  function speakText(text) {
    if (!text) return
    lastSpokenRef.current = text

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      
      // Use localized Indian voice locales for rich audio synthesis
      if (selectedLang === 'hi') {
        utterance.lang = 'hi-IN'
      } else if (selectedLang === 'mr') {
        utterance.lang = 'mr-IN'
      } else {
        utterance.lang = 'en-IN'
      }

      utterance.rate = 0.95 * speechRate
      utterance.pitch = 1.0
      setIsSpeaking(true)
      utterance.onend = () => setIsSpeaking(false)
      utterance.onerror = () => setIsSpeaking(false)
      window.speechSynthesis.speak(utterance)
    } else {
      setIsSpeaking(false) // no speech synthesis in this browser: do not pretend to speak
    }
  }

  const handleClearBuffer = () => {
    lastSpokenRef.current = ''
    setRecognizedTokens([])
    setSentenceDraftTokens([])
    setGeneratedSentence('')
    lastCommittedSignRef.current = null
    stableSignRef.current = { sign: null, count: 0 }
  }

  const handleCopyText = () => {
    if (!generatedSentence) return
    navigator.clipboard.writeText(generatedSentence)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleSimulateSign = (v) => {
    // Manual entry: no recognition happened, so no confidence is shown
    setCurrentDetection({
      sign: v.id,
      label: v.label,
      confidence: null,
      isUnknown: false,
      source: 'manual',
      metadata: v
    })
    setRecognizedTokens(prev => {
      if (prev.length > 0 && prev[prev.length - 1] === v.id) {
        return prev;
      }
      return [...prev, v.id];
    })
  }

  // Voice Input for Speech to 3D Sign Mode
  const handleToggleVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. You can type in the box directly.')
      return
    }

    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
    } else {
      const recognition = new SpeechRecognition()
      recognition.continuous = false
      recognition.interimResults = false
      recognition.lang = 'en-US'

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript
        setTextInput(transcript)
        setActiveAvatarText(transcript.toUpperCase())
        setIsListening(false)
      }

      recognition.onerror = () => setIsListening(false)
      recognition.onend = () => setIsListening(false)

      recognitionRef.current = recognition
      recognition.start()
      setIsListening(true)
    }
  }

  const handleTranslateToSign = (e) => {
    e?.preventDefault()
    if (textInput.trim()) {
      setActiveAvatarText(textInput.trim().toUpperCase())
    }
  }

  useEffect(() => {
    return () => {
      handTracker.stopCamera()
      faceExpressionTracker.stop()
      recognitionRef.current?.stop()
    }
  }, [])

  return (
    <div className="pt-3 sm:pt-6 lg:pt-10 pb-24 lg:pb-16 max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 space-y-4 sm:space-y-8">
      <style>{`
        @media (max-width: 767px) {
          .communicate-camera-panel {
            width: 100%;
            max-width: 100%;
            aspect-ratio: 4 / 3;
            height: min(75vw, 58dvh, 480px);
            min-height: 220px;
          }
          .communicate-camera-panel video,
          .communicate-camera-panel canvas {
            object-fit: cover;
          }
        }
        @media (min-width: 768px) and (max-width: 1279px) {
          .communicate-camera-panel {
            aspect-ratio: 4 / 3;
          }
        }
      `}</style>
      
      {/* Header & 2-Way Mode Switcher */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-mudra-lavender-200/60">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-mudra-lavender-100 text-mudra-lavender-700 text-xs font-bold font-mono mb-1">
            <Radio className="w-3.5 h-3.5 text-mudra-lavender-600 animate-pulse" />
            <span>SIGNLINE COMMUNICATION</span>
          </div>
          <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-mudra-indigo-900">
            Sign and speak
          </h1>
          <p className="text-sm text-mudra-indigo-600 mt-1">
            Sign to speech, fingerspell, or use a phrase.
          </p>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-2xl bg-white/90 border border-mudra-lavender-200 shadow-xs">
          <button
            type="button"
            onClick={() => {
              setActiveMode('sign-to-speech')
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeMode === 'sign-to-speech'
                ? 'bg-mudra-lavender-600 text-white shadow-xs'
                : 'text-mudra-indigo-700 hover:bg-mudra-lavender-50'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Sign &rarr; Voice</span>
          </button>

          <button
            type="button"
            onClick={() => {
              handleStopCamera()
              setActiveMode('speech-to-sign')
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeMode === 'speech-to-sign'
                ? 'bg-mudra-lavender-600 text-white shadow-xs'
                : 'text-mudra-indigo-700 hover:bg-mudra-lavender-50'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Voice &rarr; 3D Avatar</span>
          </button>
        </div>
      </div>

      {/* MODE 1: SIGN TO SPEECH (Signer to Listener) */}
      {activeMode === 'sign-to-speech' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 lg:gap-8 items-start animate-fadeIn">
          
          {/* Left: Live Webcam + Canvas Landmark Overlay */}
          <div className="lg:col-span-7 space-y-5">
            <div className="communicate-camera-panel relative aspect-video sm:aspect-[4/3] min-h-[320px] sm:min-h-0 bg-mudra-indigo-900 rounded-3xl overflow-hidden shadow-xl border-2 border-mudra-indigo-700/90 flex flex-col justify-between p-4 sm:p-5 text-white">
              
              <video
                ref={videoRef}
                className={`absolute inset-0 w-full h-full object-cover transform ${mirrored ? '-scale-x-100' : ''} ${
                  cameraActive ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
                playsInline
                muted
              />

              <div className="absolute left-3 right-3 top-3 z-20 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5 rounded-xl bg-black/55 p-1.5 backdrop-blur-sm" aria-label="Tracking overlays">
                  {Object.entries({ hands: 'Hands', body: 'Body', face: 'Face', palm: 'Palm' }).map(([key, label]) => (
                    <button key={key} type="button" aria-pressed={trackerVisibility[key]}
                      onClick={() => setTrackerVisibility((current) => ({ ...current, [key]: !current[key] }))}
                      className={`rounded-lg px-2 py-1 text-[11px] font-bold ${trackerVisibility[key] ? 'bg-white text-slate-900' : 'text-white/80 hover:bg-white/15'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <button type="button" onClick={() => setMirrored((current) => {
                    const next = !current
                    writePref('mudra_camera_mirrored', next)
                    return next
                  })} className="inline-flex items-center gap-1.5 rounded-xl bg-black/55 px-3 py-2 text-xs font-bold text-white backdrop-blur-sm" aria-pressed={mirrored}>
                    <FlipHorizontal className="h-4 w-4" aria-hidden="true" /> {mirrored ? 'Mirrored' : 'Mirror'}
                  </button>
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-[11px] font-mono backdrop-blur-md">
                    <span className={`h-2 w-2 rounded-full ${cameraActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                    {cameraActive ? `LIVE · ${trackerFps} fps` : 'CAMERA OFF'}
                  </span>
                  {cameraActive && (
                    <span className="rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-[11px] font-mono text-mudra-peach-300 backdrop-blur-md">
                      {currentDetection.source === 'model'
                        ? `Model · ${trackerDiag?.delegate || 'CPU'}`
                        : currentDetection.source === 'manual' ? 'Manual entry' : 'Rules'}
                    </span>
                  )}
                </div>
              </div>

              <canvas
                ref={canvasRef}
                width={640}
                height={480}
                className="absolute inset-0 w-full h-full object-cover z-10 pointer-events-none"
              />

              {!cameraActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-0">
                  <div className="w-16 h-16 rounded-2xl bg-mudra-indigo-800 border border-mudra-indigo-500/80 flex items-center justify-center text-mudra-lavender-200 mb-3 shadow-lg">
                    <Camera className="w-8 h-8 text-mudra-lavender-400" />
                  </div>
                  <h3 className="font-display font-bold text-base text-white mb-1">
                    Camera is Offline
                  </h3>
                  <p className="text-xs leading-relaxed text-mudra-indigo-100 max-w-sm mb-5">
                    Turn on camera to track hand landmarks and recognize ISL signs in real time.
                  </p>
                  {cameraError && (
                    <p role="alert" className="mb-4 max-w-sm rounded-xl bg-rose-500/90 px-3 py-2 text-xs font-semibold text-white">
                      {cameraError}
                    </p>
                  )}
                  <div className="mb-4 flex flex-wrap items-center justify-center gap-2 text-xs">
                    <label className="sr-only" htmlFor="camera-select">Camera</label>
                    <select
                      id="camera-select"
                      value={cameraId}
                      onChange={(e) => { setCameraId(e.target.value); writePref('mudra_camera_id', e.target.value) }}
                      className="max-w-[14rem] rounded-xl bg-mudra-indigo-800 px-2 py-1.5 text-white border border-mudra-indigo-500"
                    >
                      <option value="">Default camera</option>
                      {cameras.filter((c) => c.deviceId).map((c) => (
                        <option key={c.deviceId} value={c.deviceId}>{c.label}</option>
                      ))}
                    </select>
                    <label className="sr-only" htmlFor="camera-res">Resolution</label>
                    <select
                      id="camera-res"
                      value={cameraRes}
                      onChange={(e) => { setCameraRes(Number(e.target.value)); writePref('mudra_camera_res', e.target.value) }}
                      className="rounded-xl bg-mudra-indigo-800 px-2 py-1.5 text-white border border-mudra-indigo-500"
                    >
                      <option value={480}>640×480 (faster)</option>
                      <option value={720}>1280×720</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={handleStartCamera}
                    disabled={cameraLoading}
                    className="btn-primary min-h-11 rounded-2xl py-2.5 px-5 text-xs font-bold shadow-lg"
                  >
                    <Camera className="w-4 h-4" />
                    <span>{cameraLoading ? 'Starting MediaPipe...' : 'Start Camera Stream'}</span>
                  </button>
                </div>
              )}

              {cameraActive && cameraIssue && (
                <div role="alert" className="absolute top-14 left-1/2 -translate-x-1/2 z-40 w-[90%] max-w-md rounded-2xl bg-rose-500/95 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-lg">
                  {cameraIssue === 'black'
                    ? 'The camera picture is black. Check the lens cover or privacy shutter, or pick another camera.'
                    : 'The camera stopped sending pictures. Stop and restart the camera, or close other apps using it.'}
                </div>
              )}

              {cameraActive && !cameraIssue && !framing && trackerFps > 0 && trackerFps < LOW_FPS && (
                <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 w-[90%] max-w-md rounded-2xl bg-amber-400/95 px-4 py-2.5 text-center text-sm font-semibold text-amber-950 shadow-lg">
                  {slowReason === 'camera'
                    ? `Your camera sends only ${trackerDiag.cameraFps} frames per second. Webcams slow down in dim light: add light in front of you.`
                    : trackerDiag?.delegate === 'CPU'
                    ? `Hand tracking runs on the CPU (${trackerFps} fps). Turn on hardware acceleration in the browser settings, or close other tabs.`
                    : `Hand tracking is slow (${trackerFps} fps, ${trackerDiag?.inferenceMs ?? '?'} ms per frame). Close other tabs or apps using the GPU.`}
                </div>
              )}

              {cameraActive && framing && (
                <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 w-[90%] max-w-md rounded-2xl bg-amber-400/95 px-4 py-2.5 text-center text-sm font-semibold text-amber-950 shadow-lg">
                  {framing === 'no_shoulders'
                    ? 'Move back so both shoulders are in view: recognition needs your upper body.'
                    : 'Move back a little: your chest and both hands should stay in view while you sign.'}
                </div>
              )}

              {/* Bottom Controls */}
              {cameraActive && (
                <div className="flex flex-wrap items-center justify-between gap-3 z-20 pt-2 border-t border-white/10">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleStopCamera}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/90 hover:bg-rose-600 text-white text-xs font-bold transition-all"
                    >
                      <CameraOff className="w-3.5 h-3.5" />
                      <span>Stop Camera</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsPaused(!isPaused)}
                      className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold backdrop-blur-md border border-white/10 flex items-center gap-1.5"
                    >
                      {isPaused ? <Play className="w-3.5 h-3.5 text-emerald-400" /> : <Pause className="w-3.5 h-3.5" />}
                      <span>{isPaused ? 'Resume' : 'Pause'}</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleClearBuffer}
                    className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold backdrop-blur-md border border-white/10 flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Clear Buffer</span>
                  </button>
                </div>
              )}
            </div>

            {/* Quick Sign Simulator Chips */}
            <div className="glass-card rounded-3xl p-4 border border-white space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-mudra-indigo-900 font-display">
                  {modelState.status === 'online' ? 'Add a word manually:' : 'Rule-based signs (hold in camera or click to add):'}
                </span>
                {modelState.status === 'online' && (
                  <span className="text-[10px] text-mudra-indigo-500">Not recognised from the camera yet: teach them on the Record page</span>
                )}
                <span className="text-[10px] text-mudra-indigo-500 font-mono">{chipSigns.length} Signs</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {chipSigns.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => handleSimulateSign(v)}
                    className="p-2 rounded-xl text-left border bg-white border-mudra-lavender-200 hover:bg-mudra-lavender-50 transition-all flex items-center justify-between text-xs"
                  >
                    <span className="font-bold text-mudra-indigo-900">{v.label}</span>
                    <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">ISL</span>
                  </button>
                ))}
              </div>
            </div>

            {modelState.status === 'online' && vocab.length > 0 && (
              <div className="glass-card rounded-2xl p-4 border border-mudra-lavender-200/80 space-y-3">
                <button
                  type="button"
                  onClick={() => setVocabOpen((o) => !o)}
                  className="w-full flex items-center justify-between text-xs font-bold text-mudra-indigo-900 font-display"
                >
                  <span>What can I sign? {vocab.length} words the camera recognises</span>
                  <span className="font-mono text-mudra-indigo-500">{vocabOpen ? 'hide' : 'show'}</span>
                </button>
                {vocabOpen && (
                  <>
                    <input
                      value={vocabQuery}
                      onChange={(e) => setVocabQuery(e.target.value)}
                      placeholder="Search a word, e.g. water"
                      className="w-full rounded-xl border border-mudra-lavender-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mudra-indigo-400"
                    />
                    <div className="max-h-48 overflow-y-auto flex flex-wrap gap-1.5">
                      {vocabMatches.slice(0, 400).map((v) => (
                        <button
                          key={v.sign}
                          type="button"
                          disabled={!v.has_reference}
                          onClick={() => setReferenceSign(v.sign)}
                          title={v.test_clips ? `Tested: ${v.test_correct}/${v.test_clips} correct` : undefined}
                          className={`px-2 py-0.5 rounded-full border text-xs ${referenceSign === v.sign
                            ? 'bg-mudra-indigo-700 border-mudra-indigo-700 text-white'
                            : 'bg-white border-mudra-lavender-200 text-mudra-indigo-900 hover:bg-mudra-lavender-50'} disabled:cursor-default`}
                        >
                          {v.label}
                        </button>
                      ))}
                      {vocabMatches.length === 0 && (
                        <span className="text-xs text-mudra-indigo-600">
                          Not in the model yet. Teach it on the Record page (5 recordings) and it works here straight away.
                        </span>
                      )}
                    </div>
                    {referenceSign && (
                      <SignReference
                        sign={referenceSign}
                        testCorrect={vocab.find((v) => v.sign === referenceSign)?.test_correct}
                        testClips={vocab.find((v) => v.sign === referenceSign)?.test_clips}
                        onClose={() => setReferenceSign(null)}
                      />
                    )}
                    <p className="text-[11px] text-mudra-indigo-600">
                      Tap a word to see how the model expects it to be signed. Sign one word from start to finish, then
                      lower your hands or hold them still for a moment. Stand so your shoulders and both hands are in view.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Right: Interpretation Panel & Speech Out */}
          <div className="lg:col-span-5 min-w-0 space-y-4 sm:space-y-5 lg:pt-0">
            <div className="glass-card rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-mudra-lavender-200/80 shadow-lg space-y-4 sm:space-y-6">
              <InputModeSwitch mode={inputMode} onChange={changeInputMode} />

              {inputMode === 'auto' && (
                <div className="rounded-2xl border border-mudra-lavender-200 bg-white/80 p-3 text-xs text-mudra-indigo-700">
                  Auto streams the same tracked frames to the dynamic word, static pose and alphabet models together. It compares accepted guesses and uses the highest reported confidence after a short settling delay. Phrase recognition stays in its separate tab. The confidence values come from different model score scales, so treat the comparison as a live hint.
                </div>
              )}

              {['words', 'auto'].includes(inputMode) && (
                <div className="space-y-2 rounded-2xl border border-mudra-lavender-200 bg-white/80 p-3">
                  <label htmlFor="recognition-model" className="block text-xs font-bold text-mudra-indigo-700">
                    {inputMode === 'auto' ? 'Dynamic word expert' : 'Word recognition model'}
                    <select
                      id="recognition-model"
                      value={recognitionModel}
                      disabled={modelState.status === 'checking'}
                      onChange={(event) => changeRecognitionModel(event.target.value)}
                      className="mt-1 min-h-10 w-full rounded-xl border border-mudra-lavender-300 bg-white px-3 text-sm font-semibold text-mudra-indigo-950 disabled:opacity-60"
                    >
                      {dynamicModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.trained_words ? `${model.trained_words} words · ` : ''}{model.name}
                          {model.test_accuracy == null
                            ? ' · accuracy not measured'
                            : ` · ${(model.test_accuracy * 100).toFixed(1)}% / ${model.accuracy_samples || '?'} clips`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="text-[11px] leading-relaxed text-mudra-indigo-600">
                    Scores are from each model’s listed held-out split. Live-webcam accuracy has not been measured.
                  </p>
                  {['common_word_video', 'isl500_video'].includes(effectiveRecognitionModel) && (
                    <p className="text-[11px] leading-relaxed text-amber-900">
                      Video models are experimental. Scores use held-out signers and do not estimate webcam accuracy.
                    </p>
                  )}
                  {['isl500_video', 'common_word_video'].includes(effectiveRecognitionModel) && (
                    <details className="mt-3 overflow-hidden rounded-xl border border-indigo-200 bg-indigo-50/70">
                      <summary className="cursor-pointer px-3 py-3 text-xs font-bold text-indigo-950">
                        Evaluation videos <span className="font-normal text-indigo-700">· {activeModelTestCases.sample_count || 'loading'} held-out clips</span>
                      </summary>
                      <div className="space-y-3 border-t border-indigo-200 p-3">
                      <div>
                        <p className="text-xs font-bold text-indigo-950">Compare a test sign with your camera attempt</p>
                        <p className="mt-1 text-[11px] leading-relaxed text-indigo-800">
                          {isCommonWordVideoModel
                            ? `This 17-word model scored ${activeModelTestCases.accuracy == null ? 'an unreported score' : `${Math.round(activeModelTestCases.accuracy * 1000) / 10}%`} on ${activeModelTestCases.sample_count ? `${activeModelTestCases.sample_count} held-out clips` : 'its held-out test set'}. These exact clips let you compare the source signing with your own camera attempt.`
                            : `The pilot scored ${activeModelTestCases.accuracy == null ? 'a score that is still loading' : `${Math.round(activeModelTestCases.accuracy * 1000) / 10}%`} on ${activeModelTestCases.sample_count || 'its'} held-out videos from three unseen signers. These exact clips let you compare the source signing with your own camera attempt.`}
                        </p>
                      </div>
                      {activeModelTestCasesError ? (
                        <p className="text-xs text-rose-700">{activeModelTestCasesError}</p>
                      ) : activeModelTestCases.cases.length > 0 ? (() => {
                        const testCase = activeModelTestCases.cases.find((item) => item.id === activeModelTestCaseId) || activeModelTestCases.cases[0]
                        return <>
                          <label className="block text-[11px] font-semibold text-indigo-900" htmlFor="word-model-test-case">
                            Test clip ({activeModelTestCases.cases.length} held-out videos)
                            <select id="word-model-test-case" value={testCase.id}
                              onChange={(event) => setActiveModelTestCaseId(event.target.value)}
                              className="mt-1 min-h-9 w-full rounded-lg border border-indigo-200 bg-white px-2 text-xs">
                              {activeModelTestCases.cases.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.label.replaceAll('_', ' ')} · take {item.example_number}{item.prediction ? ` · ${item.correct ? 'model correct' : `model said ${item.prediction.replaceAll('_', ' ')}`}` : ''}
                                </option>
                              ))}
                            </select>
                          </label>
                          <video key={testCase.id} controls playsInline preload="metadata"
                            className="max-h-64 w-full rounded-lg bg-black"
                            src={`${API_BASE_URL}${testCase.video_url}`}>
                            Your browser does not support video playback.
                          </video>
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="font-semibold text-indigo-950">Expected: {testCase.label.replaceAll('_', ' ')}</span>
                            {testCase.prediction && <span className={testCase.correct ? 'font-semibold text-emerald-700' : 'font-semibold text-rose-700'}>
                              Saved evaluation: {testCase.prediction.replaceAll('_', ' ')} {testCase.correct ? '✓' : '· incorrect'}
                            </span>}
                          </div>
                          <button type="button" onClick={() => { if (!cameraActive) handleStartCamera() }}
                            disabled={cameraActive || cameraLoading}
                            className="w-full rounded-lg bg-indigo-900 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-800 disabled:cursor-default disabled:opacity-60">
                            {cameraActive ? 'Camera is ready — try the sign now' : cameraLoading ? 'Starting camera…' : 'Start camera and try this sign'}
                          </button>
                        </>
                      })() : <p className="text-xs text-indigo-700">Loading held-out test videos…</p>}
                      </div>
                    </details>
                  )}
                </div>
              )}

              {['static', 'auto'].includes(inputMode) && (
                <div className="space-y-2 rounded-2xl border border-mudra-lavender-200 bg-white/80 p-3 text-xs leading-relaxed text-mudra-indigo-700">
                  <label htmlFor="static-recognition-model" className="block font-bold text-mudra-indigo-800">
                    Static pose model
                    <select id="static-recognition-model" value={staticRecognitionModel}
                      onChange={(event) => setStaticRecognitionModel(event.target.value)}
                      className="mt-1 min-h-10 w-full rounded-xl border border-mudra-lavender-300 bg-white px-3 text-sm font-semibold text-mudra-indigo-950">
                      {staticModels.map((model) => <option key={model.id} value={model.id}>
                        {model.name}{model.test_accuracy == null ? '' : ` · ${(model.test_accuracy * 100).toFixed(1)}% / ${model.accuracy_samples || '?'} clips`}
                      </option>)}
                    </select>
                  </label>
                  <p>Hold a still sign shape. This model does not classify motion or fingerspelling. Live-webcam accuracy has not been measured.</p>
                </div>
              )}

              {(
                (['words', 'auto'].includes(inputMode) && ['sequence', 'common_word_video', 'isl500_video'].includes(effectiveRecognitionModel)) ||
                inputMode === 'static' || inputMode === 'spell' || inputMode === 'phrase'
              ) && (
                <details className="rounded-2xl border border-mudra-lavender-200 bg-white/80 p-3">
                  <summary className="cursor-pointer text-xs font-bold text-mudra-indigo-900">Reference videos and examples</summary>
                  <div className="mt-3">
                    <ModelVideoExamplePanel modelId={
                  inputMode === 'static' ? staticRecognitionModel
                    : inputMode === 'spell' ? 'letters'
                      : inputMode === 'phrase' ? 'phrases' : effectiveRecognitionModel
                    } />
                  </div>
                </details>
              )}
              {inputMode === 'auto' && (
                <details className="rounded-2xl border border-mudra-lavender-200 bg-white/80 p-3">
                  <summary className="cursor-pointer text-xs font-bold text-mudra-indigo-900">Static-pose reference videos</summary>
                  <div className="mt-3"><ModelVideoExamplePanel modelId={staticRecognitionModel} /></div>
                </details>
              )}

              {['words', 'static', 'spell', 'auto'].includes(inputMode) && (
                <label htmlFor="confidence-floor" className="block rounded-2xl border border-mudra-lavender-200 bg-white/80 p-3 text-xs text-mudra-indigo-700">
                  <span className="flex items-center justify-between gap-3 font-bold">
                    <span>Minimum confidence to accept</span><span className="font-mono">{Math.round(confidenceFloor * 100)}%</span>
                  </span>
                  <input id="confidence-floor" type="range" min="0.3" max="0.95" step="0.05" value={confidenceFloor}
                    onChange={(event) => setConfidenceFloor(Number(event.target.value))}
                    className="mt-2 w-full accent-mudra-indigo-700" />
                  <span className="mt-1 block text-[11px]">Raise it to reject more guesses; lower it to accept more candidates. Each model’s confidence scale differs.</span>
                </label>
              )}

              {inputMode === 'auto' && (
                <div className="grid grid-cols-3 gap-2 text-xs" aria-live="polite">
                  {[
                    ['dynamic', 'Dynamic word'],
                    ['static', 'Static pose'],
                    ['alphabet', 'Alphabet'],
                  ].map(([kind, label]) => {
                    const result = autoResults[kind]
                    return <div key={kind} className={`rounded-xl border p-2 ${autoResults.winner?.kind === kind ? 'border-emerald-500 bg-emerald-50' : 'border-mudra-lavender-200 bg-white/80'} ${result && !result.accepted ? 'opacity-60' : ''}`}>
                      <p className="font-bold">{label}</p>
                      <p className="mt-1 min-h-8 break-words">{result ? result.label : 'Waiting'}</p>
                      <p className="font-mono text-mudra-indigo-500">{result ? `${Math.round(result.confidence * 100)}%` : '—'}</p>
                      {result && !result.accepted && <p className="text-[10px]">Below minimum</p>}
                    </div>
                  })}
                </div>
              )}

              {inputMode === 'spell' ? (
                <SpellPanel cameraActive={cameraActive} accuracy={libraryModels.letters} confidenceFloor={confidenceFloor}
                            onCommitWord={(word) => setRecognizedTokens((prev) => [...prev, word])} />
              ) : inputMode === 'phrase' ? (
                <PhrasePanel cameraActive={cameraActive} accuracy={libraryModels.phrases}
                             onCommitPhrase={(phrase) => setRecognizedTokens((prev) => [...prev, phrase])} />
              ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-[0.12em] text-mudra-lavender-800 font-display">
                    Detected Sign
                  </span>
                  <span className={`shrink-0 text-[11px] font-mono font-bold px-2.5 py-1 rounded-full border ${
                    currentDetection.status === 'uncertain'
                      ? 'bg-amber-100 text-amber-800 border-amber-200'
                      : currentDetection.isUnknown
                      ? 'bg-gray-100 text-gray-600 border-gray-200'
                      : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  }`}>
                    {currentDetection.source === 'manual'
                      ? 'Added manually'
                      : currentDetection.source === 'custom' && !currentDetection.isUnknown
                      ? 'Your recorded word'
                      : currentDetection.status === 'unsure'
                      ? `Added, unsure · ${currentDetection.confidence}%`
                      : currentDetection.status === 'uncertain'
                      ? `Uncertain · ${currentDetection.confidence}%`
                      : currentDetection.status === 'signing'
                      ? 'Signing…'
                      : currentDetection.status === 'no_hands'
                      ? 'No hands in view'
                      : currentDetection.isUnknown
                      ? (currentDetection.source === 'model' ? 'Waiting for a sign' : 'Below 68% match')
                      : `${currentDetection.confidence}% confidence`}
                  </span>
                </div>

                <div className="flex items-center gap-3 min-h-12">
                  <span className={`font-display font-extrabold text-3xl sm:text-4xl tracking-tight leading-none break-words ${
                    currentDetection.isUnknown ? 'text-mudra-indigo-600 italic' : 'text-mudra-indigo-950'
                  }`}>
                    {currentDetection.isUnknown
                      ? (currentDetection.status === 'uncertain' ? 'Not sure yet'
                        : currentDetection.status === 'missed' ? "Didn't catch that"
                        : currentDetection.status === 'signing' ? 'Signing…'
                        : currentDetection.status === 'too_short' ? 'Too short, sign again'
                        : 'Waiting for a sign')
                      : (currentDetection.label || readableSign(currentDetection.sign))}
                  </span>
                </div>
                {currentDetection.confidence > 0 && !['signing', 'no_hands'].includes(currentDetection.status) && (
                  <div className="mt-2 max-w-sm" role="meter" aria-label="Recognition confidence"
                       aria-valuemin={0} aria-valuemax={100} aria-valuenow={currentDetection.confidence}>
                    <div className="mb-1 flex justify-between text-[11px] font-semibold text-mudra-indigo-600">
                      <span>Recognition confidence</span><span>{currentDetection.confidence}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-mudra-lavender-100">
                      <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-200"
                           style={{ width: `${Math.min(100, Math.max(0, currentDetection.confidence))}%` }} />
                    </div>
                  </div>
                )}
                {currentDetection.status === 'signing' && currentDetection.candidate && (
                  <p className="text-xs text-mudra-indigo-600 mt-1">
                    Looks like <strong>{currentDetection.candidate}</strong>… finish the movement or pause briefly; the next clear movement starts the next sign.
                  </p>
                )}
                {!currentDetection.isUnknown && currentDetection.sign && currentDetection.sign !== 'UNKNOWN' && (
                  <button
                    type="button"
                    onClick={() => { setVocabOpen(true); setReferenceSign(currentDetection.sign) }}
                    className="mt-1 text-xs font-semibold text-mudra-indigo-700 underline hover:text-mudra-indigo-900"
                  >
                    See how "{currentDetection.label || readableSign(currentDetection.sign)}" is signed
                  </button>
                )}
                {suggestions.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-mudra-indigo-600">Added "{currentDetection.label}". Wrong? Replace with:</span>
                    {suggestions.map((s) => (
                      <button
                        key={s.sign}
                        type="button"
                        onClick={() => { replaceLastToken(s.sign); setSuggestions([]) }}
                        className="px-2.5 py-1 rounded-full border border-mudra-lavender-300 bg-white font-semibold text-mudra-indigo-900 hover:bg-mudra-lavender-50"
                      >
                        {s.label} <span className="font-mono text-mudra-indigo-400">{Math.round(s.confidence * 100)}%</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                  {(() => {
                    const online = inputMode === 'static' ? staticModelOnline : inputMode === 'auto'
                      ? modelState.status === 'online' && staticModelOnline
                      : modelState.status === 'online'
                    const label = inputMode === 'static'
                      ? (online ? `${selectedStaticModel?.name || 'Static pose model'} · ${selectedStaticModel?.live_words ?? 0} live classes` : 'Static pose model offline')
                      : inputMode === 'auto'
                        ? (online ? 'Auto · dynamic, static and alphabet ready' : 'Auto · one or more models offline')
                        : modelState.status === 'online'
                          ? effectiveRecognitionModel === 'common_word_video'
                            ? `Word-video model · ${selectedRecognitionModel?.live_words ?? 17} experimental classes`
                            : effectiveRecognitionModel === 'isl500_video'
                              ? `ISL500 video model · ${selectedRecognitionModel?.live_words ?? 14} experimental classes`
                              : effectiveRecognitionModel === 'signline_intro_video'
                                ? `SignLine intro video model · ${selectedRecognitionModel?.live_words ?? 26} classes`
                              : `Dynamic word model · ${modelState.info?.num_signs ?? ''} words`
                          : modelState.status === 'checking' ? 'Connecting to recognition model...' : 'Offline: rule-based fallback, 8 signs'
                    return <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono font-semibold ${online ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-emerald-500' : 'bg-amber-500'}`} />{label}
                    </span>
                  })()}
                  {modelState.status !== 'online' && modelState.status !== 'checking' && inputMode !== 'static' && (
                    <button
                      type="button"
                      onClick={() => signRecognizer.connect()}
                      className="px-2 py-0.5 rounded-full border border-mudra-lavender-300 text-mudra-lavender-800 font-semibold hover:bg-mudra-lavender-50"
                    >
                      Retry connection
                    </button>
                  )}
                </div>
                {modelState.status === 'offline' && modelState.error && (
                  <p className="text-[11px] text-mudra-indigo-500 mt-1">{modelState.error}</p>
                )}
              </div>
              )}

              {/* Committed Sequence Buffer */}
              <div className="space-y-2 pt-2 border-t border-mudra-lavender-200/60">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-mudra-indigo-500 font-display">
                    Recognized
                  </span>
                  <span className="text-[10px] text-mudra-indigo-400 font-mono">
                    {inputMode === 'words' || inputMode === 'auto' ? 'Current word' : `${recognizedTokens.length} Tokens`}
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap min-h-[42px] p-2.5 rounded-xl bg-mudra-ivory-100/90 border border-mudra-lavender-200">
                  {recognizedTokens.length > 0 ? (
                    recognizedTokens.map((token, i) => (
                      <React.Fragment key={i}>
                        <span className="px-2.5 py-1 rounded-lg bg-mudra-indigo-900 text-white font-mono text-xs font-semibold shadow-xs">
                          {readableSign(token)}
                        </span>
                        {i < recognizedTokens.length - 1 && (
                          <span className="text-mudra-indigo-400 text-xs font-bold">&rarr;</span>
                        )}
                      </React.Fragment>
                    ))
                  ) : (
                    <span className="text-xs text-mudra-indigo-400 italic">
                        {modelState.status === 'online'
                        ? ((inputMode === 'words' || inputMode === 'auto')
                          ? `Sign a word, then lower your hands or hold them still; the current word updates and is spoken after ${AUTO_SPEAK_PAUSE_MS / 1000} seconds`
                          : 'Sign a word to add it to the sequence')
                        : 'Hold a sign steady in camera to commit token'}
                    </span>
                  )}
                </div>
              </div>

              {/* Natural Sentence Output */}
              <div className="space-y-2 pt-2 border-t border-mudra-lavender-200/60">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-mudra-indigo-500 font-display">
                    Meaning
                  </span>
                  
                  {/* Language Selector Tabs */}
                  <div className="flex items-center gap-1 p-1 rounded-xl bg-mudra-ivory-100 border border-mudra-lavender-200 shadow-xs shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedLang('en')}
                      className={`min-w-9 px-2.5 py-1.5 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-all ${
                        selectedLang === 'en'
                          ? 'bg-mudra-lavender-600 text-white shadow-xs'
                          : 'text-mudra-indigo-700 hover:bg-mudra-lavender-50'
                      }`}
                    >
                      EN
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedLang('hi')}
                      className={`min-w-9 px-2.5 py-1.5 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-all ${
                        selectedLang === 'hi'
                          ? 'bg-mudra-lavender-600 text-white shadow-xs'
                          : 'text-mudra-indigo-700 hover:bg-mudra-lavender-50'
                      }`}
                    >
                      हिन्दी
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedLang('mr')}
                      className={`min-w-9 px-2.5 py-1.5 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-all ${
                        selectedLang === 'mr'
                          ? 'bg-mudra-lavender-600 text-white shadow-xs'
                          : 'text-mudra-indigo-700 hover:bg-mudra-lavender-50'
                      }`}
                    >
                      मराठी
                    </button>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-gradient-to-br from-mudra-lavender-50 via-white to-mudra-peach-50 border border-mudra-lavender-300 min-h-[64px] flex items-center">
                  <div className="font-display font-semibold text-lg sm:text-xl text-mudra-indigo-950">
                    {generatedSentence ? `"${generatedSentence}"` : <span className="text-mudra-indigo-400 italic">No sentence generated yet</span>}
                  </div>
                </div>
                {(inputMode === 'words' || inputMode === 'auto') && recognizedTokens.length > 0 && (
                  <div className="space-y-2 rounded-xl border border-mudra-lavender-200 bg-white/80 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-mudra-indigo-800">Next word suggestions</span>
                      <button type="button" aria-pressed={blinkToAccept}
                        onClick={() => setBlinkToAccept((enabled) => !enabled)}
                        className={`min-h-9 rounded-lg border px-3 text-xs font-bold ${blinkToAccept ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-mudra-lavender-300 text-mudra-indigo-700'}`}>
                        {blinkToAccept ? 'Blink to accept: on' : 'Enable blink to accept'}
                      </button>
                    </div>
                    {sentenceDraftTokens.length === 0 && (
                      <button type="button" onClick={addCurrentSignToSentence}
                        className="rounded-lg border border-mudra-lavender-300 px-3 py-1.5 text-xs font-semibold text-mudra-indigo-700 hover:bg-mudra-lavender-50">
                        Add {readableSign(recognizedTokens[0])} as the first word
                      </button>
                    )}
                    {nextWordSuggestions.length ? (
                      <div className="flex flex-wrap gap-2">
                        {nextWordSuggestions.map((sign) => (
                          <button key={sign} type="button" onClick={() => acceptPredictedSign(sign)}
                            className="min-h-10 rounded-lg bg-mudra-indigo-900 px-3 py-2 text-xs font-bold text-white hover:bg-mudra-indigo-700">
                            + {readableSign(sign)}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-mudra-indigo-500">No reviewed continuation for this word sequence yet. Suggestions come only from the local phrase templates.</p>
                    )}
                    <p aria-live="polite" className="text-[11px] text-mudra-indigo-500">
                      {blinkAccepted ? 'Suggestion added to the sentence.' : blinkToAccept ? 'A blink accepts the first suggestion when one is available.' : 'Tap a suggestion, or enable blink acceptance.'}
                    </p>
                  </div>
                )}
              </div>

              {/* Non-manual (facial) cue layer — experimental, describes movement, not emotion */}
              <div className="space-y-3 pt-2 border-t border-mudra-lavender-200/60">
                <div className="flex items-start gap-3">
                  <span
                    key={`${expression.tone}-${faceStatus}`}
                    className="text-3xl leading-none animate-fadeIn"
                    aria-hidden="true"
                  >
                    {faceStatus === 'not-detected' || faceStatus === 'error' ? '🤔' : expression.emoji}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-mudra-lavender-700 font-display">
                        FACIAL CUES (EXPERIMENTAL)
                      </span>
                      {faceStatus === 'detected' && expression.available && (
                        <span className="text-[10px] font-mono font-bold text-mudra-indigo-600">
                          cue score {Math.round(expression.confidence * 100)} (uncalibrated)
                        </span>
                      )}
                    </div>
                    <div className="font-display font-bold text-lg text-mudra-indigo-950">
                      {faceStatus === 'not-detected'
                        ? 'Face not detected'
                        : faceStatus === 'error'
                        ? 'Facial cues unavailable'
                        : faceStatus === 'insufficient'
                        ? 'No strong facial cue'
                        : expression.label}
                    </div>
                    <p className="text-xs leading-relaxed text-mudra-indigo-600">
                      {faceStatus === 'initializing'
                        ? 'Loading facial analysis...'
                        : !cameraActive
                        ? 'Start the camera to observe facial cues.'
                        : faceStatus === 'not-detected'
                        ? 'Face not detected.'
                        : faceStatus === 'error'
                        ? expression.reason
                        : faceStatus === 'insufficient'
                        ? 'Insufficient facial cues.'
                        : 'Describes facial movement only. It is not a reading of emotion.'}
                    </p>
                    <p className="text-[10px] font-medium text-mudra-indigo-500">
                      Facial analysis runs locally on your device. No images are stored or uploaded.
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons: Speak & Copy */}
              <label className="flex items-center gap-2 text-xs font-semibold text-mudra-indigo-800 cursor-pointer select-none">
                <input type="checkbox" checked={autoSpeak} onChange={(e) => setAutoSpeak(e.target.checked)} className="accent-mudra-indigo-700 w-4 h-4" />
                Speak automatically when I pause ({AUTO_SPEAK_PAUSE_MS / 1000} s)
              </label>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleSpeakSentence}
                  disabled={!generatedSentence}
                  className={`btn-primary min-h-12 min-w-0 flex-[1_1_12rem] rounded-2xl py-3.5 text-sm shadow-md ${
                    isSpeaking ? 'bg-mudra-lavender-700 animate-pulse' : ''
                  }`}
                >
                  <Volume2 className={`w-4 h-4 ${isSpeaking ? 'animate-bounce' : ''}`} />
                  <span>{isSpeaking ? 'Speaking Out Loud...' : 'Speak Sentence'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyText}
                  disabled={!generatedSentence}
                  className="btn-secondary shrink-0 py-3.5 px-4 text-xs font-semibold"
                  title="Copy sentence"
                >
                  {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleClearBuffer}
                  className="btn-secondary shrink-0 py-3.5 px-3 text-xs"
                  title="Clear tokens"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>

            </div>
          </div>

        </div>
      )}

      {/* MODE 2: SPEECH / TEXT TO 3D AVATAR (Listener to Signer) */}
      {activeMode === 'speech-to-sign' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 lg:gap-8 items-start animate-fadeIn">
          
          {/* Left: Input & Speech Dictation */}
          <div className="lg:col-span-6 space-y-5">
            <div className="glass-card rounded-3xl p-6 sm:p-7 border border-white shadow-xl space-y-5">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-mudra-peach-warm uppercase tracking-wider font-mono mb-1">
                  <Mic className="w-3.5 h-3.5" />
                  <span>Hearing Speaker Input</span>
                </div>
                <h2 className="font-display font-bold text-xl sm:text-2xl text-mudra-indigo-900">
                  Speak or Type to Translate to ISL
                </h2>
                <p className="text-xs text-mudra-indigo-600 mt-1">
                  The MUDRA 3D Avatar will perform the sign language translation in real time.
                </p>
              </div>

              <form onSubmit={handleTranslateToSign} className="space-y-3">
                <div className="relative">
                  <textarea
                    rows={3}
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Type words or letters (e.g. 'HELLO', 'NAMASTE', 'THANK YOU', 'YES', 'NO', 'TIME')..."
                    className="w-full p-4 rounded-2xl bg-white border border-mudra-lavender-200 text-sm text-mudra-indigo-900 focus:outline-none focus:border-mudra-lavender-500 shadow-inner resize-none font-medium"
                  />

                  <button
                    type="button"
                    onClick={handleToggleVoiceInput}
                    className={`absolute bottom-3 right-3 p-2.5 rounded-xl border transition-all ${
                      isListening
                        ? 'bg-rose-500 text-white animate-pulse border-rose-600 shadow-md'
                        : 'bg-mudra-lavender-50 text-mudra-lavender-700 border-mudra-lavender-200 hover:bg-mudra-lavender-100'
                    }`}
                    title={isListening ? 'Listening...' : 'Click to Speak via Microphone'}
                  >
                    {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1 text-[11px] text-mudra-indigo-500">
                    <Sparkles className="w-3 h-3 text-mudra-lavender-600" />
                    <span>Avatar: 13 words and A-Z fingerspelling</span>
                  </div>

                  <button
                    type="submit"
                    className="btn-primary py-2.5 px-5 text-xs font-bold flex items-center gap-2"
                  >
                    <span>Sign with 3D Avatar</span>
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </form>

              {/* Sample phrases */}
              <div className="pt-2 border-t border-mudra-lavender-200/60 space-y-2">
                <span className="text-[11px] font-bold uppercase text-mudra-indigo-500 font-display">
                  Quick Phrases:
                </span>
                <div className="flex flex-wrap gap-2">
                  {['HELLO', 'NAMASTE', 'THANK YOU', 'YES', 'NO', 'TIME', 'HOME', 'GOODBYE'].map((phrase) => (
                    <button
                      key={phrase}
                      type="button"
                      onClick={() => {
                        setTextInput(phrase)
                        setActiveAvatarText(phrase)
                      }}
                      className="px-3 py-1 rounded-xl bg-white hover:bg-mudra-lavender-50 border border-mudra-lavender-200 text-xs font-semibold text-mudra-indigo-800 transition-colors shadow-xs"
                    >
                      {phrase}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right: 3D Avatar Screen */}
          <div className="lg:col-span-6 space-y-4">
            <MudraAvatarViewer
              signText={activeAvatarText}
              className="w-full h-[400px] sm:h-[450px]"
            />
          </div>

        </div>
      )}

    </div>
  )
}
