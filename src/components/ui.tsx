import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { explorerAddress, explorerTx } from '@/lib/env'
import { formatMoney, shortAddress } from '@/lib/format'
import type { PurseState } from '@/lib/purse-state'
import type { SendState } from '@/lib/hooks'
import type { Held } from '@/lib/purse-state'

export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ')

/** Money in the 6-decimal USDC view, with tabular figures so columns line up. */
export function Money({ raw, className = '', unit = true }: { raw: bigint; className?: string; unit?: boolean }) {
  return (
    <span className={cx('tabular-nums whitespace-nowrap', className)}>
      {formatMoney(raw)}
      {unit && <span className="ml-1 text-[0.7em] font-medium tracking-wide text-soft">USDC</span>}
    </span>
  )
}

/** A purse's amount: the pool, or what it held when everything has been returned. */
export function HeldMoney({ held, className = '', returnedClassName = 'text-sm font-medium' }: { held: Held; className?: string; returnedClassName?: string }) {
  if (held.kind === 'loading') return <Skeleton className={cx('inline-block h-[1em] w-24 align-middle', className)} />
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <Money raw={held.raw} className={className} />
      {held.returned && <span className={returnedClassName}>returned</span>}
    </span>
  )
}

/** Copies text and says so for a moment. Roomy hit area without taking up room in the line. */
export function CopyButton({ value, label = 'Copy address' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied' : label}
      className="-m-2 inline-flex items-center justify-center rounded p-2 text-soft hover:text-ink"
      onClick={() => {
        void navigator.clipboard
          ?.writeText(value)
          .then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1600)
          })
          .catch(() => undefined)
      }}
    >
      {copied ? <Check size={16} aria-hidden className="text-lock" /> : <Copy size={16} aria-hidden />}
    </button>
  )
}

/** An address, shortened, linked to the explorer, with a copy button. The full address is shown only on contract lines. */
export function Addr({ address, you }: { address: string; you?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap">
      <a
        href={explorerAddress(address)}
        target="_blank"
        rel="noopener noreferrer"
        title={address}
        className="inline-flex items-center gap-1 font-mono text-[0.9em] underline decoration-ink/30 underline-offset-4 hover:decoration-ink"
      >
        {shortAddress(address)}
        {you && <span className="rounded bg-ink px-1.5 py-px font-sans text-[0.75em] font-medium text-paper no-underline">you</span>}
      </a>
      <CopyButton value={address} />
    </span>
  )
}

/** A contract line: the full address, a copy button and an explorer link. Used only where the address is the point. */
export function ContractLine({ address, href = explorerAddress(address) }: { address: string; href?: string }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="break-all font-mono text-[0.9em]">{address}</span>
      <CopyButton value={address} label="Copy contract address" />
      <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
        Explorer <ExternalLink size={14} aria-hidden />
      </a>
    </span>
  )
}

export function TxLink({ hash, label = 'Transaction' }: { hash: string; label?: string }) {
  return (
    <a
      href={explorerTx(hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 underline decoration-ink/30 underline-offset-4 hover:decoration-ink"
    >
      {label}
      <ExternalLink size={14} aria-hidden />
    </a>
  )
}

const GREEN_STATES: PurseState[] = ['Locked', 'Paid out']

export function StatePill({ state }: { state: PurseState }) {
  const green = GREEN_STATES.includes(state)
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-sm font-medium',
        green ? 'border-lock bg-lock text-white' : 'border-ink/40 text-ink',
      )}
    >
      <span className={cx('h-1.5 w-1.5 rounded-full', green ? 'bg-white' : 'bg-ink/60')} aria-hidden />
      {state}
    </span>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={cx('skeleton', className)} aria-hidden />
}

export function Notice({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return (
    <div className={cx('border-l-2 py-1 pl-4 text-pretty', strong ? 'border-ink' : 'border-rule')}>
      {children}
    </div>
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'green' }

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-ink text-paper hover:bg-ink/85',
        variant === 'green' && 'bg-lock text-white hover:bg-lock/90',
        variant === 'secondary' && 'border border-ink/40 bg-transparent hover:border-ink hover:bg-ink/[0.04]',
        className,
      )}
    />
  )
}

/** Plain-words status under a button that sends a transaction. */
export function SendStatus({ state }: { state: SendState }) {
  if (state.phase === 'idle') return null
  return (
    <div className="mt-2 text-sm" role="status" aria-live="polite">
      {state.phase === 'wallet' && <p className="text-soft">Waiting for your wallet. Confirm the request there.</p>}
      {state.phase === 'confirming' && (
        <p className="text-soft">
          Sent. Waiting for the network to confirm. {state.hash && <TxLink hash={state.hash} label="Watch it" />}
        </p>
      )}
      {state.phase === 'done' && (
        <p className="text-lock">
          Done. {state.hash && <TxLink hash={state.hash} label="View transaction" />}
        </p>
      )}
      {state.phase === 'error' && <p className="font-medium">{state.error}</p>}
    </div>
  )
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="mt-14 border-t border-rule pt-8">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** A ledger: label and value rows separated by one thin rule, with no boxes inside boxes. */
export function Ledger({ children }: { children: ReactNode }) {
  return <dl className="divide-y divide-rule border-y border-rule">{children}</dl>
}

export function LedgerRow({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-4 sm:grid-cols-[11.5rem_1fr] sm:gap-6">
      <dt className="text-soft">{label}</dt>
      <dd className="min-w-0 text-pretty">{children}</dd>
    </div>
  )
}

/** Small heading for a group of rows in a long list. */
export function GroupLabel({ children }: { children: ReactNode }) {
  return <h3 className="pb-3 pt-10 text-base font-medium text-soft">{children}</h3>
}

export const BackLink = ({ to = '/', children = 'All purses' }: { to?: string; children?: ReactNode }) => (
  <Link to={to} className="underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
    {children}
  </Link>
)
