import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { AlertCircle, History, TriangleAlert, X } from 'lucide-react'
import { HomeScreen } from '@/screens/HomeScreen'
import { SetupScreen, type SetupDetails } from '@/screens/SetupScreen'
import { DashboardScreen } from '@/screens/DashboardScreen'
import { ScoreEntryScreen } from '@/screens/ScoreEntryScreen'
import { RoundResultsScreen } from '@/screens/RoundResultsScreen'
import { LeaderboardScreen } from '@/screens/LeaderboardScreen'
import { TieBreakScreen } from '@/screens/TieBreakScreen'
import { DecisionScreen } from '@/screens/DecisionScreen'
import { FinalScreen } from '@/screens/FinalScreen'
import { TransferScreen } from '@/screens/TransferScreen'
import { TransferredRoundScreen } from '@/screens/TransferredRoundScreen'
import { ImportScreen } from '@/screens/ImportScreen'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { createInitialGameState, gameStoreReducer } from '@/game/reducer'
import type { GameAction, GameStore } from '@/game/reducer'
import { clearSavedGame, loadSavedGame, saveGame, type LoadResult } from '@/game/persistence'
import { resolveScreen, type Screen } from '@/game/selectors'
import { useBeforeUnload } from '@/hooks/useBeforeUnload'
import { createId } from '@/lib/id'
import type { GameState } from '@/game/types'
import { cn, formatTime } from '@/lib/utils'

/** Reads this device's saved game once, before the first render. */
function restoreStore(saved: LoadResult): GameStore {
  return {
    game: saved.status === 'restored' ? saved.game : createInitialGameState(),
    error: null,
  }
}

const SAVE_BLOCKED = 'This browser is blocking local storage, so this game cannot be saved.'

