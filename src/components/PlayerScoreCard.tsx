import { Crown } from 'lucide-react'
import { formatPenaltyBreakdown, penaltyBreakdown, totalCards, type RemainingCards } from '@/game/cards'
import { accentClasses, accentForIndex, cn, formatNumber } from '@/lib/utils'
import { PlayerAvatar } from './PlayerAvatar'
import { Badge } from './ui/badge'

export interface PlayerScoreCardProps {
  name: string
  index: number
  counts: RemainingCards
  penalty: number
  previousTotal: number
  newTotal: number
  isWinner: boolean
  showTotals?: boolean
  showBreakdown?: boolean
  className?: string
}

/** Reusable card-by-card calculation card used for review, approval and results. */
export function PlayerScoreCard({
  name,
  index,
  counts,
  penalty,
  previousTotal,
  newTotal,
  isWinner,
  showTotals = true,
  showBreakdown = true,
  className,
}: PlayerScoreCardProps) {
  const accent = accentClasses[accentForIndex(index)]
  const lines = penaltyBreakdown(counts)
  const cards = totalCards(counts)

  return (
    <div
      className={cn(
        'rounded-2xl border bg-surface/60 p-4',
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
            {cards === 0 ? 'No cards left' : `${cards} card${cards === 1 ? '' : 's'} left`}
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

      {showBreakdown && (
        <div className="mt-3 rounded-xl bg-bg/40 px-3 py-2.5">
          {lines.length === 0 ? (
            <p className="text-xs text-muted">No remaining cards recorded.</p>
          ) : (
            <ul className="space-y-1">
              {lines.map((line) => (
                <li key={line.key} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="text-ink-soft">
                    {line.short} <span className="text-faint">× {line.count}</span>
                  </span>
                  <span className="tabular-nums text-muted">
                    {line.count} × {line.value} ={' '}
                    <span className="font-medium text-ink-soft">{line.subtotal}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {isWinner && (
            <p className="mt-2 border-t border-line/60 pt-2 text-[11px] leading-relaxed text-uno-green/90">
              Round winner — penalty locked at 0{cards > 0 ? ` despite ${formatPenaltyBreakdown(counts)} in hand.` : '.'}
            </p>
          )}
        </div>
      )}

      {showTotals && (
        <div className="mt-2.5 flex items-center justify-between text-xs">
          <span className="text-faint">Cumulative</span>
          <span className="tabular-nums text-muted">
            {formatNumber(previousTotal)}{' '}
            <span className="text-faint">+ {penalty} →</span>{' '}
            <span className="font-semibold text-ink">{formatNumber(newTotal)}</span>
          </span>
        </div>
      )}
    </div>
  )
}
