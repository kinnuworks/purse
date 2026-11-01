import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi'
import { CHAIN_ID, PURSE_ADDRESS, explorerAddress } from '@/lib/env'
import { shortAddress } from '@/lib/format'
import { Button, Notice, cx } from './ui'

function WalletButton() {
  const { address, isConnected, chainId } = useAccount()
  const { connect, connectors, isPending, error } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: switching } = useSwitchChain()

  if (!isConnected || !address) {
    const noWallet = typeof (window as { ethereum?: unknown }).ethereum === 'undefined'
    return (
      <div className="flex flex-col items-end">
        <Button variant="secondary" disabled={isPending || noWallet} onClick={() => connect({ connector: connectors[0] })}>
          {isPending ? 'Connecting…' : 'Connect wallet'}
        </Button>
        {noWallet && <span className="mt-1 max-w-48 text-right text-xs opacity-60">No browser wallet found. You can still read everything.</span>}
        {error && !noWallet && <span className="mt-1 text-right text-xs">Could not connect. Try again.</span>}
      </div>
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
    <Button variant="secondary" onClick={() => disconnect()} title="Disconnect">
      <span className="font-mono text-xs">{shortAddress(address)}</span>
    </Button>
  )
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  cx('inline-flex min-h-11 items-center text-sm underline-offset-4 hover:underline', isActive && 'font-medium underline')

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-white pb-24 text-ink">
      <header className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-5 pt-4">
        <Link to="/" className="font-display text-xl font-semibold tracking-tight">
          Purse
        </Link>
        <nav className="order-3 flex w-full items-center gap-5 sm:order-2 sm:w-auto" aria-label="Main">
          <NavLink to="/" end className={navClass}>
            Purses
          </NavLink>
          <NavLink to="/new" className={navClass}>
            New purse
          </NavLink>
          <NavLink to="/proof" className={navClass}>
            Proof
          </NavLink>
        </nav>
        <div className="order-2 sm:order-3">
          <WalletButton />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 pt-6">{children}</main>
      <footer className="mx-auto mt-16 max-w-3xl px-5 text-xs opacity-60">
        {PURSE_ADDRESS ? (
          <a href={explorerAddress(PURSE_ADDRESS)} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            Contract {shortAddress(PURSE_ADDRESS)}
          </a>
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
      The Purse contract address is not set yet. Add <span className="font-mono">VITE_PURSE_ADDRESS</span> (and{' '}
      <span className="font-mono">VITE_DEPLOY_BLOCK</span>) to the app settings, then reload.
    </Notice>
  )
}
