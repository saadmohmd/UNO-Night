import { useState, type Dispatch } from 'react'
import { ArrowRight, CheckCircle2, Lock, Zap } from 'lucide-react'
import { GameHeader } from '@/components/game/GameHeader'
import { PlayerScoreCard } from '@/components/PlayerScoreCard'
import { ScreenShell, StickyActionBar } from '@/components/AppHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { scorePreview } from '@/game/selectors'
import type { GameAction } from '@/game/reducer'
import type { GameState } from '@/game/types'
import { formatNumber, formatTime } from '@/lib/utils'

export function ApprovedScreen({
  game,
  dispatch,
  onFinalized,
  onDashboard,
  onLeaderboard,
  onEndGame,
  onReset,
}: {
  game: GameState
  dispatch: Dispatch<GameAction>
  onFinalized: () => void
  onDashboard: () => void
  onLeaderboard: () => void
  onEndGame: () => void
  onReset: () => void
}) {
  const round = game.currentRound
  const [confirmOpen, setConfirmOpen] = useState(false)
  if (!round) return null

  const preview = scorePreview(game, round)
  const totalPenalty = preview.lines.reduce((sum, line) => sum + line.penalty, 0)
  const isTieBreak = round.kind === 'tie-break'

  function finalize() {
    setConfirmOpen(false)
    dispatch({ type: 'FINALIZE_ROUND', at: Date.now() })
    onFinalized()
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
          <Badge variant="green">
            <CheckCircle2 className="size-3" />
            {round.autoApproved ? 'Auto-approved' : 'Approved'}
          </Badge>
          <Badge variant="outline">{isTieBreak ? 'Tie-break' : `Round ${round.roundNumber}`}</Badge>
          {round.approvedAt && (
            <span className="text-[11px] text-faint">accepted {formatTime(round.approvedAt)}</span>
          )}
        </div>
        <h1 className="mt-3 font-display text-3xl leading-tight font-semibold tracking-[-0.03em] text-ink sm:text-4xl">
          Scores accepted
        </h1>
        <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-muted">
          {round.autoApproved
            ? 'Automatic approval is on, so these scores are valid. Review the breakdown, then finalize when the table is ready.'
            : 'The table approved these scores. They are not on the leaderboard until you finalize the round.'}
        </p>

        <div className="mt-5 flex items-center justify-between rounded-2xl border border-uno-green/25 bg-uno-green/[0.06] px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl border border-uno-green/25 bg-uno-green/10">
              {round.autoApproved ? (
                <Zap className="size-4 text-uno-green" />
              ) : (
                <CheckCircle2 className="size-4 text-uno-green" />
              )}
            </span>
            <div>
              <p className="text-[13px] font-medium text-ink">
                {isTieBreak ? 'Tie-break ready' : 'Round ready to finalize'}
              </p>
              <p className="text-[11px] text-muted">
                {isTieBreak
                  ? 'Highest penalty is knocked out once finalized.'
                  : 'Finalizing applies penalties and checks the cutoff.'}
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

        <p className="mt-4 flex items-start gap-2 rounded-xl border border-line/70 bg-bg-soft/60 px-4 py-3 text-[11px] leading-relaxed text-muted">
          <Lock className="mt-0.5 size-3.5 shrink-0 text-faint" />
          Finalizing cannot be undone. Cumulative scores and the cutoff check happen
          only at that moment.
        </p>
      </div>

      <StickyActionBar>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-faint">{isTieBreak ? 'Sudden-death' : 'Round'} total</p>
          <p className="text-sm font-medium text-ink-soft tabular-nums">
            {formatNumber(totalPenalty)} penalty points
          </p>
        </div>
        <Button size="lg" onClick={() => setConfirmOpen(true)}>
          {isTieBreak ? 'Finalize tie-break' : 'Finalize round'}
          <ArrowRight className="size-4" />
        </Button>
      </StickyActionBar>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={isTieBreak ? 'Finalize the tie-break?' : `Finalize round ${round.roundNumber}?`}
        description={
          isTieBreak
            ? 'The tied players’ hands are locked and the highest penalty is knocked out. Cumulative scores do not change.'
            : 'These penalties will be added to cumulative scores and the cutoff will be checked. Finalized rounds cannot be edited or re-opened.'
        }
        confirmLabel={isTieBreak ? 'Finalize tie-break' : 'Finalize round'}
        tone="success"
        onConfirm={finalize}
      />
    </ScreenShell>
  )
}
