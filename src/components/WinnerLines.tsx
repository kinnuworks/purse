import type { ReactNode } from 'react'
import type { PurseData } from '@/lib/data'
import { explorerTx } from '@/lib/env'
import type { PurseEvent } from '@/lib/events'
import { sameAddress } from '@/lib/format'
import { useBlockTimes } from '@/lib/hooks'
import { Addr, Money, Stamp, cx } from './ui'

/**
 * Winners as engraved lines: address, amount right-aligned in tabular figures, and either the PAID stamp
 * (dated, linked to the delivery transaction) or "Waiting". `renderAction` adds a button to a line.
 */
export function WinnerLines({
  purse,
  events,
  limit,
  you,
  renderAction,
  className,
}: {
  purse: PurseData
  events: PurseEvent[]
  limit?: number
  you?: (address: string) => boolean
  renderAction?: (winner: PurseData['winners'][number]) => ReactNode
  className?: string
}) {
  const deliveries = events.filter((e): e is Extract<PurseEvent, { name: 'Delivered' }> => e.name === 'Delivered' && e.id === purse.id)
  const times = useBlockTimes(deliveries.map((e) => e.blockNumber))
  const shown = limit === undefined ? purse.winners : purse.winners.slice(0, limit)
  return (
    <ul className={cx('divide-y divide-rule', className)}>
      {shown.map((w) => {
        const delivery = deliveries.find((e) => sameAddress(e.winner, w.winner))
        const time = delivery ? times.data?.[delivery.blockNumber.toString()] : undefined
        return (
          <li key={w.winner} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-4">
            <Addr address={w.winner} you={you?.(w.winner)} />
            <span className="flex flex-wrap items-center justify-end gap-x-6 gap-y-3">
              <Money raw={w.amount} className="text-[20px]" />
              {w.delivered ? (
                <Stamp id={`${purse.id.toString()}:${w.winner.toLowerCase()}`} date={time} href={delivery ? explorerTx(delivery.txHash) : undefined} />
              ) : (
                <span className="t-small text-soft">Waiting</span>
              )}
              {renderAction?.(w)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
