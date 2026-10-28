import { Crown } from 'lucide-react'
import { accentClasses, accentForIndex, cn, formatNumber } from '@/lib/utils'
import { PlayerAvatar } from './PlayerAvatar'
import { Badge } from './ui/badge'

export interface PlayerScoreCardProps {
  name: string
  index: number
  /** Points added by this round (always 0 for the winner). */
  penalty: number
  previousTotal: number
  newTotal: number
  isWinner: boolean
  /** Hidden for tie-break hands, which never touch cumulative scores. */
  showTotals?: boolean
  className?: string
}

/** One player's line in a recorded round: penalty, then the new cumulative score. */
export function PlayerScoreCard({
  name,
  index,
  penalty,
  previousTotal,
  newTotal,
  isWinner,
  showTotals = true,
  className,
}: PlayerScoreCardProps) {
  const accent = accentClasses[accentForIndex(index)]

  return (
    <div
      className={cn(
        'rounded-2xl border bg-surface/60 px-4 py-3',
        isWinner ? 'border-uno-green/35 bg-uno-green/[0.06]' : 'border-line/70',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <PlayerAvatar name={name} index={index} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium text-ink">{name}</span>
            {isWinner && (
              <Badge variant="green" className="shrink-0">
                <Crown className="size-3" /> Winner
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {isWinner ? 'Round winner — 0 points' : 'Penalty points this round'}
          </p>
        </div>
        <div className="text-right">
          <div
            className={cn(
              'font-display text-2xl font-semibold tabular-nums',
              isWinner ? 'text-uno-green' : accent.text,
            )}
          >
            +{formatNumber(penalty)}
          </div>
          <div className="text-[10px] font-semibold tracking-widest text-faint uppercase">
            {isWinner ? 'zero penalty' : 'penalty'}
          </div>
        </div>
      </div>

      {showTotals && (
        <div className="mt-2.5 flex items-center justify-between border-t border-line/50 pt-2 text-xs">
          <span className="text-faint">Cumulative</span>
          <span className="tabular-nums text-muted">
            {formatNumber(previousTotal)}{' '}
            <span className="text-faint">+ {formatNumber(penalty)} →</span>{' '}
            <span className="font-semibold text-ink">{formatNumber(newTotal)}</span>
          </span>
        </div>
      )}
    </div>
  )
}
