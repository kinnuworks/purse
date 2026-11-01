import { useParams } from 'react-router-dom'
import { Money, Skeleton, StatePill } from '@/components/ui'
import { PURSE_ADDRESS } from '@/lib/env'
import { useHistory } from '@/lib/history'
import { useNow, usePurse } from '@/lib/hooks'
import { deriveState, heldAmount } from '@/lib/purse-state'

/** Amount of a purse whose pool is empty: what it held, marked returned. Reads the history only in that case. */
function ReturnedAmount({ id }: { id: bigint }) {
  const history = useHistory()
  const held = heldAmount(0n, history.events, id, history.status === 'ready')
  if (held.kind === 'loading') return <Skeleton className="h-9 w-32" />
  return (
    <>
      <Money raw={held.raw} />
      {held.returned && <span className="ml-2 text-sm font-medium text-soft">returned</span>}
    </>
  )
}

/** A small card made to sit inside an iframe on a contest page. Everything is read from the chain when it loads. */
export default function BadgePage() {
  const params = useParams()
  const id = params.id && /^\d{1,18}$/.test(params.id) ? BigInt(params.id) : null
  const purse = usePurse(id)
  const now = useNow()

  const shell = 'flex min-h-dvh flex-col justify-center bg-paper p-3 text-ink'
  const card = 'rounded-xl border border-ink/20 p-4'

  if (!PURSE_ADDRESS || id === null) {
    return (
      <div className={shell}>
        <div className={card}>
          <p className="text-sm">This prize badge needs a purse number, like /badge/1.</p>
        </div>
      </div>
    )
  }
  if (purse.isLoading) {
    return (
      <div className={shell} aria-busy="true" aria-label="Reading the prize from the chain">
        <div className={card}>
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="mt-3 h-9 w-2/3" />
          <Skeleton className="mt-3 h-5 w-24" />
        </div>
      </div>
    )
  }
  if (purse.isError || !purse.data) {
    return (
      <div className={shell}>
        <div className={card}>
          <p className="text-sm">Could not read purse #{id.toString()} from the chain right now.</p>
        </div>
      </div>
    )
  }

  const p = purse.data
  const state = deriveState(p, now)
  return (
    <div className={shell}>
      <div className={card}>
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 truncate font-display text-base font-semibold tracking-tight" title={p.title}>
            {p.title}
          </h1>
          <StatePill state={state} />
        </div>
        <p className="mt-2 font-display text-3xl font-semibold tracking-tight">{p.pool > 0n ? <Money raw={p.pool} className="[&>span]:text-sm" /> : <ReturnedAmount id={p.id} />}</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-soft">Read from the chain</span>
          <a href={`/p/${p.id}`} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">
            View this purse
          </a>
        </div>
      </div>
    </div>
  )
}
