import { createContext, useContext } from 'react'

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

export const RequesterContext = createContext<RequesterContextValue | null>(null)

export function useRequester() {
  const value = useContext(RequesterContext)
  if (!value) throw new Error('useRequester must be used inside a RequesterProvider')
  return value
}
