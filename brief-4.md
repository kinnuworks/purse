Four small changes.

1. The contract is live on Arc mainnet at 0xc81332357d6832d5fddd8ecdc884ef4e461c422b, deploy block 29024415, Sourcify exact match. Make these the defaults in config, and add the Sourcify link to /proof.
2. On home, the first purse shown should be the newest purse whose title isn't "Demo purse", falling back to the newest demo. Demo purses go last in the list, grouped under a small "Demo runs" label.
3. Add a `.npmrc` with `legacy-peer-deps=true`, which my Vercel deploy needs.
4. Prove the flow on testnet from this workspace: deploy Purse to Arc testnet using a Studio wallet, then run create, lock, name and deliver once, and add a testnet line to /proof with those hashes, labelled testnet. Create the API key if you need it.

Rerun all tests and the build.
