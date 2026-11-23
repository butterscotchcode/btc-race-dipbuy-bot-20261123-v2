// Stabilised dip-buy cbBTC bot for btc-race-24h-20261123-0511.
//
// Strategy: dip-buy mean-reversion, few trades, disciplined exits.
//   Entry: close at least DIP_BPS below the highest close of the last
//   LOOKBACK bars AND the bar closed green (stabilisation). Full cash,
//   one position at a time.
//   Exit (whole position, single exit): take-profit TP_BPS above the
//   entry fill price, stop-loss SL_BPS below it, or time-stop after
//   TIMESTOP bars. Cooldown after each exit; no new entry after
//   NO_ENTRY_AFTER. A depth guard skips buys when the pool is too thin.
//
// Why these numbers (tuned on the new dev window, 22-23 Nov 2026):
//   BTC rose +3.64% then went sideways; buy-and-hold makes ~+$35, so the
//   gate is easy but riding the trend is the trap. This bot buys only
//   real pullbacks (>=1.0% off the 120-bar high) and exits fast (240-bar
//   time-stop), so flat stretches cannot bleed it. Sim on the dev window:
//   +$34.96, max DD 1.25%, 8 trades (4 round trips, 3 winners), 2x-fees
//   +$31.67, per-6h-block +$15.18 / +$6.14 / +$0.04 / +$13.60.
//   Neighbouring parameters (dip 90-120, TP 1.2-2.0%, time-stop 240-300)
//   all stay +$20..+$35, so this is a flat plateau, not a sharp peak.
//
// Costs: a full-size round trip pays ~34 bps here (4 bps fee + 2 bps
// slippage + ~11 bps impact each way at median depth ~$900k), so every
// trade must catch a move well above that; TP 1.5% clears it with room.
//
// Determinism: pure function of the bars. No clock, no environment, no
// randomness. Entry fill price/bar are read back from the harness fills,
// never guessed from a decision-time price. Note the fills' `fill_bar`
// is the bar TIME in milliseconds, not the bar index — so the entry bar
// is taken from state.seq of the batch carrying the fill (decided bar + 1),
// which is what the time-stop age counts from.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

// --- tuned parameters (bps where noted) ---
const DIP_BPS = 100n; // entry: close >= 1.0% below rolling-high close
const LOOKBACK = 120; // bars for the rolling high
const TP_BPS = 150n; // exit: +1.5% over entry fill price
const SL_BPS = 100n; // exit: -1.0% under entry fill price
const TIMESTOP = 240; // exit: bars held before giving up
const COOLDOWN = 60; // bars to wait after an exit before re-entering
const NO_ENTRY_AFTER = 1380; // stop opening new trades near the end
const MAX_SLIPPAGE_BPS = 100; // 1.0% slippage cap on every order
const DEPTH_GUARD_BPS = 2000n; // skip buy if full-size impact above this

// --- run state (bar-time only) ---
const closes: bigint[] = [];
let entryPrice: bigint | null = null; // fill price of the open position
let entryBar = -1; // seq of the batch that carried the entry fill
let cooldownUntil = -1; // earliest seq a new entry is allowed

function rollingHighClose(): bigint {
  let hi = 0n;
  const start = closes.length > LOOKBACK ? closes.length - LOOKBACK : 0;
  for (let i = start; i < closes.length; i++) {
    if (closes[i]! > hi) hi = closes[i]!;
  }
  return hi;
}

await runBars({
  onBatch(state: BarsState, batch: Batch) {
    if (state.warmingUp) return [];

    // Learn entry fills from the harness: the fill price is the truth,
    // and the fill arrives in the batch of the bar at whose open it filled.
    for (const fill of batch.fills) {
      if (fill.symbol !== SYMBOL || fill.status !== 'filled') continue;
      if (fill.side === 'buy') {
        entryPrice = BigInt(fill.price);
        entryBar = state.seq;
      }
    }

    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    const close = BigInt(bar.c);
    const open = BigInt(bar.o);
    closes.push(close);

    const held = state.positions.get(SYMBOL);
    const qty = held === undefined ? 0n : held.qty;

    // --- holding: check exits against the entry fill price ---
    if (qty > 0n) {
      if (entryPrice === null) return []; // fill not seen yet; wait a bar
      const retBps = ((close - entryPrice) * 10000n) / entryPrice;
      const age = state.seq - entryBar;
      const takeProfit = retBps >= TP_BPS;
      const stopLoss = retBps <= -SL_BPS;
      const timedOut = age >= TIMESTOP;
      if (takeProfit || stopLoss || timedOut) {
        cooldownUntil = state.seq + COOLDOWN;
        return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // --- flat: check entry ---
    entryPrice = null;
    if (closes.length <= LOOKBACK) return [];
    if (state.seq > NO_ENTRY_AFTER) return [];
    if (state.seq < cooldownUntil) return [];
    if (close <= open) return []; // need a green bar: stabilisation
    const hi = rollingHighClose();
    if (hi === 0n) return [];
    const dipBps = ((hi - close) * 10000n) / hi;
    if (dipBps < DIP_BPS) return [];
    // Depth guard: skip the buy when the pool is too thin for full size.
    const depth = state.depthAt(SYMBOL);
    if (depth !== null && depth[0] !== undefined && depth[0] > 0n) {
      const impactBps = (state.cash * 10000n) / depth[0];
      if (impactBps > DEPTH_GUARD_BPS) return [];
    }
    if (state.cash < 1000000n) return []; // below min notional
    return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
  },
});
