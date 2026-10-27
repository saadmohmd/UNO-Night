import { useState } from 'react'
import { ArrowLeft, Gavel, History, ListOrdered, Trophy } from 'lucide-react'
import { GameHeader } from '@/components/game/GameHeader'
import { StandingsList } from '@/components/game/StandingsList'
import { ScreenShell } from '@/components/AppHeader'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { buildStandings } from '@/game/rules'
import type { GameState, RoundRecord } from '@/game/types'
import { cn, formatNumber, formatTime } from '@/lib/utils'

function RoundHistoryCard({
  round,
  names,
  latest,
}: {
  round: RoundRecord
  names: Map<string, string>
  latest: boolean
}) {
  return (
    <article className="rounded-2xl border border-line/75 bg-surface/55 p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-[10px] font-semibold tracking-[0.18em] text-brand uppercase">
              Round {round.roundNumber}
            </p>
            {latest && <Badge variant="outline">Latest</Badge>}
          </div>
          <h3 className="mt-0.5 font-display text-base font-semibold text-ink">
            {round.winnerName} won <span className="font-normal text-muted">· zero penalty</span>
          </h3>
        </div>
        <span className="text-[10px] text-faint">{formatTime(round.finalizedAt)}</span>
      </header>

      <ul className="mt-3 divide-y divide-line/50">
        {round.lines.map((line) => (
          <li key={line.playerId} className="flex items-center justify-between gap-3 py-1.5 text-xs">
            <span className={cn('truncate', line.isWinner ? 'text-uno-green' : 'text-ink-soft')}>
              {line.name}
              {line.isWinner && <span className="ml-1.5 text-[9px] tracking-wide uppercase">winner</span>}
            </span>
            <span className="shrink-0 tabular-nums text-muted">
              +{formatNumber(line.penalty)}{' '}
              <span className="text-faint">→ {formatNumber(line.newTotal)}</span>
            </span>
          </li>
        ))}
      </ul>

      {round.tieBreaks.map((record, index) => (
        <div key={index} className="mt-2.5 rounded-lg border border-uno-yellow/20 bg-uno-yellow/[0.05] px-2.5 py-2">
          <p className="text-[10px] font-semibold tracking-wide text-uno-yellow uppercase">
            {record.kind === 'replay' ? 'Tie-break replay' : 'Tie-break decision'}
          </p>
          {record.hands ? (
            <p className="mt-1 text-[11px] text-muted">
              {record.playerIds
                .map((id) => `${names.get(id) ?? 'Player'} +${formatNumber(record.hands?.[id]?.penalty ?? 0)}`)
                .join(' · ')}
              {record.eliminatedPlayerId && (
                <>
                  {' '}
                  — <span className="text-ink-soft">{names.get(record.eliminatedPlayerId)}</span> out.
                </>
              )}
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-muted">
              {record.eliminatedPlayerId
                ? `${names.get(record.eliminatedPlayerId)} was knocked out by table agreement.`
                : 'Recorded without a knockout.'}
            </p>
          )}
        </div>
      ))}

      {round.eliminations.length > 0 && (
        <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-uno-red">
          <ListOrdered className="size-3" />
          {round.eliminations
            .map((elimination) => `${elimination.playerName} out at ${formatNumber(elimination.cumulativeScore)}`)
            .join(' · ')}
        </p>
      )}
    </article>
  )
}

export function LeaderboardScreen({
  game,
  onDashboard,
  onEndGame,
  onReset,
}: {
  game: GameState
  onDashboard: () => void
  onEndGame: () => void
  onReset: () => void
}) {
  const [tab, setTab] = useState('standings')
  if (!game.config) return null

  const standings = buildStandings(game.players, game.rounds)
  const names = new Map(game.players.map((player) => [player.id, player.name]))
  const accentIndexOf = (playerId: string) => game.players.findIndex((player) => player.id === playerId)
  const rounds = [...game.rounds].reverse()
  const championId = game.ending?.championId ?? null

  return (
    <ScreenShell
      header={
        <GameHeader
          game={game}
          onDashboard={onDashboard}
          onLeaderboard={() => undefined}
          onEndGame={onEndGame}
          onReset={onReset}
        />
      }
    >
      <div className="animate-rise">
        <button
          type="button"
          onClick={onDashboard}
          className="inline-flex items-center gap-1.5 rounded-lg py-1 text-[13px] font-medium text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-4" /> Back to table
        </button>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.2em] text-brand uppercase">
              {game.config.name || 'Game session'}
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold tracking-[-0.03em] text-ink sm:text-4xl">
              Leaderboard
            </h1>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline">
              <Gavel className="size-3" /> Cutoff {formatNumber(game.config.cutoff)}
            </Badge>
            <Badge variant="outline">
              <Trophy className="size-3" /> {game.rounds.length} round
              {game.rounds.length === 1 ? '' : 's'}
            </Badge>
          </div>
        </div>
        <p className="mt-2 max-w-lg text-[14px] leading-relaxed text-muted">
          Eligible players are ranked by ascending score — lowest is best. Eliminated
          players stay on the board, marked out, with their full round history.
        </p>

        <Tabs value={tab} onValueChange={setTab} className="mt-6">
          <TabsList>
            <TabsTrigger value="standings">
              <ListOrdered className="mr-1.5 size-3.5" /> Standings
            </TabsTrigger>
            <TabsTrigger value="rounds">
              <History className="mr-1.5 size-3.5" /> Round log
            </TabsTrigger>
          </TabsList>

          <TabsContent value="standings">
            <StandingsList
              rows={standings}
              cutoff={game.config.cutoff}
              championId={championId}
              showCutoffBar
              accentIndexOf={accentIndexOf}
            />
            <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
              <p className="rounded-xl border border-line/70 bg-bg-soft/50 px-3.5 py-3 text-[11px] leading-relaxed text-muted">
                <span className="font-medium text-ink-soft">How ranking works:</span> lowest
                cumulative score first. Eligible players always rank above eliminated ones.
              </p>
              <p className="rounded-xl border border-line/70 bg-bg-soft/50 px-3.5 py-3 text-[11px] leading-relaxed text-muted">
                <span className="font-medium text-ink-soft">The cutoff:</span> after a
                finalized round, the highest score at or above{' '}
                {formatNumber(game.config.cutoff)} is knocked out.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="rounds">
            {rounds.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line/80 px-5 py-10 text-center">
                <History className="mx-auto size-6 text-faint" />
                <p className="mt-3 text-sm font-medium text-ink">No rounds finalized yet</p>
                <p className="mt-1 text-[12px] text-muted">
                  Completed rounds and their score breakdowns will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {rounds.map((round, index) => (
                  <RoundHistoryCard
                    key={round.id}
                    round={round}
                    names={names}
                    latest={index === 0}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <p className="mt-6 text-[11px] leading-relaxed text-faint">
          Round history is saved in this browser on this device. Discarding the game
          deletes it.
        </p>
      </div>
    </ScreenShell>
  )
}
