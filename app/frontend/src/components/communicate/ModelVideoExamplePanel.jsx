import { useEffect, useState } from 'react'
import { API_BASE_URL } from '../../services/signRecognizer'

/** Browse clip-backed examples that match the currently selected model's vocabulary. */
export default function ModelVideoExamplePanel({ modelId }) {
  const [catalog, setCatalog] = useState({ available_words: [], message: '' })
  const [sign, setSign] = useState('')
  const [examples, setExamples] = useState({ clips: [], message: '' })
  const [clipId, setClipId] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setCatalog({ available_words: [], message: '' })
    setSign('')
    setExamples({ clips: [], message: '' })
    setClipId('')
    setError('')
    fetch(`${API_BASE_URL}/model-video-examples?model_id=${encodeURIComponent(modelId)}`)
      .then((response) => {
        if (!response.ok) throw new Error('The example list is unavailable right now.')
        return response.json()
      })
      .then((payload) => {
        if (!active) return
        const words = payload.available_words || []
        setCatalog({ ...payload, available_words: words })
        setSign(words[0]?.sign || '')
      })
      .catch((reason) => { if (active) setError(reason.message) })
    return () => { active = false }
  }, [modelId])

  useEffect(() => {
    if (!modelId || !sign) {
      setExamples({ clips: [], message: catalog.message })
      return undefined
    }
    let active = true
    setError('')
    setExamples({ clips: [], message: catalog.message })
    setClipId('')
    fetch(`${API_BASE_URL}/model-video-examples?model_id=${encodeURIComponent(modelId)}&sign=${encodeURIComponent(sign)}`)
      .then((response) => {
        if (!response.ok) throw new Error('Videos for this sign are unavailable.')
        return response.json()
      })
      .then((payload) => {
        if (!active) return
        const clips = payload.clips || []
        setExamples({ ...payload, clips })
        setClipId(clips[0]?.id || '')
      })
      .catch((reason) => { if (active) setError(reason.message) })
    return () => { active = false }
  }, [modelId, sign, catalog.message])

  const selected = examples.clips.find((clip) => clip.id === clipId) || examples.clips[0]
  return (
    <section className="rounded-2xl border border-mudra-lavender-200 bg-white/90 p-3 space-y-3" aria-label="Model video examples">
      <div>
        <h3 className="text-xs font-bold text-mudra-indigo-900">Video examples for this model</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-mudra-indigo-600">{catalog.message || 'Finding clips that match the model vocabulary…'}</p>
      </div>
      {error ? <p role="status" className="text-xs text-rose-700">{error}</p> : catalog.available_words.length > 0 ? (
        <>
          <label className="block text-[11px] font-semibold text-mudra-indigo-800" htmlFor="model-video-word">
            Word or phrase
            <select id="model-video-word" value={sign} onChange={(event) => setSign(event.target.value)}
              className="mt-1 min-h-10 w-full rounded-lg border border-mudra-lavender-300 bg-white px-2 text-sm">
              {catalog.available_words.map((word) => (
                <option key={word.sign} value={word.sign}>{word.label} · {word.clips} clip{word.clips === 1 ? '' : 's'}</option>
              ))}
            </select>
          </label>
          {selected ? (
            <>
              {examples.clips.length > 1 && (
                <label className="block text-[11px] font-semibold text-mudra-indigo-800" htmlFor="model-video-clip">
                  Example clip
                  <select id="model-video-clip" value={selected.id} onChange={(event) => setClipId(event.target.value)}
                    className="mt-1 min-h-9 w-full rounded-lg border border-mudra-lavender-300 bg-white px-2 text-xs">
                    {examples.clips.map((clip, index) => <option key={clip.id} value={clip.id}>{clip.source} · example {index + 1}</option>)}
                  </select>
                </label>
              )}
              <video key={selected.id} controls playsInline preload="metadata" className="max-h-64 w-full rounded-lg bg-black"
                src={`${API_BASE_URL}${selected.video_url}`}>
                Your browser does not support video playback.
              </video>
              <p className="text-[10px] leading-relaxed text-mudra-indigo-500">{selected.note}</p>
            </>
          ) : <p className="text-xs text-mudra-indigo-500">Loading clips for this sign…</p>}
        </>
      ) : !error ? <p className="text-xs text-mudra-indigo-600">{catalog.message || 'No video examples are available for this model.'}</p> : null}
    </section>
  )
}
