/**
 * The app's sound cues.
 *
 * Everything here is best-effort: a missing file, blocked autoplay or a dead
 * audio device must never affect the game. Each cue plays on a single shared
 * channel, so two sounds can never overlap, and a cue that is already playing is
 * not restarted by a duplicate trigger.
 *
 * The files live in `public/sounds/` and keep their original names — the spaces
 * are URL-encoded below so the browser requests exactly the uploaded files.
 *
 * Opening the app is deliberately silent: every cue fires from a tap, so nothing
 * is attempted before the table asks for it.
 */

export type SoundCue = 'newGame' | 'beginRound' | 'elimination'

/** URLs relative to the deployed page, so sub-path hosting keeps working. */
const SOURCES: Record<SoundCue, string> = {
  newGame: 'sounds/ethra%20kunnakale.mp3',
  beginRound: 'sounds/phone%20vilich%20paranjind.mp3',
  elimination: 'sounds/thankan%20njanada.mp3',
}

/** Volume per cue: the round cues sit under the knockout sting. */
const VOLUMES: Record<SoundCue, number> = {
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
 * recoverable, a decode/network failure is not.
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

/** Stops everything currently playing. */
export function stopSounds(): void {
  stopChannel()
}

/** Test seam: forget every element and flag. */
export function resetSoundsForTests(): void {
  elements.forEach((audio) => stop(audio))
  elements.clear()
  unavailable.clear()
  channel = null
  activeCue = null
}
