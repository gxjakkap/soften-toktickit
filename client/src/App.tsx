import { useState } from 'react'

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <nav className="navbar navbar-dark bg-dark">
        <div className="container">
          <span className="navbar-brand mb-0 h1">Soften Toktickit</span>
        </div>
      </nav>

      <div className="container py-5 text-center">
        <h1>Get started</h1>
        <p className="lead">
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          onClick={() => setCount((count) => count + 1)}
        >
          Count is {count}
        </button>

        <div className="row mt-5 text-start">
          <div className="col-md-6 mb-4">
            <div className="card h-100">
              <div className="card-body">
                <h2 className="card-title h4">Documentation</h2>
                <p className="card-text">Your questions, answered</p>
                <a
                  className="card-link"
                  href="https://vite.dev/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Explore Vite
                </a>
                <a
                  className="card-link"
                  href="https://react.dev/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Learn more
                </a>
              </div>
            </div>
          </div>
          <div className="col-md-6 mb-4">
            <div className="card h-100">
              <div className="card-body">
                <h2 className="card-title h4">Connect with us</h2>
                <p className="card-text">Join the Vite community</p>
                <a
                  className="card-link"
                  href="https://github.com/vitejs/vite"
                  target="_blank"
                  rel="noreferrer"
                >
                  GitHub
                </a>
                <a
                  className="card-link"
                  href="https://chat.vite.dev/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Discord
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default App
