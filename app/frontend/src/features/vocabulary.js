import { useEffect, useState } from 'react'
import { API_BASE_URL } from '../services/signRecognizer'
import { readableSign } from '../services/islDictionary'

/**
 * The model's vocabulary from GET /labels (word, readable label, whether a recorded example exists,
 * held-out test results). Fetched once per page load and shared.
 */
let cache = null

export function fetchVocabulary() {
  if (!cache) {
    cache = fetch(`${API_BASE_URL}/labels`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((body) => ({ status: 'online', labels: Object.fromEntries((body.labels || []).map((l) => [l.sign, l])) }))
      .catch(() => {
        cache = null // retry on the next call
        return { status: 'offline', labels: {} }
      })
  }
  return cache
}

export function useVocabulary() {
  const [vocab, setVocab] = useState({ status: 'loading', labels: {} })
  useEffect(() => {
    let alive = true
    fetchVocabulary().then((v) => alive && setVocab(v))
    return () => { alive = false }
  }, [])
  const label = (sign) => vocab.labels[sign]?.label || readableSign(sign)
  const hasExample = (sign) => (vocab.status === 'online' ? Boolean(vocab.labels[sign]?.has_reference) : true)
  return { ...vocab, label, hasExample }
}
