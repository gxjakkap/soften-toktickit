import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../src/App'

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows system status online and categories after a successful check', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url === '/api/health'
          ? Promise.resolve(
              new Response(JSON.stringify({ status: 'ok', service: 'TokTickIT API' }), {
                status: 200,
              }),
            )
          : Promise.resolve(
              new Response(JSON.stringify([{ id: 1, name: 'Hardware', createdAt: '2026-01-01T00:00:00.000Z' }]), {
                status: 200,
              }),
            ),
      ),
    )
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(<App />)
    })

    await act(async () => {
      container.querySelector('button')!.click()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.textContent).toContain('System Status: Online')
    expect(container.textContent).toContain('Supported Request Categories')
    expect(container.textContent).toContain('Hardware')

    act(() => root.unmount())
    container.remove()
  })
})
