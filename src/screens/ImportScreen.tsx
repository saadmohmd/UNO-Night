import { useCallback, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CameraOff,
  Check,
  CircleAlert,
  ClipboardPaste,
  FileJson,
  Hash,
  Loader2,
  ScanLine,
  ShieldCheck,
  Upload,
  Users,
} from 'lucide-react'
import { Brand } from '@/components/Brand'
import { ScreenShell } from '@/components/AppHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useQrScanner } from '@/hooks/useQrScanner'
import {
  addScannedPart,
  assembleSession,
  decodeTransfer,
  emptyScanSession,
  handoverCode,
  parseQrText,
  readTransferInput,
  scanProgress,
  type ScanSession,
} from '@/game/transfer'
import type { GameState } from '@/game/types'
import { cn, formatNumber } from '@/lib/utils'

/** Reads a picked file, falling back to FileReader on older browsers. */
function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsText(file)
  })
}

interface Preview {
  game: GameState
  id: string
  createdAt: number
  payload: string
}

/**
 * Receiving side of a handover: scan/paste/upload, validate, preview, confirm.
 *
 * Nothing is written to this device until the operator confirms the preview, and
 * an existing game is only replaced after an explicit second confirmation.
 */
export function ImportScreen({
  hasLocalGame,
  localGamePhase,
  onImported,
  onCancel,
  onOpenGame,
}: {
  hasLocalGame: boolean
  localGamePhase: string
  onImported: (game: GameState) => void
  onCancel: () => void
  onOpenGame: () => void
}) {
  const [session, setSession] = useState<ScanSession>(emptyScanSession)
  const [error, setError] = useState<string | null>(null)
  const [pasted, setPasted] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [handover, setHandover] = useState<{ code: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const acceptPayload = useCallback((payload: string, id: string) => {
    const decoded = decodeTransfer(payload)
    if (!decoded.ok) {
      setError(decoded.error)
      return
    }
    setError(null)
    setPreview({ game: decoded.game, id: decoded.id || id, createdAt: decoded.createdAt, payload })
  }, [])

  /** Handles one QR code (camera or pasted); assembles multi-part sets. */
  const acceptCode = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (trimmed.length === 0) return

      // A pasted file or bare payload short-circuits the part collector.
      if (!trimmed.startsWith('U1:')) {
        const read = readTransferInput(trimmed)
        if (!read.ok) {
          setError(read.error)
          return
        }
        acceptPayload(read.payload, read.id)
        return
      }

      const scanned = parseQrText(trimmed)
      if (scanned.kind === 'invalid') {
        setError(scanned.reason)
        return
      }
      setError(null)
      setSession((current) => {
        const next = addScannedPart(current, scanned.part)
        const progress = scanProgress(next)
        if (progress.complete) {
          const assembled = assembleSession(next)
          if (!assembled.ok) {
            setError(assembled.error)
            return next
          }
          acceptPayload(assembled.payload, assembled.id)
        }
        return next
      })
    },
    [acceptPayload],
  )

  const scanner = useQrScanner(acceptCode)
  const progress = scanProgress(session)
  const scanning = scanner.state.status === 'scanning'

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      setError('That file is too large to be a UNO Night transfer.')
      return
    }
    try {
      acceptCode(await readFileText(file))
    } catch {
      setError('That file could not be read.')
    }
  }

  function confirmImport() {
    if (!preview) return
    setConfirmOpen(false)
    onImported(preview.game)
    setHandover({ code: handoverCode(preview.id) })
  }

  function reset() {
    setPreview(null)
    setSession(emptyScanSession())
    setPasted('')
    setError(null)
    scanner.stop()
  }

  const previewGame = preview?.game

  return (
    <ScreenShell
      header={
        <header className="sticky top-0 z-30 border-b border-line/60 bg-bg/92 backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
            <Brand compact />
            <Button variant="ghost" size="sm" onClick={onCancel}>
              <ArrowLeft className="size-4" /> Home
            </Button>
          </div>
        </header>
      }
    >
      <Badge variant="brand">
        <ScanLine className="size-3" /> Import game
      </Badge>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink">
        Take over a game.
      </h1>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
        Scan the codes from the other phone, or open the game file it saved. You will see the full
        table and scores before anything is imported.
      </p>

      {hasLocalGame && !preview && (
        <div className="mt-5 rounded-2xl border border-uno-yellow/30 bg-uno-yellow/[0.06] p-4">
          <p className="flex items-start gap-2 text-[12px] leading-relaxed text-ink-soft">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-uno-yellow" />
            <span>
              This phone already {localGamePhase === 'finished' ? 'has a finished game' : 'has a game in progress'}.
              Importing replaces it — you will be asked to confirm.
            </span>
          </p>
        </div>
      )}

      {!preview && (
        <>
          <section className="mt-6 rounded-2xl border border-line bg-bg-soft/60 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-faint uppercase">
                <Camera className="size-3.5" /> Camera scan
              </p>
              {scanning && (
                <Badge variant="green">
                  <Loader2 className="size-3 animate-spin" /> Scanning
                </Badge>
              )}
            </div>

            <div className="relative mt-3 overflow-hidden rounded-2xl border border-line bg-black/60">
              <video
                ref={scanner.videoRef}
                className={cn('aspect-[4/3] w-full object-cover', !scanning && 'hidden')}
                muted
                playsInline
              />
              <canvas ref={scanner.canvasRef} className="hidden" />
              {!scanning && (
                <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 px-6 text-center">
                  <CameraOff className="size-8 text-faint" />
                  <p className="text-[12px] leading-relaxed text-muted">
                    Point the camera at the transfer code on the other phone.
                  </p>
                  <Button size="sm" onClick={() => void scanner.start()}>
                    <Camera className="size-4" /> Start camera
                  </Button>
                </div>
              )}
              {scanning && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="size-40 rounded-2xl border-2 border-brand/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                </div>
              )}
            </div>

            {scanning && (
              <Button variant="outline" size="sm" className="mt-3 w-full" onClick={scanner.stop}>
                Stop camera
              </Button>
            )}

            {scanner.state.error && (
              <p className="mt-3 text-[11px] leading-relaxed text-uno-yellow" role="alert">
                {scanner.state.error}
              </p>
            )}

            {progress.total !== null && (
              <div className="mt-4 rounded-xl border border-line bg-surface/60 p-3">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold tracking-wide text-faint uppercase">
                    Multi-part transfer
                  </span>
                  <span className="tabular-nums text-ink-soft">
                    {progress.scanned} of {progress.total} parts
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Array.from({ length: progress.total }, (_, index) => {
                    const partNumber = index + 1
                    const done = !progress.missing.includes(partNumber)
                    return (
                      <span
                        key={partNumber}
                        className={cn(
                          'inline-flex size-7 items-center justify-center rounded-lg border text-[11px] font-semibold tabular-nums',
                          done
                            ? 'border-uno-green/40 bg-uno-green/12 text-uno-green'
                            : 'border-line bg-surface-2 text-faint',
                        )}
                        aria-label={done ? `Part ${partNumber} scanned` : `Part ${partNumber} missing`}
                      >
                        {done ? <Check className="size-3.5" /> : partNumber}
                      </span>
                    )
                  })}
                </div>
                {progress.missing.length > 0 && (
                  <p className="mt-2 text-[11px] leading-relaxed text-muted">
                    Still missing part{progress.missing.length === 1 ? '' : 's'}{' '}
                    {progress.missing.join(', ')}. Keep scanning until every part is ticked.
                  </p>
                )}
                {progress.duplicates.length > 0 && (
                  <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
                    Ignored a repeated part {progress.duplicates.join(', ')}.
                  </p>
                )}
                {progress.problems.map((problem) => (
                  <p key={problem} className="mt-1.5 text-[11px] leading-relaxed text-uno-red">
                    {problem}
                  </p>
                ))}
              </div>
            )}
          </section>

          <section className="mt-4 rounded-2xl border border-line bg-surface/40 p-4 sm:p-5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-faint uppercase">
              <ClipboardPaste className="size-3.5" /> No camera? Paste or upload
            </p>
            <Label htmlFor="transfer-paste" className="sr-only">
              Paste a transfer code or file contents
            </Label>
            <Textarea
              id="transfer-paste"
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              placeholder="Paste a U1:… code, the exported JSON file, or the payload text"
              rows={3}
              className="mt-3 font-mono text-[11px]"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => {
                  acceptCode(pasted)
                  setPasted('')
                }}
                disabled={pasted.trim().length === 0}
              >
                <ArrowRight className="size-4" /> Use this data
              </Button>
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="size-4" /> Open game file
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json,text/plain"
                className="hidden"
                aria-label="Game file"
                onChange={(event) => {
                  void handleFile(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-faint">
              <FileJson className="mt-0.5 size-3.5 shrink-0" />
              A multi-part transfer can also be pasted one code at a time — they stack up here.
            </p>
          </section>
        </>
      )}

      {error && (
        <div
          className="mt-4 rounded-2xl border border-uno-red/30 bg-uno-red/[0.06] p-4"
          role="alert"
        >
          <p className="flex items-start gap-2 text-[12px] leading-relaxed text-ink-soft">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-uno-red" />
            <span>{error}</span>
          </p>
        </div>
      )}

      {previewGame && (
        <section className="mt-6 rounded-2xl border border-brand/30 bg-brand/[0.05] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-brand uppercase">
              <ShieldCheck className="size-3.5" /> Verified transfer
            </p>
            <Badge variant="outline">
              {previewGame.rounds.length} round{previewGame.rounds.length === 1 ? '' : 's'}
            </Badge>
          </div>

          <h2 className="mt-3 font-display text-xl font-semibold text-ink">
            {previewGame.config?.name || 'Untitled game'}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5" /> {previewGame.players.length} players
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <Hash className="size-3.5" /> cutoff {formatNumber(previewGame.config?.cutoff ?? 0)}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {previewGame.phase === 'finished'
                ? 'Finished game'
                : previewGame.currentRound
                  ? `Round ${previewGame.currentRound.roundNumber} in progress`
                  : 'Waiting for the next round'}
            </span>
          </div>

          <ul className="mt-4 space-y-1.5">
            {previewGame.players
              .slice()
              .sort((a, b) => a.cumulativeScore - b.cumulativeScore)
              .map((player) => (
                <li
                  key={player.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-surface/60 px-3 py-2"
                >
                  <span className="flex items-center gap-2 text-sm">
                    <span className={cn('text-ink', player.eliminated && 'text-muted line-through')}>
                      {player.name}
                    </span>
                    {player.eliminated && (
                      <span className="text-[10px] tracking-wide text-uno-red uppercase">out</span>
                    )}
                  </span>
                  <span className="text-sm tabular-nums text-ink-soft">
                    {formatNumber(player.cumulativeScore)} pts
                  </span>
                </li>
              ))}
          </ul>

          <p className="mt-4 text-[11px] leading-relaxed text-muted">
            The receiving phone becomes the controller. The old phone keeps a read-only copy until
            someone confirms the handover code there.
          </p>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={reset} className="sm:flex-1">
              Scan again
            </Button>
            <Button onClick={() => setConfirmOpen(true)} className="sm:flex-1">
              {hasLocalGame ? 'Replace and take over' : 'Import this game'} <ArrowRight className="size-4" />
            </Button>
          </div>
        </section>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{hasLocalGame ? 'Replace the game here?' : 'Import this game?'}</DialogTitle>
            <DialogDescription>
              {hasLocalGame
                ? 'The game currently on this phone — including its saved copy — will be deleted and replaced by the transferred one. This cannot be undone.'
                : 'This phone will take over as the controller and continue from the transferred state.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-5">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant={hasLocalGame ? 'danger' : 'primary'} onClick={confirmImport}>
              {hasLocalGame ? 'Replace and import' : 'Confirm import'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={handover !== null} onOpenChange={() => undefined}>
        <DialogContent showClose={false}>
          <DialogHeader>
            <DialogTitle>Handover code</DialogTitle>
            <DialogDescription>
              Read this code to the old phone and enter it there to make that copy read-only. It is
              the only way the two offline phones can agree the handover is finished.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 rounded-2xl border border-brand/30 bg-brand/[0.08] px-4 py-5 text-center">
            <p className="font-display text-4xl font-semibold tracking-[0.35em] text-brand">
              {handover?.code}
            </p>
          </div>

          <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-muted">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-uno-green" />
            The game is now on this phone. If the old phone cannot be marked, it stays editable — it
            will simply be out of date, and nothing syncs back.
          </p>

          <DialogFooter className="mt-5">
            <Button onClick={onOpenGame}>
              Open the game <ArrowRight className="size-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScreenShell>
  )
}
