import { isAddress } from 'viem'

export interface ProofTx {
  /** Who sent it, in words. */
  sender: string
  what: string
  hash: string
  network?: 'testnet'
}

export interface ProofData {
  foundryTests?: number
  appTests?: number
  sdkTests?: number
  /** Addresses we own, as written in the file. Anything that is not a valid address is left out. */
  ours: string[]
  transactions: ProofTx[]
  testnetContract?: string
  reportUrl?: string
  /** How many entries were ignored because they were not in a shape we can use. */
  skipped: number
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const count = (v: unknown): number | undefined => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined)
const text = (v: unknown): string => (typeof v === 'string' ? v : '')

/**
 * Reads src/proof.json without ever throwing. A hand-edited file can hold a bare string where an object is expected,
 * a number instead of an address, or a missing list; each bad entry is skipped so a page never goes blank because of it.
 * An address may be written as a plain string or as { address, label }.
 */
export function readProof(raw: unknown): ProofData {
  const file = isObject(raw) ? raw : {}
  let skipped = 0

  const ours: string[] = []
  if (Array.isArray(file.ourAddresses)) {
    for (const entry of file.ourAddresses) {
      const candidate = typeof entry === 'string' ? entry.trim() : isObject(entry) ? text(entry.address).trim() : ''
      if (isAddress(candidate, { strict: false })) ours.push(candidate)
      else skipped += 1
    }
  } else if (file.ourAddresses !== undefined) {
    skipped += 1
  }

  const transactions: ProofTx[] = []
  if (Array.isArray(file.transactions)) {
    for (const entry of file.transactions) {
      if (!isObject(entry) || typeof entry.hash !== 'string') {
        skipped += 1
        continue
      }
      transactions.push({
        sender: text(entry.sender),
        what: text(entry.what),
        hash: entry.hash.trim(),
        ...(entry.network === 'testnet' ? { network: 'testnet' as const } : {}),
      })
    }
  } else if (file.transactions !== undefined) {
    skipped += 1
  }

  const testnetContract = typeof file.testnetContract === 'string' && isAddress(file.testnetContract.trim(), { strict: false }) ? file.testnetContract.trim() : undefined
  const reportRaw = text(file.reportUrl).trim()
  const reportUrl = /^(https?:\/\/|mailto:)/i.test(reportRaw) ? reportRaw : undefined

  return {
    foundryTests: count(file.foundryTests),
    appTests: count(file.appTests),
    sdkTests: count(file.sdkTests),
    ours,
    transactions,
    testnetContract,
    reportUrl,
    skipped,
  }
}
