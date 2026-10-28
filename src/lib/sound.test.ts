import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SOUND_CUES,
  playOpeningSound,
  playSound,
  resetSoundsForTests,
  soundPath,
  soundUrl,
  stopSounds,
} from '@/lib/sound'

/** Records what each cue asked the browser to play. */
function trackPlayback() {
  const played: string[] = []
  const paused: string[] = []
  const play = vi
    .spyOn(HTMLMediaElement.prototype, 'play')
    .mockImplementation(function play(this: HTMLMediaElement) {
      played.push(this.src)
      return Promise.resolve()
    })
  const pause = vi
    .spyOn(HTMLMediaElement.prototype, 'pause')
    .mockImplementation(function pause(this: HTMLMediaElement) {
      paused.push(this.src)
    })
  return { played, paused, play, pause }
}

beforeEach(() => {
  resetSoundsForTests()
})

afterEach(() => {
  resetSoundsForTests()
  vi.restoreAllMocks()
})

describe('sound cue files', () => {
  it('points every cue at the uploaded file, spaces URL-encoded', () => {
    expect(soundPath('opening')).toBe('sounds/vembanattu%20kayal.mp3')
    expect(soundPath('newGame')).toBe('sounds/ethra%20kunnakale.mp3')
    expect(soundPath('beginRound')).toBe('sounds/phone%20vilich%20paranjind.mp3')
    expect(soundPath('elimination')).toBe('sounds/thankan%20njanada.mp3')

    for (const cue of SOUND_CUES) {
      const path = soundPath(cue)
      expect(path).not.toContain(' ')
      expect(path.endsWith('.mp3')).toBe(true)
      // The encoded path resolves to the real file name on disk.
      expect(decodeURIComponent(path.split('/')[1])).toMatch(/^[a-z0-9 ]+\.mp3$/)
    }
  })

  it('resolves relative to whatever path the app is served from', () => {
    for (const cue of SOUND_CUES) {
      const url = soundUrl(cue)
      expect(url.startsWith('http')).toBe(true)
      expect(url.endsWith(soundPath(cue))).toBe(true)
    }
  })
})

describe('playSound', () => {
  it('plays a cue exactly once', async () => {
    const { played } = trackPlayback()
    await expect(playSound('beginRound')).resolves.toBe(true)
    expect(played).toHaveLength(1)
    expect(played[0]).toContain('phone%20vilich%20paranjind.mp3')
  })

  it('ignores a duplicate trigger while the cue is still playing', async () => {
    // paused stays false on the mock element, so the cue reads as in-flight.
    const { played } = trackPlayback()
    await playSound('newGame')
    await playSound('newGame')
    await playSound('newGame')
    expect(played).toHaveLength(1)
  })

  it('stops the previous cue so two sounds never overlap', async () => {
    const { played, paused } = trackPlayback()
    await playSound('newGame')
    await playSound('beginRound')

    expect(paused).toHaveLength(1)
    expect(paused[0]).toContain('ethra%20kunnakale.mp3')
    expect(played[1]).toContain('phone%20vilich%20paranjind.mp3')
  })

  it('swallows a missing or undecodable file and never retries it', async () => {
    let calls = 0
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => {
      calls += 1
      const error = new Error('no supported source') as Error & { name: string }
      error.name = 'NotSupportedError'
      return Promise.reject(error)
    })

    await expect(playSound('opening')).resolves.toBe(false)
    await expect(playSound('opening')).resolves.toBe(false)
    expect(calls).toBe(1)
  })

  it('treats a blocked autoplay as retryable, not as a broken file', async () => {
    let calls = 0
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => {
      calls += 1
      const error = new Error('blocked') as Error & { name: string }
      error.name = 'NotAllowedError'
      return Promise.reject(error)
    })

    await expect(playSound('newGame')).resolves.toBe(false)
    play.mockImplementation(function play(this: HTMLMediaElement) {
      calls += 1
      return Promise.resolve()
    })
    await expect(playSound('newGame')).resolves.toBe(true)
    expect(calls).toBe(2)
  })

  it('survives a synchronous throw from the media stack', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => {
      throw new Error('no audio device')
    })
    await expect(playSound('elimination')).resolves.toBe(false)
  })

  it('survives a browser without an audio constructor', async () => {
    const original = window.Audio
    // @ts-expect-error deliberately breaking the constructor for the test
    delete window.Audio
    await expect(playSound('newGame')).resolves.toBe(false)
    window.Audio = original
  })
})

describe('playOpeningSound', () => {
  it('plays once on open and never again', async () => {
    const { played } = trackPlayback()
    playOpeningSound()
    await Promise.resolve()
    await Promise.resolve()

    expect(played).toHaveLength(1)
    expect(played[0]).toContain('vembanattu%20kayal.mp3')

    playOpeningSound()
    await Promise.resolve()
    expect(played).toHaveLength(1)
  })

  it('retries after the browser blocks autoplay, on the first gesture', async () => {
    let calls = 0
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => {
      calls += 1
      if (calls === 1) {
        const error = new Error('blocked') as Error & { name: string }
        error.name = 'NotAllowedError'
        return Promise.reject(error)
      }
      return Promise.resolve()
    })

    playOpeningSound()
    await Promise.resolve()
    await Promise.resolve()
    expect(calls).toBe(1)

    // Nothing happened until the user touched the page…
    expect(play).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new Event('pointerdown'))
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(calls).toBe(2)

    // …and one gesture is enough: it never plays a second time.
    window.dispatchEvent(new Event('keydown'))
    window.dispatchEvent(new Event('pointerdown'))
    await Promise.resolve()
    expect(calls).toBe(2)
  })

  it('starts once even when a single tap fires several unlock events', async () => {
    let calls = 0
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => {
      calls += 1
      if (calls === 1) {
        const error = new Error('blocked') as Error & { name: string }
        error.name = 'NotAllowedError'
        return Promise.reject(error)
      }
      return Promise.resolve()
    })

    playOpeningSound()
    await Promise.resolve()
    await Promise.resolve()

    // One tap: pointerdown, then click.
    window.dispatchEvent(new Event('pointerdown'))
    window.dispatchEvent(new Event('click'))
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(calls).toBe(2)
  })

  it('stops listening when the file is missing', async () => {
    let calls = 0
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => {
      calls += 1
      const error = new Error('gone') as Error & { name: string }
      error.name = 'NotSupportedError'
      return Promise.reject(error)
    })

    playOpeningSound()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    window.dispatchEvent(new Event('pointerdown'))
    await Promise.resolve()
    await Promise.resolve()
    expect(calls).toBe(1)
  })
})

describe('stopSounds', () => {
  it('stops the cue on the channel', async () => {
    const { paused } = trackPlayback()
    await playSound('elimination')
    stopSounds()
    expect(paused).toHaveLength(1)
  })
})
