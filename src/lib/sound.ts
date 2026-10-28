/**
 * The app's four sound cues.
 *
 * Everything here is best-effort: a missing file, blocked autoplay or a dead
 * audio device must never affect the game. Each cue plays on a single shared
 * channel, so two sounds can never overlap, and a cue that is already playing is
 * not restarted by a duplicate trigger.
 *
 * The files live in `public/sounds/` and keep their original names — the spaces
 * are URL-encoded below so the browser requests exactly the uploaded files.
 */

export type SoundCue = 'opening' | 'newGame' | 'beginRound' | 'elimination'

/** URLs relative to the deployed page, so sub-path hosting keeps working. */
const SOURCES: Record<SoundCue, string> = {
  opening: 'sounds/vembanattu%20kayal.mp3',
  newGame: 'sounds/ethra%20kunnakale.mp3',
  beginRound: 'sounds/phone%20vilich%20paranjind.mp3',
  elimination: 'sounds/thankan%20njanada.mp3',
}

/** Volume per cue: the opening is background colour, the results cues carry. */
const VOLUMES: Record<SoundCue, number> = {
  opening: 0.55,
  newGame: 0.7,
  beginRound: 0.7,
  elimination: 0.8,
}

export const SOUND_CUES = Object.keys(SOURCES) as SoundCue[]

type Attempt = 'playing' | 'blocked' | 'failed'

const audioSupport = () => typeof window !== 'undefined' && typeof window.Audio === 'function'

/** Absolute URL for a cue, resolved against whatever path the app is served from. */
export function soundUrl(cue: SoundCue): string {
  const base = import.meta.env?.BASE_URL ?? './'
  const relative = `${base.replace(/\/?$/, '/')}${SOURCES[cue]}`
  if (typeof document === 'undefined') return relative
  try {
    return new URL(relative, document.baseURI).href
  } catch {
    return relative
  }
}

/** The path the browser actually requests, for diagnostics and tests. */
export function soundPath(cue: SoundCue): string {
  return SOURCES[cue]
}

const elements = new Map<SoundCue, HTMLAudioElement>()
/** Cues whose file could not be fetched or decoded: never retried, never fatal. */
const unavailable = new Set<SoundCue>()
/** The one element allowed to make noise right now. */
let channel: HTMLAudioElement | null = null
/** The cue actually sounding, so a duplicate trigger cannot restart it. */
let activeCue: SoundCue | null = null
/** Opening sound bookkeeping: it may only ever start once. */
let openingStarted = false
let openingArmed = false
/** One unlock attempt at a time: a tap fires pointerdown and click together. */
let openingAttempting = false
let unlockCleanup: (() => void) | null = null

function clearChannel(audio: HTMLAudioElement) {
  if (channel !== audio) return
  channel = null
  activeCue = null
}

function release(cue: SoundCue, audio: HTMLAudioElement) {
  unavailable.add(cue)
  elements.delete(cue)
  clearChannel(audio)
}

function elementFor(cue: SoundCue): HTMLAudioElement | null {
  if (!audioSupport() || unavailable.has(cue)) return null

  const existing = elements.get(cue)
  if (existing) return existing

  try {
    const audio = new Audio()
    audio.preload = 'auto'
    audio.volume = VOLUMES[cue]
    // A file that cannot load is remembered as broken and quietly skipped from
    // then on: no retry storms, no console noise, no broken UI.
    audio.addEventListener('error', () => release(cue, audio))
    audio.addEventListener('ended', () => clearChannel(audio))
    audio.src = soundUrl(cue)
    elements.set(cue, audio)
    return audio
  } catch {
    unavailable.add(cue)
    return null
  }
}

/**
 * Starts an element and reports *why* it did not play: a blocked autoplay is
 * recoverable on the next gesture, a decode/network failure is not.
 */
