import { useState } from 'react'
import {
  ArrowRight,
  Gavel,
  Scale,
  Swords,
  Trophy,
} from 'lucide-react'
import { GameHeader } from '@/components/game/GameHeader'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { ScreenShell } from '@/components/AppHeader'
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
import { findRoundById } from '@/game/selectors'
import type { GameState } from '@/game/types'
import { cn, formatNumber } from '@/lib/utils'

export function TieBreakScreen({
  game,
  onReplay,
  onManualResolve,
  onDashboard,
  onLeaderboard,
  onEndGame,
  onReset,
  onTransfer,
  onImport,
  readOnly = false,
}: {
  game: GameState
  onReplay: () => void
  onManualResolve: (playerId: string, note: string | null) => void
  onDashboard: () => void
  onLeaderboard: () => void
  onEndGame: () => void
  onReset: () => void
  onTransfer?: () => void
  onImport?: () => void
  readOnly?: boolean
}) {
  const [manualOpen, setManualOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [note, setNote] = useState('')

  if (!game.tieBreak) return null
  const tiedPlayers = game.tieBreak.playerIds
    .map((id) => game.players.find((player) => player.id === id))
    .filter((player): player is NonNullable<typeof player> => Boolean(player))
  const sourceRound = findRoundById(game, game.tieBreak.sourceRoundId)
  const accentIndexOf = (playerId: string) =>
    Math.max(0, game.players.findIndex((player) => player.id === playerId))

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
        <Badge variant="yellow">
          <Scale className="size-3" /> Tie at the cutoff
        </Badge>
        <h1 className="mt-3 font-display text-3xl leading-tight font-semibold tracking-[-0.03em] text-ink sm:text-4xl">
          Too close to call.
        </h1>
        <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-muted">
          After round {game.tieBreak.sourceRoundNumber},{' '}
          {tiedPlayers.map((player) => player.name).join(' and ')} are tied at the top
          with {formatNumber(game.tieBreak.score)} points. That meets the{' '}
          {formatNumber(game.config?.cutoff ?? 0)}-point cutoff, so nobody is picked
          automatically.
        </p>

        <div className="mt-5 space-y-2">
          {tiedPlayers.map((player) => (
            <div
              key={player.id}
              className="flex items-center gap-3 rounded-2xl border border-uno-yellow/25 bg-uno-yellow/[0.05] px-4 py-3"
            >
              <PlayerAvatar name={player.name} index={accentIndexOf(player.id)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{player.name}</p>
                <p className="text-[11px] text-muted">Tied for the highest score</p>
              </div>
              <span className="font-display text-2xl font-semibold text-uno-yellow tabular-nums">
                {formatNumber(player.cumulativeScore)}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-line/80 bg-surface/60 p-4">
            <span className="flex size-10 items-center justify-center rounded-xl border border-brand/25 bg-brand/10 text-brand">
              <Swords className="size-5" />
            </span>
            <h2 className="mt-3 font-display text-lg font-semibold text-ink">Sudden-death replay</h2>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
              The tied players play one more hand. Lowest penalty survives; the highest
              penalty is knocked out. Cumulative totals stay exactly as they are.
            </p>
            <Button className="mt-4 w-full" onClick={onReplay} disabled={readOnly}>
              Play tie-break hand <ArrowRight className="size-4" />
            </Button>
          </div>
          <div className="rounded-2xl border border-line/80 bg-surface/60 p-4">
            <span className="flex size-10 items-center justify-center rounded-xl border border-line bg-surface-2 text-ink-soft">
              <Gavel className="size-5" />
            </span>
            <h2 className="mt-3 font-display text-lg font-semibold text-ink">Table decision</h2>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
              Already settled it another way? Record who is out. The app never picks
              for you and no scores are changed.
            </p>
            <Button
              variant="secondary"
              className="mt-4 w-full"
              onClick={() => setManualOpen(true)}
              disabled={readOnly}
            >
              Resolve manually
            </Button>
          </div>
        </div>

        {sourceRound && (
          <section className="mt-6 rounded-2xl border border-line/75 bg-bg-soft/50 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-ink">
                How round {sourceRound.roundNumber} ended
              </h2>
              <span className="text-[11px] text-faint">
                {sourceRound.winnerName} went out first
              </span>
            </div>
            <ul className="mt-2 divide-y divide-line/50">
              {sourceRound.lines.map((line) => (
                <li key={line.playerId} className="flex items-center justify-between py-1.5 text-xs">
                  <span className={line.isWinner ? 'text-uno-green' : 'text-ink-soft'}>
                    {line.name}
                  </span>
                  <span className="tabular-nums text-muted">
                    +{formatNumber(line.penalty)} → {formatNumber(line.newTotal)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <button
          type="button"
          onClick={onLeaderboard}
          className="mt-4 inline-flex items-center gap-1.5 text-[12px] text-muted transition-colors hover:text-ink"
        >
          <Trophy className="size-3.5 text-brand" /> View leaderboard
        </button>
      </div>

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Settle the tie manually</DialogTitle>
            <DialogDescription>
              Choose who is knocked out. Only use this when the table has already
              agreed on the outcome — the result will be recorded in the round.
            </DialogDescription>
          </DialogHeader>

          <fieldset className="mt-4">
            <legend className="text-[11px] font-semibold tracking-wide text-muted uppercase">
              Who is out?
            </legend>
            <div className="mt-2 space-y-2">
              {tiedPlayers.map((player) => {
                const isSelected = selected === player.id
                return (
                  <label
                    key={player.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors',
                      isSelected
                        ? 'border-uno-red/40 bg-uno-red/[0.07]'
                        : 'border-line bg-surface-2/40 hover:border-line-soft',
                    )}
                  >
                    <input
                      type="radio"
                      name="tie-break-out"
                      value={player.id}
                      checked={isSelected}
                      onChange={() => setSelected(player.id)}
                      className="peer sr-only"
                      aria-label={`${player.name} is knocked out`}
                    />
                    <PlayerAvatar name={player.name} index={accentIndexOf(player.id)} size="sm" />
                    <span className="flex-1 text-sm font-medium text-ink">{player.name}</span>
                    <span className="text-xs tabular-nums text-muted">
                      {formatNumber(player.cumulativeScore)} pts
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          <div className="mt-4">
            <Label htmlFor="tie-note">
              How was it settled? <span className="text-faint normal-case">(optional)</span>
            </Label>
            <Textarea
              id="tie-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={200}
              placeholder="High card, coin toss, rematch…"
              className="mt-2 min-h-20"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setManualOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!selected}
              onClick={() => {
                if (!selected) return
                const chosen = selected
                setManualOpen(false)
                setSelected(null)
                setNote('')
                onManualResolve(chosen, note.trim() || null)
              }}
            >
              Knock out {tiedPlayers.find((player) => player.id === selected)?.name ?? 'player'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScreenShell>
  )
}
