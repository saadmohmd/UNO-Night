import {
  Flag,
  LayoutDashboard,
  Lock,
  MoreVertical,
  QrCode,
  ScanLine,
  Trash2,
  Trophy,
} from 'lucide-react'
import { AppHeader } from '@/components/AppHeader'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { GameState } from '@/game/types'

export function GameHeader({
  game,
  onDashboard,
  onLeaderboard,
  onEndGame,
  onReset,
  onTransfer,
  onImport,
  readOnly = false,
}: {
  game: GameState
  onDashboard: () => void
  onLeaderboard: () => void
  onEndGame: () => void
  onReset: () => void
  onTransfer?: () => void
  onImport?: () => void
  /** True once this game has been handed over: the copy here is frozen. */
  readOnly?: boolean
}) {
  const roundNumber = game.currentRound?.roundNumber ?? game.rounds.length
  const isTieBreak = game.currentRound?.kind === 'tie-break'
  const roundLabel = isTieBreak
    ? 'Tie-break'
    : game.currentRound
      ? `Round ${roundNumber}`
      : game.rounds.length > 0
        ? `R${game.rounds.length} done`
        : 'Ready'
  return (
    <AppHeader onBrandClick={onDashboard}>
      <div className="flex items-center gap-1">
        {readOnly ? (
          <Badge variant="yellow">
            <Lock className="size-3" /> Read-only
          </Badge>
        ) : (
          <Badge
            variant={isTieBreak ? 'yellow' : 'neutral'}
            className="hidden tabular-nums min-[380px]:inline-flex"
          >
            {roundLabel}
          </Badge>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Game menu">
              <MoreVertical className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{game.config?.name || 'This game'}</DropdownMenuLabel>
            <p className="px-2 pb-1.5 text-[10px] leading-relaxed text-faint">
            {readOnly
              ? 'Transferred — frozen read-only copy'
              : 'Saved automatically on this device'}
          </p>
            <DropdownMenuItem onSelect={onDashboard}>
              <LayoutDashboard className="size-4" /> Dashboard
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onLeaderboard}>
              <Trophy className="size-4" /> Leaderboard
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {onTransfer && (
              <DropdownMenuItem onSelect={onTransfer} disabled={readOnly}>
                <QrCode className="size-4" /> Transfer game
              </DropdownMenuItem>
            )}
            {onImport && (
              <DropdownMenuItem onSelect={onImport}>
                <ScanLine className="size-4" /> Import game
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={onEndGame} disabled={game.phase !== 'active' || readOnly}>
              <Flag className="size-4" /> End game
            </DropdownMenuItem>
            <DropdownMenuItem destructive onSelect={onReset}>
              <Trash2 className="size-4" /> Discard game
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </AppHeader>
  )
}
