import { ExternalLink } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { NotConfigured } from '@/components/Shell'
import { Addr, ContractLine, CopyButton, Dt, GroupLabel, Ledger, LedgerRow, Notice, Skeleton } from '@/components/ui'
import { readTransaction, testnetAddressUrl, testnetTxUrl } from '@/lib/data'
import { CHAIN_ID, PURSE_ADDRESS, STUDIO_PROJECT_URL, explorerTx, sourcifyUrl } from '@/lib/env'
import { shortAddress } from '@/lib/format'
import { readProof, type ProofTx } from '@/lib/proof-data'
import proof from '@/proof.json'

const HASH = /^0x[0-9a-fA-F]{64}$/

const linkClass = 'inline-flex items-center gap-1 underline decoration-ink/30 underline-offset-4 hover:text-brass hover:decoration-brass'

function ProofRow({ tx }: { tx: ProofTx }) {
  const valid = HASH.test(tx.hash)
  const testnet = tx.network === 'testnet'
  const read = useQuery({
    queryKey: ['proof-tx', tx.network ?? 'mainnet', tx.hash],
    queryFn: () => readTransaction(tx.hash as `0x${string}`, tx.network ?? 'mainnet'),
    enabled: valid,
    staleTime: Infinity,
  })
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <span className="font-semibold text-pretty">
          {tx.what}
          {testnet && <span className="ml-2 whitespace-nowrap rounded-sm border border-soft px-1.5 py-0.5 text-sm font-semibold">Testnet</span>}
        </span>
        <span className="text-soft">
          {!valid ? 'Not a valid hash' : read.isLoading ? <Skeleton className="inline-block h-4 w-28 align-middle" /> : read.data ? <Dt seconds={read.data.timestamp} /> : 'Not found'}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-soft">
        <span>
          Sent by <span className="text-ink">{tx.sender}</span>
        </span>
        <span className="inline-flex items-center gap-2">
          From wallet{' '}
          {read.data ? (
            testnet ? (
              <span className="inline-flex items-center gap-2.5">
                <a href={testnetAddressUrl(read.data.from)} target="_blank" rel="noopener noreferrer" title={read.data.from} className="t-mono text-ink underline decoration-ink/30 underline-offset-4 hover:text-brass hover:decoration-brass">
                  {shortAddress(read.data.from)}
                </a>
                <CopyButton value={read.data.from} />
              </span>
            ) : (
              <Addr address={read.data.from} />
            )
          ) : read.isLoading ? (
            <Skeleton className="inline-block h-4 w-20 align-middle" />
          ) : (
            '—'
          )}
        </span>
        <span>{read.data ? (read.data.status === 'success' ? 'Succeeded' : 'Failed') : read.isLoading ? <Skeleton className="inline-block h-4 w-14 align-middle" /> : '—'}</span>
        {valid && (
          <a href={testnet ? testnetTxUrl(tx.hash) : explorerTx(tx.hash)} target="_blank" rel="noopener noreferrer" className={`${linkClass} text-ink`}>
            Open <ExternalLink size={14} aria-hidden />
          </a>
        )}
      </div>
    </li>
  )
}

export default function ProofPage() {
  const file = readProof(proof)
  const transactions = file.transactions
  const mainnetTransactions = transactions.filter((t) => t.network !== 'testnet')
  const testnetTransactions = transactions.filter((t) => t.network === 'testnet')
  return (
    <>
      <h1 className="h-headline">Proof</h1>
      <p className="mt-3 max-w-[34rem] text-lg text-pretty">Where the contract lives, how it was built, and the transactions that show it working.</p>

      <h2 className="mt-20 h-section">The contract</h2>
      <div className="mt-4">
        <Ledger>
          <LedgerRow label="Contract address">{PURSE_ADDRESS ? <ContractLine address={PURSE_ADDRESS} /> : 'Not set yet'}</LedgerRow>
          {PURSE_ADDRESS && (
            <LedgerRow label="Source code">
              <a href={sourcifyUrl(PURSE_ADDRESS, CHAIN_ID)} target="_blank" rel="noopener noreferrer" className={linkClass}>
                Verified on Sourcify, exact match <ExternalLink size={14} aria-hidden />
              </a>
            </LedgerRow>
          )}
          {file.testnetContract && (
            <LedgerRow label="Testnet contract">
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="break-all t-mono">{file.testnetContract}</span>
                <CopyButton value={file.testnetContract} label="Copy contract address" />
                <a href={testnetAddressUrl(file.testnetContract)} target="_blank" rel="noopener noreferrer" className={linkClass}>
                  Explorer <ExternalLink size={14} aria-hidden />
                </a>
              </span>
              <span className="mt-1 block text-soft">Arc Testnet, no real money.</span>
            </LedgerRow>
          )}
          <LedgerRow label="Built in Arc Studio">
            <a href={STUDIO_PROJECT_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
              Open the Studio project <ExternalLink size={14} aria-hidden />
            </a>
          </LedgerRow>
          <LedgerRow label="Contract tests passing">
            <span className="tabular-nums">{file.foundryTests ?? 'Not recorded'}</span>
          </LedgerRow>
        </Ledger>
      </div>

      {!PURSE_ADDRESS && (
        <div className="mt-6">
          <NotConfigured />
        </div>
      )}

      <h2 className="mt-20 h-section">Transactions</h2>
      {transactions.length === 0 ? (
        <div className="mt-4">
          <Notice>
            No transactions have been added yet. Add them to <span className="t-mono">src/proof.json</span> with who sent each one.
          </Notice>
        </div>
      ) : (
        <>
          <p className="mt-2 text-soft">Each line says who sent it. The wallet, time and result are read from the chain.</p>
          {mainnetTransactions.length > 0 && (
            <>
              <GroupLabel>Arc mainnet</GroupLabel>
              <ul className="divide-y divide-rule border-y border-rule">
                {mainnetTransactions.map((tx) => (
                  <ProofRow key={tx.hash} tx={tx} />
                ))}
              </ul>
            </>
          )}
          {testnetTransactions.length > 0 && (
            <>
              <GroupLabel>Arc Testnet run</GroupLabel>
              <ul className="divide-y divide-rule border-y border-rule">
                {testnetTransactions.map((tx) => (
                  <ProofRow key={tx.hash} tx={tx} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </>
  )
}
