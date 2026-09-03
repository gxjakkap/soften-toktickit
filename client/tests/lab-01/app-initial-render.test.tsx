import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import SystemCheck from '../../src/SystemCheck'

describe('SystemCheck', () => {
  it('renders the check system button with no status shown yet', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(<SystemCheck />)
    })

    expect(container.querySelector('h1')).not.toBeNull()
    expect(container.querySelector('button')).not.toBeNull()
    expect(container.textContent).not.toContain('System Status')

    act(() => root.unmount())
    container.remove()
  })
})
