import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { encodeFunctionData, erc20Abi, parseEventLogs, type Address } from 'viem'
import { useQuery } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { useAccount, useConnect, useSwitchChain } from 'wagmi'
import { NotConfigured } from '@/components/Shell'
import { Button, Money, Notice, SendStatus, cx } from '@/components/ui'
import { readMinClaimWindow } from '@/lib/data'
import { CHAIN_ID, PURSE_ADDRESS, USDC_ADDRESS } from '@/lib/env'
import { formatDuration, formatMoney, nowSeconds, parseMoney } from '@/lib/format'
import { useSend } from '@/lib/hooks'
import { purseAbi } from '@/lib/purse-abi'
import { useUsdcAccount } from '@/lib/usdc-hooks'

const UNITS = { minutes: 60, hours: 3600, days: 86400 } as const
type Unit = keyof typeof UNITS

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: ReactNode }) {
  return (
    <section className="border-t border-rule pt-6">
      <h2 className="flex items-center gap-3 font-display text-xl font-semibold tracking-tight">
        <span className={cx('inline-flex h-8 w-8 items-center justify-center rounded-full text-sm', done ? 'bg-lock text-white' : 'border border-ink/40')}>
          {done ? <Check size={14} aria-hidden /> : n}
        </span>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-sm text-soft">{hint}</p>}
    </div>
  )
}

const inputClass = 'mt-2 min-h-12 w-full rounded-lg border border-ink/40 bg-white px-3'

