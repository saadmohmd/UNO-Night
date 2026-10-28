import { useState } from 'react'
import { ArrowRight, Flag, Swords, Trophy, Users } from 'lucide-react'
import { GameHeader } from '@/components/game/GameHeader'
import { PlayerAvatar } from '@/components/PlayerAvatar'
import { ScreenShell } from '@/components/AppHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { latestRound } from '@/game/selectors'
import type { GameState } from '@/game/types'
import { formatNumber } from '@/lib/utils'

export function DecisionScreen({
  game,
  onContinueWithTwo,
  onEndGameDecision,
  onDashboard,
  onLeaderboard,
  onEndGame,
  onReset,
  onTransfer,
  onImport,
  readOnly = false,
}: {
  game: GameState
  onContinueWithTwo: () => void
  onEndGameDecision: () => void
  onDashboard: () => void
  onLeaderboard: () => void
  onEndGame: () => void
  onReset: () => void
  onTransfer?: () => void
  onImport?: () => void
  readOnly?: boolean
}) {
  const [continueOpen, setContinueOpen] = useState(false)
  const [endOpen, setEndOpen] = useState(false)
  if (!game.decision) return null

  const active = game.decision.activePlayerIds
    .map((id) => game.players.find((player) => player.id === id))
    .filter((player): player is NonNullable<typeof player> => Boolean(player))
  const leader = [...active].sort((a, b) => a.cumulativeScore - b.cumulativeScore)[0]
  const last = latestRound(game)
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
          <Users className="size-3" /> Controller decision
        </Badge>
        <h1 className="mt-3 font-display text-3xl leading-tight font-semibold tracking-[-0.03em] text-ink sm:text-4xl">
          Two players remain.
        </h1>
        <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-muted">
          A standard UNO Night game needs 3–7 players. With only two eligible players
          left, the table has to decide how the night ends — the app won't quietly
          bend the rule.
        </p>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {active.map((player) => (
            <div
              key={player.id}
              className="flex items-center gap-3 rounded-2xl border border-line/75 bg-surface/55 px-4 py-3"
            >
              <PlayerAvatar name={player.name} index={accentIndexOf(player.id)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{player.name}</p>
                <p className="text-[11px] text-muted">
                  {leader?.id === player.id ? 'Lowest score remaining' : 'Still eligible'}
                </p>
              </div>
              <span className="font-display text-xl font-semibold text-ink tabular-nums">
                {formatNumber(player.cumulativeScore)}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-line/80 bg-surface/60 p-4">
            <span className="flex size-10 items-center justify-center rounded-xl border border-uno-blue/25 bg-uno-blue/10 text-uno-blue">
              <Swords className="size-5" />
            </span>
            <h2 className="mt-3 font-display text-lg font-semibold text-ink">Play on with two</h2>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
              Waive the 3-player minimum for this game and keep scoring. The house
              rule stays on until the night ends.
            </p>
            <Button
              className="mt-4 w-full"
              onClick={() => setContinueOpen(true)}
              disabled={readOnly}
            >
              Continue with 2 <ArrowRight className="size-4" />
            </Button>
          </div>
          <div className="rounded-2xl border border-line/80 bg-surface/60 p-4">
            <span className="flex size-10 items-center justify-center rounded-xl border border-line bg-surface-2 text-ink-soft">
              <Flag className="size-5" />
            </span>
            <h2 className="mt-3 font-display text-lg font-semibold text-ink">End the game</h2>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
              Record final standings now. The lowest remaining score wins if it is
              unique; otherwise the game ends with an unresolved tie.
            </p>
            <Button
              variant="secondary"
              className="mt-4 w-full"
              onClick={() => setEndOpen(true)}
              disabled={readOnly}
            >
              End game
            </Button>
          </div>
        </div>

        {last && (
          <section className="mt-6 rounded-2xl border border-line/75 bg-bg-soft/50 p-4">
            <h2 className="text-[13px] font-semibold text-ink">
              Round {last.roundNumber} set this up
            </h2>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
              {last.winnerName} won the round.
              {last.eliminations.length > 0 && (
                <>
                  {' '}
                  {last.eliminations
                    .map((elimination) => elimination.playerName)
                    .join(', ')}{' '}
                  was knocked out at{' '}
                  {formatNumber(last.eliminations[0].cumulativeScore)} points
                  {last.eliminations[0].via === 'cutoff' ? ' at the cutoff' : ' after a tie-break'}.
                </>
              )}
            </p>
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

      <ConfirmDialog
        open={continueOpen}
        onOpenChange={setContinueOpen}
        title="Play on with two players?"
        description="This waives the 3-player minimum for the rest of this game. Rounds will be scored exactly as before."
        confirmLabel="Continue with 2"
        onConfirm={() => {
          setContinueOpen(false)
          onContinueWithTwo()
        }}
      >
        <div className="rounded-xl border border-uno-yellow/25 bg-uno-yellow/[0.06] px-3.5 py-3 text-[11px] leading-relaxed text-uno-yellow">
          House rule · the table must agree. The lowest score still wins the night.
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={endOpen}
        onOpenChange={setEndOpen}
        title="End the game now?"
        description="Final standings will be recorded and the session will close. If the two remaining scores are equal, the result stays unresolved unless the table declares a champion."
        confirmLabel="End game"
        tone="danger"
        onConfirm={() => {
          setEndOpen(false)
          onEndGameDecision()
        }}
      />
    </ScreenShell>
  )
}
