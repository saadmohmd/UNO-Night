import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  Gavel,
  Lock,
  Plus,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react'
import { AppHeader, ScreenShell, StickyActionBar } from '@/components/AppHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  DEFAULT_CUTOFF,
  MAX_PLAYERS,
  MAX_NAME_LENGTH,
  MIN_PLAYERS,
  cleanName,
  normalizeName,
  validateCutoff,
  validateRoster,
} from '@/game/validation'
import { cn } from '@/lib/utils'

export interface SetupDetails {
  names: string[]
  name: string
  cutoff: number
}

const CUTOFF_PRESETS = [100, 200, 300, 500]

export function SetupScreen({
  onStart,
  onBack,
}: {
  onStart: (details: SetupDetails) => void
  onBack: () => void
}) {
  const [gameName, setGameName] = useState('')
  const [names, setNames] = useState<string[]>(['', '', ''])
  const [cutoffRaw, setCutoffRaw] = useState(String(DEFAULT_CUTOFF))
  const [attempted, setAttempted] = useState(false)
  const [blurred, setBlurred] = useState<Set<number>>(new Set())
  const [cutoffBlurred, setCutoffBlurred] = useState(false)
  const [focusIndex, setFocusIndex] = useState<number | null>(null)

  const nameRefs = useRef<Array<HTMLInputElement | null>>([])
  const cutoffRef = useRef<HTMLInputElement | null>(null)
  const addButtonRef = useRef<HTMLButtonElement | null>(null)

  const roster = validateRoster(names)
  const cutoff = validateCutoff(cutoffRaw)
  const valid = roster.ok && cutoff.ok

  useEffect(() => {
    if (focusIndex !== null) {
      nameRefs.current[focusIndex]?.focus()
      setFocusIndex(null)
    }
  }, [focusIndex])

  function addPlayer() {
    if (names.length >= MAX_PLAYERS) return
    setFocusIndex(names.length)
    setNames((current) => [...current, ''])
  }

  function removePlayer(index: number) {
    if (names.length <= MIN_PLAYERS) return
    setNames((current) => current.filter((_, i) => i !== index))
    setBlurred(new Set())
    // Keep focus sensible after removing a row.
    const nextFocus = Math.min(index, names.length - 2)
    requestAnimationFrame(() => nameRefs.current[nextFocus]?.focus())
  }

  function updateName(index: number, value: string) {
    setNames((current) => current.map((name, i) => (i === index ? value : name)))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAttempted(true)
    if (!roster.ok || !cutoff.ok || cutoff.value === null) {
      const invalidIndex = names.findIndex((name) => {
        const cleaned = cleanName(name)
        return cleaned.length === 0
      })
      const duplicateIndex = Object.keys(roster.errors.byIndex)
        .map(Number)
        .sort((a, b) => a - b)[0]
      if (!cutoff.ok) cutoffRef.current?.focus()
      else if (duplicateIndex !== undefined) nameRefs.current[duplicateIndex]?.focus()
      else if (invalidIndex >= 0) nameRefs.current[invalidIndex]?.focus()
      return
    }
    onStart({
      names: names.map(cleanName),
      name: cleanName(gameName),
      cutoff: cutoff.value,
    })
  }

  const generalErrors = Array.from(new Set(roster.errors.general))
  const showCutoffError = Boolean(cutoff.error) && (cutoffBlurred || attempted || cutoffRaw.trim().length > 0)

  function nameError(index: number): string | null {
    const message = roster.errors.byIndex[index]
    if (!message) return null
    const shouldShow =
      attempted ||
      blurred.has(index) ||
      names[index].trim().length > 0 ||
      message.toLowerCase().includes('duplicate')
    return shouldShow ? message : null
  }

  return (
    <ScreenShell
      header={<AppHeader />}
    >
      <div className="animate-rise">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-lg py-1 text-[13px] font-medium text-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-4" /> Back
          </button>
          <Badge variant="outline">
            <Lock className="size-3" /> Setup
          </Badge>
        </div>

        <h1 className="mt-5 font-display text-3xl leading-tight font-semibold tracking-[-0.03em] text-ink sm:text-4xl">
          Set up the table
        </h1>
        <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-muted">
          Seat 3–7 players and choose the knockout line. The roster locks the
          moment you start.
        </p>

        <form id="setup-form" onSubmit={handleSubmit} className="mt-7 space-y-4" noValidate>
          <section className="rounded-2xl border border-line/80 bg-surface/60 p-5">
            <div className="flex items-center justify-between">
              <Label htmlFor="game-name">
                Game name <span className="text-faint normal-case">(optional)</span>
              </Label>
              <Sparkles className="size-4 text-faint" />
            </div>
            <Input
              id="game-name"
              value={gameName}
              maxLength={40}
              onChange={(event) => setGameName(event.target.value)}
              placeholder="Friday night table"
              className="mt-2"
              autoComplete="off"
            />
          </section>

          <section className="rounded-2xl border border-line/80 bg-surface/60 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users className="size-4 text-brand" />
                <Label>Players</Label>
              </div>
              <span className="text-[11px] font-medium text-muted tabular-nums">
                {names.length} / {MAX_PLAYERS}
              </span>
            </div>
            <p className="mt-1.5 text-[13px] text-muted">
              Names must be unique. Add up to {MAX_PLAYERS} people.
            </p>

            <div className="mt-4 space-y-2.5">
              {names.map((name, index) => {
                const error = nameError(index)
                const duplicate = error?.toLowerCase().includes('duplicate')
                return (
                  <div key={index}>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'flex size-9 shrink-0 items-center justify-center rounded-lg border text-xs font-semibold tabular-nums',
                          index === 0 && 'border-uno-red/25 bg-uno-red/10 text-uno-red',
                          index === 1 && 'border-uno-yellow/25 bg-uno-yellow/10 text-uno-yellow',
                          index === 2 && 'border-uno-green/25 bg-uno-green/10 text-uno-green',
                          index === 3 && 'border-uno-blue/25 bg-uno-blue/10 text-uno-blue',
                          index > 3 && 'border-line bg-surface-2 text-muted',
                        )}
                        aria-hidden="true"
                      >
                        {index + 1}
                      </span>
                      <Input
                        ref={(element) => {
                          nameRefs.current[index] = element
                        }}
                        value={name}
                        onChange={(event) => updateName(index, event.target.value)}
                        onBlur={() =>
                          setBlurred((current) => new Set(current).add(index))
                        }
                        aria-label={`Player ${index + 1} name`}
                        placeholder={`Player ${index + 1}`}
                        maxLength={MAX_NAME_LENGTH}
                        autoComplete="off"
                        autoCapitalize="words"
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? `player-${index}-error` : undefined}
                        className={cn('flex-1', error && 'border-uno-red/50')}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove player ${index + 1}`}
                        onClick={() => removePlayer(index)}
                        disabled={names.length <= MIN_PLAYERS}
                        className="text-muted hover:text-uno-red disabled:opacity-25"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    {error && (
                      <p
                        id={`player-${index}-error`}
                        className={cn(
                          'mt-1.5 ml-11 text-xs',
                          duplicate ? 'text-uno-yellow' : 'text-uno-red',
                        )}
                      >
                        {duplicate ? 'That name is already at the table.' : error}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-line/60 pt-4">
              <p className="text-[11px] leading-relaxed text-faint">
                {names.length >= MAX_PLAYERS
                  ? 'The table is full.'
                  : `${MIN_PLAYERS} minimum · ${MAX_PLAYERS} maximum`}
              </p>
              <Button
                ref={addButtonRef}
                variant="secondary"
                size="sm"
                onClick={addPlayer}
                disabled={names.length >= MAX_PLAYERS}
              >
                <Plus className="size-4" /> Add player
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-line/80 bg-surface/60 p-5">
            <div className="flex items-center gap-2">
              <Gavel className="size-4 text-brand" />
              <Label htmlFor="cutoff">Score cutoff</Label>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              After each finalized round, the highest cumulative score at or above
              this line is knocked out. Lowest score survives.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <div className="relative flex-1">
                <Input
                  id="cutoff"
                  ref={cutoffRef}
                  inputMode="numeric"
                  value={cutoffRaw}
                  maxLength={6}
                  onChange={(event) => setCutoffRaw(event.target.value.replace(/[^0-9]/g, ''))}
                  onFocus={(event) => {
                    const input = event.currentTarget
                    requestAnimationFrame(() => input.select())
                  }}
                  onBlur={() => setCutoffBlurred(true)}
                  aria-invalid={showCutoffError}
                  aria-describedby="cutoff-help"
                  className="pr-16 tabular-nums"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-[11px] font-semibold tracking-wider text-faint uppercase">
                  points
                </span>
              </div>
              <span className="text-sm text-faint">pts</span>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {CUTOFF_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setCutoffRaw(String(preset))}
                  aria-pressed={cutoffRaw === String(preset)}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                    cutoffRaw === String(preset)
                      ? 'border-brand/40 bg-brand/12 text-brand'
                      : 'border-line bg-surface-2/50 text-muted hover:border-line-soft hover:text-ink',
                  )}
                >
                  {preset}
                </button>
              ))}
            </div>
            <p id="cutoff-help" className="mt-2.5 text-[11px] leading-relaxed text-faint">
              Example at 200: 199 stays in — 200 is out.
            </p>
            {showCutoffError && (
              <p className="mt-1.5 text-xs text-uno-red">{cutoff.error}</p>
            )}
          </section>

          {attempted && !valid && (
            <div
              role="alert"
              className="flex gap-3 rounded-xl border border-uno-red/25 bg-uno-red/[0.07] p-3.5 text-[13px] text-ink-soft"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-uno-red" />
              <div>
                <p className="font-medium text-ink">A few things need attention</p>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-muted">
                  {generalErrors.length > 0 && generalErrors.map((error) => <li key={error}>{error}</li>)}
                  {!roster.ok && generalErrors.length === 0 && (
                    <li>Fix the highlighted player names.</li>
                  )}
                  {!cutoff.ok && <li>{cutoff.error}</li>}
                </ul>
              </div>
            </div>
          )}
        </form>
      </div>

      <StickyActionBar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] text-faint">
            {valid
              ? `${names.length} players · cutoff ${cutoff.value}`
              : 'Complete the setup to start.'}
          </p>
          <p className="mt-0.5 truncate text-xs font-medium text-ink-soft">
            {normalizeName(gameName) ? gameName : 'Game session on this device'}
          </p>
        </div>
        <Button type="submit" form="setup-form" size="lg" className="min-w-36">
          Start game
        </Button>
      </StickyActionBar>
    </ScreenShell>
  )
}
