import { useState } from 'react'
import type { Address } from 'viem'
import { encodeFunctionData, erc20Abi } from 'viem'
import { useAccount } from 'wagmi'
import { PURSE_ADDRESS, USDC_ADDRESS } from '@/lib/env'
import { formatMoney, parseMoney } from '@/lib/format'
import { useSend } from '@/lib/hooks'
import { purseAbi } from '@/lib/purse-abi'
import { useUsdcAccount } from '@/lib/usdc-hooks'
import { Button, Money, SendStatus } from './ui'

/** Anyone can add money while a purse is open. Two clear steps: approve USDC, then add. */
export function AddFunds({ id }: { id: bigint }) {
  const { address } = useAccount()
  const [text, setText] = useState('')
  const amount = parseMoney(text)
  const { balance, allowance } = useUsdcAccount(address)
  const approve = useSend()
  const add = useSend()

  if (!PURSE_ADDRESS) return null
  const purseAddress: Address = PURSE_ADDRESS
  const valid = amount !== null && amount > 0n
  const approved = valid && allowance.data !== undefined && allowance.data >= amount
  const short = valid && balance.data !== undefined && balance.data < amount

  return (
    <div className="rounded-xl border border-ink/15 p-4">
      <h3 className="font-medium">Add to this purse</h3>
      <p className="mt-1 text-sm opacity-70 text-pretty">Anyone can add money until the organiser locks the purse. You can take your own money back if no winners are named in time.</p>
      <label htmlFor="add-amount" className="mt-3 block text-sm font-medium">
        Amount (USDC)
      </label>
      <input
        id="add-amount"
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="0.00"
        className="mt-1 min-h-11 w-full rounded-lg border border-ink/25 px-3 text-right tabular-nums"
      />
      {address && balance.data !== undefined && (
        <p className="mt-1 text-xs opacity-60">
          Your balance: <Money raw={balance.data} />
        </p>
      )}
      {text !== '' && !valid && <p className="mt-1 text-sm">Enter an amount like 5 or 12.50.</p>}
      {short && <p className="mt-1 text-sm">Your wallet holds less USDC than that.</p>}

      <ol className="mt-4 space-y-4">
        <li>
          <p className="text-sm font-medium">Step 1. Let the purse take {valid ? formatMoney(amount) : 'this amount'} USDC</p>
          {approved ? (
            <p className="mt-1 text-sm text-lock">Already approved.</p>
          ) : (
            <>
              <Button
                className="mt-2"
                variant="secondary"
                disabled={!valid || approve.busy}
                onClick={() => {
                  if (!valid) return
                  void approve.send({
                    to: USDC_ADDRESS,
                    data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [purseAddress, amount] }),
                  })
                }}
              >
                {approve.busy ? 'Approving…' : 'Approve USDC'}
              </Button>
              <SendStatus state={approve.state} />
            </>
          )}
        </li>
        <li>
          <p className="text-sm font-medium">Step 2. Add it to the purse</p>
          <Button
            className="mt-2"
            disabled={!valid || !approved || short || add.busy}
            onClick={() => {
              if (!valid) return
              void add.send({ to: purseAddress, data: encodeFunctionData({ abi: purseAbi, functionName: 'add', args: [id, amount] }) }).then((r) => {
                if (r) setText('')
              })
            }}
          >
            {add.busy ? 'Adding…' : 'Add funds'}
          </Button>
          <SendStatus state={add.state} />
        </li>
      </ol>
    </div>
  )
}
