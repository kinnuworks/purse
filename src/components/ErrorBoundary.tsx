import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** When this changes (for example the route), a shown error is cleared and the children are tried again. */
  resetKey?: string
}

interface State {
  error: Error | null
}

/**
 * Catches a crash while drawing a page so one bad piece of data can never blank the whole screen.
 * The header and the rest of the site stay usable.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('A page could not be drawn:', error.message, info.componentStack)
  }

  componentDidUpdate(previous: Props): void {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="border-l-2 border-ink pl-4 py-1">
        <p className="font-semibold">Something on this page could not be shown.</p>
        <p className="mt-1 text-soft text-pretty">The rest of the site still works. The figures come from the chain, so nothing about your money is affected.</p>
        <p className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          <button type="button" onClick={() => this.setState({ error: null })} className="min-h-11 underline underline-offset-4">
            Try again
          </button>
          <a href="/" className="inline-flex min-h-11 items-center underline underline-offset-4">
            Go to the home page
          </a>
        </p>
      </div>
    )
  }
}
