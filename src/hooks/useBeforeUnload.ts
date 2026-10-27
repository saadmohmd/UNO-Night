import { useEffect } from 'react'

/**
 * Uses the standard beforeunload mechanism while a game is active.
 * Browsers decide whether to show the prompt; this cannot recover a lost session.
 */
export function useBeforeUnload(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // Legacy browsers require a truthy returnValue.
      event.returnValue = ''
      return ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [enabled])
}
