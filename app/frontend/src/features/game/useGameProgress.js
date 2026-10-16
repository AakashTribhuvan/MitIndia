import { useCallback, useEffect, useState } from 'react'
import { useSession } from '../../context/SessionContext'
import { loadProgress, saveProgress } from './progress'

/** Game progress of the signed-in demo profile, kept in this browser. */
export function useGameProgress() {
  const { session } = useSession()
  const name = session?.name || 'guest'
  const [state, setState] = useState(() => loadProgress(name))
  const [saved, setSaved] = useState(true)

  useEffect(() => { setState(loadProgress(name)) }, [name])

  const update = useCallback((next) => {
    setState(next)
    setSaved(saveProgress(name, next))
  }, [name])

  return { progress: state, update, saved }
}
