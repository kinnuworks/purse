import { useParams } from 'react-router-dom'
import { Money, Plate, Skeleton, StatePill } from '@/components/ui'
import { PURSE_ADDRESS } from '@/lib/env'
import { useHistory } from '@/lib/history'
import { useNow, usePurse } from '@/lib/hooks'
import { deriveState, heldAmount } from '@/lib/purse-state'

/** Amount of a purse whose pool is empty: what it held, marked returned. Reads the history only in that case. */
function ReturnedAmount({ id }: { id: bigint }) {
  const history = useHistory()
  const held = heldAmount(0n, history.events, id, history.status === 'ready')
  if (held.kind === 'loading') return <Skeleton className="h-10 w-36" />
  return (
    <>
      <Money raw={held.raw} unitClassName="text-[16px] ml-1.5" />
      {held.returned && <span className="t-small ml-2 font-semibold text-soft">returned</span>}
    </>
  )
}

/** A small card made to sit inside an iframe on a contest page. Everything is read from the chain when it loads. */
export default function BadgePage() {
  const params = useParams()
  const id = params.id && /^\d{1,18}$/.test(params.id) ? BigInt(params.id) : null
  const purse = usePurse(id)
  const now = useNow()

  const shell = 'flex min-h-dvh flex-col justify-center bg-paper p-2 text-ink'

  if (!PURSE_ADDRESS || id === null) {
    return (
      <div className={shell}>
        <Plate small>
          <p className="t-small">This prize badge needs a purse number, like /badge/1.</p>
        </Plate>
      </div>
    )
  }
  if (purse.isLoading) {
    return (
      <div className={shell} aria-busy="true" aria-label="Reading the prize from the chain">
        <Plate small>
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="mt-3 h-10 w-2/3" />
          <Skeleton className="mt-3 h-5 w-24" />
        </Plate>
      </div>
    )
  }
  if (purse.isError || !purse.data) {
    return (
      <div className={shell}>
        <Plate small>
          <p className="t-small">Could not read purse #{id.toString()} from the chain right now.</p>
        </Plate>
      </div>
    )
  }

  const p = purse.data
  const state = deriveState(p, now)
  return (
    <div className={shell}>
      <Plate small>
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 truncate font-display text-[20px] font-medium leading-tight" title={p.title}>
            {p.title}
          </h1>
          <StatePill state={state} />
        </div>
        <p className="t-amount-sm amount-in mt-3">{p.pool > 0n ? <Money raw={p.pool} unitClassName="text-[16px] ml-1.5" /> : <ReturnedAmount id={p.id} />}</p>
        <div className="t-small mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-soft">Read from the chain</span>
          <a href={`/p/${p.id}`} target="_blank" rel="noopener noreferrer" className="font-semibold underline decoration-brass underline-offset-4 hover:text-brass">
            View this purse
          </a>
        </div>
      </Plate>
    </div>
  )
}
