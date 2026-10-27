import { useState, type Dispatch } from 'react'
import {
  ArrowRight,
  Check,
  Crown,
  Lock,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Zap,
} from 'lucide-react'
import { GameHeader } from '@/components/game/GameHeader'
import { CardCountTile } from '@/components/game/CardCountTile'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { PlayerScoreCard } from '@/components/PlayerScoreCard'
import { ScreenShell, StickyActionBar } from '@/components/AppHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { CARD_GROUPS, calculatePenalty, totalCards, type CardKey, type HandEntries } from '@/game/cards'
import { scorePreview } from '@/game/selectors'
import { validateRoundEntry } from '@/game/validation'
import type { GameAction } from '@/game/reducer'
import type { GameState, PlayerRecord } from '@/game/types'
import { accentClasses, accentForIndex, cn, formatNumber } from '@/lib/utils'

interface PlayerEntryCardProps {
  player: PlayerRecord
  accentIndex: number
  entries: HandEntries
  isWinner: boolean
  isTieBreak: boolean
  onCountChange: (playerId: string, card: CardKey, value: number) => void
  onIncrement: (playerId: string, card: CardKey, delta: number) => void
  onConfirmChange: (playerId: string, confirmed: boolean) => void
}

function PlayerEntryCard({
  player,
  accentIndex,
  entries,
  isWinner,
  isTieBreak,
  onCountChange,
  onIncrement,
  onConfirmChange,
}: PlayerEntryCardProps) {
  const entry = entries[player.id]
  const counts = entry?.counts
  const confirmed = Boolean(entry?.confirmed)
  const cards = counts ? totalCards(counts) : 0
  const penalty = counts && !isWinner ? calculatePenalty(counts) : 0
  const accent = accentClasses[accentForIndex(accentIndex)]

  return (
    <AccordionItem
      value={player.id}
      className={cn(
        'mb-2.5 rounded-2xl border bg-surface/55 transition-colors last:mb-0',
        isWinner ? 'border-uno-green/35' : 'border-line/75',
      )}
    >
      <AccordionTrigger className="px-3.5 py-3 hover:bg-surface-2/30 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <PlayerAvatar name={player.name} index={accentIndex} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="truncate text-[15px] font-medium text-ink">{player.name}</span>
              {isWinner && (
                <Badge variant="green">
                  <Crown className="size-3" /> Winner
                </Badge>
              )}
              {confirmed && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wide text-uno-green uppercase">
                  <Check className="size-3" /> Confirmed
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-muted">
              {cards} card{cards === 1 ? '' : 's'} recorded
              {isWinner && ' · penalty locked at 0'}
            </p>
          </div>
          <div className="mr-1 text-right">
            <div className={cn('font-display text-lg leading-tight font-semibold tabular-nums', isWinner ? 'text-uno-green' : accent.text)}>
              +{formatNumber(penalty)}
            </div>
            <div className="text-[9px] font-semibold tracking-[0.14em] text-faint uppercase">penalty</div>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-3.5 sm:px-4">
        {isWinner && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-uno-green/25 bg-uno-green/[0.07] px-3 py-2.5 text-[11px] leading-relaxed text-uno-green">
            <Crown className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Winner — this hand scores 0 points no matter how many cards are left.
              Record the cards anyway so the round breakdown stays complete.
            </span>
          </div>
        )}
        {isTieBreak && (
          <p className="mb-3 text-[11px] leading-relaxed text-uno-yellow">
            Tie-break hand only. These penalties do not change cumulative scores.
          </p>
        )}

        {CARD_GROUPS.map((group) => (
          <div key={group.id} className="mb-3 last:mb-0">
            <p className="mb-1.5 text-[10px] font-semibold tracking-[0.16em] text-faint uppercase">
              {group.title}
            </p>
            <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2 md:grid-cols-3">
              {group.keys.map((card) => (
                <CardCountTile
                  key={card}
                  card={card}
                  count={counts?.[card] ?? 0}
                  playerName={player.name}
                  onChange={(value) => onCountChange(player.id, card, value)}
                  onIncrement={(delta) => onIncrement(player.id, card, delta)}
                />
              ))}
            </div>
          </div>
        ))}

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-line/60 pt-3">
          <div>
            <p className="text-[9px] font-semibold tracking-[0.14em] text-faint uppercase">Total remaining</p>
            <p className="font-display text-lg font-semibold text-ink tabular-nums">
              {cards} <span className="text-xs font-normal text-muted">cards</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-semibold tracking-[0.14em] text-faint uppercase">Penalty</p>
            <p className={cn('font-display text-lg font-semibold tabular-nums', isWinner ? 'text-uno-green' : 'text-ink')}>
              +{formatNumber(penalty)}
            </p>
          </div>
        </div>
        <Button
          variant={confirmed ? 'secondary' : 'primary'}
          className="mt-3 w-full"
          onClick={() => onConfirmChange(player.id, !confirmed)}
        >
          {confirmed ? (
            <>
              <Check className="size-4 text-uno-green" /> Hand confirmed · edit
            </>
          ) : (
            <>
              Confirm hand <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </AccordionContent>
    </AccordionItem>
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
}: {
  game: GameState
  dispatch: Dispatch<GameAction>
  onDashboard: () => void
  onLeaderboard: () => void
  onEndGame: () => void
  onReset: () => void
  onDiscardRound: () => void
}) {
  const round = game.currentRound
  const [openPlayer, setOpenPlayer] = useState<string | undefined>(round?.participants[0])
  const [reviewOpen, setReviewOpen] = useState(false)
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

  const confirmedCount = participants.filter((player) => round.entries[player.id]?.confirmed).length
  const totalPenalty = preview.lines.reduce((sum, line) => sum + line.penalty, 0)

  function touchHandler(playerId: string) {
    if (round?.entries[playerId]?.confirmed) {
      dispatch({ type: 'CONFIRM_HAND', playerId, confirmed: false })
    }
  }

  function handleCountChange(playerId: string, card: CardKey, value: number) {
    touchHandler(playerId)
    dispatch({ type: 'SET_COUNT', playerId, card, value })
  }

  function handleIncrement(playerId: string, card: CardKey, delta: number) {
    touchHandler(playerId)
    dispatch({ type: 'INCREMENT_COUNT', playerId, card, delta })
  }

  function handleConfirm(playerId: string, confirmed: boolean) {
    dispatch({ type: 'CONFIRM_HAND', playerId, confirmed })
    if (confirmed) {
      const next = participants.find(
        (player) => player.id !== playerId && !round?.entries[player.id]?.confirmed,
      )
      setOpenPlayer(next?.id)
    }
  }

  function handleSubmit() {
    setReviewOpen(false)
    dispatch({ type: 'SUBMIT_ROUND', at: Date.now() })
  }

  let helper: string
  if (!round.winnerId) helper = isTieBreak ? 'Pick the tie-break winner.' : 'Pick the round winner.'
  else if (confirmedCount < participants.length) {
    const remaining = participants.length - confirmedCount
    helper = `${remaining} hand${remaining === 1 ? '' : 's'} left to confirm.`
  } else if (!validation.ok) helper = validation.errors[0]
  else helper = 'All hands recorded — review before submitting.'

  return (
    <ScreenShell
      header={
        <GameHeader
          game={game}
          onDashboard={onDashboard}
          onLeaderboard={onLeaderboard}
          onEndGame={onEndGame}
          onReset={onReset}
        />
      }
    >
      <div className="animate-rise">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={isTieBreak ? 'yellow' : 'blue'}>
            {isTieBreak ? 'Tie-break' : `Round ${round.roundNumber}`}
          </Badge>
          <Badge variant="outline">
            {round.mode === 'manual' ? (
              <>
                <ShieldCheck className="size-3" /> Manual approval
              </>
            ) : (
              <>
                <Zap className="size-3" /> Auto approval
              </>
            )}
          </Badge>
        </div>
        <h1 className="mt-3 font-display text-3xl leading-tight font-semibold tracking-[-0.03em] text-ink sm:text-4xl">
          {isTieBreak ? 'Settle the tie' : 'Count the cards'}
        </h1>
        <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-muted">
          {isTieBreak
            ? 'The tied players play one sudden-death hand. Lowest penalty survives; highest penalty is knocked out.'
            : 'After the hand ends, record what each player still holds. The winner scores zero.'}
        </p>

        {round.rejection && (
          <div
            role="status"
            className="mt-4 rounded-2xl border border-uno-red/25 bg-uno-red/[0.06] p-4"
          >
            <div className="flex items-center gap-2">
              <Badge variant="red">Rejected</Badge>
              <p className="text-[13px] font-medium text-ink">These scores were sent back</p>
            </div>
            {round.rejection.reason && (
              <p className="mt-2 text-[12px] leading-relaxed text-ink-soft">
                “{round.rejection.reason}”
              </p>
            )}
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
              Nothing has been applied to the leaderboard. Correct the hands and submit
              again when the table is ready.
            </p>
          </div>
        )}

        <section className="mt-6 rounded-2xl border border-line/80 bg-surface/60 p-4 sm:p-5">
          <fieldset>
            <div className="flex items-center justify-between gap-2">
              <legend className="text-[13px] font-semibold tracking-wide text-ink-soft uppercase">
                {isTieBreak ? 'Who won the tie-break?' : 'Who won the round?'}
              </legend>
              <span className="text-[10px] font-medium tracking-wide text-faint uppercase">Pick one</span>
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
              The first player out of cards. Their penalty is locked at zero.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 min-[480px]:grid-cols-3">
              {participants.map((player) => {
                const index = game.players.findIndex((entry) => entry.id === player.id)
                const selected = round.winnerId === player.id
                const accent = accentClasses[accentForIndex(index)]
                return (
                  <label
                    key={player.id}
                    className={cn(
                      'relative flex cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-2.5 transition-colors',
                      selected
                        ? cn('border-transparent ring-2', accent.border, accent.softBg, accent.ring)
                        : 'border-line bg-surface-2/40 hover:border-line-soft',
                    )}
                  >
                    <input
                      type="radio"
                      name="round-winner"
                      value={player.id}
                      checked={selected}
                      onChange={() => dispatch({ type: 'SET_WINNER', playerId: player.id })}
                      className="peer sr-only"
                      aria-label={`${player.name} wins the round`}
                    />
                    <PlayerAvatar name={player.name} index={index} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
                      {player.name}
                    </span>
                    {selected && <Crown className={cn('size-4 shrink-0', accent.text)} />}
                  </label>
                )
              })}
            </div>
            {winner && (
              <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-uno-green">
                <Check className="size-3.5" />
                {winner.name} takes the round — zero penalty locked in.
              </p>
            )}
            {!winner && (
              <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-faint">
                <TriangleAlert className="size-3.5" /> No winner selected yet.
              </p>
            )}
          </fieldset>
        </section>

        <div className="mt-7 flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.2em] text-brand uppercase">
              {isTieBreak ? 'Tie-break hands' : 'Remaining cards'}
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-ink">
              {participants.length} hands to record
            </h2>
          </div>
          <span className="pb-1 text-xs font-medium text-muted tabular-nums">
            {confirmedCount}/{participants.length} confirmed
          </span>
        </div>
        <Progress
          value={confirmedCount}
          max={participants.length}
          className="mt-2.5"
          label="Hands confirmed"
        />

        <Accordion
          type="single"
          collapsible
          value={openPlayer ?? ''}
          onValueChange={(value) => setOpenPlayer(value || undefined)}
          className="mt-4"
        >
          {participants.map((player) => {
            const accentIndex = game.players.findIndex((entry) => entry.id === player.id)
            return (
              <PlayerEntryCard
                key={player.id}
                player={player}
                accentIndex={accentIndex}
                entries={round.entries}
                isWinner={round.winnerId === player.id}
                isTieBreak={isTieBreak}
                onCountChange={handleCountChange}
                onIncrement={handleIncrement}
                onConfirmChange={handleConfirm}
              />
            )
          })}
        </Accordion>

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="text-[11px] leading-relaxed text-faint">
            <Lock className="mr-1 inline size-3" />
            Scores lock once submitted. Approvals and finalization happen next.
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
        <p className="mt-1 text-[11px] text-faint">
          Round penalty so far:{' '}
          <span className="text-ink-soft">{formatNumber(totalPenalty)} pts</span>
        </p>
      </div>

      <StickyActionBar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] text-faint">
            {preview.lines.length} players · {formatNumber(totalPenalty)} pts
          </p>
          <p className="mt-0.5 truncate text-xs font-medium text-ink-soft">{helper}</p>
        </div>
        <Button
          size="lg"
          onClick={() => setReviewOpen(true)}
          disabled={!validation.ok}
          aria-describedby="review-hint"
        >
          Review
          <ArrowRight className="size-4" />
        </Button>
        <span id="review-hint" className="sr-only">
          {helper}
        </span>
      </StickyActionBar>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="sm:w-[min(94vw,40rem)]">
          <DialogHeader>
            <DialogTitle>
              Review {isTieBreak ? 'tie-break' : `round ${round.roundNumber}`}
            </DialogTitle>
            <DialogDescription>
              {isTieBreak
                ? 'Check every hand. The highest penalty in this hand is knocked out; cumulative totals stay as they are.'
                : 'Check every hand with the table. Nothing is added to cumulative scores until the round is finalized.'}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-2.5">
            {preview.lines.map((line) => (
              <PlayerScoreCard
                key={line.playerId}
                name={line.name}
                index={game.players.findIndex((player) => player.id === line.playerId)}
                counts={line.counts}
                penalty={line.penalty}
                previousTotal={line.previousTotal}
                newTotal={line.newTotal}
                isWinner={line.isWinner}
                showTotals={!isTieBreak}
              />
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl border border-line bg-surface/60 px-4 py-3">
            <span className="text-[11px] font-semibold tracking-wide text-muted uppercase">
              {isTieBreak ? 'Hand penalties' : 'Round penalty'}
            </span>
            <span className="font-display text-xl font-semibold text-ink tabular-nums">
              {formatNumber(totalPenalty)} pts
            </span>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-faint">
            <Lock className="size-3" />
            {round.mode === 'manual'
              ? 'This will go to the table for approval before it can be finalized.'
              : 'Automatic approval — valid scores are accepted as soon as you submit.'}
          </p>

          <DialogFooter className="mt-5">
            <Button variant="outline" onClick={() => setReviewOpen(false)}>
              Back to edit
            </Button>
            <Button onClick={handleSubmit}>
              {round.mode === 'manual' ? 'Submit for approval' : 'Submit scores'}
              <ArrowRight className="size-4" />
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
            : 'Every card count for this round will be cleared. Finalized rounds are never affected.'
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
