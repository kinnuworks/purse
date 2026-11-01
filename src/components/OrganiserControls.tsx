import { useState } from 'react'
import { encodeFunctionData, type Address } from 'viem'
import { Plus, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import type { PurseData } from '@/lib/data'
import { readMaxWinners } from '@/lib/data'
import { PURSE_ADDRESS } from '@/lib/env'
import { formatMoney, parseMoney } from '@/lib/format'
import { useSend } from '@/lib/hooks'
import { purseAbi } from '@/lib/purse-abi'
import { allocation, canLock, canName, checkWinnerRows, type WinnerRowInput } from '@/lib/purse-state'
import { Button, Money, Notice, SendStatus, cx } from './ui'

function AllocationLine({ pool, amounts }: { pool: bigint; amounts: bigint[] }) {
  const a = allocation(amounts, pool)
  return (
    <div
      className={cx('border-l-2 py-1 pl-4', a.status === 'match' ? 'border-paid text-paid' : 'border-ink')}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span>
          Assigned <Money raw={a.total} /> of <Money raw={a.pool} />
        </span>
        <span className="font-semibold">
          {a.status === 'match' && 'Matches the pool'}
          {a.status === 'short' && (
            <>
              <Money raw={a.remaining} unit={false} /> still to assign
            </>
          )}
          {a.status === 'over' && (
            <>
              <Money raw={-a.remaining} unit={false} /> too much
            </>
          )}
        </span>
      </div>
      {a.status !== 'match' && <p className="mt-1 text-soft">Naming is blocked until the amounts add up to exactly the pool, so the organiser cannot keep any of it.</p>}
    </div>
  )
}

/** Lock the pool, then name winners. Shown only to the organiser of an unnamed purse. */
export function OrganiserControls({ purse, now }: { purse: PurseData; now: bigint }) {
  const lock = useSend()
  const name = useSend()
  const [rows, setRows] = useState<WinnerRowInput[]>([{ address: '', amount: '' }])
  const [touched, setTouched] = useState(false)
  const max = useQuery({ queryKey: ['max-winners'], queryFn: readMaxWinners, staleTime: Infinity, enabled: PURSE_ADDRESS !== null })

  if (!PURSE_ADDRESS || purse.named) return null
  const purseAddress: Address = PURSE_ADDRESS
  if (now > purse.nameBy) {
    return <Notice strong>The deadline to name winners has passed. Everyone who put money in can now take their own share back from the funders list below.</Notice>
  }

  const maxWinners = max.data ?? 50
  const amounts = rows.map((r) => parseMoney(r.amount) ?? 0n)
  const check = checkWinnerRows(rows, purse.pool, parseMoney, maxWinners)
  const update = (i: number, patch: Partial<WinnerRowInput>) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  return (
    <div className="space-y-5 border-t-2 border-ink pt-6">
      <h3 className="font-display text-[22px] font-semibold leading-tight">You are the organiser</h3>

      {canLock(purse, now) && (
        <div>
          <p className="text-sm font-semibold">Step 1. Lock the purse</p>
          <p className="mt-1 text-sm text-soft text-pretty">
            Locking ends funding. Nobody can add to the pool after this, so nobody can make your winner amounts stop adding up at the last second.
          </p>
          <Button
            className="mt-2"
            disabled={lock.busy}
            onClick={() => void lock.send({ to: purseAddress, data: encodeFunctionData({ abi: purseAbi, functionName: 'lock', args: [purse.id] }) })}
          >
            {lock.busy ? 'Locking…' : 'Lock the purse'}
          </Button>
          <SendStatus state={lock.state} />
        </div>
      )}

      {canName(purse, now) && <p className="text-sm font-semibold text-paid">Step 1 done. The purse is locked.</p>}

      <div>
        <p className="text-sm font-semibold">Step 2. Name the winners</p>
        {!purse.locked && <p className="mt-1 text-sm text-soft">Lock the purse first. The pool can still change until you do.</p>}
        <ul className="mt-3 space-y-3">
          {rows.map((row, i) => (
            <li key={i} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_9rem_auto]">
              <input
                aria-label={`Winner ${i + 1} wallet address`}
                value={row.address}
                onChange={(e) => update(i, { address: e.target.value })}
                placeholder="0x… wallet address"
                spellCheck={false}
                autoComplete="off"
                className="col-span-2 min-h-12 rounded-lg border border-soft bg-plate px-3 t-mono sm:col-span-1"
              />
              <input
                aria-label={`Winner ${i + 1} amount in USDC`}
                value={row.amount}
                inputMode="decimal"
                onChange={(e) => update(i, { amount: e.target.value })}
                placeholder="0.00"
                className="min-h-12 rounded-lg border border-soft bg-plate px-3 text-right tabular-nums"
              />
              <Button variant="secondary" aria-label={`Remove winner ${i + 1}`} disabled={rows.length === 1} onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}>
                <X size={16} aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" disabled={rows.length >= maxWinners} onClick={() => setRows((prev) => [...prev, { address: '', amount: '' }])}>
            <Plus size={16} aria-hidden /> Add a winner
          </Button>
          {rows.length === 1 && purse.pool > 0n && (
            <Button variant="secondary" onClick={() => update(0, { amount: formatMoney(purse.pool).replace(/,/g, '') })}>
              Give the whole pool
            </Button>
          )}
        </div>

        <div className="mt-3">
          <AllocationLine pool={purse.pool} amounts={amounts} />
        </div>

        {touched && !check.ok && (
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">
            {check.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}

        <Button
          className="mt-3"
          variant="green"
          disabled={name.busy || !purse.locked}
          onClick={() => {
            setTouched(true)
            if (!check.ok) return
            void name.send({
              to: purseAddress,
              data: encodeFunctionData({ abi: purseAbi, functionName: 'name', args: [purse.id, check.winners, check.amounts] }),
            })
          }}
        >
          {name.busy ? 'Naming…' : 'Name the winners'}
        </Button>
        <p className="mt-2 text-sm text-soft">Winners can be named once. It cannot be changed afterwards.</p>
        <SendStatus state={name.state} />
      </div>
    </div>
  )
}
