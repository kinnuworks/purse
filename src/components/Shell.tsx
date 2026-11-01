import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi'
import { CHAIN_ID, PURSE_ADDRESS } from '@/lib/env'
import { shortAddress } from '@/lib/format'
import { Addr, Button, Notice, cx } from './ui'

function WalletButton() {
  const { address, isConnected, chainId } = useAccount()
  const { connect, connectors, isPending, error } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: switching } = useSwitchChain()

  if (!isConnected || !address) {
    const noWallet = typeof (window as { ethereum?: unknown }).ethereum === 'undefined'
    // The long explanation lives in the tooltip so the header never changes height.
    const hint = noWallet
      ? 'No browser wallet found. You can still read everything here.'
      : error
        ? 'Could not connect. Try again.'
        : 'Connect a browser wallet to create or manage a purse.'
    return (
      <Button variant="secondary" disabled={isPending || noWallet} title={hint} aria-label={hint} onClick={() => connect({ connector: connectors[0] })}>
        {isPending ? 'Connecting…' : noWallet ? 'No wallet found' : error ? 'Try again' : 'Connect wallet'}
      </Button>
    )
  }
  if (chainId !== CHAIN_ID) {
    return (
      <Button disabled={switching} onClick={() => switchChain({ chainId: CHAIN_ID })}>
        {switching ? 'Switching…' : 'Switch to Arc'}
      </Button>
    )
  }
  return (
    <Button variant="secondary" onClick={() => disconnect()} title="Connected. Press to disconnect." aria-label="Connected. Press to disconnect.">
      <span className="font-mono text-sm">{shortAddress(address)}</span>
    </Button>
  )
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  cx('inline-flex min-h-11 items-center whitespace-nowrap underline-offset-8 hover:underline', isActive ? 'font-medium underline decoration-2' : 'text-soft hover:text-ink')

export function Shell({ children }: { children: ReactNode }) {
  return (
    // Bottom padding keeps the floating "Built with Arc Studio" badge from sitting on any text.
    <div className="min-h-dvh bg-paper pb-32 text-ink">
      <header className="mx-auto max-w-[720px] px-5 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-x-6 sm:flex-nowrap">
          <Link to="/" className="font-display text-xl font-semibold tracking-tight">
            Purse
          </Link>
          <nav className="order-3 -mx-5 flex w-[calc(100%+2.5rem)] gap-x-5 overflow-x-auto px-5 sm:order-none sm:mx-0 sm:w-auto sm:flex-1 sm:overflow-visible sm:px-0" aria-label="Main">
            <NavLink to="/" end className={navClass}>
              Purses
            </NavLink>
            <NavLink to="/new" className={navClass}>
              New purse
            </NavLink>
            <NavLink to="/proof" className={navClass}>
              Proof
            </NavLink>
            <NavLink to="/judges" className={navClass}>
              For reviewers
            </NavLink>
          </nav>
          <WalletButton />
        </div>
        <div className="mt-2 border-b border-rule" />
      </header>
      <main className="mx-auto max-w-[720px] px-5 pt-10">{children}</main>
      <footer className="mx-auto mt-20 max-w-[720px] px-5 text-sm text-soft">
        {PURSE_ADDRESS ? (
          <span className="inline-flex flex-wrap items-center gap-x-2">
            Contract <Addr address={PURSE_ADDRESS} />
          </span>
        ) : (
          'Contract address not set'
        )}
      </footer>
    </div>
  )
}

export function NotConfigured() {
  return (
    <Notice strong>
      The Purse contract address is not set yet. Add <span className="font-mono">VITE_PURSE_ADDRESS</span> (and <span className="font-mono">VITE_DEPLOY_BLOCK</span>) to the app settings, then reload.
    </Notice>
  )
}
