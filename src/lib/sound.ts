/**
 * The elimination music.
 *
 * One track, one element, one shared channel: the app never plays anything else,
 * and the same track is never restarted on top of itself. Everything here is
 * best-effort — a missing file, blocked autoplay or a dead audio device must
 * never affect the game, so every failure is swallowed.
 *
 * The file lives in `public/sounds/` with its original name; the spaces are
 * URL-encoded below so the browser requests exactly the uploaded file.
 */

const TRACK = 'sounds/BALOR%20Music%20-%20Big%20B%20mass%20Dialogues.mp3'

/** Loud enough to land, quiet enough to talk over at the table. */
const VOLUME = 0.7

const audioSupport = () => typeof window !== 'undefined' && typeof window.Audio === 'function'

/** Absolute URL for the track, resolved against whatever path the app is served from. */
export function eliminationTrackUrl(): string {
  const base = import.meta.env?.BASE_URL ?? './'
  const relative = `${base.replace(/\/?$/, '/')}${TRACK}`
  if (typeof document === 'undefined') return relative
  try {
    return new URL(relative, document.baseURI).href
  } catch {
    return relative
  }
}

/** The path the browser actually requests, for diagnostics and tests. */
export function eliminationTrackPath(): string {
  return TRACK
}

let element: HTMLAudioElement | null = null
/** A file that cannot be fetched or decoded is never retried. */
let unavailable = false

function audio(): HTMLAudioElement | null {
  if (!audioSupport() || unavailable) return null
  if (element) return element

  try {
    const next = new Audio()
    next.preload = 'auto'
    next.volume = VOLUME
    next.addEventListener('error', () => {
      unavailable = true
      element = null
    })
    next.src = eliminationTrackUrl()
    element = next
    return next
  } catch {
    unavailable = true
    return null
  }
}

/**
 * Plays the elimination music.
 *
 * Resolves to whether audio actually started. A blocked autoplay or a broken
 * file resolves to `false` and changes nothing else.
 */
export async function playEliminationSound(): Promise<boolean> {
  const track = audio()
  if (!track) return false

  // Never restart the track on top of itself: the effect that calls this can run
  // twice (StrictMode in development, or a re-render while it is still sounding).
  if (!track.paused && !track.ended) return true

  try {
    track.currentTime = 0
  } catch {
    // Some browsers refuse to seek before metadata is known; harmless.
  }

  try {
    const result = track.play() as Promise<void> | undefined
    if (result && typeof result.then === 'function') {
      return result.then(
        () => true,
        (error: unknown) => {
          // A browser that refuses before the first gesture can be retried
          // later; anything else means the file itself is unusable.
          if ((error as { name?: string } | null)?.name !== 'NotAllowedError') {
            unavailable = true
            element = null
          }
          return false
        },
      )
    }
    // jsdom and very old browsers return nothing from play().
    return true
  } catch {
    unavailable = true
    element = null
    return false
  }
}

/** Stops the track. Used when a game is discarded or replaced. */
export function stopEliminationSound(): void {
  if (!element) return
  try {
    element.pause()
    element.currentTime = 0
  } catch {
    // A media element that cannot seek is not worth reporting.
  }
}

/** Test seam: forget the element and the failure flag. */
export function resetSoundForTests(): void {
  stopEliminationSound()
  element = null
  unavailable = false
}
