import { ArrowRight, Lock } from 'lucide-react'
import { GameHeader } from '@/components/game/GameHeader'
import { PlayerScoreCard } from '@/components/PlayerScoreCard'
import { ScreenShell } from '@/components/AppHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { scorePreview } from '@/game/selectors'
import type { GameState } from '@/game/types'
import { formatNumber } from '@/lib/utils'

/**
 * The open round of a handed-over game, shown as a frozen snapshot.
 *
 * The old phone keeps the ability to *read* exactly what was sent (including an
 * unfinished round) but every control that could change a score is gone.
 */
export function TransferredRoundScreen({
  game,
  onDashboard,
  onLeaderboard,
  onReset,
  onImport,
}: {
  game: GameState
  onDashboard: () => void
  onLeaderboard: () => void
  onReset: () => void
  onImport?: () => void
}) {
  const round = game.currentRound
  if (!round || !game.config) return null

  const participants = round.participants
    .map((id) => game.players.find((player) => player.id === id))
    .filter((player): player is NonNullable<typeof player> => Boolean(player))
  const isTieBreak = round.kind === 'tie-break'
  const preview = scorePreview(game, round)
  const totalPenalty = preview.lines.reduce((sum, line) => sum + line.penalty, 0)
  const confirmedCount = participants.filter((player) => round.entries[player.id]?.confirmed).length
  const winner = participants.find((player) => player.id === round.winnerId)

  return (
    <ScreenShell
      header={
        <GameHeader
          game={game}
          onDashboard={onDashboard}
          onLeaderboard={onLeaderboard}
          onEndGame={() => undefined}
          onReset={onReset}
          onImport={onImport}
          readOnly
        />
      }
    >
      <div className="animate-rise">
        <Badge variant="yellow">
          <Lock className="size-3" /> Read-only
        </Badge>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink">
          {isTieBreak ? 'Tie-break' : `Round ${round.roundNumber}`} snapshot
        </h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
          This game was transferred to another phone, so this is the last state recorded here.
          Scoring continues on the receiving device.
        </p>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-line bg-surface/60 px-3.5 py-3">
            <p className="text-[10px] font-semibold tracking-wide text-faint uppercase">
              {winner ? 'Round winner' : 'Winner not picked'}
            </p>
            <p className="mt-0.5 text-sm font-medium text-ink">{winner?.name ?? '—'}</p>
          </div>
          <div className="rounded-xl border border-line bg-surface/60 px-3.5 py-3">
            <p className="text-[10px] font-semibold tracking-wide text-faint uppercase">
              Hands confirmed
            </p>
            <p className="mt-0.5 text-sm font-medium text-ink tabular-nums">
              {confirmedCount} / {participants.length}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl border border-line bg-bg-soft/60 px-4 py-3">
          <span className="text-[11px] font-semibold tracking-wide text-muted uppercase">
            Unconfirmed penalty
          </span>
          <span className="font-display text-lg font-semibold text-ink tabular-nums">
            {formatNumber(totalPenalty)} pts
          </span>
        </div>

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

        <div className="mt-6 rounded-2xl border border-line/70 bg-surface/40 p-4">
          <p className="text-[11px] leading-relaxed text-faint">
            Nothing here can be edited. The receiving phone picked up this exact round, together with
            every confirmed round and cumulative score.
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={onDashboard}>
            Dashboard <ArrowRight className="size-4" />
          </Button>
          <Button variant="outline" onClick={onLeaderboard}>
            Leaderboard
          </Button>
        </div>
      </div>
    </ScreenShell>
  )
}
