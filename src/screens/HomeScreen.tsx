import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Crown,
  Gavel,
  HandCoins,
  ListChecks,
  ScanLine,
  Sparkles,
  Users,
} from 'lucide-react'
import { Brand } from '@/components/Brand'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { APP_VERSION } from '@/config'
import { cn } from '@/lib/utils'

function FanCard({
  label,
  points,
  className,
  tone,
}: {
  label: string
  points: string
  className: string
  tone: 'red' | 'yellow' | 'green' | 'blue' | 'wild'
}) {
  const toneClass = {
    red: 'bg-uno-red text-[#2b0709] border-white/25',
    yellow: 'bg-uno-yellow text-[#2b2205] border-white/25',
    green: 'bg-uno-green text-[#042416] border-white/25',
    blue: 'bg-uno-blue text-[#04162b] border-white/25',
    wild:
      'text-white border-white/25 [background:conic-gradient(from_210deg,#ff5f63,#ffcf4d,#3ddc8c,#59a0ff,#ff5f63)]',
  }[tone]
  return (
    <div
      className={cn(
        'absolute top-2 flex h-[118px] w-[82px] flex-col justify-between rounded-2xl border-2 p-3 shadow-[0_24px_40px_-18px_rgba(0,0,0,0.9)]',
        toneClass,
        className,
      )}
      aria-hidden="true"
    >
      <span className="font-display text-3xl leading-none font-semibold">{label}</span>
      <span className="text-[8px] font-semibold tracking-[0.18em] uppercase opacity-70">{points}</span>
    </div>
  )
}

function TableFan() {
  return (
    <div className="relative mx-auto h-[170px] w-[260px]" aria-hidden="true">
      <div className="absolute inset-x-6 top-8 h-24 rounded-[50%] bg-brand/20 blur-3xl" />
      <FanCard label="7" points="7 points" tone="red" className="left-2 top-4 -rotate-[16deg] opacity-95" />
      <FanCard label="+2" points="20 points" tone="yellow" className="left-1/2 top-0 -translate-x-1/2 -rotate-[2deg]" />
      <FanCard label="Skip" points="10 points" tone="green" className="right-2 top-5 rotate-[14deg] opacity-95" />
      <div className="absolute -right-1 bottom-0 flex size-11 items-center justify-center rounded-full border border-brand/30 bg-[#0c1526] text-brand shadow-xl">
        <Sparkles className="size-5" />
      </div>
    </div>
  )
}

const steps = [
  {
    icon: Users,
    title: 'Seat the table',
    body: 'Add 3–7 players and set the knockout cutoff.',
    tone: 'text-uno-blue border-uno-blue/25 bg-uno-blue/10',
  },
  {
    icon: ListChecks,
    title: 'Log each hand',
    body: 'Type each player’s penalty points after every round.',
    tone: 'text-uno-yellow border-uno-yellow/25 bg-uno-yellow/10',
  },
  {
    icon: Gavel,
    title: 'Survive the cutoff',
    body: 'The highest score at the line is out each round.',
    tone: 'text-uno-red border-uno-red/25 bg-uno-red/10',
  },
]

const scoring = [
  { label: '0–9', value: 'face value', tone: 'text-uno-blue' },
  { label: 'Skip / Reverse', value: '10 pts', tone: 'text-uno-yellow' },
  { label: 'Draw Two', value: '20 pts', tone: 'text-uno-green' },
  { label: 'Wild / +4', value: '40 pts', tone: 'text-uno-red' },
]

export function HomeScreen({ onNewGame, onImport }: { onNewGame: () => void; onImport: () => void }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 left-1/2 h-[420px] w-[520px] -translate-x-1/2 rounded-full bg-uno-blue/10 blur-[110px]" />
        <div className="absolute right-[-120px] bottom-[-80px] h-[360px] w-[360px] rounded-full bg-uno-red/8 blur-[110px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,201,77,0.06),transparent_45%)]" />
      </div>

      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 pt-6 sm:pt-8">
        <Brand />
        <Badge variant="outline" className="hidden sm:inline-flex">
          v{APP_VERSION}
        </Badge>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 pb-12">
        <section className="animate-rise pt-10 sm:pt-14">
          <div className="flex flex-col items-center text-center">
            <Badge variant="brand" className="mb-6">
              <BadgeCheck className="size-3" /> Single-device game companion
            </Badge>
            <TableFan />
            <h1 className="mt-6 font-display text-[2.6rem] leading-[1.02] font-semibold tracking-[-0.035em] text-ink sm:text-6xl">
              Track the night,{' '}
              <br />
              <span className="text-brand">not the math.</span>
            </h1>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted sm:text-base">
              One phone on the table. Accurate UNO scores, no card-by-card maths and a
              knockout cutoff — without paper, arguments or accounts.
            </p>
            <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
              <Button size="lg" onClick={onNewGame} className="group w-full text-base">
                New Game
                <ArrowRight className="size-5 transition-transform group-hover:translate-x-0.5" />
              </Button>
              <Button size="lg" variant="outline" onClick={onImport} className="w-full">
                <ScanLine className="size-4" /> Import game
              </Button>
              <p className="text-center text-[11px] leading-relaxed text-faint">
                Take over a game from another phone with a QR code or a game file.
              </p>
              <div className="flex items-center justify-center gap-2.5 text-[11px] text-faint">
                <span className="inline-flex items-center gap-1">
                  <Users className="size-3.5" /> 3–7 players
                </span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1">
                  <HandCoins className="size-3.5" /> No accounts
                </span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1">
                  <Crown className="size-3.5" /> No backend
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-16 grid gap-3 sm:mt-20 sm:grid-cols-3">
          {steps.map((step, index) => (
            <div
              key={step.title}
              className="rounded-2xl border border-line/70 bg-surface/50 p-4"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <div
                className={cn(
                  'flex size-9 items-center justify-center rounded-xl border',
                  step.tone,
                )}
              >
                <step.icon className="size-4" />
              </div>
              <h2 className="mt-3 font-display text-base font-semibold text-ink">
                <span className="mr-1.5 text-faint">0{index + 1}</span>
                {step.title}
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{step.body}</p>
            </div>
          ))}
        </section>

        <section className="mt-10 rounded-2xl border border-line/70 bg-bg-soft/60 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-base font-semibold text-ink">House scoring</h2>
            <span className="text-[11px] text-faint">Official point values · winner scores zero</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {scoring.map((item) => (
              <div key={item.label} className="rounded-xl border border-line/60 bg-surface/50 px-3 py-2.5">
                <p className={cn('text-[11px] font-semibold', item.tone)}>{item.label}</p>
                <p className="mt-0.5 text-[13px] font-medium text-ink-soft">{item.value}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-auto pt-12 text-center text-[11px] leading-relaxed text-faint">
          <p>
            The game is saved in this browser on this device — close the tab, come back
            and the table is exactly where you left it. No data ever leaves this device.
          </p>
          <p className="mt-2 inline-flex items-center gap-1 text-muted">
            Built for tables that play the real thing
            <ArrowUpRight className="size-3" />
          </p>
        </footer>
      </main>
    </div>
  )
}
