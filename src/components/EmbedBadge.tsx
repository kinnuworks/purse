import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { buildShareLink } from '@/lib/share'
import { Button } from './ui'

/** "Put this on your contest page": a copyable iframe for the live prize badge. */
export function EmbedBadge({ id }: { id: bigint }) {
  const [src, setSrc] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    void buildShareLink(`/badge/${id}`).then((link) => {
      if (!cancelled) setSrc(link)
    })
    return () => {
      cancelled = true
    }
  }, [id])

  const snippet = src
    ? `<iframe src="${src}" title="Purse prize badge" width="360" height="150" style="border:0;max-width:100%" loading="lazy"></iframe>`
    : ''

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="rounded-xl border border-ink/15 p-4">
      <h3 className="font-medium">Put this on your contest page</h3>
      <p className="mt-1 text-sm opacity-70 text-pretty">Paste this into your page. It shows the prize, its state and a link back here, read from the chain each time it loads.</p>
      <textarea
        readOnly
        aria-label="Embed code"
        value={snippet}
        placeholder="Preparing the link…"
        rows={4}
        onFocus={(e) => e.currentTarget.select()}
        className="mt-3 w-full resize-none rounded-lg border border-ink/25 p-3 font-mono text-xs"
      />
      <Button className="mt-2" variant="secondary" disabled={!src} onClick={() => void copy()}>
        {copied ? (
          <>
            <Check size={16} aria-hidden /> Copied
          </>
        ) : (
          <>
            <Copy size={16} aria-hidden /> Copy the code
          </>
        )}
      </Button>
      <iframe src={`/badge/${id}`} title="Preview of the prize badge" width="360" height="150" className="mt-4 block max-w-full rounded-lg border-0" loading="lazy" />
    </div>
  )
}
