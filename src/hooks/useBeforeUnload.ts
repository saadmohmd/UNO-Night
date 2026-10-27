import { useEffect } from 'react'

/**
 * Standard beforeunload guard. The app calls it only while a game is active *and*
 * saving to this device is failing — otherwise the saved copy makes the prompt
 * meaningless. Browsers decide whether to show it, and it cannot recover anything.
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
