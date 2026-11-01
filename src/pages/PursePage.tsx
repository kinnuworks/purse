import { useParams } from 'react-router-dom'
import { encodeFunctionData } from 'viem'
import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { AddFunds } from '@/components/AddFunds'
import { ChainButton } from '@/components/ChainButton'
import { HistoryList } from '@/components/HistoryList'
import { OrganiserControls } from '@/components/OrganiserControls'
import { NotConfigured } from '@/components/Shell'
import { Addr, BackLink, Money, Notice, Section, Skeleton, StatePill } from '@/components/ui'
import { readContribution } from '@/lib/data'
import { PURSE_ADDRESS } from '@/lib/env'
import { plainError } from '@/lib/errors'
import { formatDate, formatDuration, sameAddress, timeLeft } from '@/lib/format'
import { useHistory } from '@/lib/history'
import { useNow, usePurse } from '@/lib/hooks'
import { purseAbi } from '@/lib/purse-abi'
import { mapLimit } from '@/lib/retry'
import { canAdd, canDeliver, canRefund, canSweep, deriveState } from '@/lib/purse-state'

type Address = `0x${string}`

function parseId(raw: string | undefined): bigint | null {
  return raw && /^\d{1,18}$/.test(raw) ? BigInt(raw) : null
}

interface Funder {
  address: Address
  funded: bigint
  returned: bigint
}

function useFunders(id: bigint | null): { funders: Funder[]; ready: boolean } {
  const history = useHistory()
  const map = new Map<string, Funder>()
  for (const e of history.events) {
    if (id === null || e.id !== id) continue
    if (e.name === 'Funded') {
      const key = e.funder.toLowerCase()
      const row = map.get(key) ?? { address: e.funder, funded: 0n, returned: 0n }
      row.funded += e.amount
      map.set(key, row)
    } else if (e.name === 'Refunded') {
      const key = e.funder.toLowerCase()
      const row = map.get(key) ?? { address: e.funder, funded: 0n, returned: 0n }
      row.returned += e.amount
      map.set(key, row)
    }
  }
  return { funders: [...map.values()], ready: history.status === 'ready' || map.size > 0 }
}

