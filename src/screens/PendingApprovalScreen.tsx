import { useState, type Dispatch } from 'react'
import { Clock, ShieldCheck, ThumbsDown, ThumbsUp } from 'lucide-react'
import { GameHeader } from '@/components/game/GameHeader'
import { PlayerScoreCard } from '@/components/PlayerScoreCard'
import { ScreenShell, StickyActionBar } from '@/components/AppHeader'
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
import { scorePreview } from '@/game/selectors'
import type { GameAction } from '@/game/reducer'
import type { GameState } from '@/game/types'
import { formatNumber, formatTime } from '@/lib/utils'

export function PendingApprovalScreen({
  game,
  dispatch,
  onDashboard,
  onLeaderboard,
  onEndGame,
  onReset,
}: {
  game: GameState
  dispatch: Dispatch<GameAction>
  onDashboard: () => void
  onLeaderboard: () => void
  onEndGame: () => void
  onReset: () => void
}) {
  const round = game.currentRound
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  if (!round) return null

  const preview = scorePreview(game, round)
  const totalPenalty = preview.lines.reduce((sum, line) => sum + line.penalty, 0)
  const isTieBreak = round.kind === 'tie-break'

  function approve() {
    dispatch({ type: 'APPROVE_ROUND', at: Date.now() })
  }

  function reject() {
    dispatch({ type: 'REJECT_ROUND', at: Date.now(), reason: reason.trim() || null })
    setRejectOpen(false)
    setReason('')
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
        />
      }
    >
      <div className="animate-rise">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="yellow">
            <Clock className="size-3" /> Pending approval
          </Badge>
          <Badge variant="outline">
            {isTieBreak ? 'Tie-break' : `Round ${round.roundNumber}`}
          </Badge>
          {round.submittedAt && (
            <span className="text-[11px] text-faint">submitted {formatTime(round.submittedAt)}</span>
          )}
        </div>
        <h1 className="mt-3 font-display text-3xl leading-tight font-semibold tracking-[-0.03em] text-ink sm:text-4xl">
          Scores submitted
        </h1>
        <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-muted">
          Check the card counts with the table before these scores count. Nothing has
          been added to the cumulative totals yet.
        </p>

        <div className="mt-5 flex items-center justify-between rounded-2xl border border-line/80 bg-surface/60 px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl border border-uno-blue/25 bg-uno-blue/10">
              <ShieldCheck className="size-4 text-uno-blue" />
            </span>
            <div>
              <p className="text-[13px] font-medium text-ink">Manual approval required</p>
              <p className="text-[11px] text-muted">
                {isTieBreak
                  ? 'The highest penalty is knocked out. Totals stay unchanged.'
                  : 'Approving makes the round ready to finalize.'}
              </p>
            </div>
          </div>
          <span className="font-display text-xl font-semibold text-ink tabular-nums">
            {formatNumber(totalPenalty)}
            <span className="ml-1 text-[10px] font-normal tracking-wide text-faint uppercase">pts</span>
          </span>
        </div>

        <div className="mt-5 space-y-2.5">
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

        <p className="mt-4 rounded-xl border border-line/70 bg-bg-soft/60 px-4 py-3 text-[11px] leading-relaxed text-muted">
          Rejecting sends these scores back for correction and leaves every cumulative
          total untouched. Only approved scores can be finalized.
        </p>
      </div>

      <StickyActionBar>
        <Button
          variant="danger"
          size="lg"
          className="flex-1"
          onClick={() => setRejectOpen(true)}
        >
          <ThumbsDown className="size-4" /> Reject
        </Button>
        <Button variant="success" size="lg" className="flex-1" onClick={approve}>
          <ThumbsUp className="size-4" /> Approve
        </Button>
      </StickyActionBar>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject these scores?</DialogTitle>
            <DialogDescription>
              The round goes back to score entry. No penalties are applied and the
              leaderboard stays exactly as it is.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <Label htmlFor="reject-reason">
              Reason <span className="text-faint normal-case">(optional)</span>
            </Label>
            <Textarea
              id="reject-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={200}
              placeholder="e.g. Ben also had a Wild Draw Four"
              className="mt-2"
            />
            <p className="mt-1.5 text-right text-[10px] text-faint tabular-nums">{reason.length}/200</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Keep reviewing
            </Button>
            <Button variant="danger" onClick={reject}>
              <ThumbsDown className="size-4" /> Reject scores
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScreenShell>
  )
}
