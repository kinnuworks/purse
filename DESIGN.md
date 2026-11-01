# Purse design: The Engraved Plate

## Concept
Every purse is a trophy plate on top and a bank statement underneath. The plate shows what was promised. The statement proves where it went. Quiet, official, easy on the eyes.

## Signature
The **plate**: amount in large serif, a thin double rule inside the border, title and winners below as if engraved.
The **stamp**: when a winner is paid, their line carries a small rotated "PAID" mark with the date, linked to the transaction. It lands once with a short press animation.

## Reference map
| Reference | Job | What changed |
|---|---|---|
| Unloan | The number is the hero | Serif instead of grotesk, one number, with a plate around it |
| Fiberplane | Dated mono rows with hairlines | Warmer paper; rows hold money and transaction links |
| Kelp | Calm serif voice | Used for amounts and headlines only; left-aligned, no curved band |
| Paper | Faint ruled texture | Horizontal statement rules only, no diagonals, only on the plate's backing |

## Colour tokens
```
--paper: #F6F2E9      page
--plate: #FCFAF4      plate and panels
--ink: #1C1A15        main text
--ink-2: #4F4A3F      secondary text (at least 7:1 on paper)
--rule: #DDD6C6       hairlines
--brass: #7A5C1E      accent: plate rule, links on hover, focus ring
--paid: #1F5C3F       paid stamp and paid or locked state
--alert: #9A2B1F      a failed simulation only
```
Dark mode isn't part of this design.

## Type
- Display and amounts: Newsreader, 500. Tabular lining numerals (`font-variant-numeric: lining-nums tabular-nums`).
- Text and UI: Instrument Sans, 400 and 600.
- Addresses, hashes, dates: JetBrains Mono, 400.

| Role | Desktop | Phone |
|---|---|---|
| Plate amount | 112px / 1 | 72px / 1 |
| Page headline | 56px / 1.08 | 38px / 1.1 |
| Section heading | 28px / 1.2 | 24px / 1.25 |
| Body | 18px / 1.6 | 17px / 1.6 |
| Small | 15px / 1.5 | 15px / 1.5 |
| Mono | 14px / 1.5 | 13px / 1.5 |

## Spacing and shape
Base 8px. Sections 72 to 96px apart. Reading width 680px; home and purse pages 880px. Corners: plate 2px, buttons 4px, no pills except the state marker. No shadows except the plate's single soft edge: `0 1px 0 var(--rule), 0 18px 40px -28px rgba(28,26,21,.35)`.

## Components
- **Plate:** `--plate` fill, 1px `--ink` border, inner 1px `--brass` rule inset 6px. State marker top right. Amount, "USDC" in small caps, title in serif, then winners as engraved lines.
- **Statement row:** date in mono, what happened, amount right-aligned in tabular figures, transaction link. Hairline between rows, no boxes. Hover: `--plate` background.
- **Stamp:** 1.5px `--paid` border, uppercase 12px with letter-spacing, rotated -3deg, date under "PAID". Undelivered winners show "Waiting" in `--ink-2`.
- **Buttons:** primary is ink on paper, 4px corners, 48px high; secondary is a 1px ink border. Hover darkens or fills; focus uses a 2px brass ring; disabled uses `--ink-2` at reduced opacity with its reason in text.
- **Inputs:** 1px `--ink-2` border, 48px high, `--plate` fill; errors in plain words beneath.
- **Header:** one line, name in serif, links, wallet button. Thin rule below.

## Motion
Stamp press: 220ms, scale 1.25 to 1, opacity 0 to 1, only the first time a row is seen as paid in a session. Amount fades in 200ms. Nothing loops. Respect `prefers-reduced-motion`.

## Do
1. Make the amount the largest thing on any purse page.
2. Keep one plate per screen.
3. Use hairlines before boxes.
4. Keep money right-aligned in tabular figures.
5. Keep every number read from chain, as now.

## Don't
1. Add gradients, glow, confetti or trophy illustrations.
2. Use brass for body text or large fills.
3. Nest cards inside cards.
4. Use pale grey for anything people need to read.
5. Change any logic, route, wording of a disclosure or number.
