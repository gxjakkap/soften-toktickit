import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders without crashing', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(<App />)
    })

    expect(container.querySelector('h1')).not.toBeNull()

    act(() => root.unmount())
    container.remove()
  })
})
