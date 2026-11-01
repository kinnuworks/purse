import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { DemoPanel } from '@/components/DemoPanel'
import { NotConfigured } from '@/components/Shell'
import { Button, Money, Notice, Skeleton, StatePill } from '@/components/ui'
import type { PurseData } from '@/lib/data'
import { PURSE_ADDRESS, explorerAddress } from '@/lib/env'
import { plainError } from '@/lib/errors'
import { formatDate, timeLeft } from '@/lib/format'
import { usePurseList, useNow } from '@/lib/hooks'
import { arrangePurses, deriveState } from '@/lib/purse-state'

function PurseRow({ p, now }: { p: PurseData; now: bigint }) {
  return (
    <li>
      <Link to={`/p/${p.id}`} className="flex min-h-14 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 hover:bg-ink/[0.03]">
        <span className="min-w-0">
          <span className="block truncate font-medium">{p.title}</span>
          <span className="text-xs opacity-60">#{p.id.toString()}</span>
        </span>
        <span className="flex items-center gap-3">
          <Money raw={p.pool} className="text-sm" />
          <StatePill state={deriveState(p, now)} />
        </span>
      </Link>
    </li>
  )
}

function FeaturedPurse({ purse, now }: { purse: PurseData; now: bigint }) {
  const state = deriveState(purse, now)
  return (
    <section className="rounded-xl border border-ink/15 p-5 sm:p-7" aria-label="A real purse from the chain">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-lg font-medium tracking-tight">{purse.title}</h2>
        <StatePill state={state} />
      </div>
      <p className="mt-5 font-display text-5xl font-semibold tracking-tight sm:text-6xl">
        <Money raw={purse.pool} className="[&>span]:text-base" />
      </p>
      <p className="mt-1 text-sm opacity-70">{state === 'Locked' ? 'Locked in the contract. It cannot be taken back by anyone.' : 'The pool for this purse, read from the contract.'}</p>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="opacity-60">{purse.named ? 'Winners were named' : 'Winners must be named by'}</dt>
          <dd className="mt-0.5 tabular-nums">
            {purse.named ? `Claim by ${formatDate(purse.claimBy)}` : `${formatDate(purse.nameBy)} (${timeLeft(purse.nameBy, now)})`}
          </dd>
        </div>
        <div>
          <dt className="opacity-60">Contract</dt>
          <dd className="mt-0.5">
            {PURSE_ADDRESS && (
              <a
                href={explorerAddress(PURSE_ADDRESS)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline decoration-ink/25 underline-offset-2 hover:decoration-ink"
              >
                View on the explorer <ExternalLink size={12} aria-hidden />
              </a>
            )}
          </dd>
        </div>
      </dl>
      <Link to={`/p/${purse.id}`} className="mt-5 inline-block text-sm font-medium underline underline-offset-4">
        Open this purse
      </Link>
    </section>
  )
}

function FeaturedSkeleton() {
  return (
    <div className="rounded-xl border border-ink/15 p-5 sm:p-7" aria-busy="true" aria-label="Loading a purse from the chain">
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="mt-6 h-14 w-2/3" />
      <Skeleton className="mt-4 h-4 w-3/4" />
      <Skeleton className="mt-6 h-10 w-full" />
    </div>
  )
}

export default function HomePage() {
  const list = usePurseList()
  const now = useNow()

  if (!PURSE_ADDRESS) {
    return (
      <>
        <h1 className="font-display text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Prize money you can see.</h1>
        <p className="mt-3 max-w-prose text-pretty opacity-80">
          Lock the prize before the contest. The whole pool goes to the winners, or back to whoever funded it.
        </p>
        <div className="mt-6">
          <NotConfigured />
        </div>
      </>
    )
  }

  const purses = list.data
  const { featured, real, demos } = arrangePurses(purses ?? [])

  return (
    <>
      {list.isLoading && <FeaturedSkeleton />}
      {list.isError && <Notice strong>Could not read the purses from the chain. {plainError(list.error)}</Notice>}
      {purses && featured && <FeaturedPurse purse={featured} now={now} />}
      {purses && !featured && (
        <Notice>
          No purse exists on this contract yet. <Link to="/new" className="font-medium underline underline-offset-2">Create the first one</Link>.
        </Notice>
      )}

      <h1 className="mt-8 font-display text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Prize money you can see.</h1>
      <p className="mt-3 max-w-prose text-pretty opacity-80">
        Lock the prize before the contest. The whole pool goes to the winners, or back to whoever funded it.
      </p>
      <Link to="/new" className="mt-5 inline-block">
        <Button>Create a purse</Button>
      </Link>

      <DemoPanel purses={purses} />

      <section className="mt-10" aria-labelledby="all-heading">
        <h2 id="all-heading" className="font-display text-lg font-semibold tracking-tight">
          Every purse
        </h2>
        <ul className="mt-3 divide-y divide-ink/10 rounded-xl border border-ink/15">
          {list.isLoading &&
            [0, 1, 2].map((i) => (
              <li key={i} className="flex items-center justify-between gap-4 px-4 py-4">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-5 w-20" />
              </li>
            ))}
          {real.map((p) => (
            <PurseRow key={p.id.toString()} p={p} now={now} />
          ))}
          {purses && purses.length === 0 && <li className="px-4 py-4 text-sm opacity-70">Nothing here yet.</li>}
          {demos.length > 0 && (
            <li className="bg-ink/[0.03] px-4 py-2 text-xs font-medium uppercase tracking-wider opacity-70" aria-label="Demo runs">
              Demo runs
            </li>
          )}
          {demos.map((p) => (
            <PurseRow key={p.id.toString()} p={p} now={now} />
          ))}
        </ul>
      </section>
    </>
  )
}
