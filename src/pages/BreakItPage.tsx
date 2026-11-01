import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Addr, Button, Notice, Skeleton, StatePill, cx } from '@/components/ui'
import { classifySimulation, planAttacks, type AttackPlan, type SimulationResult } from '@/lib/attacks'
import { publicClient } from '@/lib/chain'
import { PURSE_ADDRESS, STUDIO_PROJECT_URL } from '@/lib/env'
import { plainError, plainRevert, revertInfo } from '@/lib/errors'
import { useNow, usePurseList } from '@/lib/hooks'
import { withRetry } from '@/lib/retry'
import proof from '@/proof.json'

const reportUrl = (proof as { reportUrl?: string }).reportUrl?.trim()

/** Asks the live contract to run the call as `caller` with eth_call. Nothing is signed or sent. */
async function simulate(plan: AttackPlan): Promise<SimulationResult> {
  const t = plan.target
  if (!t || !PURSE_ADDRESS) return { outcome: 'error', message: 'There is nothing to simulate.' }
  try {
    await withRetry(() => publicClient.call({ account: t.caller, to: PURSE_ADDRESS, data: t.data }), { baseMs: 800 })
    return classifySimulation({ ok: true }, plan.expect)
  } catch (error) {
    const revert = revertInfo(error)
    return classifySimulation({ ok: false, revert: revert ? { name: revert.name, text: revert.text } : null, message: plainError(error) }, plan.expect)
  }
}

function Result({ plan, result }: { plan: AttackPlan; result: SimulationResult | 'running' }) {
  if (result === 'running') {
    return (
      <p className="mt-3 flex items-center gap-2 text-sm" role="status">
        <Loader2 size={16} className="animate-spin" aria-hidden /> Asking the live contract…
      </p>
    )
  }
  if (result.outcome === 'succeeded') {
    return (
      <div className="mt-3 rounded-lg border-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
        <p className="font-semibold">Failure: this call succeeded.</p>
        <p className="mt-1">The contract should have refused it. If you see this, please report it.</p>
      </div>
    )
  }
  if (result.outcome === 'error') {
    return (
      <p className="mt-3 text-sm" role="status">
        Could not run this one: {result.message}
      </p>
    )
  }
  return (
    <div className="mt-3 grid gap-3 rounded-lg border border-ink/15 p-3 text-sm sm:grid-cols-2" role="status">
      <div>
        <div className="text-xs font-medium uppercase tracking-wider opacity-60">The contract said</div>
        <p className="mt-1 break-all font-mono text-[0.85em]">{result.reason}</p>
        {!result.matchesExpected && (
          <p className="mt-1 text-xs">It refused, but for a different reason than expected ({plan.expect}). The purse’s state may have changed.</p>
        )}
      </div>
      <div>
        <div className="text-xs font-medium uppercase tracking-wider opacity-60">In plain words</div>
        <p className="mt-1 text-pretty">{plainRevert(result.name) ?? plan.meaning}</p>
        <p className="mt-1 text-xs opacity-70 text-pretty">{plan.meaning}</p>
      </div>
    </div>
  )
}

export default function BreakItPage() {
  const list = usePurseList()
  const now = useNow()
  const [results, setResults] = useState<Record<string, SimulationResult | 'running'>>({})

  const plans = list.data ? planAttacks(list.data, now) : []

  const run = async (plan: AttackPlan) => {
    setResults((prev) => ({ ...prev, [plan.key]: 'running' }))
    const result = await simulate(plan)
    setResults((prev) => ({ ...prev, [plan.key]: result }))
  }
  const runAll = async () => {
    for (const plan of plans) if (plan.target) await run(plan)
  }
  const anyRunnable = plans.some((p) => p.target)
  const failures = Object.values(results).filter((r) => r !== 'running' && r.outcome === 'succeeded').length

  return (
    <>
      <h1 className="font-display text-3xl font-semibold tracking-tight">Try to break it</h1>
      <p className="mt-3 max-w-prose text-pretty">
        Each row is an attack. The button asks the live contract on Arc to run it, from the address that would really try it, using a read-only call. No wallet, no transaction, no money moves. The contract’s own refusal is shown next to what it means.
      </p>
      <p className="mt-2 max-w-prose text-sm text-pretty opacity-80">
        Purses are picked from the chain so each test means something. If none fits right now, the row says so instead of pretending.
      </p>

      {!PURSE_ADDRESS && (
        <div className="mt-6">
          <Notice strong>The contract address is not set.</Notice>
        </div>
      )}

      {PURSE_ADDRESS && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button disabled={!anyRunnable} onClick={() => void runAll()}>
            Run them all
          </Button>
          {failures > 0 && <span className="text-sm font-semibold text-red-700">{failures} failed. See below.</span>}
        </div>
      )}

      {list.isLoading && (
        <div className="mt-6 space-y-3" aria-busy="true">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}
      {list.isError && (
        <div className="mt-6">
          <Notice strong>Could not read the purses from the chain. {plainError(list.error)}</Notice>
        </div>
      )}

      <ol className="mt-6 space-y-4">
        {plans.map((plan, i) => {
          const result = results[plan.key]
          const failed = result !== undefined && result !== 'running' && result.outcome === 'succeeded'
          return (
            <li key={plan.key} className={cx('rounded-xl border p-4', failed ? 'border-red-600' : 'border-ink/15')}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display text-base font-semibold tracking-tight">
                    {i + 1}. {plan.title}
                  </h2>
                  <p className="mt-1 text-sm text-pretty opacity-80">{plan.how}</p>
                </div>
                {plan.target && (
                  <Button variant="secondary" disabled={result === 'running'} onClick={() => void run(plan)}>
                    {result === undefined ? 'Simulate it' : 'Simulate again'}
                  </Button>
                )}
              </div>

              {plan.target ? (
                <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="inline opacity-60">Caller: </dt>
                    <dd className="inline">
                      {plan.target.callerLabel} <Addr address={plan.target.caller} />
                    </dd>
                  </div>
                  <div>
                    <dt className="inline opacity-60">On: </dt>
                    <dd className="inline">
                      <Link to={`/p/${plan.target.purseId}`} className="underline decoration-ink/25 underline-offset-2 hover:decoration-ink">
                        Purse #{plan.target.purseId.toString()}, {plan.target.purseTitle}
                      </Link>{' '}
                      <StatePill state={plan.target.purseState} />
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-3 text-sm font-medium">Not run: {plan.unavailable}</p>
              )}
              {plan.note && plan.target && <p className="mt-2 text-xs opacity-70 text-pretty">{plan.note}</p>}
              {result !== undefined && <Result plan={plan} result={result} />}
            </li>
          )
        })}
      </ol>

      <p className="mt-8 border-l-2 border-ink pl-3 text-sm text-pretty">
        Found a way past any of these, or something we missed? Please{' '}
        <a href={reportUrl || STUDIO_PROJECT_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
          report it
        </a>
        .
      </p>
    </>
  )
}
