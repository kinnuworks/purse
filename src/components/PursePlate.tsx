import type { ReactNode } from 'react'
import type { Held, PurseState } from '@/lib/purse-state'
import { HeldMoney, Plate, PlateBacking, StatePill } from './ui'

/**
 * The engraved plate for one purse: state marker top right, the amount as the largest thing on the page,
 * "USDC" in small caps, the title in serif, then whatever lines the page puts underneath.
 */
export function PursePlate({
  id,
  title,
  state,
  held,
  caption,
  as: Heading = 'h2',
  children,
}: {
  id: bigint
  title: string
  state: PurseState
  held: Held
  caption?: ReactNode
  as?: 'h1' | 'h2'
  children?: ReactNode
}) {
  return (
    <PlateBacking>
      <Plate>
        <div className="flex items-start justify-between gap-4">
          <p className="t-small text-soft">Purse #{id.toString()}</p>
          <StatePill state={state} />
        </div>
        <p className="t-amount amount-in mt-8">
          <HeldMoney
            held={held}
            unitClassName="text-[22px] sm:text-[28px] ml-2"
            returnedClassName="font-sans text-[18px] font-semibold tracking-normal text-soft"
          />
        </p>
        <Heading className="h-section mt-6 text-balance">{title}</Heading>
        {caption && <p className="mt-3 text-soft text-pretty">{caption}</p>}
        {children}
      </Plate>
    </PlateBacking>
  )
}
