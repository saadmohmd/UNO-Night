import { Crown, Trophy } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import type { StandingRow } from '@/game/rules'
import { cn, formatNumber, ordinal } from '@/lib/utils'

export interface StandingsListProps {
  rows: StandingRow[]
  cutoff?: number
  championId?: string | null
  showHistory?: boolean
  showCutoffBar?: boolean
  emptyLabel?: string
  showLeadBadge?: boolean
  className?: string
}

export function StandingsList({
  rows,
  cutoff,
  championId,
  showHistory = true,
  showCutoffBar = false,
  emptyLabel = 'No players yet.',
  showLeadBadge = true,
  className,
  accentIndexOf,
}: StandingsListProps & { accentIndexOf?: (playerId: string) => number }) {
  if (rows.length === 0) {
    return (
      <p className={cn('rounded-xl border border-dashed border-line/80 px-4 py-6 text-center text-sm text-muted', className)}>
        {emptyLabel}
      </p>
    )
  }

  return (
    <ul className={cn('space-y-2', className)}>
      {rows.map(({ player, rank, tiedOnScore, history }, index) => {
        const isChampion = championId === player.id
        const isLeader = !player.eliminated && rank === 1
        const atCutoff = cutoff !== undefined && player.cumulativeScore >= cutoff
        const playedHistory = history.filter((entry) => entry.penalty !== null)
        return (
          <li
            key={player.id}
            className={cn(
              'rounded-2xl border bg-surface/60 px-4 py-3',
              // An eliminated row slides in and stays muted, so a fresh
              // knockout reads even when the splash has been dismissed.
              player.eliminated && 'animate-strike',
              isChampion
                ? 'border-brand/45 bg-brand/[0.06]'
                : player.eliminated
                  ? 'border-line/50 opacity-70'
                  : 'border-line/75',
            )}
          >
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'w-5 shrink-0 text-center font-display text-sm font-semibold tabular-nums',
                  player.eliminated ? 'text-faint' : 'text-muted',
                )}
              >
                {player.eliminated ? '–' : rank}
              </span>
              <PlayerAvatar
                name={player.name}
                index={accentIndexOf ? accentIndexOf(player.id) : index}
                dimmed={player.eliminated}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={cn(
                      'truncate text-[15px] font-medium',
                      player.eliminated ? 'strike-name text-muted' : 'text-ink',
                    )}
                  >
                    {player.name}
                  </span>
                  {isChampion && (
                    <Badge variant="brand">
                      <Trophy className="size-3" /> Champion
                    </Badge>
                  )}
                  {showLeadBadge && isLeader && !isChampion && (
                    <Badge variant={tiedOnScore ? 'outline' : 'green'}>
                      <Crown className="size-3" />
                      {tiedOnScore ? 'Tied lead' : 'Leading'}
                    </Badge>
                  )}
                  {player.eliminated && (
                    <Badge variant="red" className="animate-pop">
                      Out · R{player.eliminatedAtRound ?? '—'}
                    </Badge>
                  )}
                  {!player.eliminated && atCutoff && (
                    <Badge variant="yellow">At the line</Badge>
                  )}
                </div>
                {showHistory && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {playedHistory.length === 0 ? (
                      <span className="text-[11px] text-faint">
                        {player.eliminated ? 'No scored rounds' : 'No rounds played yet'}
                      </span>
                    ) : (
                      playedHistory.map((entry) => (
                        <span
                          key={entry.roundNumber}
                          className="rounded-md bg-bg/50 px-1.5 py-0.5 text-[10px] text-muted tabular-nums"
                        >
                          R{entry.roundNumber} +{entry.penalty} → {formatNumber(entry.newTotal ?? 0)}
                        </span>
                      ))
                    )}
                  </div>
                )}
              </div>
              <div className="text-right">
                <div
                  className={cn(
                    'font-display text-2xl leading-none font-semibold tabular-nums',
                    player.eliminated ? 'text-muted' : isChampion ? 'text-brand' : 'text-ink',
                  )}
                >
                  {formatNumber(player.cumulativeScore)}
                </div>
                <div className="mt-1 text-[9px] font-semibold tracking-[0.16em] text-faint uppercase">
                  {isChampion ? 'final' : 'points'}
                </div>
              </div>
            </div>

            {player.eliminated && player.eliminationOrder !== null && (
              <p className="mt-2 text-[11px] text-faint">
                Knocked out in round {player.eliminatedAtRound ?? '—'} ·{' '}
                {player.eliminationOrder === 1 ? 'first' : `${ordinal(player.eliminationOrder)}`} out
                at {formatNumber(player.cumulativeScore)} points.
              </p>
            )}

            {showCutoffBar && cutoff !== undefined && !player.eliminated && (
              <div className="mt-2.5 flex items-center gap-2">
                <Progress
                  value={player.cumulativeScore}
                  max={cutoff}
                  className="h-1"
                  indicatorClassName={cn(
                    atCutoff ? 'bg-uno-red' : 'bg-gradient-to-r from-uno-blue to-uno-green',
                  )}
                  label={`${player.name}'s score towards the ${cutoff} point cutoff`}
                />
                <span className={cn('shrink-0 text-[10px] tabular-nums', atCutoff ? 'text-uno-red' : 'text-faint')}>
                  {formatNumber(player.cumulativeScore)}/{formatNumber(cutoff)}
                </span>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
