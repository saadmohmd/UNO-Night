import { useCallback, useEffect, useRef, useState } from 'react'
import type jsQR from 'jsqr'

export type ScannerStatus = 'idle' | 'starting' | 'scanning' | 'error'

export interface ScannerState {
  status: ScannerStatus
  error: string | null
}

/**
 * Camera QR scanner built on getUserMedia + jsQR.
 *
 * Deliberately conservative: it never starts on its own, it stops every track on
 * unmount, and every failure (no camera, permission denied, unsupported browser)
 * is reported so the caller can fall back to a file or pasted code.
 */
export function useQrScanner(onResult: (text: string) => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameRef = useRef<number | null>(null)
  const lastTextRef = useRef<{ text: string; at: number } | null>(null)
  const resultRef = useRef(onResult)
  const decoderRef = useRef<typeof jsQR | null>(null)
  const [state, setState] = useState<ScannerState>({ status: 'idle', error: null })

  useEffect(() => {
    resultRef.current = onResult
  }, [onResult])

  const stop = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setState((current) => (current.status === 'error' ? current : { status: 'idle', error: null }))
  }, [])

  const tick = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const width = video.videoWidth
      const height = video.videoHeight
      if (width > 0 && height > 0) {
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (context) {
          canvas.width = width
          canvas.height = height
          context.drawImage(video, 0, 0, width, height)
          const image = context.getImageData(0, 0, width, height)
          const decode = decoderRef.current
          const found = decode?.(image.data, width, height, { inversionAttempts: 'dontInvert' })
          if (found?.data) {
            const now = Date.now()
            const last = lastTextRef.current
            // The same code stays in frame for many frames; report it once.
            if (!last || last.text !== found.data || now - last.at > 2500) {
              lastTextRef.current = { text: found.data, at: now }
              resultRef.current(found.data)
            }
          }
        }
      }
    }
    frameRef.current = window.requestAnimationFrame(tick)
  }, [])

  const start = useCallback(async () => {
    if (streamRef.current) return
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setState({
        status: 'error',
        error: 'This browser cannot open the camera. Use the game file or a pasted code below.',
      })
      return
    }

    setState({ status: 'starting', error: null })
    try {
      // The decoder is only fetched when the camera is actually used.
      if (!decoderRef.current) {
        const module = await import('jsqr')
        decoderRef.current = module.default as typeof jsQR
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) {
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        return
      }
      video.srcObject = stream
      video.setAttribute('playsinline', 'true')
      await video.play()
      setState({ status: 'scanning', error: null })
      frameRef.current = window.requestAnimationFrame(tick)
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      const name = error instanceof Error ? error.name : ''
      const message =
        name === 'NotAllowedError'
          ? 'Camera permission was refused. Allow it in the browser, or use the game file below.'
          : name === 'NotFoundError'
            ? 'No camera was found on this device. Use the game file below.'
            : 'The camera could not be started. Use the game file below.'
      setState({ status: 'error', error: message })
    }
  }, [tick])

  useEffect(() => stop, [stop])

  return { videoRef, canvasRef, state, start, stop }
}
