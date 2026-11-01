import { ExternalLink } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { NotConfigured } from '@/components/Shell'
import { Addr, Notice, Skeleton } from '@/components/ui'
import { readTransaction, testnetAddressUrl, testnetTxUrl, type ProofNetwork } from '@/lib/data'
import { CHAIN_ID, PURSE_ADDRESS, STUDIO_PROJECT_URL, explorerAddress, explorerTx, sourcifyUrl } from '@/lib/env'
import { formatDate, shortAddress } from '@/lib/format'
import proof from '@/proof.json'

interface ProofTx {
  /** Who sent it, in words: "Organiser", "Sponsor", "Winner", "Anyone". */
  sender: string
  what: string
  hash: string
  /** Leave out for Arc mainnet. "testnet" marks a rehearsal on Arc Testnet with no real money. */
  network?: ProofNetwork
}

interface ProofFile {
  foundryTests: number
  /** Address of the Purse contract used for the testnet rehearsal, if any. */
  testnetContract?: string
  transactions: ProofTx[]
}

const file = proof as ProofFile
const transactions = file.transactions
const HASH = /^0x[0-9a-fA-F]{64}$/

function ProofRow({ tx }: { tx: ProofTx }) {
  const valid = HASH.test(tx.hash)
  const read = useQuery({
    queryKey: ['proof-tx', tx.network ?? 'mainnet', tx.hash],
    queryFn: () => readTransaction(tx.hash as `0x${string}`, tx.network ?? 'mainnet'),
    enabled: valid,
    staleTime: Infinity,
  })
  return (
    <tr className="border-t border-ink/10 align-top">
      <td className="py-3 pr-3 font-medium">{tx.sender}</td>
      <td className="py-3 pr-3">
        {tx.what}
        {tx.network === 'testnet' && <span className="ml-2 rounded border border-ink/30 px-1.5 py-0.5 text-xs font-medium">Testnet</span>}
      </td>
      <td className="py-3 pr-3 tabular-nums">
        {!valid ? 'Not a valid hash' : read.isLoading ? <Skeleton className="h-4 w-28" /> : read.data ? formatDate(read.data.timestamp) : 'Not found'}
      </td>
      <td className="py-3 pr-3">{read.data ? tx.network === 'testnet' ? <a href={testnetAddressUrl(read.data.from)} target="_blank" rel="noopener noreferrer" title={read.data.from} className="font-mono text-[0.85em] underline decoration-ink/25 underline-offset-2 hover:decoration-ink">{shortAddress(read.data.from)}</a> : <Addr address={read.data.from} /> : read.isLoading ? <Skeleton className="h-4 w-20" /> : '—'}</td>
      <td className="py-3 pr-3">{read.data ? (read.data.status === 'success' ? 'Succeeded' : 'Failed') : read.isLoading ? <Skeleton className="h-4 w-14" /> : '—'}</td>
      <td className="py-3">
        {valid &&
          (tx.network === 'testnet' ? (
            <a href={testnetTxUrl(tx.hash)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm underline decoration-ink/25 underline-offset-2 hover:decoration-ink">
              Open <ExternalLink size={12} aria-hidden />
            </a>
          ) : (
            <a href={explorerTx(tx.hash)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm underline decoration-ink/25 underline-offset-2 hover:decoration-ink">
              Open <ExternalLink size={12} aria-hidden />
            </a>
          ))}
      </td>
    </tr>
  )
}

export default function ProofPage() {
  return (
    <>
      <h1 className="font-display text-3xl font-semibold tracking-tight">Proof</h1>
      <p className="mt-2 max-w-prose text-sm opacity-75 text-pretty">Where the contract lives, how it was built, and the transactions that show it working.</p>

      <dl className="mt-6 space-y-5 text-sm">
        <div>
          <dt className="opacity-60">Contract address</dt>
          <dd className="mt-1 break-all font-mono">
            {PURSE_ADDRESS ? (
              <a href={explorerAddress(PURSE_ADDRESS)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline decoration-ink/25 underline-offset-2 hover:decoration-ink">
                {PURSE_ADDRESS} <ExternalLink size={12} aria-hidden />
              </a>
            ) : (
              <span className="font-sans">Not set yet</span>
            )}
          </dd>
        </div>
        {PURSE_ADDRESS && (
          <div>
            <dt className="opacity-60">Source code</dt>
            <dd className="mt-1">
              <a href={sourcifyUrl(PURSE_ADDRESS, CHAIN_ID)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline decoration-ink/25 underline-offset-2 hover:decoration-ink">
                Verified on Sourcify, exact match <ExternalLink size={12} aria-hidden />
              </a>
            </dd>
          </div>
        )}
        {file.testnetContract && (
          <div>
            <dt className="opacity-60">Testnet rehearsal contract (Arc Testnet, no real money)</dt>
            <dd className="mt-1 break-all font-mono">
              <a href={testnetAddressUrl(file.testnetContract)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline decoration-ink/25 underline-offset-2 hover:decoration-ink">
                {file.testnetContract} <ExternalLink size={12} aria-hidden />
              </a>
            </dd>
          </div>
        )}
        <div>
          <dt className="opacity-60">Built in Arc Studio</dt>
          <dd className="mt-1">
            <a href={STUDIO_PROJECT_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline decoration-ink/25 underline-offset-2 hover:decoration-ink">
              Open the Studio project <ExternalLink size={12} aria-hidden />
            </a>
          </dd>
        </div>
        <div>
          <dt className="opacity-60">Contract tests passing</dt>
          <dd className="mt-1 tabular-nums">{file.foundryTests}</dd>
        </div>
      </dl>

      {!PURSE_ADDRESS && (
        <div className="mt-6">
          <NotConfigured />
        </div>
      )}

      <section className="mt-10">
        <h2 className="font-display text-lg font-semibold tracking-tight">Transactions</h2>
        {transactions.length === 0 ? (
          <div className="mt-3">
            <Notice>No transactions have been added yet. Add them to <span className="font-mono">src/proof.json</span> with who sent each one.</Notice>
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider opacity-60">
                <tr>
                  <th className="pb-2 pr-3 font-medium">Sent by</th>
                  <th className="pb-2 pr-3 font-medium">What</th>
                  <th className="pb-2 pr-3 font-medium">When</th>
                  <th className="pb-2 pr-3 font-medium">From wallet</th>
                  <th className="pb-2 pr-3 font-medium">Result</th>
                  <th className="pb-2 font-medium">Link</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <ProofRow key={tx.hash} tx={tx} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
