import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { explorerAddress, explorerTx } from '@/lib/env'
import { formatDay, formatMoney, formatDate, shortAddress } from '@/lib/format'
import { markSeen, wasSeen } from '@/lib/seen'
import type { PurseState } from '@/lib/purse-state'
import type { SendState } from '@/lib/hooks'
import type { Held } from '@/lib/purse-state'

export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ')

const linkClass = 'underline decoration-ink/30 underline-offset-4 hover:text-brass hover:decoration-brass'

/** Money in the 6-decimal USDC view: serif, lining tabular figures, "USDC" in small caps. */
export function Money({ raw, className = '', unit = true, unitClassName = 'text-[0.62em]' }: { raw: bigint; className?: string; unit?: boolean; unitClassName?: string }) {
  return (
    <span className={cx('font-display font-medium tabular-nums whitespace-nowrap', className)} style={{ fontVariantNumeric: 'lining-nums tabular-nums' }}>
      {formatMoney(raw)}
      {unit && <span className={cx('smallcaps ml-1 text-soft', unitClassName)}>USDC</span>}
    </span>
  )
}

/** A purse's amount: the pool, or what it held when everything has been returned. */
export function HeldMoney({
  held,
  className = '',
  returnedClassName = 'text-sm font-medium',
  unitClassName,
}: {
  held: Held
  className?: string
  returnedClassName?: string
  unitClassName?: string
}) {
  if (held.kind === 'loading') return <Skeleton className={cx('inline-block h-[0.8em] w-40 align-middle', className)} />
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-3">
      <Money raw={held.raw} className={className} unitClassName={unitClassName} />
      {held.returned && <span className={returnedClassName}>returned</span>}
    </span>
  )
}

/** A date and time in mono, as the design asks for dates. */
export function Dt({ seconds, className = '' }: { seconds: bigint | number; className?: string }) {
  return <span className={cx('t-mono whitespace-nowrap', className)}>{formatDate(seconds)}</span>
}

/** Copies text and says so for a moment. Roomy hit area without taking up room in the line. */
export function CopyButton({ value, label = 'Copy address' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied' : label}
      className="-m-2 inline-flex items-center justify-center rounded p-2 text-soft hover:text-brass"
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
      {copied ? <Check size={16} aria-hidden className="text-paid" /> : <Copy size={16} aria-hidden />}
    </button>
  )
}

/** An address, shortened, linked to the explorer, with a copy button. The full address is shown only on contract lines. */
export function Addr({ address, you }: { address: string; you?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap">
      <a href={explorerAddress(address)} target="_blank" rel="noopener noreferrer" title={address} className={cx('t-mono inline-flex items-center gap-1.5', linkClass)}>
        {shortAddress(address)}
        {you && <span className="rounded-sm bg-ink px-1.5 py-px font-sans text-[12px] font-semibold text-paper no-underline">you</span>}
      </a>
      <CopyButton value={address} />
    </span>
  )
}

/** A contract line: the full address, a copy button and an explorer link. Used only where the address is the point. */
export function ContractLine({ address, href = explorerAddress(address) }: { address: string; href?: string }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="t-mono break-all">{address}</span>
      <CopyButton value={address} label="Copy contract address" />
      <a href={href} target="_blank" rel="noopener noreferrer" className={cx('inline-flex items-center gap-1', linkClass)}>
        Explorer <ExternalLink size={14} aria-hidden />
      </a>
    </span>
  )
}

export function TxLink({ hash, label = 'Transaction' }: { hash: string; label?: string }) {
  return (
    <a href={explorerTx(hash)} target="_blank" rel="noopener noreferrer" className={cx('inline-flex items-center gap-1', linkClass)}>
      {label}
      <ExternalLink size={14} aria-hidden />
    </a>
  )
}

const PAID_STATES: PurseState[] = ['Locked', 'Paid out']

/** The state marker: the only pill in the design. */
export function StatePill({ state }: { state: PurseState }) {
  const paid = PAID_STATES.includes(state)
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-0.5 text-sm font-semibold',
        paid ? 'border-paid bg-paid text-plate' : 'border-ink bg-plate text-ink',
      )}
    >
      <span className={cx('h-1.5 w-1.5 rounded-full', paid ? 'bg-plate' : 'bg-ink')} aria-hidden />
      {state}
    </span>
  )
}

/**
 * The PAID stamp: a small rotated mark with the date, linked to the transaction when there is one.
 * It presses in once, the first time this row is seen as paid in a browser session.
 */
export function Stamp({ id, date, href }: { id: string; date?: bigint | number; href?: string }) {
  const [press] = useState(() => !wasSeen(id))
  useEffect(() => {
    markSeen(id)
  }, [id])
  const body = (
    <>
      Paid
      {date !== undefined && <span className="stamp-date">{formatDay(date)}</span>}
    </>
  )
  const cls = cx('stamp', press && 'stamp-press')
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls} title="View the transaction">
      {body}
    </a>
  ) : (
    <span className={cls}>{body}</span>
  )
}

/** Paper behind a plate, with faint horizontal statement rules. */
export function PlateBacking({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={cx('plate-backing', className)}>{children}</div>
}

/** The engraved plate: ink border, inner brass rule, one soft edge. One per screen. */
export function Plate({ children, small = false, className = '' }: { children: ReactNode; small?: boolean; className?: string }) {
  return <article className={cx('plate', small && 'plate-sm', className)}>{children}</article>
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={cx('skeleton', className)} aria-hidden />
}

export function Notice({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return <div className={cx('border-l-2 py-1 pl-4 text-pretty', strong ? 'border-ink' : 'border-rule')}>{children}</div>
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'green' }

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded px-5 text-[16px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-55',
        variant === 'primary' && 'bg-ink text-paper hover:bg-black',
        variant === 'green' && 'bg-paid text-plate hover:bg-black',
        variant === 'secondary' && 'border border-ink bg-transparent text-ink hover:bg-ink hover:text-paper',
        className,
      )}
    />
  )
}

/** Plain-words status under a button that sends a transaction. */
export function SendStatus({ state }: { state: SendState }) {
  if (state.phase === 'idle') return null
  return (
    <div className="t-small mt-2" role="status" aria-live="polite">
      {state.phase === 'wallet' && <p className="text-soft">Waiting for your wallet. Confirm the request there.</p>}
      {state.phase === 'confirming' && (
        <p className="text-soft">
          Sent. Waiting for the network to confirm. {state.hash && <TxLink hash={state.hash} label="Watch it" />}
        </p>
      )}
      {state.phase === 'done' && (
        <p className="text-paid">
          Done. {state.hash && <TxLink hash={state.hash} label="View transaction" />}
        </p>
      )}
      {state.phase === 'error' && <p className="font-semibold">{state.error}</p>}
    </div>
  )
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="mt-20 border-t border-rule pt-10">
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <h2 className="h-section">{title}</h2>
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
  return <h3 className="pb-3 pt-12 font-semibold text-soft">{children}</h3>
}

export const BackLink = ({ to = '/', children = 'All purses' }: { to?: string; children?: ReactNode }) => (
  <Link to={to} className={linkClass}>
    {children}
  </Link>
)
