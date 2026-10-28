import {
  ArrowRight,
  Gavel,
  Info,
  ListOrdered,
  Lock,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react'
import { GameHeader } from '@/components/game/GameHeader'
import { StandingsList } from '@/components/game/StandingsList'
import { ScreenShell, StickyActionBar } from '@/components/AppHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { StatTile } from '@/components/StatTile'
import { buildStandings } from '@/game/rules'
import { canBeginRound, latestRound } from '@/game/selectors'
import type { GameState } from '@/game/types'
import { cn, formatNumber, formatTime } from '@/lib/utils'

export function DashboardScreen({
  game,
  onBeginRound,
  onDashboard,
  onLeaderboard,
  onResults,
  onEndGame,
  onReset,
  onTransfer,
  onImport,
  onSnapshot,
  readOnly = false,
}: {
  game: GameState
  onBeginRound: () => void
  onDashboard: () => void
  onLeaderboard: () => void
  onResults: () => void
  onEndGame: () => void
  onReset: () => void
  onTransfer?: () => void
  onImport?: () => void
  /** Read-only copies can still open the frozen round that was mid-entry. */
  onSnapshot?: () => void
  readOnly?: boolean
}) {
  if (!game.config) return null
  const active = game.players.filter((player) => !player.eliminated)
  const eliminated = game.players.filter((player) => player.eliminated)
  const standings = buildStandings(game.players, game.rounds)
  const activeRows = standings.filter((row) => !row.player.eliminated)
  const eliminatedRows = standings.filter((row) => row.player.eliminated)
  const last = latestRound(game)
  const nextRound = game.rounds.length + 1
  const gate = canBeginRound(game)
  const leaders = activeRows.filter((row) => row.player.cumulativeScore === activeRows[0]?.player.cumulativeScore)
  const leaderTie = leaders.length > 1
  const topScore = active.length > 0 ? Math.max(...active.map((player) => player.cumulativeScore)) : 0
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
          <span className="text-[10px] font-semibold tracking-[0.2em] text-brand uppercase">
            {game.config.name || 'Game in progress'}
          </span>
          {game.allowTwoPlayerRounds && <Badge variant="yellow">2-player rule</Badge>}
        </div>

        <h1 className="mt-2.5 font-display text-[2rem] leading-[1.05] font-semibold tracking-[-0.03em] text-ink sm:text-[2.6rem]">
          {game.rounds.length === 0 ? (
            <>
              Table&apos;s set.{' '}
              <br />
              <span className="text-muted">First hand?</span>
            </>
          ) : leaderTie ? (
            <>
              Dead heat at the top.{' '}
              <br />
              <span className="text-muted">Round {nextRound} decides.</span>
            </>
          ) : (
            <>
              Round {nextRound}.{' '}
              <br />
              <span className="text-muted">{leaders[0]?.player.name ?? 'The table'} leads the night.</span>
            </>
          )}
        </h1>
        <p className="mt-3 max-w-lg text-[14px] leading-relaxed text-muted">
          {game.rounds.length === 0
            ? 'Everyone starts at zero. Add each player’s penalty points after a physical round; the top score at the cutoff is knocked out.'
            : `${formatNumber(topScore)} is the highest score in play. Lowest cumulative score leads — the cutoff decides who goes home.`}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <StatTile
            label="Next round"
            value={`Round ${nextRound}`}
            hint={last ? `Round ${last.roundNumber} finalized` : 'Not started'}
            icon={<Play className="size-3.5" />}
          />
          <StatTile
            label="Eligible"
            value={`${active.length}`}
            hint={eliminated.length > 0 ? `${eliminated.length} eliminated` : 'All players in'}
            icon={<Users className="size-3.5" />}
          />
          <StatTile
            label="Cutoff"
            value={formatNumber(game.config.cutoff)}
            hint="Top score at the line is out"
            icon={<Gavel className="size-3.5" />}
          />
          <StatTile
            label="Rounds played"
            value={`${game.rounds.length}`}
            hint={game.rounds.length === 1 ? 'Round confirmed' : 'Rounds confirmed'}
            icon={<RotateCcw className="size-3.5" />}
          />
        </div>

        <section className="mt-7">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.2em] text-brand uppercase">
                Cumulative leaderboard
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-ink">
                {game.rounds.length === 0
                  ? 'Everyone starts level'
                  : leaderTie
                    ? 'Shared lead'
                    : 'Current standings'}
              </h2>
            </div>
            <button
              type="button"
              onClick={onLeaderboard}
              className="inline-flex items-center gap-1 pb-1 text-xs font-medium text-muted transition-colors hover:text-ink"
            >
              Details <ArrowRight className="size-3.5" />
            </button>
          </div>
          <StandingsList
            rows={activeRows}
            cutoff={game.config.cutoff}
            showHistory={false}
            showCutoffBar
            showLeadBadge={game.rounds.length > 0}
            accentIndexOf={accentIndexOf}
          />
          <p className="mt-2.5 flex items-center gap-1.5 px-1 text-[11px] text-faint">
            <Trophy className="size-3" /> Lowest score leads. At the cutoff, the highest score is knocked out.
          </p>
        </section>

        {eliminatedRows.length > 0 && (
          <section className="mt-7">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-ink">Out of the running</h2>
              <span className="text-[11px] text-faint">{eliminatedRows.length} eliminated</span>
            </div>
            <StandingsList
              rows={eliminatedRows}
              showHistory={false}
              accentIndexOf={accentIndexOf}
            />
          </section>
        )}

        {last && (
          <section className="mt-7">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold tracking-[0.2em] text-brand uppercase">
                  Last finalized
                </p>
                <h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-ink">
                  Round {last.roundNumber}
                </h2>
              </div>
              <Button variant="ghost" size="sm" onClick={onResults}>
                Results <ArrowRight className="size-3.5" />
              </Button>
            </div>
            <div className="rounded-2xl border border-line/75 bg-surface/55 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-soft">
                  <Sparkles className="size-3.5 text-brand" />
                  {last.winnerName} went out first
                </span>
                <span className="text-[11px] text-faint">{formatTime(last.finalizedAt)}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {last.lines.map((line) => (
                  <span
                    key={line.playerId}
                    className={cn(
                      'rounded-lg border px-2 py-1 text-[11px] tabular-nums',
                      line.isWinner
                        ? 'border-uno-green/25 bg-uno-green/10 text-uno-green'
                        : 'border-line/70 bg-bg/40 text-muted',
                    )}
                  >
                    {line.name} +{formatNumber(line.penalty)}
                  </span>
                ))}
              </div>
              {last.eliminations.length > 0 && (
                <p className="mt-3 text-[11px] text-uno-red">
                  {last.eliminations
                    .map(
                      (entry) =>
                        `${entry.playerName} knocked out ${
                          entry.via === 'cutoff' ? 'at the cutoff' : 'after a tie-break'
                        }`,
                    )
                    .join(' · ')}
                  .
                </p>
              )}
              {last.tieBreaks.length > 0 && (
                <p className="mt-3 text-[11px] text-uno-yellow">
                  Tie-break resolved after this round.
                </p>
              )}
            </div>
          </section>
        )}

        {game.rounds.length === 0 && (
          <section className="mt-7 rounded-2xl border border-line/70 bg-bg-soft/60 p-4">
            <div className="flex items-center gap-2">
              <Info className="size-4 text-uno-blue" />
              <h2 className="text-[13px] font-semibold text-ink">How scoring works</h2>
            </div>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
              The round winner scores 0. Everyone else adds the total points left in
              their hand, counted the way your table counts them. When the top
              cumulative score reaches the cutoff after a finalized round, that player
              is out.
            </p>
          </section>
        )}

        <p className="mt-8 flex items-center gap-1.5 text-[11px] leading-relaxed text-faint">
          <ListOrdered className="size-3.5" />
          Saved automatically in this browser on this device · refreshing keeps the game,
          discarding deletes it. Nothing is uploaded.
        </p>
      </div>

      <StickyActionBar>
        <div className="min-w-0 flex-1">
          {readOnly ? (
            // The frozen copy has no action to offer, so keep the bar short.
            <p className="flex items-center gap-1.5 truncate text-xs font-medium text-ink-soft">
              <Lock className="size-3.5 shrink-0 text-uno-yellow" />
              Read-only copy
            </p>
          ) : (
            <>
              <p className="truncate text-[11px] text-faint">
                {active.length} eligible · cutoff {formatNumber(game.config.cutoff)}
              </p>
              <p className="mt-0.5 truncate text-xs font-medium text-ink-soft">
                {gate.allowed ? 'Deal the next hand to begin.' : gate.reason}
              </p>
            </>
          )}
        </div>
        {/* On a frozen copy the snapshot button takes this slot; the board stays
            reachable from the standings link and the game menu. */}
        {!(readOnly && game.currentRound && onSnapshot) && (
          <Button variant="secondary" size="lg" onClick={onLeaderboard} className="px-3 sm:px-5">
            <Trophy className="size-4" />
            <span className="hidden sm:inline">Leaderboard</span>
          </Button>
        )}
        {readOnly && game.currentRound && onSnapshot && (
          <Button
            variant="secondary"
            size="lg"
            onClick={onSnapshot}
            className="px-3"
            aria-label="Round snapshot"
          >
            <ListOrdered className="size-4" />
            <span className="hidden sm:inline">Snapshot</span>
          </Button>
        )}
        <Button size="lg" onClick={onBeginRound} disabled={!gate.allowed} className="min-w-32">
          <Play className="size-4" />
          Begin round
        </Button>
      </StickyActionBar>
    </ScreenShell>
  )
}
