import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CategoryList from '../../src/CategoryList'

describe('CategoryList', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows an error state when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('', { status: 500 }))),
    )
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<CategoryList />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.textContent).toMatch(/unable to load/i)

    act(() => root.unmount())
    container.remove()
  })
})
