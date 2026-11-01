/**
 * wagmi configuration: one chain (Arc, from env) and the injected browser wallet.
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { purseChain } from './lib/chain'
import { RPC_URL } from './lib/env'
import { registerChain } from './tracing'

registerChain(purseChain.id, RPC_URL)

export const config = createConfig({
  chains: [purseChain],
  connectors: [injected()],
  transports: {
    [purseChain.id]: http(RPC_URL),
  },
})
