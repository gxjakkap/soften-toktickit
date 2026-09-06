import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { requesterInvalidated } from './apiClient'

/** Lab 2 stores the selected Requester client-side only (BR-10). It is not a
 *  session and grants no trust — every future API call still sends the id. */
export const REQUESTER_STORAGE_KEY = 'toktickit.dev-requester'

export type Requester = {
  id: number
  name: string
  email: string
}

type RequesterContextValue = {
  requester: Requester | null
  selectRequester: (requester: Requester) => void
  clearRequester: () => void
}

const RequesterContext = createContext<RequesterContextValue | null>(null)

function readStoredRequester(): Requester | null {
  try {
    const raw = localStorage.getItem(REQUESTER_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Requester>
    if (typeof parsed?.id !== 'number' || typeof parsed?.name !== 'string') return null
    return { id: parsed.id, name: parsed.name, email: String(parsed.email ?? '') }
  } catch {
    // Unreadable or corrupt storage counts as "nothing selected" (BR-12).
    return null
  }
}

export function RequesterProvider({ children }: { children: ReactNode }) {
  const [requester, setRequester] = useState<Requester | null>(readStoredRequester)

  const selectRequester = useCallback((next: Requester) => {
    localStorage.setItem(REQUESTER_STORAGE_KEY, JSON.stringify(next))
    setRequester(next)
  }, [])

  const clearRequester = useCallback(() => {
    localStorage.removeItem(REQUESTER_STORAGE_KEY)
    setRequester(null)
  }, [])

  // BR-12: the stored Requester was deactivated (or no longer exists) since
  // it was selected — every scoped screen already redirects on `requester ===
  // null` (App.tsx's RequireRequester), so clearing it here is enough.
  useEffect(() => {
    const handleInvalidated = () => clearRequester()
    requesterInvalidated.addEventListener('invalidated', handleInvalidated)
    return () => requesterInvalidated.removeEventListener('invalidated', handleInvalidated)
  }, [clearRequester])

  const value = useMemo(
    () => ({ requester, selectRequester, clearRequester }),
    [requester, selectRequester, clearRequester],
  )

  return <RequesterContext.Provider value={value}>{children}</RequesterContext.Provider>
}

export function useRequester() {
  const value = useContext(RequesterContext)
  if (!value) throw new Error('useRequester must be used inside a RequesterProvider')
  return value
}
