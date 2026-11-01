import { Link } from 'react-router-dom'
import { DemoPanel } from '@/components/DemoPanel'
import { NotConfigured } from '@/components/Shell'
import { PursePlate } from '@/components/PursePlate'
import { WinnerLines } from '@/components/WinnerLines'
import { Button, ContractLine, Dt, GroupLabel, HeldMoney, LedgerRow, Notice, Plate, PlateBacking, Skeleton, StatePill } from '@/components/ui'
import type { PurseData } from '@/lib/data'
import { PURSE_ADDRESS } from '@/lib/env'
import { plainError } from '@/lib/errors'
import { timeLeft } from '@/lib/format'
import { useHistory } from '@/lib/history'
import { usePurseList, useNow } from '@/lib/hooks'
import type { PurseEvent } from '@/lib/events'
import { arrangePurses, deriveState, heldAmount } from '@/lib/purse-state'

function PurseRow({ p, now, events, ready }: { p: PurseData; now: bigint; events: PurseEvent[]; ready: boolean }) {
  return (
    <li>
      <Link to={`/p/${p.id}`} className="-mx-3 grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded px-3 py-4 hover:bg-plate">
        <span className="min-w-0">
          <span className="block truncate font-semibold">{p.title}</span>
          <span className="t-small text-soft">Purse #{p.id.toString()}</span>
        </span>
        <span className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-right">
          <HeldMoney held={heldAmount(p.pool, events, p.id, ready)} className="text-[22px]" returnedClassName="t-small font-semibold text-soft" />
          <StatePill state={deriveState(p, now)} />
        </span>
      </Link>
    </li>
  )
}

function FeaturedPurse({ purse, now, events, ready }: { purse: PurseData; now: bigint; events: PurseEvent[]; ready: boolean }) {
  const state = deriveState(purse, now)
  const shownWinners = 5
  return (
    <section aria-label="A real purse from the chain">
      <PursePlate
        id={purse.id}
        title={purse.title}
        state={state}
        held={heldAmount(purse.pool, events, purse.id, ready)}
        caption={state === 'Locked' ? 'Locked in the contract. It is paid to the named winners, or returned to the funders if nobody is named in time.' : 'Read from the contract just now.'}
      >
        {purse.winners.length > 0 && (
          <div className="mt-8 border-t border-rule">
            <WinnerLines purse={purse} events={events} limit={shownWinners} />
            {purse.winners.length > shownWinners && (
              <p className="t-small pb-2 text-soft">
                And {purse.winners.length - shownWinners} more on the purse page.
              </p>
            )}
          </div>
        )}
        <dl className="mt-6 divide-y divide-rule border-y border-rule">
          <LedgerRow label={purse.named ? 'Winners were named' : 'Winners must be named by'}>
            {purse.named ? (
              <>
                Claim by <Dt seconds={purse.claimBy} />
              </>
            ) : (
              <>
                <Dt seconds={purse.nameBy} /> ({timeLeft(purse.nameBy, now)})
              </>
            )}
          </LedgerRow>
          <LedgerRow label="Contract">{PURSE_ADDRESS && <ContractLine address={PURSE_ADDRESS} />}</LedgerRow>
        </dl>
        <Link to={`/p/${purse.id}`} className="mt-6 inline-flex min-h-12 items-center font-semibold underline decoration-brass decoration-2 underline-offset-8 hover:text-brass">
          Open this purse
        </Link>
      </PursePlate>
    </section>
  )
}

function FeaturedSkeleton() {
  return (
    <PlateBacking>
      <Plate>
        <div aria-busy="true" aria-label="Loading a purse from the chain">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="mt-8 h-16 w-2/3" />
          <Skeleton className="mt-6 h-7 w-1/2" />
          <Skeleton className="mt-8 h-12 w-full" />
        </div>
      </Plate>
    </PlateBacking>
  )
}

function Headline() {
  return (
    <>
      <h1 className="h-headline text-balance">Prize money you can see.</h1>
      <p className="mt-5 max-w-[36rem] text-lg text-pretty">Lock the prize before the contest. The whole pool has to go to the named winners. If nobody is named in time, each funder gets their own money back. A prize left unclaimed returns to the organiser.</p>
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
      <div className="mb-10">
        <Headline />
      </div>
      {list.isLoading && <FeaturedSkeleton />}
      {list.isError && <Notice strong>Could not read the purses from the chain. {plainError(list.error)}</Notice>}
      {purses && featured && <FeaturedPurse purse={featured} now={now} events={history.events} ready={ready} />}
      {purses && !featured && (
        <Notice>
          No purse exists on this contract yet. <Link to="/new" className="font-semibold underline underline-offset-4">Create the first one</Link>.
        </Notice>
      )}

      <Link to="/new" className="mt-10 inline-block">
        <Button>Create a purse</Button>
      </Link>

      <DemoPanel purses={purses} />

      <section className="mt-20 border-t border-rule pt-10" aria-labelledby="all-heading">
        <h2 id="all-heading" className="h-section">
          Every purse
        </h2>
        <ul className="mt-5 divide-y divide-rule border-y border-rule">
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
