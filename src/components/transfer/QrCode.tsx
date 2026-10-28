import { useEffect, useState } from 'react'

/**
 * Renders one QR code as inline SVG.
 *
 * SVG (rather than canvas) keeps it crisp at any size on a phone screen, prints
 * cleanly, and still renders in tests where no canvas backend exists.
 */
export function QrCode({
  value,
  size = 260,
  label,
  className,
}: {
  value: string
  size?: number
  /** Accessible description; defaults to a generic "transfer code". */
  label?: string
  className?: string
}) {
  const [svg, setSvg] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setFailed(false)
    // The QR encoder is only needed on this screen, so it is loaded on demand.
    import('qrcode')
      .then(({ default: QRCode }) =>
        QRCode.toString(value, {
          type: 'svg',
          errorCorrectionLevel: 'L',
          margin: 1,
          width: size,
        }),
      )
      .then((markup) => {
        if (!cancelled) setSvg(markup)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [value, size])

  if (failed) {
    return (
      <div
        className="rounded-xl border border-uno-yellow/30 bg-uno-yellow/[0.06] p-4 text-[11px] leading-relaxed text-uno-yellow"
        role="alert"
      >
        This code could not be drawn on this device ({value.length.toLocaleString()} characters).
        Use the game file instead.
      </div>
    )
  }

  return (
    <div
      className={className}
      role="img"
      aria-label={label ?? 'Transfer QR code'}
      style={{ width: size, maxWidth: '100%' }}
    >
      {svg ? (
        // The markup is generated locally by the qrcode library from our payload.
        <div
          className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
          style={{ width: '100%' }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div
          className="animate-pulse rounded-xl bg-surface-2"
          style={{ aspectRatio: '1 / 1', width: '100%' }}
          aria-hidden="true"
        />
      )}
    </div>
  )
}
