import type { PurseEvent } from '@/lib/events'
import { formatDate, formatDuration } from '@/lib/format'
import { useBlockTimes } from '@/lib/hooks'
import { useHistory } from '@/lib/history'
import { Addr, Money, Notice, Skeleton, TxLink } from './ui'

function Line({ event }: { event: PurseEvent }) {
  switch (event.name) {
    case 'PurseCreated':
      return (
        <>
          Purse created by <Addr address={event.organiser} /> with <Money raw={event.amount} />. Winners to be named by {formatDate(event.nameBy)}, then{' '}
          {formatDuration(event.claimWindow)} to claim.
        </>
      )
    case 'Funded':
      return (
        <>
          <Addr address={event.funder} /> added <Money raw={event.amount} />. The pool is now <Money raw={event.newPool} />.
        </>
      )
    case 'FundingLocked':
      return (
        <>
          Funding locked. The pool is fixed at <Money raw={event.pool} />.
        </>
      )
    case 'WinnersNamed':
      return (
        <>
          {event.winners.length} winner{event.winners.length === 1 ? '' : 's'} named. Prizes can be claimed until {formatDate(event.claimBy)}.
        </>
      )
    case 'Delivered':
      return (
        <>
          <Money raw={event.amount} /> delivered to <Addr address={event.winner} />, sent by <Addr address={event.caller} />.
        </>
      )
    case 'Refunded':
      return (
        <>
          <Money raw={event.amount} /> returned to <Addr address={event.funder} />.
        </>
      )
    case 'Swept':
      return (
        <>
          <Money raw={event.amount} /> of unclaimed prize returned to the organiser <Addr address={event.organiser} />.
        </>
      )
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
            <p className="text-xs opacity-60 tabular-nums">
              Reading the chain history{progress ? `: block ${progress.scannedTo.toString()} of ${progress.head.toString()}` : '…'}
            </p>
          </>
        ) : (
          <p className="text-sm opacity-70">No events recorded for this purse yet.</p>
        )}
      </div>
    )
  }

  return (
    <ol className="divide-y divide-ink/10 rounded-xl border border-ink/15">
      {events.map((event) => {
        const time = times.data?.[event.blockNumber.toString()]
        return (
          <li key={`${event.txHash}:${event.logIndex}`} className="px-4 py-3 text-sm leading-relaxed">
            <div className="mb-0.5 text-xs opacity-60 tabular-nums">
              {time !== undefined ? formatDate(time) : <Skeleton className="inline-block h-3 w-28 align-middle" />}
            </div>
            <div className="text-pretty">
              <Line event={event} />
            </div>
            <div className="mt-1">
              <TxLink hash={event.txHash} />
            </div>
          </li>
        )
      })}
      {history.status === 'loading' && (
        <li className="px-4 py-2 text-xs opacity-60">Checking for newer events…</li>
      )}
    </ol>
  )
}
