/**
 * Client for the backend's /recordings API: signs recorded in the app for training and
 * for few-shot custom words. Only landmark coordinates are sent, never camera images.
 */
import { API_BASE_URL } from './signRecognizer'

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.detail || `Request failed (${res.status})`)
  return body
}

export const listRecordings = () => request('/recordings')

export const saveRecording = ({ label, signer, width, height, frames }) =>
  request('/recordings', { method: 'POST', body: JSON.stringify({ label, signer, width, height, frames }) })

export const deleteRecording = (sampleId) => request(`/recordings/${encodeURIComponent(sampleId)}`, { method: 'DELETE' })
