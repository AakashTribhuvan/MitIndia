import { createContext, useContext, useState } from 'react'

/**
 * DEMO sign-in only. There are no accounts, no passwords and no server-side roles: the chosen role
 * and display name are kept in this browser so the app can show the User or Admin workspace.
 * Anyone can choose either role. Do not use this for anything that needs protection.
 */
const KEY = 'signline_demo_session'
const SessionContext = createContext(null)

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null')
    return s && (s.role === 'user' || s.role === 'admin') ? s : null
  } catch {
    return null
  }
}

export function SessionProvider({ children }) {
  const [session, setSession] = useState(load)
  const signIn = (role, name) => {
    const s = { role, name: (name || '').trim() || (role === 'admin' ? 'Admin' : 'Friend'), demo: true }
    try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* not remembered after reload */ }
    setSession(s)
  }
  const signOut = () => {
    try { localStorage.removeItem(KEY) } catch { /* nothing stored */ }
    setSession(null)
  }
  return <SessionContext.Provider value={{ session, signIn, signOut }}>{children}</SessionContext.Provider>
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within SessionProvider')
  return ctx
}