export default function CreatePage() {
  const navigate = useNavigate()
  const { address, isConnected, chainId } = useAccount()
  const { connect, connectors, isPending: connecting } = useConnect()
  const { switchChain, isPending: switching } = useSwitchChain()
  const approve = useSend()
  const create = useSend()

  const [title, setTitle] = useState('')
  const [amountText, setAmountText] = useState('')
  const [nameByText, setNameByText] = useState('')
  const [windowValue, setWindowValue] = useState('7')
  const [unit, setUnit] = useState<Unit>('days')

  const { balance, allowance } = useUsdcAccount(address)
  const minWindow = useQuery({ queryKey: ['min-claim-window'], queryFn: readMinClaimWindow, staleTime: Infinity, enabled: PURSE_ADDRESS !== null })

  if (!PURSE_ADDRESS) return <NotConfigured />
  const purseAddress: Address = PURSE_ADDRESS

  const onChain = isConnected && chainId === CHAIN_ID
  const noWallet = typeof (window as { ethereum?: unknown }).ethereum === 'undefined'

  const amount = parseMoney(amountText)
  const nameBy = nameByText ? BigInt(Math.floor(new Date(nameByText).getTime() / 1000)) : null
  const windowNumber = Number(windowValue)
  const claimWindow = Number.isFinite(windowNumber) && windowNumber > 0 ? BigInt(Math.floor(windowNumber * UNITS[unit])) : null

  const problems: string[] = []
  if (!title.trim()) problems.push('Give the purse a title.')
  if (amount === null || amount <= 0n) problems.push('Enter the prize amount in USDC, for example 250 or 12.50.')
  if (nameBy === null || Number.isNaN(Number(nameBy))) problems.push('Pick the date and time by which you will name winners.')
  else if (nameBy <= nowSeconds()) problems.push('The deadline to name winners has to be in the future.')
  if (claimWindow === null) problems.push('Enter how long winners have to claim after they are named.')
  else if (minWindow.data !== undefined && claimWindow < minWindow.data) problems.push(`The claim window must be at least ${formatDuration(minWindow.data)}.`)
  const short = amount !== null && balance.data !== undefined && balance.data < amount
  if (short) problems.push('Your wallet holds less USDC than the prize.')

  const formOk = problems.length === 0 && amount !== null && nameBy !== null && claimWindow !== null
  const approved = formOk && allowance.data !== undefined && allowance.data >= amount

  const submit = async () => {
    if (!formOk) return
    const receipt = await create.send({
      to: purseAddress,
      data: encodeFunctionData({ abi: purseAbi, functionName: 'create', args: [title.trim(), amount, nameBy, claimWindow] }),
    })
    if (!receipt) return
    const created = parseEventLogs({ abi: purseAbi, logs: receipt.logs, eventName: 'PurseCreated' })[0]
    if (created) void navigate(`/p/${created.args.id.toString()}`)
  }

  return (
    <>
      <h1 className="font-display text-4xl font-semibold tracking-tight">Create a purse</h1>
      <p className="mt-3 max-w-[34rem] text-lg text-pretty">
        The prize leaves your wallet now and sits in the contract. The whole pool has to go to the winners you name. If nobody is named in time, each funder gets their own money back. A prize left unclaimed returns to you.
      </p>

      <div className="mt-10 space-y-10">
        <Step n={1} title="Connect your wallet" done={onChain}>
          {onChain && address ? (
            <p className="text-sm">
              Connected on Arc. {balance.data !== undefined && (<>You hold <Money raw={balance.data} />.</>)}
            </p>
          ) : !isConnected ? (
            <>
              <Button disabled={connecting || noWallet} onClick={() => connect({ connector: connectors[0] })}>
                {connecting ? 'Connecting…' : 'Connect wallet'}
              </Button>
              {noWallet && <p className="mt-2 text-sm">No browser wallet found. Install one such as MetaMask or Rabby, then reload this page.</p>}
            </>
          ) : (
            <>
              <p className="mb-2 text-sm">Your wallet is on a different network.</p>
              <Button disabled={switching} onClick={() => switchChain({ chainId: CHAIN_ID })}>
                {switching ? 'Switching…' : 'Switch to Arc'}
              </Button>
            </>
          )}
        </Step>

        <Step n={2} title="Describe the purse">
          <div className="space-y-4">
            <Field id="title" label="Title">
              <input id="title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Spring hackathon, first prize" className={inputClass} />
            </Field>
            <Field id="amount" label="Prize amount (USDC)" hint="You can add more later, and so can sponsors, until the purse is locked.">
              <input id="amount" inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder="0.00" className={cx(inputClass, 'text-right tabular-nums')} />
            </Field>
            <Field id="nameby" label="Name the winners by" hint="If you have not named winners by then, everyone can take their own money back.">
              <input id="nameby" type="datetime-local" value={nameByText} onChange={(e) => setNameByText(e.target.value)} className={inputClass} />
            </Field>
            <Field id="window" label="Time winners have to claim" hint="Counted from the moment you name winners, so naming late never shortens it.">
              <div className="mt-1 flex gap-2">
                <input id="window" inputMode="decimal" value={windowValue} onChange={(e) => setWindowValue(e.target.value)} className="min-h-12 w-24 rounded-lg border border-ink/40 px-3 text-right tabular-nums" />
                <select aria-label="Claim window unit" value={unit} onChange={(e) => setUnit(e.target.value as Unit)} className="min-h-12 rounded-lg border border-ink/40 bg-white px-3">
                  <option value="minutes">minutes</option>
                  <option value="hours">hours</option>
                  <option value="days">days</option>
                </select>
              </div>
            </Field>
          </div>
          {problems.length > 0 && (title || amountText || nameByText) && (
            <ul className="mt-4 list-disc space-y-0.5 pl-5 text-sm">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </Step>

        <Step n={3} title="Approve USDC" done={approved}>
          {approved ? (
            <p className="text-sm text-lock">Approved. The purse may take {amount !== null && formatMoney(amount)} USDC from your wallet.</p>
          ) : (
            <>
              <p className="mb-2 text-sm text-soft">This lets the contract take exactly the prize amount. It moves nothing yet.</p>
              <Button
                disabled={!formOk || !onChain || approve.busy}
                onClick={() => {
                  if (!formOk) return
                  void approve.send({ to: USDC_ADDRESS, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [purseAddress, amount] }) })
                }}
              >
                {approve.busy ? 'Approving…' : 'Approve USDC'}
              </Button>
              <SendStatus state={approve.state} />
            </>
          )}
        </Step>

        <Step n={4} title="Create the purse">
          <Button variant="green" disabled={!formOk || !onChain || !approved || create.busy} onClick={() => void submit()}>
            {create.busy ? 'Creating…' : 'Create purse'}
          </Button>
          <SendStatus state={create.state} />
          {!approved && formOk && onChain && <p className="mt-2 text-sm text-soft">Approve first, then create.</p>}
        </Step>

        <Notice>You will lock funding and name winners from the purse page after it is created.</Notice>
      </div>
    </>
  )
}
