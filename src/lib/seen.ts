const KEY = 'purse-stamps-seen'

function read(): string[] {
  try {
    const raw = window.sessionStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** True if this row has already been shown as paid in this browser session. */
export function wasSeen(id: string): boolean {
  return read().includes(id)
}

export function markSeen(id: string): void {
  try {
    const seen = read()
    if (!seen.includes(id)) window.sessionStorage.setItem(KEY, JSON.stringify([...seen, id]))
  } catch {
    // Private mode or no storage: the stamp may animate again, which is harmless.
  }
}
