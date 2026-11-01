import { useQuery } from '@tanstack/react-query'
import { readAllowance, readUsdcBalance } from './data'
import { PURSE_ADDRESS } from './env'

type Address = `0x${string}`

/** The wallet's USDC (6-decimal ERC-20 view) and how much of it the Purse contract may take. */
export function useUsdcAccount(owner: Address | undefined) {
  const balance = useQuery({
    queryKey: ['usdc', 'balance', owner],
    queryFn: () => readUsdcBalance(owner as Address),
    enabled: !!owner,
  })
  const allowance = useQuery({
    queryKey: ['usdc', 'allowance', owner],
    queryFn: () => readAllowance(owner as Address),
    enabled: !!owner && PURSE_ADDRESS !== null,
  })
  return { balance, allowance }
}
