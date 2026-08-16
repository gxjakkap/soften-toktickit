import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CategoryList from '../../src/CategoryList'

describe('CategoryList', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows a loading state before the request resolves', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<CategoryList />)
    })

    expect(container.textContent).toMatch(/loading/i)

    act(() => root.unmount())
    container.remove()
  })
})