export default function PursePage() {
  const params = useParams()
  const id = parseId(params.id)
  const { address: account } = useAccount()
  const now = useNow()
  const purseQuery = usePurse(id)
  const { funders, ready } = useFunders(id)

  const funderKey = funders.map((f) => f.address).join(',')
  const contributions = useQuery({
    queryKey: ['contributions', id?.toString(), funderKey],
    queryFn: async () => {
      const values = await mapLimit(funders, 4, (f) => readContribution(id as bigint, f.address))
      return new Map(funders.map((f, i) => [f.address.toLowerCase(), values[i]]))
    },
    enabled: id !== null && funders.length > 0 && PURSE_ADDRESS !== null,
    refetchInterval: 20_000,
  })

  if (!PURSE_ADDRESS) return <NotConfigured />
  if (id === null) return <Notice strong>That is not a purse number. <BackLink /></Notice>

  const purse = purseQuery.data
  if (purseQuery.isLoading) {
    return (
      <div aria-busy="true" aria-label="Loading the purse from the chain">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="mt-6 h-14 w-1/2" />
        <Skeleton className="mt-6 h-24 w-full" />
        <Skeleton className="mt-6 h-40 w-full" />
      </div>
    )
  }
  if (purseQuery.isError || !purse) {
    return (
      <Notice strong>
        {purseQuery.error && /unknownpurse|UnknownPurse/i.test(String(purseQuery.error))
          ? 'There is no purse with that number.'
          : `Could not read this purse from the chain. ${plainError(purseQuery.error)}`}{' '}
        <BackLink />
      </Notice>
    )
  }

  const state = deriveState(purse, now)
  const isOrganiser = sameAddress(account, purse.organiser)
  const organiserIsWinner = purse.winners.some((w) => sameAddress(w.winner, purse.organiser))
  const organiserOnlyFunder = ready && funders.length === 1 && sameAddress(funders[0].address, purse.organiser)

  return (
    <>
      <BackLink />
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-balance">{purse.title}</h1>
        <StatePill state={state} />
      </div>
      <p className="mt-1 text-sm opacity-60">Purse #{purse.id.toString()}</p>

      <p className="mt-6 font-display text-5xl font-semibold tracking-tight">
        <Money raw={purse.pool} className="[&>span]:text-base" />
      </p>
      <p className="mt-1 text-sm opacity-70 tabular-nums">
        {purse.owed > 0n ? (
          <>
            <Money raw={purse.owed} /> is still held by the contract for this purse.
          </>
        ) : (
          'Nothing is left in the contract for this purse.'
        )}
      </p>

      <div className="mt-5 space-y-2">
        {organiserIsWinner && <Notice>The organiser is also one of the winners.</Notice>}
        {organiserOnlyFunder && <Notice>The organiser is the only funder: all of this money came from them.</Notice>}
      </div>

      <dl className="mt-6 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="opacity-60">Organiser</dt>
          <dd className="mt-0.5">
            <Addr address={purse.organiser} you={isOrganiser} />
          </dd>
        </div>
        <div>
          <dt className="opacity-60">Winners must be named by</dt>
          <dd className="mt-0.5 tabular-nums">
            {formatDate(purse.nameBy)} {!purse.named && <span className="opacity-60">({timeLeft(purse.nameBy, now)})</span>}
          </dd>
        </div>
        <div>
          <dt className="opacity-60">Time to claim after winners are named</dt>
          <dd className="mt-0.5">{formatDuration(purse.claimWindow)}</dd>
        </div>
        <div>
          <dt className="opacity-60">Claim deadline</dt>
          <dd className="mt-0.5 tabular-nums">
            {purse.named ? (
              <>
                {formatDate(purse.claimBy)} <span className="opacity-60">({timeLeft(purse.claimBy, now)})</span>
              </>
            ) : (
              <span className="opacity-60">Set when winners are named</span>
            )}
          </dd>
        </div>
      </dl>

      <p className="mt-6 max-w-prose border-l-2 border-ink pl-3 text-sm text-pretty">
        Purse proves the money is there and where it went. It can't prove the judging was fair.
      </p>

      <div className="mt-8 space-y-4">
        {isOrganiser && <OrganiserControls purse={purse} now={now} />}
        {canAdd(purse, now) && <AddFunds id={purse.id} />}
      </div>

      <Section title="Winners">
        {purse.winners.length === 0 ? (
          <p className="text-sm opacity-70">{state === 'Refunds open' || state === 'Returned' ? 'No winners were named in time.' : 'Winners have not been named yet.'}</p>
        ) : (
          <ul className="divide-y divide-ink/10 rounded-xl border border-ink/15">
            {purse.winners.map((w) => (
              <li key={w.winner} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <Addr address={w.winner} you={sameAddress(account, w.winner)} />
                  <div className="mt-0.5 text-sm">
                    <Money raw={w.amount} />{' '}
                    <span className={w.delivered ? 'text-lock' : 'opacity-60'}>{w.delivered ? 'Delivered' : 'Not delivered yet'}</span>
                  </div>
                </div>
                {canDeliver(purse, now, w.delivered) && (
                  <ChainButton
                    label="Deliver prize"
                    busyLabel="Delivering…"
                    data={encodeFunctionData({ abi: purseAbi, functionName: 'deliver', args: [purse.id, w.winner] })}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        {purse.named && <p className="mt-2 text-xs opacity-60">Anyone can press Deliver. The prize always goes to the winner, who needs no gas and no USDC.</p>}
        {canSweep(purse, now) && (
          <div className="mt-3">
            <Notice>
              The claim window has closed. <Money raw={purse.owed} /> was never delivered and can go back to the organiser.
            </Notice>
            <ChainButton
              className="mt-2"
              label="Return unclaimed prize to the organiser"
              busyLabel="Returning…"
              data={encodeFunctionData({ abi: purseAbi, functionName: 'sweep', args: [purse.id] })}
            />
          </div>
        )}
      </Section>

      <Section title="Funders">
        {!ready ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : funders.length === 0 ? (
          <p className="text-sm opacity-70">No funding events were found.</p>
        ) : (
          <ul className="divide-y divide-ink/10 rounded-xl border border-ink/15">
            {funders.map((f) => {
              const left = contributions.data?.get(f.address.toLowerCase())
              return (
                <li key={f.address} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <Addr address={f.address} you={sameAddress(account, f.address)} />
                    <div className="mt-0.5 text-sm">
                      <Money raw={f.funded} /> put in
                      {f.returned > 0n && (
                        <span className="text-lock">
                          {' '}
                          · <Money raw={f.returned} /> returned
                        </span>
                      )}
                    </div>
                  </div>
                  {left !== undefined && canRefund(purse, now, left) && (
                    <ChainButton
                      label="Return their money"
                      busyLabel="Returning…"
                      data={encodeFunctionData({ abi: purseAbi, functionName: 'refund', args: [purse.id, f.address] })}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {!purse.named && now > purse.nameBy && <p className="mt-2 text-xs opacity-60">No winners were named in time, so each funder can take back exactly what they put in. Anyone can press the button for them.</p>}
      </Section>

      <Section title="History">
        <HistoryList id={purse.id} />
      </Section>
    </>
  )
}
