import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
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
      {unit && <span className="ml-1 text-[0.7em] font-medium tracking-wide opacity-60">USDC</span>}
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

export function Addr({ address, you }: { address: string; you?: boolean }) {
  return (
    <a
      href={explorerAddress(address)}
      target="_blank"
      rel="noopener noreferrer"
      title={address}
      className="inline-flex items-center gap-1 font-mono text-[0.85em] underline decoration-ink/25 underline-offset-2 hover:decoration-ink"
    >
      {shortAddress(address)}
      {you && <span className="rounded bg-ink px-1 py-px font-sans text-[0.7em] font-medium text-white no-underline">you</span>}
    </a>
  )
}

export function TxLink({ hash, label = 'Transaction' }: { hash: string; label?: string }) {
  return (
    <a
      href={explorerTx(hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-sm underline decoration-ink/25 underline-offset-2 hover:decoration-ink"
    >
      {label}
      <ExternalLink size={12} aria-hidden />
    </a>
  )
}

const GREEN_STATES: PurseState[] = ['Locked', 'Paid out']

export function StatePill({ state }: { state: PurseState }) {
  const green = GREEN_STATES.includes(state)
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        green ? 'border-lock bg-lock text-white' : 'border-ink/25 text-ink',
      )}
    >
      <span className={cx('h-1.5 w-1.5 rounded-full', green ? 'bg-white' : 'bg-ink/50')} aria-hidden />
      {state}
    </span>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={cx('skeleton', className)} aria-hidden />
}

export function Notice({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return (
    <div className={cx('rounded-lg border px-4 py-3 text-sm leading-relaxed text-pretty', strong ? 'border-ink bg-ink/[0.03]' : 'border-ink/15')}>
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
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        variant === 'primary' && 'bg-ink text-white hover:bg-ink/90',
        variant === 'green' && 'bg-lock text-white hover:bg-lock/90',
        variant === 'secondary' && 'border border-ink/25 bg-white hover:border-ink',
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
      {state.phase === 'wallet' && <p className="opacity-70">Waiting for your wallet. Confirm the request there.</p>}
      {state.phase === 'confirming' && (
        <p className="opacity-70">
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
    <section className="mt-10">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

export const BackLink = ({ to = '/', children = 'All purses' }: { to?: string; children?: ReactNode }) => (
  <Link to={to} className="text-sm underline decoration-ink/25 underline-offset-2 hover:decoration-ink">
    {children}
  </Link>
)
