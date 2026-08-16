import { useEffect, useState } from 'react'
import CategoryList from './CategoryList'

type Health = { status: string; service: string }

function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`Backend responded with ${res.status}`)
        return res.json() as Promise<Health>
      })
      .then(setHealth)
      .catch(() =>
        setError('Backend is unavailable. Please make sure the API server is running.'),
      )
  }, [])

  return (
    <div className="container py-5 text-center">
      <h1>TokTickIT</h1>
      <p className="lead">
        {error ? (
          <span className="text-danger">{error}</span>
        ) : health ? (
          <span className="text-success">
            {health.status} ({health.service})
          </span>
        ) : (
          <span className="text-muted">Checking backend...</span>
        )}
      </p>
      <CategoryList />
    </div>
  )
}

export default App
