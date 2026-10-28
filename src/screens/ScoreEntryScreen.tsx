import { useEffect, useRef, useState, type Dispatch } from 'react'
import { Check, Crown, Lock, Trash2, UserRound } from 'lucide-react'
import { GameHeader } from '@/components/game/GameHeader'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { ScreenShell, StickyActionBar } from '@/components/AppHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { validateRoundEntry } from '@/game/validation'
import { scorePreview } from '@/game/selectors'
import type { GameAction } from '@/game/reducer'
import type { GameState, PlayerRecord } from '@/game/types'
import { accentClasses, accentForIndex, cn, formatNumber } from '@/lib/utils'

/**
 * A penalty field that keeps its own text so a half-typed number never fights
 * the game state. Only digits are accepted, which makes negatives and decimals
 * impossible to enter; clearing the field returns the entry to "not entered".
 */
function PenaltyField({
  playerId,
  playerName,
  value,
  disabled,
  onChange,
}: {
  playerId: string
  playerName: string
  value: number | null
  disabled: boolean
  onChange: (penalty: number | null) => void
}) {
  const [text, setText] = useState(() => (value === null ? '' : String(value)))
  const lastValue = useRef(value)

  useEffect(() => {
    if (lastValue.current === value) return
    lastValue.current = value
    setText(value === null ? '' : String(value))
  }, [value])

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      pattern="[0-9]*"
      enterKeyHint="done"
      aria-label={`Penalty points for ${playerName}`}
      id={`penalty-${playerId}`}
      value={disabled ? '0' : text}
      disabled={disabled}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, '').slice(0, 4)
        setText(digits)
        const parsed = digits === '' ? null : Number(digits)
        lastValue.current = parsed
        onChange(parsed)
      }}
      className={cn(
        'h-14 w-28 rounded-xl border bg-surface-2/60 text-right font-display text-2xl font-semibold tabular-nums',
        'text-ink transition-colors duration-150 focus:outline-none focus:ring-2',
        'border-line hover:border-line-soft focus:border-brand/60 focus:ring-brand/15',
        'disabled:cursor-not-allowed disabled:border-uno-green/30 disabled:bg-uno-green/[0.07] disabled:text-uno-green disabled:opacity-100',
      )}
    />
  )
}

