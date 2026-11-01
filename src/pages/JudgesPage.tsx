import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { ContractLine, Ledger, LedgerRow, Money, Notice, Skeleton } from '@/components/ui'
import { CHAIN_ID, PURSE_ADDRESS, STUDIO_PROJECT_URL, explorerTx, sourcifyUrl } from '@/lib/env'
import { useHistory } from '@/lib/history'
import { usePurseList } from '@/lib/hooks'
import { computeStats, pickExamples, type Example, type MoneyOut } from '@/lib/stats'
import { readProof } from '@/lib/proof-data'
import proof from '@/proof.json'


const linkClass = 'inline-flex items-center gap-1 underline decoration-ink/30 underline-offset-4 hover:text-brass hover:decoration-brass'

const WAYS: Record<MoneyOut, { heading: string; sentence: (e: Example) => string }> = {
  delivered: { heading: 'Delivered to a winner', sentence: () => 'was sent to a winner the organiser had named.' },
  refunded: { heading: 'Refunded to a funder', sentence: () => 'went back to a funder because no winners were named in time.' },
  returned: { heading: 'Returned when unclaimed', sentence: () => 'went back to the organiser because the winner never claimed it.' },
}

function Row({ kind, example, loading }: { kind: MoneyOut; example: Example | null; loading: boolean }) {
  return (
    <li className="py-5">
      <div className="font-semibold">{WAYS[kind].heading}</div>
      {loading ? (
        <Skeleton className="mt-2 h-5 w-3/4" />
      ) : example ? (
        <>
          <p className="mt-1 text-pretty">
            <Money raw={example.amount} /> from “{example.title}” {WAYS[kind].sentence(example)}
          </p>
          <p className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
            <Link to={`/p/${example.purseId}`} className={linkClass}>
              Purse #{example.purseId.toString()}
            </Link>
            <a href={explorerTx(example.txHash)} target="_blank" rel="noopener noreferrer" className={linkClass}>
              Mainnet transaction <ExternalLink size={14} aria-hidden />
            </a>
          </p>
        </>
      ) : (
        <p className="mt-1 text-soft">This has not happened on the live contract yet.</p>
      )}
    </li>
  )
}

function StatRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <tr className="border-t border-rule first:border-t-0">
      <th scope="row" className="py-3 pr-4 text-left font-normal">
        {label}
      </th>
      <td className="py-3 text-right font-display text-[22px] font-medium tabular-nums">{children}</td>
    </tr>
  )
}

export default function JudgesPage() {
  const file = readProof(proof)
  const ours = file.ours
  const history = useHistory()
  const list = usePurseList()
  const ready = history.status === 'ready' && list.data !== undefined
  const examples = pickExamples(history.events)
  const stats = list.data ? computeStats(history.events, list.data.map((p) => p.owed), ours) : null

  return (
    <>
      <h1 className="h-headline">For reviewers</h1>
      <p className="mt-3 max-w-[34rem] text-lg text-pretty">
        Purse is a contract on Arc that locks a contest’s USDC prize before the contest starts. The whole pool has to go to the named winners. If nobody is named in time, each funder gets their own money back. A prize left unclaimed returns to the organiser.
      </p>

      <div className="mt-10">
        <Ledger>
          <LedgerRow label="Contract">
            {PURSE_ADDRESS ? (
              <>
                <ContractLine address={PURSE_ADDRESS} />
                <a href={sourcifyUrl(PURSE_ADDRESS, CHAIN_ID)} target="_blank" rel="noopener noreferrer" className={`${linkClass} mt-2`}>
                  Sourcify, exact match <ExternalLink size={14} aria-hidden />
                </a>
              </>
            ) : (
              'Not set'
            )}
          </LedgerRow>
          <LedgerRow label="Built in Arc Studio">
            <a href={STUDIO_PROJECT_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
              Studio project <ExternalLink size={14} aria-hidden />
            </a>
          </LedgerRow>
          <LedgerRow label="Tests passing">
            <span className="tabular-nums">
              {file.foundryTests !== undefined && <span className="mr-5 inline-block">Contract {file.foundryTests}</span>}
              {file.appTests !== undefined && <span className="mr-5 inline-block">App {file.appTests}</span>}
              {file.sdkTests !== undefined && <span className="inline-block">SDK {file.sdkTests}</span>}
            </span>
            <span className="mt-1 block text-soft">Recorded in the repo, not read from the chain.</span>
          </LedgerRow>
          <LedgerRow label="Outside feedback that changed the product">
            <blockquote className="border-l-2 border-ink pl-4 text-lg text-pretty">“improve on design so it’s easier to view and easy on eyes.”</blockquote>
            <span className="mt-2 block text-soft">Every page was redesigned in response.</span>
          </LedgerRow>
        </Ledger>
      </div>

      <section className="mt-20 border-t border-rule pt-10" aria-labelledby="sixty">
        <h2 id="sixty" className="h-section">
          See it in 60 seconds
        </h2>
        <p className="mt-2 text-soft">One real example, from the live contract, for each way money can leave it.</p>
        <ul className="mt-4 divide-y divide-rule border-y border-rule">
          {(['delivered', 'refunded', 'returned'] as const).map((kind) => (
            <Row key={kind} kind={kind} example={examples[kind]} loading={history.status !== 'ready' && examples[kind] === null} />
          ))}
        </ul>
        <p className="mt-4">
          <Link to="/break-it" className={linkClass}>
            Try to break it
          </Link>{' '}
          <span className="text-soft">to watch the contract refuse eight things it should refuse.</span>
        </p>
      </section>

      <section className="mt-20 border-t border-rule pt-10" aria-labelledby="live">
        <h2 id="live" className="h-section">
          Counts from the chain, live
        </h2>
        {!PURSE_ADDRESS ? (
          <div className="mt-4">
            <Notice>The contract address is not set.</Notice>
          </div>
        ) : !ready || !stats ? (
          <div className="mt-4 space-y-3" aria-busy="true">
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-7 w-full" />
            {history.progress && (
              <p className="text-sm text-soft tabular-nums">
                Reading the chain history: block {history.progress.scannedTo.toString()} of {history.progress.head.toString()}
              </p>
            )}
          </div>
        ) : (
          <>
            <table className="mt-4 w-full border-y border-rule">
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
            <p className="mt-3 text-sm text-soft text-pretty">
              Wallets are organisers, funders, winners, and whoever pressed Deliver or Return. “Ours” are the {ours.length} addresses listed in the repo’s proof file; every other wallet counts as “others”.
            </p>
            <p className="mt-4 max-w-[34rem] text-pretty">
              Everything so far is small and mostly our own wallets. The two launch-prize winners are people I know personally.
            </p>
          </>
        )}
      </section>

      <p className="mt-20 max-w-[34rem] border-l-2 border-ink pl-4 text-pretty">
        What this does not prove: the organiser alone picks the winners, and Purse cannot show the judging was fair. The contract has not been audited.
      </p>
    </>
  )
}
