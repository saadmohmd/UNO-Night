import { useState } from 'react'
import {
  Flag,
  Home,
  Plus,
  Scale,
  Sparkles,
  Trophy,
} from 'lucide-react'
import { AppHeader, ScreenShell, StickyActionBar } from '@/components/AppHeader'
import { Brand } from '@/components/Brand'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { StandingsList } from '@/components/game/StandingsList'
import { StatTile } from '@/components/StatTile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { buildStandings, buildFinalSummary } from '@/game/rules'
import type { EndingVia, GameState } from '@/game/types'
import { cn, formatNumber, ordinal } from '@/lib/utils'

const VIA_COPY: Record<EndingVia, string> = {
  'last-standing': 'Last player under the cutoff.',
  'controller-end': 'The table ended the game after reaching the minimum-player limit.',
  'manual-end': 'The game was ended by the table.',
  declared: 'Champion declared by the table.',
}

export function FinalScreen({
  game,
  onDeclareChampion,
  onNewGame,
  onHome,
}: {
  game: GameState
  onDeclareChampion: (playerId: string) => void
  onNewGame: () => void
  onHome: () => void
}) {
  const [declareOpen, setDeclareOpen] = useState(false)
  const [pick, setPick] = useState<string | null>(null)
  const [newGameOpen, setNewGameOpen] = useState(false)
  const [homeOpen, setHomeOpen] = useState(false)

  if (!game.config) return null
  const summary = buildFinalSummary(game)
  const standings = buildStandings(game.players, game.rounds)
  const champion = summary.champion
  const accentIndexOf = (playerId: string) => game.players.findIndex((player) => player.id === playerId)
  const tiedIds = game.ending?.namedPlayerIds ?? []
  const tiedPlayers = game.players.filter((player) => tiedIds.includes(player.id))

  return (
    <ScreenShell
      header={
        <AppHeader>
          <Badge variant="outline">
            <Flag className="size-3" /> Final
          </Badge>
        </AppHeader>
      }
    >
      <div className="animate-rise">
        <div className="flex items-center justify-center">
          {champion ? (
            <div className="relative">
              <div className="absolute inset-0 -z-10 animate-sheen rounded-full bg-brand/25 blur-2xl" />
              <div className="flex size-20 items-center justify-center rounded-3xl border border-brand/30 bg-brand/[0.1] text-brand">
                <Trophy className="size-10" />
              </div>
            </div>
          ) : (
            <div className="flex size-20 items-center justify-center rounded-3xl border border-uno-yellow/30 bg-uno-yellow/[0.08] text-uno-yellow">
              <Scale className="size-10" />
            </div>
          )}
        </div>

        <div className="mt-5 text-center">
          <Badge variant={champion ? 'brand' : 'yellow'} className="mx-auto">
            <Sparkles className="size-3" />
            {champion ? 'Game complete' : 'Unresolved tie'}
          </Badge>
          <h1 className="mt-3 font-display text-[2.2rem] leading-[1.04] font-semibold tracking-[-0.035em] text-ink sm:text-5xl">
            {champion ? (
              <>
                {champion.name} takes{' '}
                <br />
                <span className="text-brand">the night.</span>
              </>
            ) : (
              <>
                Dead heat{' '}
                <br />
                <span className="text-uno-yellow">at the end.</span>
              </>
            )}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-[14px] leading-relaxed text-muted">
            {champion ? (
              <>
                {game.config.name ? `${game.config.name} · ` : ''}
                {summary.completedRounds} round{summary.completedRounds === 1 ? '' : 's'} played ·{' '}
                {game.ending ? VIA_COPY[game.ending.via] : ''}
              </>
            ) : (
              <>
                The game ended with the leaders level. No champion has been declared —
                the results below are final until the table records a decision.
              </>
            )}
          </p>
        </div>

        {!champion && tiedPlayers.length > 0 && (
          <div className="mt-5 rounded-2xl border border-uno-yellow/25 bg-uno-yellow/[0.05] p-4">
            <p className="text-[10px] font-semibold tracking-[0.18em] text-uno-yellow uppercase">
              Tied leaders
            </p>
            <div className="mt-2 space-y-2">
              {tiedPlayers.map((player) => (
                <div key={player.id} className="flex items-center gap-3">
                  <PlayerAvatar name={player.name} index={accentIndexOf(player.id)} size="sm" />
                  <span className="flex-1 text-sm font-medium text-ink">{player.name}</span>
                  <span className="font-display text-lg font-semibold text-ink tabular-nums">
                    {formatNumber(player.cumulativeScore)}
                  </span>
                </div>
              ))}
            </div>
            <Button className="mt-3.5 w-full" onClick={() => setDeclareOpen(true)}>
              <Trophy className="size-4" /> Declare a champion
            </Button>
            <p className="mt-2 text-center text-[10px] leading-relaxed text-faint">
              Only use this if the table has agreed. The decision is recorded as final.
            </p>
          </div>
        )}

        <div className="mt-6 grid grid-cols-3 gap-2.5">
          <StatTile label="Rounds" value={summary.completedRounds} hint="Finalized" />
          <StatTile
            label="Final score"
            value={champion ? formatNumber(champion.cumulativeScore) : '—'}
            hint={champion ? 'Lowest total' : 'Unresolved'}
          />
          <StatTile label="Cutoff" value={formatNumber(game.config.cutoff)} hint="Points" />
        </div>

        <section className="mt-7">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.2em] text-brand uppercase">
                Final standings
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold tracking-tight text-ink">
                Where the night landed
              </h2>
            </div>
            <span className="text-[11px] text-faint">
              {game.players.length} players
            </span>
          </div>
          <StandingsList
            rows={standings}
            cutoff={game.config.cutoff}
            championId={champion?.id ?? null}
            showHistory
            accentIndexOf={accentIndexOf}
          />
        </section>

        <section className="mt-7">
          <h2 className="mb-3 font-display text-xl font-semibold tracking-tight text-ink">
            Elimination order
          </h2>
          {summary.eliminationOrder.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line/80 px-4 py-5 text-center text-sm text-muted">
              No one was knocked out — the game ended early.
            </p>
          ) : (
            <ol className="space-y-2">
              {summary.eliminationOrder.map((player) => (
                <li
                  key={player.id}
                  className="flex items-center gap-3 rounded-xl border border-line/60 bg-surface/40 px-3.5 py-2.5"
                >
                  <span className="w-5 text-center font-display text-xs font-semibold text-faint">
                    {ordinal(player.eliminationOrder ?? 0)}
                  </span>
                  <PlayerAvatar name={player.name} index={accentIndexOf(player.id)} size="sm" />
                  <span className={cn('flex-1 text-[13px]', player.eliminated ? 'text-muted' : 'text-ink')}>
                    {player.name}
                  </span>
                  <span className="text-[11px] text-faint">
                    Round {player.eliminatedAtRound ?? '—'} ·{' '}
                    <span className="text-muted">{formatNumber(player.cumulativeScore)} pts</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
          {champion && (
            <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-uno-green">
              <Trophy className="size-3" /> {champion.name} survived to the end.
            </p>
          )}
        </section>

        <div className="mt-8 rounded-2xl border border-line/70 bg-bg-soft/50 p-4">
          <div className="flex items-center gap-2">
            <Brand />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            This result is saved in this browser on this device. Nothing was uploaded and
            no account was created. Starting a new game or returning home deletes the
            saved result.
          </p>
        </div>
      </div>

      <StickyActionBar>
        <Button variant="secondary" size="lg" onClick={() => setHomeOpen(true)} className="px-3 sm:px-5">
          <Home className="size-4" />
          <span className="hidden sm:inline">Home</span>
        </Button>
        <div className="flex-1" />
        <Button size="lg" onClick={() => setNewGameOpen(true)}>
          <Plus className="size-4" /> New game
        </Button>
      </StickyActionBar>

      <Dialog
        open={declareOpen}
        onOpenChange={(open) => {
          setDeclareOpen(open)
          if (!open) setPick(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Declare a champion?</DialogTitle>
            <DialogDescription>
              The scores are tied. Only record a champion if the table has agreed on
              how the tie was settled. This becomes part of the final result.
            </DialogDescription>
          </DialogHeader>

          <fieldset className="mt-4">
            <legend className="text-[11px] font-semibold tracking-wide text-muted uppercase">
              Champion
            </legend>
            <div className="mt-2 space-y-2">
              {tiedPlayers.map((player) => {
                const selected = pick === player.id
                return (
                  <label
                    key={player.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors',
                      selected
                        ? 'border-brand/40 bg-brand/[0.07]'
                        : 'border-line bg-surface-2/40 hover:border-line-soft',
                    )}
                  >
                    <input
                      type="radio"
                      name="declared-champion"
                      value={player.id}
                      checked={selected}
                      onChange={() => setPick(player.id)}
                      className="peer sr-only"
                      aria-label={`${player.name} is the champion`}
                    />
                    <PlayerAvatar name={player.name} index={accentIndexOf(player.id)} size="sm" />
                    <span className="flex-1 text-sm font-medium text-ink">{player.name}</span>
                    <span className="text-xs text-muted tabular-nums">
                      {formatNumber(player.cumulativeScore)} pts
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclareOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!pick}
              onClick={() => {
                if (!pick) return
                const chosen = pick
                setDeclareOpen(false)
                setPick(null)
                onDeclareChampion(chosen)
              }}
            >
              <Trophy className="size-4" /> Record champion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={newGameOpen}
        onOpenChange={setNewGameOpen}
        title="Start a new game?"
        description="This deletes the saved result from this device, then opens game setup for a fresh table."
        confirmLabel="New game"
        tone="danger"
        onConfirm={() => {
          setNewGameOpen(false)
          onNewGame()
        }}
      />

      <ConfirmDialog
        open={homeOpen}
        onOpenChange={setHomeOpen}
        title="Return home?"
        description="This deletes the saved result from this device. The standings will be gone."
        confirmLabel="Return home"
        tone="danger"
        onConfirm={() => {
          setHomeOpen(false)
          onHome()
        }}
      />
    </ScreenShell>
  )
}