export default function App() {
  const [boot] = useState<LoadResult>(() => loadSavedGame())
  const [store, rawDispatch] = useReducer(gameStoreReducer, boot, restoreStore)
  const [route, setRoute] = useState<Screen>('home')
  const [confirm, setConfirm] = useState<'end-game' | 'reset' | null>(null)
  const [restoredAt, setRestoredAt] = useState<number | null>(
    boot.status === 'restored' ? boot.savedAt : null,
  )
  const [restoreError, setRestoreError] = useState<string | null>(
    boot.status === 'discarded' ? boot.reason : null,
  )
  const [saveError, setSaveError] = useState<string | null>(
    boot.status === 'unavailable' ? SAVE_BLOCKED : null,
  )
  const { game, error } = store
  const screen = resolveScreen(game, route)
  const isActive = game.phase === 'active'
  /** A completed handover freezes this copy: no scoring, no round changes. */
  const readOnly = Boolean(game.transfer?.lockedAt)

  // The saved copy is now the safety net, so only warn on leaving when saving
  // is actually unavailable — otherwise the prompt would be a lie.
  useBeforeUnload(isActive && saveError !== null)

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

  // A rejected save is deleted once, after mount — never while reading it.
  useEffect(() => {
    if (boot.status === 'discarded') clearSavedGame()
  }, [boot.status])

  // Write every state change to this device. Resetting clears the slot.
  useEffect(() => {
    const result = saveGame(game)
    setSaveError(result.ok ? null : result.error)
  }, [game])

  useEffect(() => {
    if (restoredAt === null) return
    const timer = window.setTimeout(() => setRestoredAt(null), 9000)
    return () => window.clearTimeout(timer)
  }, [restoredAt])

  useEffect(() => {
    if (!restoreError) return
    const timer = window.setTimeout(() => setRestoreError(null), 14000)
    return () => window.clearTimeout(timer)
  }, [restoreError])

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
  const goImport = () => setRoute('import')

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

  /** Opens the handover screen, minting a transfer id the first time. */
  function startTransfer() {
    if (!game.transfer) {
      dispatch({ type: 'BEGIN_TRANSFER', id: createId('tx'), at: Date.now() })
    }
    setRoute('transfer')
  }

  /** Called only after the operator confirms the code from the receiving phone. */
  function markTransferred() {
    dispatch({ type: 'MARK_TRANSFERRED', at: Date.now() })
    setRoute('transfer')
  }

  /** Replaces this device's game with a validated transfer. */
  function importGame(incoming: GameState) {
    dispatch({ type: 'IMPORT_GAME', game: incoming, at: Date.now() })
    setRestoredAt(null)
    setRestoreError(null)
  }

  function endGame() {
    setConfirm(null)
    dispatch({ type: 'END_GAME', at: Date.now(), via: 'manual-end' })
    setRoute('final')
  }

  /** Discards the game in memory *and* the saved copy on this device. */
  function resetGame() {
    setConfirm(null)
    clearSavedGame()
    dispatch({ type: 'RESET_GAME' })
    setRestoredAt(null)
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

  const notice =
    saveError !== null
      ? {
          tone: 'danger' as const,
          icon: AlertCircle,
          title: 'Saving is off',
          body: saveError,
          discard: false,
        }
      : restoreError !== null
        ? {
            tone: 'warning' as const,
            icon: TriangleAlert,
            title: 'Saved game not restored',
            body: restoreError,
            discard: false,
          }
        : restoredAt !== null
          ? {
              tone: 'neutral' as const,
              icon: History,
              title: 'Saved game restored',
              body: `Picking up where you left off — saved at ${formatTime(restoredAt)}.`,
              discard: true,
            }
          : null

  const gameChrome = {
    game,
    dispatch,
    readOnly,
    onDashboard: goDashboard,
    onLeaderboard: goLeaderboard,
    onResults: goResults,
    onEndGame: () => setConfirm('end-game'),
    onReset: () => setConfirm('reset'),
    onTransfer: startTransfer,
    onImport: goImport,
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
        {screen === 'home' && (
          <HomeScreen onNewGame={() => setRoute('setup')} onImport={goImport} />
        )}

        {screen === 'setup' && (
          <SetupScreen onStart={startGame} onBack={() => setRoute('home')} />
        )}

        {screen === 'dashboard' && (
          <DashboardScreen
            {...gameChrome}
            onBeginRound={beginRound}
            onDashboard={goDashboard}
            onLeaderboard={goLeaderboard}
            onSnapshot={() => setRoute('entry')}
          />
        )}

        {screen === 'entry' &&
          (readOnly ? (
            <TransferredRoundScreen
              game={game}
              onDashboard={goDashboard}
              onLeaderboard={goLeaderboard}
              onReset={() => setConfirm('reset')}
              onImport={goImport}
            />
          ) : (
            <ScoreEntryScreen
              {...gameChrome}
              onDiscardRound={discardRound}
              onRoundConfirmed={showRoundResults}
            />
          ))}

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

        {screen === 'transfer' && (
          <TransferScreen
            {...gameChrome}
            onBack={goDashboard}
            onMarkTransferred={markTransferred}
          />
        )}

        {screen === 'import' && (
          <ImportScreen
            hasLocalGame={game.phase !== 'idle'}
            localGamePhase={game.phase}
            onImported={importGame}
            onCancel={() => setRoute(game.phase === 'idle' ? 'home' : 'dashboard')}
            onOpenGame={() => setRoute('dashboard')}
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

      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 mx-auto flex w-full max-w-md flex-col gap-2 px-4">
        {notice && (
          <div
            role={notice.tone === 'neutral' ? 'status' : 'alert'}
            aria-live="polite"
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-2xl backdrop-blur',
              notice.tone === 'danger' && 'border-uno-red/30 bg-[#1b0e13]',
              notice.tone === 'warning' && 'border-uno-yellow/30 bg-[#1d1708]',
              notice.tone === 'neutral' && 'border-line bg-bg-soft/95',
            )}
          >
            <notice.icon
              className={cn(
                'mt-0.5 size-4 shrink-0',
                notice.tone === 'danger' && 'text-uno-red',
                notice.tone === 'warning' && 'text-uno-yellow',
                notice.tone === 'neutral' && 'text-uno-blue',
              )}
            />
            <div className="flex-1">
              <p className="text-[13px] leading-snug font-medium text-ink">{notice.title}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{notice.body}</p>
              {notice.discard && (
                <button
                  type="button"
                  onClick={() => setConfirm('reset')}
                  className="mt-1.5 text-[11px] font-semibold text-uno-red underline-offset-2 hover:underline"
                >
                  Discard saved game
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setSaveError(null)
                setRestoreError(null)
                setRestoredAt(null)
              }}
              className="rounded-md p-0.5 text-faint transition-colors hover:text-ink"
              aria-label="Dismiss save notice"
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        {error && (
          <div
            role="alert"
            aria-live="assertive"
            className="pointer-events-auto flex items-start gap-3 rounded-xl border border-uno-red/30 bg-[#1b0e13] px-4 py-3 shadow-2xl"
          >
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
        )}
      </div>

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
        title="Discard this game?"
        description="This deletes the saved game from this device and clears every player, score, round and elimination. It cannot be undone."
        confirmLabel="Discard game"
        cancelLabel="Keep playing"
        tone="danger"
        onConfirm={resetGame}
      />
    </div>
  )
}
