import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useBeforeUnload } from './useBeforeUnload'

function Harness({ enabled }: { enabled: boolean }) {
  useBeforeUnload(enabled)
  return null
}

function fireBeforeUnload() {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event
}

describe('useBeforeUnload', () => {
  it('warns while a game is active', () => {
    const { unmount } = render(<Harness enabled />)
    expect(fireBeforeUnload().defaultPrevented).toBe(true)
    unmount()
  })

  it('does not warn without an active game', () => {
    render(<Harness enabled={false} />)
    expect(fireBeforeUnload().defaultPrevented).toBe(false)
  })

  it('removes the listener when the game ends', () => {
    const { rerender } = render(<Harness enabled />)
    rerender(<Harness enabled={false} />)
    expect(fireBeforeUnload().defaultPrevented).toBe(false)
  })
})
