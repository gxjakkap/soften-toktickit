import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CategoryList from '../../src/CategoryList'

describe('CategoryList', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders categories once the request resolves', async () => {
    const categories = [
      { id: 1, name: 'Hardware', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 2, name: 'Software', createdAt: '2026-01-01T00:00:00.000Z' },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(categories), { status: 200 }))),
    )
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<CategoryList />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.textContent).toContain('Hardware')
    expect(container.textContent).toContain('Software')

    act(() => root.unmount())
    container.remove()
  })
})
