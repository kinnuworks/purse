// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import type { PurseEvent } from '@/lib/events'

const A = '0xC112DCb724a80E00Af0980e3a4023c4833B4F04e' as const
const B = '0xd80b6Ffa6b5Fa21e7c7Ddc605B1D00D29b9e6B17' as const
const HASH = `0x${'ab'.repeat(32)}` as const

const proofRef = vi.hoisted(() => ({ value: {} as unknown }))
vi.mock('@/proof.json', () => ({
  get default() {
    return proofRef.value
  },
}))

const at = (blockNumber: bigint) => ({ blockNumber, txHash: HASH, logIndex: 0 })
const EVENTS: PurseEvent[] = [
  { name: 'PurseCreated', id: 0n, organiser: A, title: 'Test: flow', amount: 5_000_000n, nameBy: 2_000_000_000n, claimWindow: 3600n, ...at(1n) },
  { name: 'Funded', id: 0n, funder: A, amount: 5_000_000n, newPool: 5_000_000n, ...at(1n) },
  { name: 'Delivered', id: 0n, winner: B, amount: 1_000_000n, caller: A, ...at(2n) },
]

vi.mock('@/lib/history', () => ({
  useHistory: () => ({ status: 'ready', events: EVENTS, progress: null, error: null }),
  eventsForPurse: (events: PurseEvent[], id: bigint) => events.filter((e) => e.id === id),
  refreshHistory: () => Promise.resolve(),
}))

const PURSES = [
  {
    id: 0n,
    organiser: A,
    title: 'Test: flow',
    nameBy: 2_000_000_000n,
    claimWindow: 3600n,
    claimBy: 0n,
    named: false,
    locked: false,
    pool: 5_000_000n,
    owed: 5_000_000n,
    winnerCount: 0n,
    winners: [],
  },
]
vi.mock('@/lib/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/hooks')>()),
  usePurseList: () => ({ data: PURSES, isLoading: false, isError: false, error: null }),
}))

vi.mock('@/lib/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data')>()),
  readTransaction: () => Promise.resolve(null),
}))

afterEach(() => cleanup())

function renderAt(path: string, element: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Entries a person might plausibly type into src/proof.json by mistake. */
const HOSTILE = [
  { ourAddresses: [A] },
  { ourAddresses: A },
  { ourAddresses: [A, { address: B, label: 'x' }, 42, null, {}, { address: 5 }] },
  { ourAddresses: null, transactions: null },
  { ourAddresses: [], transactions: [null, 'text', { hash: 5 }, { hash: 'not a hash' }, { sender: 1, what: 2, hash: HASH }] },
  { foundryTests: 'many', testnetContract: 12, reportUrl: 9 },
  'a file that is just a string',
]

describe('pages do not crash on a bad proof file', () => {
  it('/judges renders the counts for every kind of bad entry', async () => {
    const { default: JudgesPage } = await import('./JudgesPage')
    for (const value of HOSTILE) {
      proofRef.value = value
      const view = renderAt('/judges', <JudgesPage />)
      expect(screen.getByRole('heading', { name: 'For reviewers' })).toBeTruthy()
      expect(screen.getByText('Distinct wallets')).toBeTruthy()
      view.unmount()
    }
  })

  it('/judges counts a bare-string address as ours', async () => {
    const { default: JudgesPage } = await import('./JudgesPage')
    proofRef.value = { ourAddresses: [A, B] }
    renderAt('/judges', <JudgesPage />)
    const row = screen.getByText('of which ours').closest('tr')
    expect(row?.textContent).toContain('2')
  })

  it('/proof renders for every kind of bad entry', async () => {
    const { default: ProofPage } = await import('./ProofPage')
    for (const value of HOSTILE) {
      proofRef.value = value
      const view = renderAt('/proof', <ProofPage />)
      expect(screen.getByRole('heading', { name: 'Transactions' })).toBeTruthy()
      view.unmount()
    }
  })

  it('/break-it states what Purse cannot stop', async () => {
    const { default: BreakItPage } = await import('./BreakItPage')
    proofRef.value = HOSTILE[2]
    renderAt('/break-it', <BreakItPage />)
    expect(screen.getByRole('heading', { name: 'What Purse can’t stop' })).toBeTruthy()
    expect(screen.getByText(/name themselves as a winner/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'purse #3' }).getAttribute('href')).toBe('/p/3')
  })
})

describe('error boundary', () => {
  function Boom(): never {
    throw new Error('bad data')
  }

  it('keeps the rest of the page alive when a child crashes', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(
      <div>
        <p>header stays</p>
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
      </div>,
    )
    expect(screen.getByText('header stays')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('could not be shown')
    quiet.mockRestore()
  })

  it('tries again when asked', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let crash = true
    function Maybe() {
      if (crash) throw new Error('bad data')
      return <p>recovered</p>
    }
    render(
      <ErrorBoundary>
        <Maybe />
      </ErrorBoundary>,
    )
    crash = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByText('recovered')).toBeTruthy()
    quiet.mockRestore()
  })
})
