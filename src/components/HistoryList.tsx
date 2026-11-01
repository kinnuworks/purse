import type { ReactNode } from 'react'
import type { PurseEvent } from '@/lib/events'
import { formatDuration } from '@/lib/format'
import { useBlockTimes } from '@/lib/hooks'
import { useHistory } from '@/lib/history'
import { Addr, Dt, Money, Notice, Skeleton, TxLink } from './ui'

/** What happened, in words, and the amount (if any) for the right-hand column. */
function describe(event: PurseEvent): { text: ReactNode; amount?: bigint } {
  switch (event.name) {
    case 'PurseCreated':
      return {
        text: (
          <>
            Purse created by <Addr address={event.organiser} />. Winners to be named by <Dt seconds={event.nameBy} />, then {formatDuration(event.claimWindow)} to claim.
          </>
        ),
        amount: event.amount,
      }
    case 'Funded':
      return {
        text: (
          <>
            <Addr address={event.funder} /> added funds. The pool is now <Money raw={event.newPool} />.
          </>
        ),
        amount: event.amount,
      }
    case 'FundingLocked':
      return { text: 'Funding locked. The pool is fixed.', amount: event.pool }
    case 'WinnersNamed':
      return {
        text: (
          <>
            {event.winners.length} winner{event.winners.length === 1 ? '' : 's'} named. Prizes can be claimed until <Dt seconds={event.claimBy} />.
          </>
        ),
      }
    case 'Delivered':
      return {
        text: (
          <>
            Delivered to <Addr address={event.winner} />, sent by <Addr address={event.caller} />.
          </>
        ),
        amount: event.amount,
      }
    case 'Refunded':
      return {
        text: (
          <>
            Returned to <Addr address={event.funder} />.
          </>
        ),
        amount: event.amount,
      }
    case 'Swept':
      return {
        text: (
          <>
            Unclaimed prize returned to the organiser <Addr address={event.organiser} />.
          </>
        ),
        amount: event.amount,
      }
  }
}

/** Dated history of every event for one purse, oldest first, each with a transaction link. */
export function HistoryList({ id }: { id: bigint }) {
  const history = useHistory()
  const events = history.events.filter((e) => e.id === id).filter((e, _i, all) => !(e.name === 'Funded' && all.some((o) => o.name === 'PurseCreated' && o.txHash === e.txHash)))
  const times = useBlockTimes(events.map((e) => e.blockNumber))

  if (history.status === 'error' && events.length === 0) {
    return <Notice strong>Could not read the history. {history.error}</Notice>
  }
  if (events.length === 0) {
    const progress = history.progress
    return (
      <div className="space-y-3" aria-busy={history.status !== 'ready'}>
        {history.status !== 'ready' ? (
          <>
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
            <p className="t-small text-soft tabular-nums">
              Reading the chain history{progress ? `: block ${progress.scannedTo.toString()} of ${progress.head.toString()}` : '…'}
            </p>
          </>
        ) : (
          <p className="t-small text-soft">No events recorded for this purse yet.</p>
        )}
      </div>
    )
  }

  return (
    <ol className="divide-y divide-rule border-y border-rule">
      {events.map((event) => {
        const time = times.data?.[event.blockNumber.toString()]
        const { text, amount } = describe(event)
        return (
          <li key={`${event.txHash}:${event.logIndex}`} className="grid gap-x-6 gap-y-2 py-4 hover:bg-plate sm:grid-cols-[11rem_minmax(0,1fr)_auto]">
            <div>{time !== undefined ? <Dt seconds={time} /> : <Skeleton className="inline-block h-3 w-28 align-middle" />}</div>
            <div className="min-w-0 text-pretty">{text}</div>
            <div className="flex flex-col gap-1 sm:items-end sm:text-right">
              {amount !== undefined && <Money raw={amount} className="text-[20px]" />}
              <span className="t-small">
                <TxLink hash={event.txHash} />
              </span>
            </div>
          </li>
        )
      })}
      {history.status === 'loading' && (
        <li className="t-small py-3 text-soft">Checking for newer events…</li>
      )}
    </ol>
  )
}