export function ScoreEntryScreen({
  game,
  dispatch,
  onDashboard,
  onLeaderboard,
  onEndGame,
  onReset,
  onDiscardRound,
  onRoundConfirmed,
  onTransfer,
  onImport,
  readOnly = false,
}: {
  game: GameState
  dispatch: Dispatch<GameAction>
  onDashboard: () => void
  onLeaderboard: () => void
  onEndGame: () => void
  onReset: () => void
  onTransfer?: () => void
  onImport?: () => void
  readOnly?: boolean
  onDiscardRound: () => void
  onRoundConfirmed: () => void
}) {
  const round = game.currentRound
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)

  if (!round) return null

  const isTieBreak = round.kind === 'tie-break'
  const participants = round.participants
    .map((id) => game.players.find((player) => player.id === id))
    .filter((player): player is PlayerRecord => Boolean(player))
  const winner = participants.find((player) => player.id === round.winnerId)
  const preview = scorePreview(game, round)

  const validation = validateRoundEntry({
    participants: participants.map((player) => ({ id: player.id, name: player.name })),
    entries: round.entries,
    winnerId: round.winnerId,
  })

  const totalPenalty = preview.lines.reduce((sum, line) => sum + line.penalty, 0)
  const missing = round.winnerId
    ? participants.filter(
        (player) =>
          player.id !== round.winnerId && round.entries[player.id]?.penalty == null,
      ).length
    : 0

  let helper: string
  if (!round.winnerId) {
    helper = isTieBreak ? 'Pick the tie-break winner.' : 'Pick the round winner.'
  } else if (missing > 0) {
    helper = `${missing} ${missing === 1 ? 'penalty' : 'penalties'} still to enter.`
  } else if (!validation.ok) {
    helper = validation.errors[0]
  } else {
    helper = 'Ready — confirm the round.'
  }

  function handleConfirmRound() {
    // The reducer validates again; navigation only happens once it accepted.
    if (!validation.ok) return
    setConfirmOpen(false)
    dispatch({ type: 'CONFIRM_ROUND', at: Date.now() })
    onRoundConfirmed()
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
          onTransfer={onTransfer}
          onImport={onImport}
          readOnly={readOnly}
        />
      }
    >
      <div className="animate-rise">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={isTieBreak ? 'yellow' : 'blue'}>
            {isTieBreak ? 'Tie-break' : `Round ${round.roundNumber}`}
          </Badge>
        </div>
        <h1 className="mt-3 font-display text-3xl leading-tight font-semibold tracking-[-0.03em] text-ink sm:text-4xl">
          {isTieBreak ? 'Settle the tie.' : 'Record the round.'}
        </h1>
        <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-muted">
          {isTieBreak
            ? 'One sudden-death hand. Lowest penalty survives, highest is knocked out — cumulative scores stay as they are.'
            : 'Pick who went out first, then type each other player’s total penalty points.'}
        </p>

        <section className="mt-6" aria-labelledby="winner-heading">
          <h2
            id="winner-heading"
            className="text-[11px] font-semibold tracking-[0.16em] text-faint uppercase"
          >
            {isTieBreak ? 'Tie-break winner' : 'Round winner'}
          </h2>
          <div className="mt-2 grid grid-cols-2 gap-2 min-[440px]:grid-cols-3">
            {participants.map((player) => {
              const index = game.players.findIndex((entry) => entry.id === player.id)
              const accent = accentClasses[accentForIndex(index)]
              const selected = round.winnerId === player.id
              return (
                <button
                  key={player.id}
                  type="button"
                  aria-pressed={selected}
                  aria-label={`${player.name} wins the round`}
                  onClick={() => dispatch({ type: 'SET_WINNER', playerId: player.id })}
                  className={cn(
                    'flex min-h-14 items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors',
                    selected
                      ? cn('border-transparent ring-2', accent.border, accent.softBg, accent.ring)
                      : 'border-line bg-surface/50 hover:border-line-soft',
                  )}
                >
                  <PlayerAvatar name={player.name} index={index} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">
                    {player.name}
                  </span>
                  {selected ? (
                    <Crown className={cn('size-4 shrink-0', accent.text)} />
                  ) : (
                    <UserRound className="size-4 shrink-0 text-faint" />
                  )}
                </button>
              )
            })}
          </div>
          <p className="mt-2 flex min-h-5 items-center gap-1.5 text-[12px] text-muted">
            {winner ? (
              <>
                <Check className="size-3.5 text-uno-green" />
                {winner.name} scores 0 this round.
              </>
            ) : (
              <span className="text-faint">No winner selected yet.</span>
            )}
          </p>
        </section>

        <section className="mt-6" aria-labelledby="penalties-heading">
          <div className="flex items-end justify-between gap-3">
            <h2
              id="penalties-heading"
              className="text-[11px] font-semibold tracking-[0.16em] text-faint uppercase"
            >
              Penalty points
            </h2>
            <span className="text-[11px] text-faint tabular-nums">
              Round total <span className="font-medium text-ink-soft">{formatNumber(totalPenalty)}</span>
            </span>
          </div>

          <div className="mt-2 space-y-2">
            {participants.map((player) => {
              const index = game.players.findIndex((entry) => entry.id === player.id)
              const isWinner = player.id === round.winnerId
              const entry = round.entries[player.id]
              const penalty = isWinner ? 0 : (entry?.penalty ?? null)
              const previous = player.cumulativeScore
              return (
                <div
                  key={player.id}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl border px-3 py-2.5',
                    isWinner
                      ? 'border-uno-green/30 bg-uno-green/[0.06]'
                      : 'border-line/75 bg-surface/55',
                  )}
                >
                  <PlayerAvatar name={player.name} index={index} />
                  <div className="min-w-0 flex-1">
                    <p className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[15px] font-medium text-ink">
                        {player.name}
                      </span>
                      {isWinner && (
                        <Badge variant="green" className="shrink-0">
                          Winner
                        </Badge>
                      )}
                    </p>
                    <label
                      htmlFor={`penalty-${player.id}`}
                      className="mt-0.5 block truncate text-[11px] text-muted"
                    >
                      {isWinner
                        ? 'Locked at 0 points'
                        : `Penalty points · now ${formatNumber(previous)}`}
                    </label>
                  </div>
                  <PenaltyField
                    playerId={player.id}
                    playerName={player.name}
                    value={penalty}
                    disabled={isWinner}
                    onChange={(next) =>
                      dispatch({ type: 'SET_PENALTY', playerId: player.id, penalty: next })
                    }
                  />
                </div>
              )
            })}
          </div>
        </section>

        <section className="mt-6" aria-labelledby="summary-heading">
          <h2
            id="summary-heading"
            className="text-[11px] font-semibold tracking-[0.16em] text-faint uppercase"
          >
            Summary
          </h2>
          <div className="mt-2 overflow-hidden rounded-2xl border border-line/70 bg-bg-soft/50">
            {preview.lines.map((line) => (
              <div
                key={line.playerId}
                className="flex items-center gap-3 border-b border-line/40 px-3.5 py-2.5 last:border-b-0"
              >
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-[13px]',
                    line.isWinner ? 'text-uno-green' : 'text-ink-soft',
                  )}
                >
                  {line.name}
                </span>
                <span className="w-16 text-right text-[13px] font-medium text-ink tabular-nums">
                  +{formatNumber(line.penalty)}
                </span>
                <span className="w-24 text-right text-[12px] text-muted tabular-nums">
                  {isTieBreak ? (
                    'no change'
                  ) : (
                    <>
                      {formatNumber(line.previousTotal)}{' '}
                      <span className="text-faint">→</span>{' '}
                      <span className="font-semibold text-ink">{formatNumber(line.newTotal)}</span>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="text-[11px] leading-relaxed text-faint">
            <Lock className="mr-1 inline size-3" />
            Confirming applies these points immediately.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted hover:text-uno-red"
            onClick={() => setDiscardOpen(true)}
          >
            <Trash2 className="size-3.5" /> Discard
          </Button>
        </div>
      </div>

      <StickyActionBar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] text-faint">
            {participants.length} players · {formatNumber(totalPenalty)} pts
          </p>
          <p className="mt-0.5 truncate text-xs font-medium text-ink-soft">{helper}</p>
        </div>
        <Button
          size="lg"
          onClick={() => setConfirmOpen(true)}
          disabled={!validation.ok}
          aria-describedby="confirm-hint"
          className="min-w-36"
        >
          Confirm round
        </Button>
        <span id="confirm-hint" className="sr-only">
          {helper}
        </span>
      </StickyActionBar>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="flex max-h-[92dvh] flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              Confirm {isTieBreak ? 'tie-break' : `round ${round.roundNumber}`}?
            </DialogTitle>
            <DialogDescription>
              {isTieBreak
                ? `The highest penalty in this hand is knocked out. Cumulative scores do not change.`
                : `${formatNumber(totalPenalty)} points are added to the cumulative scores and the cutoff is checked straight away.`}{' '}
              This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {/* Last look at the numbers that are about to be committed. */}
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-xl border border-line/70 bg-bg-soft/50">
            {preview.lines.map((line) => (
              <div
                key={line.playerId}
                className="flex items-center gap-3 border-b border-line/40 px-3.5 py-2 last:border-b-0"
              >
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-[13px]',
                    line.isWinner ? 'text-uno-green' : 'text-ink-soft',
                  )}
                >
                  {line.name}
                  {line.isWinner && <span className="ml-1.5 text-[11px] text-faint">winner</span>}
                </span>
                <span className="text-[13px] font-medium text-ink tabular-nums">
                  +{formatNumber(line.penalty)}
                </span>
                <span className="w-20 text-right text-[12px] text-muted tabular-nums">
                  {isTieBreak ? '—' : formatNumber(line.newTotal)}
                </span>
              </div>
            ))}
          </div>

          <DialogFooter className="mt-4 flex-col-reverse pb-4 sm:pb-0">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Back
            </Button>
            <Button onClick={handleConfirmRound} autoFocus>
              Confirm round
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title={isTieBreak ? 'Discard tie-break entry?' : 'Discard this round?'}
        description={
          isTieBreak
            ? 'No result has been recorded. You can replay or resolve the tie another way.'
            : 'The penalties typed in for this round will be cleared. Confirmed rounds are never affected.'
        }
        confirmLabel="Discard entry"
        tone="danger"
        onConfirm={() => {
          setDiscardOpen(false)
          onDiscardRound()
        }}
      />
    </ScreenShell>
  )
}
