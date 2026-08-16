import { useState } from 'react'
import CategoryList from './CategoryList'

type CheckState = 'idle' | 'checking' | 'online' | 'offline'

function App() {
  const [state, setState] = useState<CheckState>('idle')

  const checkSystem = () => {
    setState('checking')
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`Backend responded with ${res.status}`)
        return res.json()
      })
      .then(() => setState('online'))
      .catch(() => setState('offline'))
  }

  return (
    <div className="container py-5 text-center">
      <h1>TokTickIT IT Service Desk</h1>

      <button
        type="button"
        className="btn btn-primary my-3"
        onClick={checkSystem}
        disabled={state === 'checking'}
      >
        Check System
      </button>

      {state === 'online' && (
        <>
          <p className="lead text-success">System Status: Online</p>
          <h2 className="h5">Supported Request Categories</h2>
          <CategoryList />
        </>
      )}

      {state === 'offline' && (
        <>
          <p className="lead text-danger mb-0">System Status: Offline</p>
          <p className="text-danger">Unable to connect to TokTickIT API</p>
        </>
      )}
    </div>
  )
}

export default App
