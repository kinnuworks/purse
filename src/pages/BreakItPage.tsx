import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Addr, Button, Money, Notice, Skeleton, StatePill, cx } from '@/components/ui'
import { classifySimulation, planAttacks, type AttackPlan, type SimulationResult } from '@/lib/attacks'
import { publicClient } from '@/lib/chain'
import { readMinClaimWindow } from '@/lib/data'
import { PURSE_ADDRESS, STUDIO_PROJECT_URL, explorerTx } from '@/lib/env'
import { plainError, plainRevert, revertInfo } from '@/lib/errors'
import { useHistory } from '@/lib/history'
import { useNow, usePurseList } from '@/lib/hooks'
import { readProof } from '@/lib/proof-data'
import { withRetry } from '@/lib/retry'
import proof from '@/proof.json'


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
      <div className="mt-3 rounded-lg border-2 border-alert bg-plate px-4 py-3 text-alert" role="alert">
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
    <div className="mt-4 grid gap-5 border-l-2 border-rule pl-4 sm:grid-cols-2" role="status">
      <div>
        <div className="text-sm font-semibold text-soft">The contract said</div>
        <p className="mt-1 break-all t-mono">{result.reason}</p>
        {!result.matchesExpected && (
          <p className="mt-1 text-sm">It refused, but for a different reason than expected ({plan.expect}). The purse’s state may have changed.</p>
        )}
      </div>
      <div>
        <div className="text-sm font-semibold text-soft">In plain words</div>
        <p className="mt-1 text-pretty">{plainRevert(result.name) ?? plan.meaning}</p>
        <p className="mt-1 text-sm text-soft text-pretty">{plan.meaning}</p>
      </div>
    </div>
  )
}

const SWEPT_EXAMPLE_ID = 3n

function CannotStop() {
  const history = useHistory()
  const minWindow = useQuery({ queryKey: ['min-claim-window'], queryFn: readMinClaimWindow, staleTime: Infinity, enabled: PURSE_ADDRESS !== null })
  const swept = history.events.find((e) => e.name === 'Swept' && e.id === SWEPT_EXAMPLE_ID)
  const shortest = minWindow.data !== undefined ? `${minWindow.data.toString()} seconds` : 'the shortest the contract allows'
  return (
    <>
      <h2 className="mt-20 h-section">What Purse can’t stop</h2>
      <p className="mt-3 max-w-[34rem] text-pretty">These are not bugs. They are things the contract allows by design, so you should know them before you trust a purse.</p>
      <ul className="mt-4 divide-y divide-rule border-y border-rule">
        <li className="py-4 text-pretty">
          <span className="font-semibold">The organiser can name themselves as a winner.</span> The purse page flags it when they do.
        </li>
        <li className="py-4 text-pretty">
          <span className="font-semibold">The organiser can set a claim window as short as {shortest}</span>, then return an undelivered prize to themselves once it ends.
        </li>
        <li className="py-4 text-pretty">
          <span className="font-semibold">Money a sponsor added goes with it.</span> An unclaimed prize returns to the organiser, not to the sponsors.
        </li>
        <li className="py-4 text-pretty">
          <span className="font-semibold">Anyone can deliver a prize,</span> so a short claim window is only a risk if nobody delivers in time.
        </li>
      </ul>
      <p className="mt-4 max-w-[34rem] text-pretty">
        A real example is{' '}
        <Link to={`/p/${SWEPT_EXAMPLE_ID.toString()}`} className="underline decoration-ink/30 underline-offset-4 hover:text-brass hover:decoration-brass">
          purse #{SWEPT_EXAMPLE_ID.toString()}
        </Link>
        {swept && swept.name === 'Swept' ? (
          <>
            , where <Money raw={swept.amount} /> went back to the organiser after the claim window ended (
            <a href={explorerTx(swept.txHash)} target="_blank" rel="noopener noreferrer" className="underline decoration-ink/30 underline-offset-4 hover:text-brass hover:decoration-brass">
              transaction
            </a>
            ).
          </>
        ) : (
          '.'
        )}
      </p>
    </>
  )
}

export default function BreakItPage() {
  const reportUrl = readProof(proof).reportUrl
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
      <h1 className="h-headline">Try to break it</h1>
      <p className="mt-3 max-w-[34rem] text-lg text-pretty">
        Each row is an attack. The button asks the live contract on Arc to run it, from the address that would really try it, using a read-only call. No wallet, no transaction, no money moves. The contract’s own refusal is shown next to what it means.
      </p>
      <p className="mt-3 max-w-[34rem] text-pretty text-soft">
        Purses are picked from the chain so each test means something. If none fits right now, the row says so instead of pretending.
      </p>

      {!PURSE_ADDRESS && (
        <div className="mt-6">
          <Notice strong>The contract address is not set.</Notice>
        </div>
      )}

      {PURSE_ADDRESS && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button disabled={!anyRunnable} onClick={() => void runAll()}>
            Run them all
          </Button>
          {failures > 0 && <span className="font-semibold text-alert">{failures} failed. See below.</span>}
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

      <h2 className="mt-20 h-section">The attacks</h2>
      <ol className="mt-4 divide-y divide-rule border-y border-rule">
        {plans.map((plan, i) => {
          const result = results[plan.key]
          const failed = result !== undefined && result !== 'running' && result.outcome === 'succeeded'
          return (
            <li key={plan.key} className={cx('py-6', failed && 'border-l-4 border-alert pl-4')}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-display text-[22px] font-semibold leading-tight">
                    {i + 1}. {plan.title}
                  </h3>
                  <p className="mt-1 text-pretty text-soft">{plan.how}</p>
                </div>
                {plan.target && (
                  <Button variant="secondary" disabled={result === 'running'} onClick={() => void run(plan)}>
                    {result === undefined ? 'Simulate it' : 'Simulate again'}
                  </Button>
                )}
              </div>

              {plan.target ? (
                <dl className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  <div>
                    <dt className="inline text-soft">Caller: </dt>
                    <dd className="inline">
                      {plan.target.callerLabel} <Addr address={plan.target.caller} />
                    </dd>
                  </div>
                  <div>
                    <dt className="inline text-soft">On: </dt>
                    <dd className="inline">
                      <Link to={`/p/${plan.target.purseId}`} className="underline decoration-ink/30 underline-offset-4 hover:text-brass hover:decoration-brass">
                        Purse #{plan.target.purseId.toString()}, {plan.target.purseTitle}
                      </Link>{' '}
                      <StatePill state={plan.target.purseState} />
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-4 font-semibold">Not run: {plan.unavailable}</p>
              )}
              {plan.note && plan.target && <p className="mt-3 text-sm text-soft text-pretty">{plan.note}</p>}
              {result !== undefined && <Result plan={plan} result={result} />}
            </li>
          )
        })}
      </ol>

      <CannotStop />

      <h2 className="mt-20 h-section">Found a way through?</h2>
      <p className="mt-3 max-w-[34rem] text-pretty">
        Found a way past any of these, or something we missed? Please{' '}
        <a href={reportUrl || STUDIO_PROJECT_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
          report it
        </a>
        .
      </p>
    </>
  )
}
