import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { AlertCircle, X } from 'lucide-react'
import { HomeScreen } from '@/screens/HomeScreen'
import { SetupScreen, type SetupDetails } from '@/screens/SetupScreen'
import { DashboardScreen } from '@/screens/DashboardScreen'
import { ScoreEntryScreen } from '@/screens/ScoreEntryScreen'
import { RoundResultsScreen } from '@/screens/RoundResultsScreen'
import { LeaderboardScreen } from '@/screens/LeaderboardScreen'
import { TieBreakScreen } from '@/screens/TieBreakScreen'
import { DecisionScreen } from '@/screens/DecisionScreen'
import { FinalScreen } from '@/screens/FinalScreen'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { createInitialGameState, gameStoreReducer } from '@/game/reducer'
import type { GameAction, GameStore } from '@/game/reducer'
import { resolveScreen, type Screen } from '@/game/selectors'
import { useBeforeUnload } from '@/hooks/useBeforeUnload'
import { createId } from '@/lib/id'

const initialState: GameStore = { game: createInitialGameState(), error: null }

export default function App() {
  const [store, rawDispatch] = useReducer(gameStoreReducer, initialState)
  const [route, setRoute] = useState<Screen>('home')
  const [confirm, setConfirm] = useState<'end-game' | 'reset' | null>(null)
  const { game, error } = store
  const screen = resolveScreen(game, route)
  const isActive = game.phase === 'active'

  useBeforeUnload(isActive)

  const dispatch = useCallback(
    (action: GameAction) => {
      rawDispatch(action)
    },
    [rawDispatch],
  )

  useEffect(() => {
    if (!error) return
    const timer = window.setTimeout(() => rawDispatch({ type: 'DISMISS_ERROR' }), 6000)
    return () => window.clearTimeout(timer)
  }, [error, rawDispatch])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [screen])

  useEffect(() => {
    const round = game.currentRound?.roundNumber ?? game.rounds.length
    const suffix = game.phase === 'active' && round > 0 ? `Round ${round} · ` : ''
    document.title =
      screen === 'home' || screen === 'setup'
        ? 'UNO Night — Score Tracker'
        : `${suffix}UNO Night`
  }, [game.currentRound, game.rounds.length, game.phase, screen])

  const goDashboard = () => setRoute('dashboard')
  const goLeaderboard = () => setRoute('leaderboard')
  const goResults = () => setRoute('results')

  const requireName =
    game.currentRound?.participants
      .map((id) => game.players.find((player) => player.id === id)?.name)
      .filter(Boolean)
      .join(', ') ?? ''

  const activeCount = useMemo(
    () => game.players.filter((player) => !player.eliminated).length,
    [game.players],
  )

  function startGame(details: SetupDetails) {
    dispatch({
      type: 'START_GAME',
      payload: {
        players: details.names.map((name) => ({ id: createId('player'), name })),
        name: details.name,
        cutoff: details.cutoff,
        at: Date.now(),
      },
    })
    setRoute('dashboard')
  }

  function beginRound() {
    dispatch({ type: 'BEGIN_ROUND', at: Date.now() })
    setRoute('entry')
  }

  function startTieBreak() {
    dispatch({ type: 'START_TIE_BREAK_REPLAY' })
    setRoute('entry')
  }

  function resolveTieManually(playerId: string, note: string | null) {
    dispatch({ type: 'RESOLVE_TIE_BREAK_MANUAL', playerId, note, at: Date.now() })
    setRoute('dashboard')
  }

  function continueWithTwo() {
    dispatch({ type: 'CONTINUE_WITH_TWO_PLAYERS' })
    setRoute('dashboard')
  }

  function endGameFromDecision() {
    dispatch({ type: 'END_GAME', at: Date.now(), via: 'controller-end' })
    setRoute('final')
  }

  function discardRound() {
    const kind = game.currentRound?.kind
    dispatch({ type: 'DISCARD_ROUND' })
    setRoute(kind === 'tie-break' ? 'tiebreak' : 'dashboard')
  }

  /** A confirmed round is recorded immediately; show its results. */
  function showRoundResults() {
    setRoute('results')
  }

  function endGame() {
    setConfirm(null)
    dispatch({ type: 'END_GAME', at: Date.now(), via: 'manual-end' })
    setRoute('final')
  }

  function resetGame() {
    setConfirm(null)
    dispatch({ type: 'RESET_GAME' })
    setRoute('home')
  }

  function newGameFromFinal() {
    dispatch({ type: 'RESET_GAME' })
    setRoute('setup')
  }

  function homeFromFinal() {
    dispatch({ type: 'RESET_GAME' })
    setRoute('home')
  }

  function declareChampion(playerId: string) {
    dispatch({ type: 'DECLARE_CHAMPION', playerId, at: Date.now() })
  }

  const gameChrome = {
    game,
    dispatch,
    onDashboard: goDashboard,
    onLeaderboard: goLeaderboard,
    onResults: goResults,
    onEndGame: () => setConfirm('end-game'),
    onReset: () => setConfirm('reset'),
  }

  return (
    <div className="relative min-h-dvh">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="accent-line fixed inset-x-0 top-0 h-px opacity-70" />
        <div className="absolute inset-0 bg-[radial-gradient(75%_55%_at_50%_-10%,rgba(89,160,255,0.09),transparent_70%),radial-gradient(45%_40%_at_100%_100%,rgba(255,95,99,0.05),transparent_70%)]" />
      </div>

      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-brand-ink"
      >
        Skip to content
      </a>

      <div id="main-content">
        {screen === 'home' && <HomeScreen onNewGame={() => setRoute('setup')} />}

        {screen === 'setup' && (
          <SetupScreen onStart={startGame} onBack={() => setRoute('home')} />
        )}

        {screen === 'dashboard' && (
          <DashboardScreen
            {...gameChrome}
            onBeginRound={beginRound}
            onDashboard={goDashboard}
            onLeaderboard={goLeaderboard}
          />
        )}

        {screen === 'entry' && (
          <ScoreEntryScreen
            {...gameChrome}
            onDiscardRound={discardRound}
            onRoundConfirmed={showRoundResults}
          />
        )}

        {screen === 'results' && (
          <RoundResultsScreen {...gameChrome} onNextRound={beginRound} />
        )}

        {screen === 'leaderboard' && (
          <LeaderboardScreen
            game={game}
            onDashboard={goDashboard}
            onEndGame={() => setConfirm('end-game')}
            onReset={() => setConfirm('reset')}
          />
        )}

        {screen === 'tiebreak' && (
          <TieBreakScreen
            {...gameChrome}
            onReplay={startTieBreak}
            onManualResolve={resolveTieManually}
          />
        )}

        {screen === 'decision' && (
          <DecisionScreen
            {...gameChrome}
            onContinueWithTwo={continueWithTwo}
            onEndGameDecision={endGameFromDecision}
          />
        )}

        {screen === 'final' && (
          <FinalScreen
            game={game}
            onDeclareChampion={declareChampion}
            onNewGame={newGameFromFinal}
            onHome={homeFromFinal}
          />
        )}
      </div>

      {error && (
        <div
          className="fixed inset-x-0 bottom-24 z-50 mx-auto w-full max-w-md px-4"
          role="alert"
          aria-live="assertive"
        >
          <div className="flex items-start gap-3 rounded-xl border border-uno-red/30 bg-[#1b0e13] px-4 py-3 shadow-2xl">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-uno-red" />
            <p className="flex-1 text-[13px] leading-relaxed text-ink-soft">{error.message}</p>
            <button
              type="button"
              onClick={() => rawDispatch({ type: 'DISMISS_ERROR' })}
              className="rounded-md p-0.5 text-faint transition-colors hover:text-ink"
              aria-label="Dismiss message"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirm === 'end-game'}
        onOpenChange={(open) => setConfirm(open ? 'end-game' : null)}
        title="End this game?"
        description={
          game.currentRound
            ? 'The current round entry will be discarded. Final standings are recorded by lowest eligible score; if the leaders are tied the result stays unresolved.'
            : 'Final standings are recorded by lowest eligible score. If the leaders are tied, the result stays unresolved until the table declares a champion.'
        }
        confirmLabel="End game"
        tone="danger"
        onConfirm={endGame}
      >
        <div className="rounded-xl border border-line bg-surface/60 px-3.5 py-3 text-[11px] leading-relaxed text-muted">
          {game.rounds.length} round{game.rounds.length === 1 ? '' : 's'} completed ·{' '}
          {activeCount} eligible player{activeCount === 1 ? '' : 's'}
          {requireName ? ` · currently recording ${requireName}` : ''}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm === 'reset'}
        onOpenChange={(open) => setConfirm(open ? 'reset' : null)}
        title="Reset this game?"
        description="The current game will be lost. Every player, score, round and elimination is removed from this device immediately. This cannot be undone."
        confirmLabel="Reset game"
        tone="danger"
        onConfirm={resetGame}
      />
    </div>
  )
}
