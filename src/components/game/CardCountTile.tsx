import { useEffect, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { CARD_DEFS, type CardKey } from '@/game/cards'
import { parseCardCount } from '@/game/validation'
import { cn } from '@/lib/utils'

const TONES: Record<CardKey, { chip: string; text: string }> = {
  n0: { chip: 'bg-uno-blue/15 text-uno-blue border-uno-blue/25', text: 'text-uno-blue' },
  n1: { chip: 'bg-uno-red/15 text-uno-red border-uno-red/25', text: 'text-uno-red' },
  n2: { chip: 'bg-uno-green/15 text-uno-green border-uno-green/25', text: 'text-uno-green' },
  n3: { chip: 'bg-uno-yellow/15 text-uno-yellow border-uno-yellow/25', text: 'text-uno-yellow' },
  n4: { chip: 'bg-uno-blue/15 text-uno-blue border-uno-blue/25', text: 'text-uno-blue' },
  n5: { chip: 'bg-uno-red/15 text-uno-red border-uno-red/25', text: 'text-uno-red' },
  n6: { chip: 'bg-uno-green/15 text-uno-green border-uno-green/25', text: 'text-uno-green' },
  n7: { chip: 'bg-uno-yellow/15 text-uno-yellow border-uno-yellow/25', text: 'text-uno-yellow' },
  n8: { chip: 'bg-uno-blue/15 text-uno-blue border-uno-blue/25', text: 'text-uno-blue' },
  n9: { chip: 'bg-uno-red/15 text-uno-red border-uno-red/25', text: 'text-uno-red' },
  skip: { chip: 'bg-uno-red/15 text-uno-red border-uno-red/25', text: 'text-uno-red' },
  reverse: { chip: 'bg-uno-green/15 text-uno-green border-uno-green/25', text: 'text-uno-green' },
  draw2: { chip: 'bg-uno-yellow/15 text-uno-yellow border-uno-yellow/25', text: 'text-uno-yellow' },
  wild: {
    chip:
      'border-white/15 text-ink [background:linear-gradient(120deg,rgba(255,95,99,0.28),rgba(255,207,77,0.24),rgba(61,220,140,0.24),rgba(89,160,255,0.28))]',
    text: 'text-ink',
  },
  wild4: {
    chip:
      'border-white/15 text-ink [background:linear-gradient(120deg,rgba(89,160,255,0.26),rgba(255,95,99,0.26),rgba(255,207,77,0.22),rgba(61,220,140,0.26))]',
    text: 'text-ink',
  },
}

export function CardCountTile({
  card,
  count,
  playerName,
  onChange,
  onIncrement,
  disabled = false,
}: {
  card: CardKey
  count: number
  playerName: string
  onChange: (value: number) => void
  onIncrement: (delta: number) => void
  disabled?: boolean
}) {
  const definition = CARD_DEFS[card]
  const tone = TONES[card]
  const [draft, setDraft] = useState(String(count))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (Number(draft) !== count) {
      setDraft(String(count))
      setError(null)
    }
    // The draft is intentionally only reconciled when the committed count changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count])

  function commit(raw: string) {
    setDraft(raw)
    const parsed = parseCardCount(raw)
    if (parsed.ok && parsed.value !== null) {
      setError(null)
      if (parsed.value !== count) onChange(parsed.value)
    } else {
      setError(parsed.error)
    }
  }

  function handleBlur() {
    setDraft(String(count))
    setError(null)
  }

  const label = `${definition.label} count for ${playerName}`

  return (
    <div
      className={cn(
        'rounded-xl border bg-surface-2/35 p-2.5 transition-colors',
        error ? 'border-uno-red/50' : 'border-line/70',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              'flex h-6 min-w-7 items-center justify-center rounded-md border px-1.5 text-[10px] font-bold',
              tone.chip,
            )}
            aria-hidden="true"
          >
            {definition.short}
          </span>
          <span className="truncate text-[10px] text-faint">{definition.value} pts</span>
        </div>
        <span className={cn('text-[10px] font-semibold tabular-nums', count > 0 ? tone.text : 'text-faint')}>
          ×{count}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onIncrement(-1)}
          disabled={disabled || count <= 0}
          aria-label={`Remove one ${definition.label} from ${playerName}`}
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-lg border border-line bg-bg/40 text-ink-soft',
            'transition-colors hover:border-line-soft hover:bg-surface-3 hover:text-ink',
            'disabled:opacity-30 disabled:hover:bg-bg/40',
          )}
        >
          <Minus className="size-4" />
        </button>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          enterKeyHint="done"
          maxLength={2}
          disabled={disabled}
          aria-label={label}
          aria-invalid={Boolean(error)}
          value={draft}
          onChange={(event) => commit(event.target.value)}
          onFocus={(event) => {
            const input = event.currentTarget
            requestAnimationFrame(() => input.select())
          }}
          onBlur={handleBlur}
          className={cn(
            'h-10 w-full min-w-0 rounded-lg border border-line/60 bg-bg/50 text-center text-base font-semibold text-ink tabular-nums',
            'transition-colors focus:border-brand/50 focus:bg-bg/80 focus:outline-none focus:ring-2 focus:ring-brand/15',
            error && 'border-uno-red/60',
          )}
        />
        <button
          type="button"
          onClick={() => onIncrement(1)}
          disabled={disabled || count >= 99}
          aria-label={`Add one ${definition.label} to ${playerName}`}
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-lg border border-line bg-bg/40 text-ink-soft',
            'transition-colors hover:border-line-soft hover:bg-surface-3 hover:text-ink',
            'disabled:opacity-30 disabled:hover:bg-bg/40',
          )}
        >
          <Plus className="size-4" />
        </button>
      </div>
      {error && (
        <p className="mt-1 text-[10px] text-uno-red" role="status">
          {error}
        </p>
      )}
    </div>
  )
}
