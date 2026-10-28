import {
  ArrowRight,
  CheckCircle2,
  Crown,
  Gavel,
  LayoutDashboard,
  RotateCcw,
  Trophy,
  UserMinus,
} from 'lucide-react'
import { GameHeader } from '@/components/game/GameHeader'
import { PlayerScoreCard } from '@/components/PlayerScoreCard'
import { ScreenShell, StickyActionBar } from '@/components/AppHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { latestRound, canBeginRound } from '@/game/selectors'
import type { GameState, TieBreakRecord } from '@/game/types'
import { cn, formatNumber, formatTime } from '@/lib/utils'

function tieBreakSummary(record: TieBreakRecord): string {
  if (record.kind === 'manual') {
    return record.eliminatedPlayerId
      ? 'The table settled the tie by agreement.'
      : 'Tie resolution recorded.'
  }
  if (!record.eliminatedPlayerId) return 'The replay ended level — the tie remains open.'
  return 'The replay separated the tied players.'
}

export function RoundResultsScreen({
  game,
  onNextRound,
  onDashboard,
  onLeaderboard,
  onEndGame,
  onReset,
  onTransfer,
  onImport,
  readOnly = false,
}: {
  game: GameState
  onNextRound: () => void
  onDashboard: () => void
  onLeaderboard: () => void
  onEndGame: () => void
  onReset: () => void
  onTransfer?: () => void
  onImport?: () => void
  readOnly?: boolean
}) {
  const round = latestRound(game)
  if (!round || !game.config) return null
  const gate = canBeginRound(game)
  const cutoff = game.config.cutoff
  const totalPenalty = round.lines.reduce((sum, line) => sum + line.penalty, 0)
  const nextRound = round.roundNumber + 1
  const accentIndexOf = (playerId: string) => game.players.findIndex((player) => player.id === playerId)

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
          <Badge variant="green">
            <CheckCircle2 className="size-3" /> Finalized
          </Badge>
          <Badge variant="outline">Round {round.roundNumber}</Badge>
          <span className="text-[11px] text-faint">{formatTime(round.finalizedAt)}</span>
        </div>

        <div className="mt-4 flex items-start gap-3.5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-brand/30 bg-brand/[0.09] text-brand">
            <Crown className="size-6" />
          </span>
          <div>
            <p className="mb-1.5 text-[10px] font-semibold tracking-[0.2em] text-brand uppercase">
              Round {round.roundNumber} complete
            </p>
            <h1 className="font-display text-[1.75rem] leading-[1.1] font-semibold tracking-[-0.03em] text-ink sm:text-4xl">
              {round.winnerName} takes the round.
            </h1>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">
              Zero penalty for the winner. {formatNumber(totalPenalty)} points across the
              rest of the table{round.eliminations.length > 0 ? ', and one knockout.' : '.'}
            </p>
          </div>
        </div>

        {round.eliminations.map((elimination) => (
          <div
            key={elimination.playerId}
            className="mt-5 flex animate-strike items-center gap-3 rounded-2xl border border-uno-red/25 bg-uno-red/[0.06] px-4 py-3.5"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-uno-red/25 bg-uno-red/10">
              <UserMinus className="size-4 text-uno-red" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">
                {elimination.playerName} is out
              </p>
              <p className="text-[11px] leading-relaxed text-muted">
                {elimination.via === 'cutoff' && (
                  <>
                    {formatNumber(elimination.cumulativeScore)} points reaches the{' '}
                    {formatNumber(cutoff)} cutoff.
                  </>
                )}
                {elimination.via === 'tie-break-replay' && 'Lost the tie-break replay at the cutoff.'}
                {elimination.via === 'tie-break-manual' && 'Settled by the table after a cutoff tie.'}
              </p>
            </div>
            <span className="font-display text-lg font-semibold text-uno-red tabular-nums">
              {formatNumber(elimination.cumulativeScore)}
            </span>
          </div>
        ))}

        {round.tieBreaks.length > 0 && (
          <div className="mt-4 rounded-2xl border border-uno-yellow/25 bg-uno-yellow/[0.05] px-4 py-3.5">
            <div className="flex items-center gap-2">
              <Gavel className="size-4 text-uno-yellow" />
              <p className="text-[13px] font-medium text-ink">Tie-break resolved</p>
            </div>
            {round.tieBreaks.map((record, index) => (
              <p key={index} className="mt-1 text-[11px] leading-relaxed text-muted">
                {tieBreakSummary(record)}
                {record.eliminatedPlayerId && (
                  <>
                    {' '}
                    <span className="text-ink-soft">
                      {game.players.find((player) => player.id === record.eliminatedPlayerId)?.name}
                    </span>{' '}
                    was knocked out.
                  </>
                )}
              </p>
            ))}
          </div>
        )}

        <section className="mt-7">
          <div className="mb-3 flex items-end justify-between">
            <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
              Score breakdown
            </h2>
            <span className="text-[11px] text-faint">
              {round.lines.length} {round.lines.length === 1 ? 'player' : 'players'}
            </span>
          </div>
          <div className="space-y-2.5">
            {round.lines.map((line) => (
              <PlayerScoreCard
                key={line.playerId}
                name={line.name}
                index={accentIndexOf(line.playerId)}
                penalty={line.penalty}
                previousTotal={line.previousTotal}
                newTotal={line.newTotal}
                isWinner={line.isWinner}
              />
            ))}
          </div>
        </section>

        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <div className="rounded-xl border border-line/70 bg-surface/55 px-3.5 py-3">
            <p className="text-[9px] font-semibold tracking-[0.16em] text-faint uppercase">Cutoff</p>
            <p className="mt-1 font-display text-lg font-semibold text-ink tabular-nums">
              {formatNumber(round.cutoff)}
            </p>
          </div>
          <div className="rounded-xl border border-line/70 bg-surface/55 px-3.5 py-3">
            <p className="text-[9px] font-semibold tracking-[0.16em] text-faint uppercase">Players eligible</p>
            <p className="mt-1 font-display text-lg font-semibold text-ink tabular-nums">
              {game.players.filter((player) => !player.eliminated).length}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onLeaderboard}
          className="mt-5 flex w-full items-center justify-between rounded-xl border border-line/70 bg-bg-soft/50 px-4 py-3 text-left transition-colors hover:border-line-soft"
        >
          <span className="flex items-center gap-2 text-[13px] text-ink-soft">
            <Trophy className="size-4 text-brand" /> See the updated leaderboard
          </span>
          <ArrowRight className="size-4 text-muted" />
        </button>

        <p className={cn('mt-4 text-[11px] leading-relaxed', gate.allowed ? 'text-faint' : 'text-uno-yellow')}>
          {gate.allowed
            ? `Round ${nextRound} can begin whenever the next hand is dealt.`
            : gate.reason}
        </p>
      </div>

      <StickyActionBar>
        <Button variant="secondary" size="lg" onClick={onDashboard} className="px-3 sm:px-4">
          <LayoutDashboard className="size-4" />
          <span className="hidden sm:inline">Dashboard</span>
        </Button>
        <div className="min-w-0 flex-1" />
        <Button size="lg" onClick={onNextRound} disabled={!gate.allowed}>
          <RotateCcw className="size-4" />
          {gate.allowed ? `Begin round ${nextRound}` : 'Round blocked'}
        </Button>
      </StickyActionBar>
    </ScreenShell>
  )
}
