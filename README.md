[![make.fun](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/butterscotchcode/btc-race-dipbuy-bot-20261123-v2/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/butterscotchcode/btc-race-dipbuy-bot-20261123-v2/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)

# Stabilised dip-buy cbBTC bot

A dip-buy mean-reversion trading bot for the make.fun
[btc-race-24h-20261123-0511](https://make.fun/bounty/btc-race-24h-20261123-0511)
bounty: it trades Coinbase Wrapped BTC (cbBTC) against USDC on 1-minute
on-chain bars, starting with $1,000 of paper money.

## Strategy

- **Entry:** buy with full cash when the close is at least 1.0% below the
  highest close of the last 120 bars **and** the bar closed green
  (stabilisation). One position at a time.
- **Exit (whole position):** take-profit +1.5% over the entry fill price,
  stop-loss −1.0%, or a 240-bar time-stop — whichever comes first.
- **Discipline:** 60-bar cooldown after every exit, no new entries after
  bar 1380, and a depth guard that skips buys when the pool is too thin
  for full size. Max slippage 100 bps on every order.

## Dev-window result (grade-local, `--driver process`)

- Net PnL **+$34.96** (+3.50%), max drawdown 1.25%, 8 trades
  (4 round trips, 3 winners), net PnL at 2x fees +$31.67.
- Per-6-hour block: +$15.18 / +$6.14 / +$0.04 / +$13.60 — positive in
  all four blocks; the flat middle blocks do not bleed.
- Deterministic: re-grading reproduces the same result byte for byte.

The dev window (22–23 Nov 2026) rose +3.64% then went sideways, so
buy-and-hold alone makes ~+$35 — this bot does not ride the trend, it
earns from pullbacks: each winning round trip buys a ≥1% dip and exits
at +1.5% or on the time-stop.

## Run

```sh
node main.ts   # speaks agent-fun/bars-replay/v1 on stdin/stdout
```

TypeScript, Node 22, standard library only plus the vendored kit SDK
(`vendor/makefun-bars.ts`, byte-identical to the kit shim). No network,
no wall clock, no environment, no randomness — a pure function of the
bars it is sent.

## License

MIT — see [LICENSE](LICENSE).
