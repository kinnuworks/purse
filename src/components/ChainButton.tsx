import type { Hex } from 'viem'
import { useSend } from '@/lib/hooks'
import { PURSE_ADDRESS } from '@/lib/env'
import { Button, SendStatus } from './ui'

/**
 * One button that sends one transaction to the Purse contract (or another contract) and says in words what happened.
 * Anyone can press the delivery, refund and return buttons; the wallet only pays the network fee.
 */
export function ChainButton({
  label,
  busyLabel = 'Working…',
  data,
  to = PURSE_ADDRESS,
  variant = 'secondary',
  disabled = false,
  onDone,
  className = '',
}: {
  label: string
  busyLabel?: string
  data: Hex
  to?: `0x${string}` | null
  variant?: 'primary' | 'secondary' | 'green'
  disabled?: boolean
  onDone?: () => void
  className?: string
}) {
  const { send, state, busy } = useSend()
  return (
    <div className={className}>
      <Button
        variant={variant}
        disabled={disabled || busy || !to}
        onClick={() => {
          if (!to) return
          void send({ to, data }).then((receipt) => {
            if (receipt) onDone?.()
          })
        }}
      >
        {busy ? busyLabel : label}
      </Button>
      <SendStatus state={state} />
    </div>
  )
}
