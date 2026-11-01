import { describe, expect, it } from 'vitest'
import { formatDuration } from './format'
import { readProof } from './proof-data'

const A = '0xC112DCb724a80E00Af0980e3a4023c4833B4F04e'
const B = '0xd80b6Ffa6b5Fa21e7c7Ddc605B1D00D29b9e6B17'
const HASH = `0x${'ab'.repeat(32)}`

describe('readProof', () => {
  it('accepts addresses as bare strings and as { address, label } objects', () => {
    const data = readProof({ ourAddresses: [A, { address: B, label: 'Demo wallet' }] })
    expect(data.ours).toEqual([A, B])
    expect(data.skipped).toBe(0)
  })

  it('skips entries that are not addresses instead of throwing', () => {
    const data = readProof({ ourAddresses: [A, 42, null, {}, { address: 7 }, 'not an address', undefined, [A]] })
    expect(data.ours).toEqual([A])
    expect(data.skipped).toBe(7)
  })

  it('survives a file of the wrong shape', () => {
    for (const bad of [null, undefined, 'text', 7, [], { ourAddresses: 'oops', transactions: 'oops' }, { transactions: { a: 1 } }]) {
      const data = readProof(bad)
      expect(data.ours).toEqual([])
      expect(data.transactions).toEqual([])
    }
  })

  it('keeps usable transactions and drops broken ones', () => {
    const data = readProof({
      transactions: [{ sender: 'Organiser', what: 'Created a purse', hash: HASH }, { hash: HASH, network: 'testnet' }, 'a string', null, { sender: 'x' }, { hash: 5 }],
    })
    expect(data.transactions).toHaveLength(2)
    expect(data.transactions[0]).toEqual({ sender: 'Organiser', what: 'Created a purse', hash: HASH })
    expect(data.transactions[1]?.network).toBe('testnet')
    expect(data.transactions[1]?.sender).toBe('')
    expect(data.skipped).toBe(4)
  })

  it('only keeps whole-number counts, a valid testnet contract and a safe report link', () => {
    expect(readProof({ foundryTests: 139, appTests: -1, sdkTests: 2.5 })).toMatchObject({ foundryTests: 139, appTests: undefined, sdkTests: undefined })
    expect(readProof({ testnetContract: 'nope' }).testnetContract).toBeUndefined()
    expect(readProof({ testnetContract: B }).testnetContract).toBe(B)
    expect(readProof({ reportUrl: 'javascript:alert(1)' }).reportUrl).toBeUndefined()
    expect(readProof({ reportUrl: ' https://example.com/issues ' }).reportUrl).toBe('https://example.com/issues')
    expect(readProof({ reportUrl: 'mailto:a@b.co' }).reportUrl).toBe('mailto:a@b.co')
  })
})

describe('formatDuration in plain words', () => {
  it('keeps whole units simple', () => {
    expect(formatDuration(60n)).toBe('1 minute')
    expect(formatDuration(3600n)).toBe('1 hour')
    expect(formatDuration(7n * 86400n)).toBe('7 days')
  })
  it('joins two units for the rest', () => {
    expect(formatDuration(5400n)).toBe('1 hour 30 minutes')
    expect(formatDuration(90n)).toBe('1 minute 30 seconds')
    expect(formatDuration(45n)).toBe('45 seconds')
    expect(formatDuration(86400n + 7200n)).toBe('1 day 2 hours')
  })
})
