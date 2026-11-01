import { formatUsdc, parseUsdc } from '@/onchain-money'

/** "1,250.00" style USDC text from a raw 6-decimal amount. Always at least two decimals, never rounds. */
export function formatMoney(raw: bigint): string {
  const exact = formatUsdc(raw)
  const negative = exact.startsWith('-')
  const [whole, fraction = ''] = exact.replace('-', '').split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}${grouped}.${fraction.padEnd(2, '0')}`
}

/** Parses what a person typed ("12", "0.5", "1,000.25"). Returns null when it is not a valid USDC amount. */
export function parseMoney(text: string): bigint | null {
  const clean = text.trim().replace(/,/g, '')
  if (!clean) return null
  try {
    return parseUsdc(clean)
  } catch {
    return null
  }
}

export const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`

export const sameAddress = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase()

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** Formats a unix timestamp in seconds. */
export function formatDate(seconds: bigint | number): string {
  return dateTime.format(new Date(Number(seconds) * 1000))
}

export function formatDuration(seconds: bigint | number): string {
  let s = Math.max(0, Math.floor(Number(seconds)))
  const units: Array<[string, number]> = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1],
  ]
  const parts: string[] = []
  for (const [name, size] of units) {
    const n = Math.floor(s / size)
    s -= n * size
    if (n > 0) parts.push(`${n} ${name}${n === 1 ? '' : 's'}`)
  }
  return parts.length === 0 ? '0 seconds' : parts.slice(0, 2).join(' ')
}

export function timeLeft(deadline: bigint, now: bigint): string {
  const s = Number(deadline - now)
  if (s <= 0) return 'passed'
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h left`
  if (h > 0) return `${h}h ${m}m left`
  if (m > 0) return `${m}m left`
  return 'under a minute left'
}

export const nowSeconds = () => BigInt(Math.floor(Date.now() / 1000))
