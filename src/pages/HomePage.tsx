import { Link } from 'react-router-dom'
import { DemoPanel } from '@/components/DemoPanel'
import { NotConfigured } from '@/components/Shell'
import { Button, ContractLine, GroupLabel, HeldMoney, LedgerRow, Notice, Skeleton, StatePill } from '@/components/ui'
import type { PurseData } from '@/lib/data'
import { PURSE_ADDRESS } from '@/lib/env'
import { plainError } from '@/lib/errors'
import { formatDate, timeLeft } from '@/lib/format'
import { useHistory } from '@/lib/history'
import { usePurseList, useNow } from '@/lib/hooks'
import type { PurseEvent } from '@/lib/events'
import { arrangePurses, deriveState, heldAmount } from '@/lib/purse-state'

function PurseRow({ p, now, events, ready }: { p: PurseData; now: bigint; events: PurseEvent[]; ready: boolean }) {
  return (
    <li>
      <Link to={`/p/${p.id}`} className="-mx-3 flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded px-3 py-4 hover:bg-ink/[0.04]">
        <span className="min-w-0">
          <span className="block truncate font-medium">{p.title}</span>
          <span className="text-sm text-soft">Purse #{p.id.toString()}</span>
        </span>
        <span className="flex items-center gap-4">
          <HeldMoney held={heldAmount(p.pool, events, p.id, ready)} className="text-lg font-medium" returnedClassName="text-sm font-medium text-soft" />
          <StatePill state={deriveState(p, now)} />
        </span>
      </Link>
    </li>
  )
}

function FeaturedPurse({ purse, now, events, ready }: { purse: PurseData; now: bigint; events: PurseEvent[]; ready: boolean }) {
  const state = deriveState(purse, now)
  return (
    <section className="border-y border-rule py-8 sm:py-10" aria-label="A real purse from the chain">
      <div className="flex items-start justify-between gap-4">
        <h2 className="font-display text-xl font-medium tracking-tight text-balance">{purse.title}</h2>
        <StatePill state={state} />
      </div>
      <p className="mt-8 font-display text-5xl font-semibold tracking-tight sm:text-6xl">
        <HeldMoney held={heldAmount(purse.pool, events, purse.id, ready)} className="[&>span]:text-lg [&>span]:text-soft" returnedClassName="font-sans text-xl font-medium tracking-normal text-soft" />
      </p>
      <p className="mt-3 text-soft">{state === 'Locked' ? 'Locked in the contract. It is paid to the named winners, or returned to the funders if nobody is named in time.' : 'Read from the contract just now.'}</p>
      <dl className="mt-8 divide-y divide-rule border-t border-rule">
        <LedgerRow label={purse.named ? 'Winners were named' : 'Winners must be named by'}>
          <span className="tabular-nums">{purse.named ? `Claim by ${formatDate(purse.claimBy)}` : `${formatDate(purse.nameBy)} (${timeLeft(purse.nameBy, now)})`}</span>
        </LedgerRow>
        <LedgerRow label="Contract">{PURSE_ADDRESS && <ContractLine address={PURSE_ADDRESS} />}</LedgerRow>
      </dl>
      <Link to={`/p/${purse.id}`} className="mt-6 inline-flex min-h-11 items-center font-medium underline decoration-2 underline-offset-8">
        Open this purse
      </Link>
    </section>
  )
}

function FeaturedSkeleton() {
  return (
    <div className="border-y border-rule py-8 sm:py-10" aria-busy="true" aria-label="Loading a purse from the chain">
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="mt-8 h-16 w-2/3" />
      <Skeleton className="mt-4 h-5 w-3/4" />
      <Skeleton className="mt-8 h-12 w-full" />
    </div>
  )
}

function Headline() {
  return (
    <>
      <h1 className="mt-14 font-display text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Prize money you can see.</h1>
      <p className="mt-4 max-w-[34rem] text-lg text-pretty">Lock the prize before the contest. The whole pool has to go to the named winners. If nobody is named in time, each funder gets their own money back. A prize left unclaimed returns to the organiser.</p>
    </>
  )
}

export default function HomePage() {
  const list = usePurseList()
  const history = useHistory()
  const now = useNow()
  const ready = history.status === 'ready'

  if (!PURSE_ADDRESS) {
    return (
      <>
        <Headline />
        <div className="mt-8">
          <NotConfigured />
        </div>
      </>
    )
  }

  const purses = list.data
  const { featured, real, testAndDemo } = arrangePurses(purses ?? [], now)

  return (
    <>
      {list.isLoading && <FeaturedSkeleton />}
      {list.isError && <Notice strong>Could not read the purses from the chain. {plainError(list.error)}</Notice>}
      {purses && featured && <FeaturedPurse purse={featured} now={now} events={history.events} ready={ready} />}
      {purses && !featured && (
        <Notice>
          No purse exists on this contract yet. <Link to="/new" className="font-medium underline underline-offset-4">Create the first one</Link>.
        </Notice>
      )}

      <Headline />
      <Link to="/new" className="mt-6 inline-block">
        <Button>Create a purse</Button>
      </Link>

      <DemoPanel purses={purses} />

      <section className="mt-14 border-t border-rule pt-8" aria-labelledby="all-heading">
        <h2 id="all-heading" className="font-display text-xl font-semibold tracking-tight">
          Every purse
        </h2>
        <ul className="mt-4 divide-y divide-rule border-y border-rule">
          {list.isLoading &&
            [0, 1, 2].map((i) => (
              <li key={i} className="flex items-center justify-between gap-4 py-5">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-5 w-20" />
              </li>
            ))}
          {real.map((p) => (
            <PurseRow key={p.id.toString()} p={p} now={now} events={history.events} ready={ready} />
          ))}
          {purses && purses.length === 0 && <li className="py-5 text-soft">Nothing here yet.</li>}
        </ul>
        {testAndDemo.length > 0 && (
          <>
            <GroupLabel>Test and demo runs</GroupLabel>
            <ul className="divide-y divide-rule border-y border-rule" aria-label="Test and demo runs">
              {testAndDemo.map((p) => (
                <PurseRow key={p.id.toString()} p={p} now={now} events={history.events} ready={ready} />
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  )
}
