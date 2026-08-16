import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

function mountApp() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  return { container, root }
}

function clickCheckSystem(container: HTMLElement) {
  container.querySelector('button')!.click()
}

describe('App', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the check system button with no status shown yet', () => {
    const { container, root } = mountApp()

    act(() => {
      root.render(<App />)
    })

    expect(container.querySelector('h1')).not.toBeNull()
    expect(container.querySelector('button')).not.toBeNull()
    expect(container.textContent).not.toContain('System Status')

    act(() => root.unmount())
    container.remove()
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
    const { container, root } = mountApp()

    act(() => {
      root.render(<App />)
    })

    await act(async () => {
      clickCheckSystem(container)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.textContent).toContain('System Status: Online')
    expect(container.textContent).toContain('Supported Request Categories')
    expect(container.textContent).toContain('Hardware')

    act(() => root.unmount())
    container.remove()
  })

  it('shows system status offline when the health check fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 500 }))),
    )
    const { container, root } = mountApp()

    act(() => {
      root.render(<App />)
    })

    await act(async () => {
      clickCheckSystem(container)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.textContent).toContain('System Status: Offline')
    expect(container.textContent).toContain('Unable to connect to TokTickIT API')

    act(() => root.unmount())
    container.remove()
  })
})
