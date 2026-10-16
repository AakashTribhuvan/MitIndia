import { useCallback, useEffect, useState } from 'react'
import { API_BASE_URL } from '../../services/signRecognizer'
import { LESSONS, emptyState } from '../../features/game/progress'

export async function getJson(path, init) {
  const res = await fetch(`${API_BASE_URL}${path}`, init)
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return res.json()
}

/** Fetch one backend path: {status: loading|live|error, data, error, reload}. */
export function useApi(path) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null })
  const load = useCallback(() => {
    setState((s) => ({ ...s, status: 'loading' }))
    getJson(path)
      .then((data) => setState({ status: 'live', data, error: null }))
      .catch((error) => setState({ status: 'error', data: null, error: error.message }))
  }, [path])
  useEffect(() => { load() }, [load])
  return { ...state, reload: load }
}

/**
 * Demo profiles with Game Mode progress saved in THIS browser (the only user data that exists while
 * sign-in is a demo). Read-only.
 */
export function localProfiles() {
  const out = []
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (!key?.startsWith('signline_progress_v1:')) continue
      const s = { ...emptyState(), ...JSON.parse(localStorage.getItem(key) || '{}') }
      const results = Object.values(s.lessons)
      out.push({
        name: key.slice('signline_progress_v1:'.length),
        xp: s.xp,
        passed: results.filter((l) => l.passed).length,
        total: LESSONS.length,
        words: Object.keys(s.words).length,
        badges: Object.keys(s.badges).length,
        days: s.days,
        lastAt: results.map((l) => l.lastAt).sort().pop() || null,
      })
    }
  } catch { /* storage blocked: no profiles */ }
  return out.sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || ''))
}
