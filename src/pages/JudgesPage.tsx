import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { Money, Notice, Skeleton } from '@/components/ui'
import { CHAIN_ID, PURSE_ADDRESS, STUDIO_PROJECT_URL, explorerAddress, explorerTx, sourcifyUrl } from '@/lib/env'
import { useHistory } from '@/lib/history'
import { usePurseList } from '@/lib/hooks'
import { computeStats, pickExamples, type Example, type MoneyOut } from '@/lib/stats'
import proof from '@/proof.json'

interface ProofFile {
  foundryTests?: number
  appTests?: number
  sdkTests?: number
  ourAddresses?: Array<{ address: string; label?: string }>
}
const file = proof as ProofFile
const ours = (file.ourAddresses ?? []).map((a) => a.address)

const linkClass = 'inline-flex items-center gap-1 underline decoration-ink/25 underline-offset-2 hover:decoration-ink'

const WAYS: Record<MoneyOut, { heading: string; sentence: (e: Example) => string }> = {
  delivered: { heading: 'Delivered to a winner', sentence: () => 'was sent to a winner the organiser had named.' },
  refunded: { heading: 'Refunded to a funder', sentence: () => 'went back to a funder because no winners were named in time.' },
  returned: { heading: 'Returned when unclaimed', sentence: () => 'went back to the organiser because the winner never claimed it.' },
}

function Row({ kind, example, loading }: { kind: MoneyOut; example: Example | null; loading: boolean }) {
  return (
    <li className="px-4 py-3 text-sm">
      <div className="font-medium">{WAYS[kind].heading}</div>
      {loading ? (
        <Skeleton className="mt-2 h-4 w-3/4" />
      ) : example ? (
        <>
          <p className="mt-0.5 text-pretty">
            <Money raw={example.amount} /> from “{example.title}” {WAYS[kind].sentence(example)}
          </p>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            <Link to={`/p/${example.purseId}`} className={linkClass}>
              Purse #{example.purseId.toString()}
            </Link>
            <a href={explorerTx(example.txHash)} target="_blank" rel="noopener noreferrer" className={linkClass}>
              Mainnet transaction <ExternalLink size={12} aria-hidden />
            </a>
          </p>
        </>
      ) : (
        <p className="mt-0.5 opacity-70">This has not happened on the live contract yet.</p>
      )}
    </li>
  )
}

function StatRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <tr className="border-t border-ink/10">
      <th scope="row" className="py-2 pr-4 text-left font-normal">
        {label}
      </th>
      <td className="py-2 text-right tabular-nums">{children}</td>
    </tr>
  )
}

export default function JudgesPage() {
  const history = useHistory()
  const list = usePurseList()
  const ready = history.status === 'ready' && list.data !== undefined
  const examples = pickExamples(history.events)
  const stats = list.data ? computeStats(history.events, list.data.map((p) => p.owed), ours) : null

  return (
    <>
      <h1 className="font-display text-3xl font-semibold tracking-tight">For reviewers</h1>
      <p className="mt-3 max-w-prose text-pretty">
        Purse is a contract on Arc that locks a contest’s USDC prize before the contest starts, so the money can only be paid to the winners the organiser names, or sent back.
      </p>

      <dl className="mt-6 space-y-4 text-sm">
        <div>
          <dt className="opacity-60">Contract</dt>
          <dd className="mt-1">
            {PURSE_ADDRESS ? (
              <>
                <span className="break-all font-mono">{PURSE_ADDRESS}</span>
                <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  <a href={explorerAddress(PURSE_ADDRESS)} target="_blank" rel="noopener noreferrer" className={linkClass}>
                    Explorer <ExternalLink size={12} aria-hidden />
                  </a>
                  <a href={sourcifyUrl(PURSE_ADDRESS, CHAIN_ID)} target="_blank" rel="noopener noreferrer" className={linkClass}>
                    Sourcify, exact match <ExternalLink size={12} aria-hidden />
                  </a>
                </span>
              </>
            ) : (
              'Not set'
            )}
          </dd>
        </div>
        <div>
          <dt className="opacity-60">Built in Arc Studio</dt>
          <dd className="mt-1">
            <a href={STUDIO_PROJECT_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
              Studio project <ExternalLink size={12} aria-hidden />
            </a>
          </dd>
        </div>
        <div>
          <dt className="opacity-60">Tests passing (recorded in the repo, not read from chain)</dt>
          <dd className="mt-1 tabular-nums">
            {file.foundryTests !== undefined && <span className="mr-4">Contract {file.foundryTests}</span>}
            {file.appTests !== undefined && <span className="mr-4">App {file.appTests}</span>}
            {file.sdkTests !== undefined && <span>SDK {file.sdkTests}</span>}
          </dd>
        </div>
      </dl>

      <section className="mt-8" aria-labelledby="sixty">
        <h2 id="sixty" className="font-display text-lg font-semibold tracking-tight">
          See it in 60 seconds
        </h2>
        <p className="mt-1 text-sm opacity-70">One real example, from the live contract, for each way money can leave it.</p>
        <ul className="mt-3 divide-y divide-ink/10 rounded-xl border border-ink/15">
          {(['delivered', 'refunded', 'returned'] as const).map((kind) => (
            <Row key={kind} kind={kind} example={examples[kind]} loading={history.status !== 'ready' && examples[kind] === null} />
          ))}
        </ul>
        <p className="mt-2 text-sm">
          <Link to="/break-it" className={linkClass}>
            Try to break it
          </Link>{' '}
          <span className="opacity-70">to watch the contract refuse eight things it should refuse.</span>
        </p>
      </section>

      <section className="mt-8" aria-labelledby="live">
        <h2 id="live" className="font-display text-lg font-semibold tracking-tight">
          Counts from the chain, live
        </h2>
        {!PURSE_ADDRESS ? (
          <Notice>The contract address is not set.</Notice>
        ) : !ready || !stats ? (
          <div className="mt-3 space-y-2" aria-busy="true">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            {history.progress && (
              <p className="text-xs opacity-60 tabular-nums">
                Reading the chain history: block {history.progress.scannedTo.toString()} of {history.progress.head.toString()}
              </p>
            )}
          </div>
        ) : (
          <>
            <table className="mt-2 w-full text-sm">
              <tbody>
                <StatRow label="Purses">{stats.purses}</StatRow>
                <StatRow label="USDC locked now">
                  <Money raw={stats.lockedNow} unit={false} />
                </StatRow>
                <StatRow label="USDC delivered to winners">
                  <Money raw={stats.delivered} unit={false} />
                </StatRow>
                <StatRow label="USDC refunded to funders">
                  <Money raw={stats.refunded} unit={false} />
                </StatRow>
                <StatRow label="USDC returned when unclaimed">
                  <Money raw={stats.returned} unit={false} />
                </StatRow>
                <StatRow label="Distinct wallets">{stats.wallets.total}</StatRow>
                <StatRow label="of which ours">{stats.wallets.ours}</StatRow>
                <StatRow label="of which others">{stats.wallets.others}</StatRow>
              </tbody>
            </table>
            <p className="mt-2 text-xs opacity-60 text-pretty">
              Wallets are organisers, funders, winners, and whoever pressed Deliver or Return. “Ours” are the {ours.length} addresses listed in the repo’s proof file; every other wallet counts as “others”.
            </p>
          </>
        )}
      </section>

      <p className="mt-8 border-l-2 border-ink pl-3 text-sm text-pretty">
        What this does not prove: the organiser alone picks the winners, and Purse cannot show the judging was fair. The contract has not been audited.
      </p>
    </>
  )
}
