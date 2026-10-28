import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  eliminationTrackPath,
  eliminationTrackUrl,
  playEliminationSound,
  resetSoundForTests,
  stopEliminationSound,
} from '@/lib/sound'

beforeEach(() => {
  resetSoundForTests()
})

afterEach(() => {
  resetSoundForTests()
  vi.restoreAllMocks()
})

describe('the elimination track', () => {
  it('points at the uploaded file with the spaces URL-encoded', () => {
    const path = eliminationTrackPath()
    expect(path).toBe('sounds/BALOR%20Music%20-%20Big%20B%20mass%20Dialogues.mp3')
    expect(path).not.toContain(' ')
    // The encoded path resolves to the real file name on disk.
    expect(decodeURIComponent(path.split('/')[1])).toBe(
      'BALOR Music - Big B mass Dialogues.mp3',
    )
  })

  it('resolves against whatever path the app is served from', () => {
    const url = eliminationTrackUrl()
    expect(url.startsWith('http')).toBe(true)
    expect(url.endsWith(eliminationTrackPath())).toBe(true)
  })
})

describe('playEliminationSound', () => {
  it('plays the track', async () => {
    const played: string[] = []
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function play(
      this: HTMLMediaElement,
    ) {
      played.push(this.src)
      return Promise.resolve()
    })

    await expect(playEliminationSound()).resolves.toBe(true)
    expect(played).toHaveLength(1)
    expect(decodeURIComponent(played[0])).toContain('BALOR Music - Big B mass Dialogues.mp3')
  })

  it('does not restart a track that is already sounding', async () => {
    // jsdom has no playback engine, so the flags the module reads are driven
    // directly: "playing" until it is paused.
    const originalPaused = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'paused')
    const originalEnded = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'ended')
    let playing = false
    Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
      configurable: true,
      get: () => !playing,
    })
    Object.defineProperty(HTMLMediaElement.prototype, 'ended', {
      configurable: true,
      get: () => false,
    })

    let calls = 0
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => {
      calls += 1
      playing = true
      return Promise.resolve()
    })
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {
      playing = false
    })

    await playEliminationSound()
    await playEliminationSound()
    await playEliminationSound()
    expect(calls).toBe(1)

    // Once it has finished, a later knockout plays it again.
    playing = false
    await playEliminationSound()
    expect(calls).toBe(2)

    // Put jsdom's own descriptors back so later tests are unaffected.
    if (originalPaused) Object.defineProperty(HTMLMediaElement.prototype, 'paused', originalPaused)
    if (originalEnded) Object.defineProperty(HTMLMediaElement.prototype, 'ended', originalEnded)
  })

  it('swallows a blocked autoplay without breaking anything', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => {
      const error = new Error('blocked') as Error & { name: string }
      error.name = 'NotAllowedError'
      return Promise.reject(error)
    })
    await expect(playEliminationSound()).resolves.toBe(false)
  })

  it('retires a broken or missing file after one attempt', async () => {
    let calls = 0
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => {
      calls += 1
      const error = new Error('404') as Error & { name: string }
      error.name = 'NotSupportedError'
      return Promise.reject(error)
    })

    await expect(playEliminationSound()).resolves.toBe(false)
    // A rejected play is retried once more, then the element is dropped for good.
    await playEliminationSound()
    await playEliminationSound()
    expect(calls).toBeLessThanOrEqual(2)
  })

  it('survives a synchronous throw from the media stack', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => {
      throw new Error('no audio device')
    })
    await expect(playEliminationSound()).resolves.toBe(false)
  })

  it('survives a browser without an audio constructor', async () => {
    const original = window.Audio
    // @ts-expect-error deliberately breaking the constructor for the test
    delete window.Audio
    await expect(playEliminationSound()).resolves.toBe(false)
    window.Audio = original
  })
})

describe('stopEliminationSound', () => {
  it('pauses whatever was started', async () => {
    const paused: string[] = []
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function pause(
      this: HTMLMediaElement,
    ) {
      paused.push(this.src)
    })

    await playEliminationSound()
    stopEliminationSound()
    expect(paused).toHaveLength(1)
    expect(decodeURIComponent(paused[0])).toContain('BALOR Music')
  })

  it('is safe when nothing is playing', () => {
    expect(() => stopEliminationSound()).not.toThrow()
  })
})
