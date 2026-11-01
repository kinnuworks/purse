import { useCallback, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAccount, useConnect, useSendTransaction, useSwitchChain } from 'wagmi'
import type { Hex, TransactionReceipt } from 'viem'
import { publicClient } from './chain'
import { readBlockTime, readPurse, readPurseList } from './data'
import { CHAIN_ID, PURSE_ADDRESS } from './env'
import { plainError } from './errors'
import { refreshHistory } from './history'
import { readBlockTimes } from './logs'
import { nowSeconds } from './format'

type Address = `0x${string}`

/** Current time in seconds, refreshed so deadlines flip without a reload. */
export function useNow(intervalMs = 10_000): bigint {
  const [now, setNow] = useState(nowSeconds)
  useEffect(() => {
    const timer = setInterval(() => setNow(nowSeconds()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

export function usePurseList() {
  return useQuery({
    queryKey: ['purse', 'list'],
    queryFn: readPurseList,
    enabled: PURSE_ADDRESS !== null,
    refetchInterval: 20_000,
  })
}

export function usePurse(id: bigint | null) {
  return useQuery({
    queryKey: ['purse', 'one', id?.toString()],
    queryFn: () => readPurse(id as bigint),
    enabled: PURSE_ADDRESS !== null && id !== null,
    refetchInterval: 15_000,
  })
}

/** Timestamps (seconds) for the given blocks, remembered in localStorage. Keys are block numbers as strings. */
export function useBlockTimes(blocks: bigint[]) {
  const key = [...new Set(blocks.map(String))].sort().join(',')
  return useQuery({
    queryKey: ['block-times', key],
    queryFn: () =>
      readBlockTimes({
        blocks,
        fetchTime: readBlockTime,
        storage: window.localStorage,
        cacheKey: `purse:block-times:v1:${CHAIN_ID}`,
      }),
    enabled: blocks.length > 0,
    staleTime: Infinity,
  })
}

export type SendPhase = 'idle' | 'wallet' | 'confirming' | 'done' | 'error'

export interface SendState {
  phase: SendPhase
  hash: Hex | null
  error: string | null
}

/**
 * Sends one transaction from the browser wallet: connects if needed, switches to the Purse chain,
 * dry-runs the call so a refusal is explained in words, then waits for the receipt.
 * Resolves to the receipt, or null when it failed (the reason is in state.error).
 */
export function useSend() {
  const { address, chainId, isConnected } = useAccount()
  const { connectAsync, connectors } = useConnect()
  const { switchChainAsync } = useSwitchChain()
  const { sendTransactionAsync } = useSendTransaction()
  const queryClient = useQueryClient()
  const [state, setState] = useState<SendState>({ phase: 'idle', hash: null, error: null })

  const send = useCallback(
    async (request: { to: Address; data: Hex }): Promise<TransactionReceipt | null> => {
      setState({ phase: 'wallet', hash: null, error: null })
      try {
        let account: Address | undefined = address
        let currentChain: number | undefined = chainId
        if (!isConnected || !account) {
          if (typeof (window as { ethereum?: unknown }).ethereum === 'undefined') {
            throw new Error('No browser wallet found. Install a wallet such as MetaMask or Rabby, then reload.')
          }
          const connected = await connectAsync({ connector: connectors[0] })
          account = connected.accounts[0]
          currentChain = connected.chainId
        }
        if (currentChain !== CHAIN_ID) await switchChainAsync({ chainId: CHAIN_ID })
        await publicClient.call({ account, to: request.to, data: request.data })
        const hash = await sendTransactionAsync({ to: request.to, data: request.data, chainId: CHAIN_ID })
        setState({ phase: 'confirming', hash, error: null })
        const receipt = await publicClient.waitForTransactionReceipt({ hash })
        if (receipt.status !== 'success') throw new Error('The transaction reverted.')
        setState({ phase: 'done', hash, error: null })
        await queryClient.invalidateQueries()
        void refreshHistory()
        return receipt
      } catch (error) {
        const message =
          error instanceof Error && error.message.startsWith('No browser wallet') ? error.message : plainError(error)
        setState((prev) => ({ phase: 'error', hash: prev.hash, error: message }))
        return null
      }
    },
    [address, chainId, isConnected, connectAsync, connectors, switchChainAsync, sendTransactionAsync, queryClient],
  )

  const reset = useCallback(() => setState({ phase: 'idle', hash: null, error: null }), [])

  return { send, state, reset, busy: state.phase === 'wallet' || state.phase === 'confirming' }
}