function attemptPlay(audio: HTMLAudioElement): Promise<Attempt> {
  try {
    const result = audio.play() as Promise<void> | undefined
    if (result && typeof result.then === 'function') {
      return result.then(
        () => 'playing' as Attempt,
        (error: unknown) => {
          const name = (error as { name?: string } | null)?.name
          // Browsers refuse to start audio before the first user gesture.
          return name === 'NotAllowedError' ? ('blocked' as Attempt) : ('failed' as Attempt)
        },
      )
    }
    // jsdom and very old browsers return nothing from play().
    return Promise.resolve('playing')
  } catch {
    return Promise.resolve('failed')
  }
}

function stop(audio: HTMLAudioElement | null) {
  if (!audio) return
  try {
    audio.pause()
    audio.currentTime = 0
  } catch {
    // A media element that cannot seek is not worth reporting.
  }
}

/** Silences whatever is playing and forgets it. */
function stopChannel() {
  if (!channel) return
  stop(channel)
  channel = null
  activeCue = null
}

/**
 * Plays a cue on the shared channel.
 *
 * - a cue already playing is left alone, so a double click cannot stutter it
 * - starting a cue stops whatever was playing, so sounds never overlap
 * - resolves to whether audio actually started
 */
export async function playSound(cue: SoundCue): Promise<boolean> {
  const audio = elementFor(cue)
  if (!audio) return false

  // Duplicate trigger while the same cue is still sounding.
  if (activeCue === cue) return true

  stopChannel()

  channel = audio
  try {
    audio.currentTime = 0
  } catch {
    // Ignore: some browsers refuse to seek before metadata is known.
  }

  const result = await attemptPlay(audio)
  if (result === 'failed') {
    release(cue, audio)
    return false
  }
  if (result === 'blocked') {
    clearChannel(audio)
    return false
  }
  activeCue = cue
  return true
}

/**
 * The opening sound, once per app open.
 *
 * Browsers block audio until the document has been interacted with, so a blocked
 * attempt is retried on the first tap, key press or touch — and then forgotten.
 */
export function playOpeningSound(): void {
  if (openingStarted || openingArmed || !audioSupport()) return
  openingArmed = true

  const cleanup = () => {
    unlockCleanup?.()
    unlockCleanup = null
  }

  const attempt = () => {
    if (openingStarted) {
      cleanup()
      return
    }
    if (openingAttempting) return
    const audio = elementFor('opening')
    if (!audio) {
      cleanup()
      return
    }
    openingAttempting = true
    void attemptPlay(audio).then((result) => {
      openingAttempting = false
      if (result === 'playing') {
        openingStarted = true
        activeCue = 'opening'
        channel = audio
        cleanup()
      } else if (result === 'failed') {
        // Missing or undecodable: stop listening instead of retrying forever.
        release('opening', audio)
        cleanup()
      }
    })
  }

  // First try straight away; most browsers refuse this without a gesture.
  attempt()
  if (openingStarted) return

  if (typeof window === 'undefined') return

  // pointerdown/keydown cover mouse, pen and keyboard; 'click' also covers
  // synthetic activation from assistive tech and older browsers.
  const events = ['pointerdown', 'keydown', 'touchstart', 'click'] as const
  const unlock = () => attempt()
  events.forEach((event) => window.addEventListener(event, unlock, { passive: true }))
  unlockCleanup = () => {
    events.forEach((event) => window.removeEventListener(event, unlock))
  }
  // Nobody interacted: stop listening rather than hold the page hostage.
  window.setTimeout(cleanup, 30_000)
}

/** Stops everything currently playing. */
export function stopSounds(): void {
  stopChannel()
}

/** Test seam: forget every element, flag and listener. */
export function resetSoundsForTests(): void {
  unlockCleanup?.()
  unlockCleanup = null
  elements.forEach((audio) => stop(audio))
  elements.clear()
  unavailable.clear()
  channel = null
  activeCue = null
  openingStarted = false
  openingArmed = false
  openingAttempting = false
}
