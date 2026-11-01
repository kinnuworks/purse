/** Browser side of /api/demo: reads the streamed progress lines the function writes. */

export type DemoStep = 'check' | 'approve' | 'create' | 'lock' | 'name' | 'deliver'

/** Keep in step with the DemoEvent type in api/demo.ts. */
export type DemoEvent =
  | { type: 'step'; step: DemoStep; status: 'pending' | 'done'; hash?: string; message?: string }
  | { type: 'done'; id: string; winner: string }
  | { type: 'error'; message: string; code?: string }

export type DemoOutcome = { kind: 'finished' } | { kind: 'stopped' } | { kind: 'unavailable' }

/** Splits a text stream into complete JSON lines and passes each parsed event on. */
export function createLineParser(onEvent: (event: DemoEvent) => void) {
  let buffer = ''
  const flushLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return
    try {
      onEvent(JSON.parse(trimmed) as DemoEvent)
    } catch {
      // A broken line is ignored; the rest of the stream still counts.
    }
  }
  return {
    push(chunk: string) {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      lines.forEach(flushLine)
    },
    end() {
      flushLine(buffer)
      buffer = ''
    },
  }
}

export async function runDemo(winner: string, onEvent: (event: DemoEvent) => void, fetcher: typeof fetch = fetch): Promise<DemoOutcome> {
  let response: Response
  try {
    response = await fetcher('/api/demo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(winner ? { winner } : {}),
    })
  } catch {
    return { kind: 'unavailable' }
  }

  const type = response.headers.get('content-type') ?? ''
  const isJson = type.includes('application/json') || type.includes('ndjson')
  if (!isJson) return { kind: 'unavailable' }

  if (!response.ok || !response.body) {
    try {
      const body = (await response.json()) as DemoEvent
      if (body.type === 'error' && body.code !== 'unavailable') {
        onEvent(body)
        return { kind: 'stopped' }
      }
    } catch {
      // fall through
    }
    return { kind: 'unavailable' }
  }

  let stopped = false
  const parser = createLineParser((event) => {
    if (event.type === 'error') stopped = true
    onEvent(event)
  })
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      parser.push(decoder.decode(value, { stream: true }))
    }
    parser.end()
  } catch {
    onEvent({ type: 'error', message: 'The connection dropped part-way. Check the purse list: the run may still have gone through.' })
    return { kind: 'stopped' }
  }
  return stopped ? { kind: 'stopped' } : { kind: 'finished' }
}
