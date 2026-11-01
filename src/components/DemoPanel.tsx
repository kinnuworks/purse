import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Loader2 } from 'lucide-react'
import { DEMO_PRIZE_USDC } from '@/lib/env'
import { runDemo, type DemoEvent, type DemoStep } from '@/lib/demo-client'
import { DEMO_TITLE, deriveState } from '@/lib/purse-state'
import type { PurseData } from '@/lib/data'
import { useNow } from '@/lib/hooks'
import { Button, Money, Notice, TxLink } from './ui'

const STEP_LABEL: Record<DemoStep, string> = {
  check: 'Checking the limits',
  approve: 'Approving 0.01 USDC for the purse',
  create: 'Creating the purse',
  lock: 'Locking the prize',
  name: 'Naming the winner',
  deliver: 'Delivering the prize',
}

interface StepRow {
  step: DemoStep
  status: 'pending' | 'done'
  hash?: string
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/

export function DemoPanel({ purses }: { purses: PurseData[] | undefined }) {
  const [winner, setWinner] = useState('')
  const [rows, setRows] = useState<StepRow[]>([])
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [finishedId, setFinishedId] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const now = useNow()

  const trimmed = winner.trim()
  const invalid = trimmed !== '' && !ADDRESS.test(trimmed)

  const onEvent = (event: DemoEvent) => {
    if (event.type === 'step') {
      setRows((prev) => {
        const without = prev.filter((r) => r.step !== event.step)
        return [...without, { step: event.step, status: event.status, hash: event.hash ?? prev.find((r) => r.step === event.step)?.hash }]
      })
    } else if (event.type === 'done') {
      setFinishedId(event.id)
    } else {
      setMessage(event.message)
    }
  }

  const start = async () => {
    setRunning(true)
    setRows([])
    setMessage(null)
    setFinishedId(null)
    setUnavailable(false)
    const outcome = await runDemo(trimmed, onEvent)
    if (outcome.kind === 'unavailable') setUnavailable(true)
    setRunning(false)
  }

  const latestFinished = purses?.find((p) => p.title === DEMO_TITLE && deriveState(p, now) === 'Paid out')

  return (
    <section className="mt-10 rounded-xl border border-ink/15 p-5" aria-labelledby="try-heading">
      <h2 id="try-heading" className="font-display text-lg font-semibold tracking-tight">
        Try it with a real cent
      </h2>
      <p className="mt-1 max-w-prose text-sm leading-relaxed opacity-75 text-pretty">
        This runs a real {DEMO_PRIZE_USDC} USDC prize on Arc: create, lock, name the winner, deliver. One run a minute, 50 a day, and one run per winner
        address.
      </p>

      <label htmlFor="demo-winner" className="mt-4 block text-sm font-medium">
        Winner address <span className="font-normal opacity-60">(optional)</span>
      </label>
      <input
        id="demo-winner"
        value={winner}
        onChange={(e) => setWinner(e.target.value)}
        placeholder="0x… leave empty to use the demo wallet's second address"
        spellCheck={false}
        autoComplete="off"
        className="mt-1 min-h-11 w-full rounded-lg border border-ink/25 px-3 font-mono text-sm placeholder:font-sans placeholder:opacity-50"
        aria-invalid={invalid}
      />
      {invalid && <p className="mt-1 text-sm">That is not a full Arc wallet address.</p>}

      <Button className="mt-3 w-full sm:w-auto" disabled={running || invalid} onClick={() => void start()}>
        {running ? (
          <>
            <Loader2 size={16} className="animate-spin" aria-hidden /> Running…
          </>
        ) : (
          'Run a real prize'
        )}
      </Button>

      {rows.length > 0 && (
        <ol className="mt-4 space-y-2 text-sm" aria-live="polite">
          {rows.map((row) => (
            <li key={row.step} className="flex flex-wrap items-center gap-x-2">
              {row.status === 'done' ? <Check size={16} className="text-lock" aria-hidden /> : <Loader2 size={16} className="animate-spin" aria-hidden />}
              <span>{STEP_LABEL[row.step]}</span>
              {row.hash && <TxLink hash={row.hash} label="View transaction" />}
            </li>
          ))}
        </ol>
      )}

      {finishedId && (
        <p className="mt-4 text-sm font-medium text-lock">
          Paid out.{' '}
          <Link to={`/p/${finishedId}`} className="underline underline-offset-2">
            Open the purse
          </Link>
        </p>
      )}
      {message && (
        <div className="mt-4">
          <Notice strong>{message}</Notice>
        </div>
      )}

      {unavailable && (
        <div className="mt-4">
          <Notice>
            The live demo is not available right now. {latestFinished ? 'Here is the latest finished demo purse:' : 'No finished demo purse has been recorded yet.'}
          </Notice>
          {latestFinished && (
            <Link to={`/p/${latestFinished.id}`} className="mt-2 flex items-center justify-between rounded-lg border border-ink/15 px-4 py-3 text-sm hover:border-ink">
              <span>
                {latestFinished.title} <span className="opacity-60">#{latestFinished.id.toString()}</span>
              </span>
              <Money raw={latestFinished.pool} />
            </Link>
          )}
        </div>
      )}
    </section>
  )
}
