import { useMemo, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  FileJson,
  Lock,
  QrCode as QrIcon,
  ScanLine,
  ShieldAlert,
  Smartphone,
  Unlock,
} from 'lucide-react'
import { GameHeader } from '@/components/game/GameHeader'
import { ScreenShell } from '@/components/AppHeader'
import { QrCode } from '@/components/transfer/QrCode'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  buildTransferDocument,
  encodeTransfer,
  handoverCode,
  normalizeHandoverCode,
  planTransfer,
  transferFileName,
} from '@/game/transfer'
import type { GameState } from '@/game/types'
import { cn, formatNumber } from '@/lib/utils'

/**
 * Sender side of a QR handover.
 *
 * The old phone stays editable until the table confirms the takeover with the
 * code shown on the receiving phone — the two devices cannot talk to each other,
 * so the confirmation is deliberately manual.
 */
export function TransferScreen({
  game,
  onDashboard,
  onLeaderboard,
  onEndGame,
  onReset,
  onBack,
  onMarkTransferred,
  onImport,
}: {
  game: GameState
  onDashboard: () => void
  onLeaderboard: () => void
  onEndGame: () => void
  onReset: () => void
  onBack: () => void
  onMarkTransferred: () => void
  onImport?: () => void
}) {
  const [partIndex, setPartIndex] = useState(0)
  const [handoverOpen, setHandoverOpen] = useState(false)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [skipVerification, setSkipVerification] = useState(false)
  const [downloaded, setDownloaded] = useState(false)

  const transfer = game.transfer
  const locked = Boolean(transfer?.lockedAt)

  const encoded = useMemo(() => (transfer ? encodeTransfer(game) : null), [game, transfer])
  const plan = useMemo(
    () => (encoded?.ok ? planTransfer(encoded.payload, encoded.id) : null),
    [encoded],
  )

  if (!game.config) return null

  const openParts = plan && plan.mode !== 'too-large' ? plan.parts : []
  const currentPart = openParts[Math.min(partIndex, Math.max(0, openParts.length - 1))]
  const multi = plan?.mode === 'multi'
  const expectedCode = transfer ? handoverCode(transfer.id) : ''

  function downloadFile() {
    if (!encoded?.ok) return
    const file = buildTransferDocument(encoded.game, encoded)
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = transferFileName(game)
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    // Give the browser a tick to start the download before revoking.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setDownloaded(true)
  }

  function submitCode() {
    const cleaned = normalizeHandoverCode(code)
    if (cleaned.length === 0) {
      setCodeError('Enter the six-character code shown on the receiving phone.')
      return
    }
    if (cleaned !== expectedCode) {
      setCodeError(
        'That code does not match this transfer. Check the receiving phone, or mark it without verification.',
      )
      return
    }
    setHandoverOpen(false)
    onMarkTransferred()
  }

  if (locked) {
    return (
      <ScreenShell
        header={
          <GameHeader
            game={game}
            onDashboard={onDashboard}
            onLeaderboard={onLeaderboard}
            onEndGame={onEndGame}
            onReset={onReset}
            onImport={onImport}
            readOnly
          />
        }
      >
        <div className="animate-rise">
          <div className="flex items-center gap-2">
            <Badge variant="yellow">
              <Lock className="size-3" /> Read-only
            </Badge>
          </div>
          <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink">
            Handover complete.
          </h1>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
            This game now belongs to the receiving phone. Scores, rounds and endings are frozen
            here so the two devices cannot drift apart.
          </p>

          <div className="mt-6 rounded-2xl border border-line bg-surface/60 p-4">
            <p className="text-[11px] font-semibold tracking-wide text-faint uppercase">
              Final state on this phone
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <dt className="text-[11px] text-faint">Rounds</dt>
                <dd className="font-display text-lg text-ink tabular-nums">{game.rounds.length}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-faint">Cutoff</dt>
                <dd className="font-display text-lg text-ink tabular-nums">
                  {formatNumber(game.config.cutoff)}
                </dd>
              </div>
            </dl>
            <ul className="mt-4 space-y-1.5">
              {game.players.map((player) => (
                <li key={player.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className={cn(player.eliminated ? 'text-muted' : 'text-ink')}>
                    {player.name}
                    {player.eliminated && (
                      <span className="ml-2 text-[10px] tracking-wide text-uno-red uppercase">out</span>
                    )}
                  </span>
                  <span className="tabular-nums text-ink-soft">{player.cumulativeScore}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-5 rounded-2xl border border-uno-blue/25 bg-uno-blue/[0.06] p-4">
            <p className="flex items-start gap-2 text-[12px] leading-relaxed text-ink-soft">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-uno-blue" />
              Keep this copy for reference or discard it. The receiving phone is now the controller —
              any score entered there will not appear here.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <Button onClick={onDashboard} className="flex-1 sm:flex-none">
              View this game <ArrowRight className="size-4" />
            </Button>
            <Button variant="outline" onClick={onReset}>
              Discard this copy
            </Button>
          </div>
        </div>
      </ScreenShell>
    )
  }

  return (
    <ScreenShell
      header={
        <GameHeader
          game={game}
          onDashboard={onDashboard}
          onLeaderboard={onLeaderboard}
          onEndGame={onEndGame}
          onReset={onReset}
          onImport={onImport}
        />
      }
    >
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="size-3.5" /> Back to the game
      </button>

      <Badge variant="brand">
        <QrIcon className="size-3" /> Transfer game
      </Badge>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink">
        Hand the table over.
      </h1>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
        The receiving phone scans this code, checks the snapshot and takes over. Nothing is sent
        over the internet and the two phones never sync — this is a one-time copy.
      </p>

      {!transfer && (
        <div className="mt-6 rounded-2xl border border-uno-yellow/30 bg-uno-yellow/[0.06] p-4">
          <p className="text-[12px] leading-relaxed text-ink-soft">
            This transfer has not been started yet. Close this screen and choose{' '}
            <strong className="text-ink">Transfer game</strong> from the game menu.
          </p>
        </div>
      )}

      {transfer && plan?.mode === 'too-large' && (
        <div className="mt-6 rounded-2xl border border-uno-yellow/30 bg-uno-yellow/[0.06] p-4">
          <p className="flex items-start gap-2 text-[12px] leading-relaxed text-ink-soft">
            <FileJson className="mt-0.5 size-4 shrink-0 text-uno-yellow" />
            <span>
              This game needs {plan.total} QR codes, which is too many to scan reliably. Nothing has
              been shortened — use the game file below and send it to the receiving phone instead.
            </span>
          </p>
        </div>
      )}

      {transfer && plan && plan.mode !== 'too-large' && (
        <div className="mt-6 rounded-2xl border border-line bg-bg-soft/60 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-faint uppercase">
              <ScanLine className="size-3.5" /> Scan this on the receiving phone
            </p>
            {multi ? (
              <Badge variant="yellow" className="tabular-nums">
                Part {partIndex + 1} of {plan.total}
              </Badge>
            ) : (
              <Badge variant="green">
                <Check className="size-3" /> Single code
              </Badge>
            )}
          </div>

          <div className="mt-4 flex justify-center">
            {currentPart && (
              <QrCode
                className="rounded-2xl bg-white p-3"
                value={currentPart}
                size={300}
                label={
                  multi
                    ? `Transfer QR code, part ${partIndex + 1} of ${plan.total}`
                    : 'Transfer QR code'
                }
              />
            )}
          </div>

          {multi && (
            <>
              <p className="mt-3 text-center text-[11px] leading-relaxed text-muted">
                Scan every part — the receiving phone tracks which ones are done. Order does not
                matter.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPartIndex((index) => Math.max(0, index - 1))}
                  disabled={partIndex === 0}
                  aria-label="Previous part"
                >
                  <ArrowLeft className="size-4" />
                </Button>
                <div className="flex flex-1 flex-wrap justify-center gap-1.5">
                  {openParts.map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setPartIndex(index)}
                      aria-label={`Show part ${index + 1}`}
                      aria-current={index === partIndex ? 'true' : undefined}
                      className={cn(
                        'size-2.5 rounded-full transition-colors',
                        index === partIndex ? 'bg-brand' : 'bg-surface-3 hover:bg-muted',
                      )}
                    />
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPartIndex((index) => Math.min(openParts.length - 1, index + 1))}
                  disabled={partIndex >= openParts.length - 1}
                  aria-label="Next part"
                >
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {transfer && (
        <div className="mt-4 rounded-2xl border border-line bg-surface/50 p-4">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-faint uppercase">
            <Smartphone className="size-3.5" /> On the receiving phone
          </p>
          <ol className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-muted">
            <li>1. Open UNO Night and choose “Import game”.</li>
            <li>2. Scan {multi ? 'every part' : 'the code'} with the camera, or open the game file.</li>
            <li>3. Check the preview and confirm the import.</li>
            <li>4. Read the handover code it shows back to this phone.</li>
          </ol>
        </div>
      )}

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Button variant="secondary" onClick={downloadFile} disabled={!encoded?.ok} className="sm:flex-1">
          <Download className="size-4" /> {downloaded ? 'Game file saved' : 'Save game file'}
        </Button>
        <Button onClick={() => setHandoverOpen(true)} disabled={!transfer} className="sm:flex-1">
          <Lock className="size-4" /> Mark as transferred
        </Button>
      </div>

      <div className="mt-4 rounded-2xl border border-line/70 bg-bg-soft/50 p-4">
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-faint">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-uno-yellow" />
          <span>
            This phone stays editable until you confirm the handover code. Only then does it lock and
            become read-only. Two offline phones cannot confirm each other automatically, so that
            last step is done by hand.
          </span>
        </p>
      </div>

      <Dialog
        open={handoverOpen}
        onOpenChange={(open) => {
          setHandoverOpen(open)
          if (!open) {
            setCode('')
            setCodeError(null)
            setSkipVerification(false)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm the handover</DialogTitle>
            <DialogDescription>
              Enter the six-character code shown on the receiving phone. This locks the game here and
              makes this phone read-only.
            </DialogDescription>
          </DialogHeader>

          {!skipVerification ? (
            <div className="mt-4">
              <Label htmlFor="handover-code">Handover code</Label>
              <Input
                id="handover-code"
                value={code}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="ABC123"
                maxLength={10}
                onChange={(event) => {
                  setCode(event.target.value.toUpperCase())
                  setCodeError(null)
                }}
                className="mt-1.5 font-display text-lg tracking-[0.3em]"
              />
              {codeError && (
                <p className="mt-2 text-[11px] leading-relaxed text-uno-red" role="alert">
                  {codeError}
                </p>
              )}
              <button
                type="button"
                onClick={() => setSkipVerification(true)}
                className="mt-3 text-[11px] text-faint underline-offset-2 hover:text-ink hover:underline"
              >
                I don’t have the code
              </button>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-uno-red/30 bg-uno-red/[0.06] p-3">
              <p className="flex items-start gap-2 text-[11px] leading-relaxed text-ink-soft">
                <Unlock className="mt-0.5 size-3.5 shrink-0 text-uno-red" />
                <span>
                  Only mark this game as transferred if the other phone really has it. This phone will
                  be locked out of scoring immediately, and that cannot be undone.
                </span>
              </p>
            </div>
          )}

          <DialogFooter className="mt-5">
            <Button variant="outline" onClick={() => setHandoverOpen(false)}>
              Cancel
            </Button>
            {skipVerification ? (
              <Button
                variant="danger"
                onClick={() => {
                  setHandoverOpen(false)
                  onMarkTransferred()
                }}
              >
                <Lock className="size-4" /> Mark as transferred
              </Button>
            ) : (
              <Button onClick={submitCode}>
                Confirm handover
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScreenShell>
  )
}
