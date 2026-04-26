// src/utils/deltaNeutral.js

/**
 * Estimate the actual fill price for delta neutral calculation.
 *
 * Taker (market order) → fill at best ask (LONG) or best bid (SHORT).
 * Maker (limit order)  → fill at the specified limit price.
 *
 * @param {object} p
 * @param {'taker'|'maker'} p.orderType
 * @param {'LONG'|'SHORT'}  p.side
 * @param {number}          p.mid        — current mid price
 * @param {number|null}     p.bid        — best bid from order book
 * @param {number|null}     p.ask        — best ask from order book
 * @param {number|null}     p.limitPrice — computed limit price (maker mode)
 */
export function estimateFillPrice({ orderType, side, mid, bid, ask, limitPrice }) {
  if (!mid) return null
  const SLIP = 0.0005  // fallback slippage when bid/ask unavailable
  if (orderType === 'taker') {
    return side === 'LONG'
      ? (ask ?? mid * (1 + SLIP))
      : (bid ?? mid * (1 - SLIP))
  }
  // maker / limit
  return limitPrice ?? mid
}

/**
 * Calculate delta neutral position sizes.
 *
 * Principle: same asset quantity on both legs → P&L nets to zero at any price move.
 *
 *   qty      = sizeUSD / max(fillPrice1, fillPrice2)   ← reference on expensive leg
 *   notional = qty × fillPrice                         ← adjusted for cheap leg
 *
 * deltaScore ≈ price spread between platforms (fraction).
 *
 * @param {{ sizeUSD: number, fillPrice1: number, fillPrice2: number }}
 * @returns {{ qty, notional1, notional2, deltaUSD, deltaScore, cheaperLeg, expensiveLeg } | null}
 */
export function calcDeltaNeutral({ sizeUSD, fillPrice1, fillPrice2 }) {
  if (!sizeUSD || !fillPrice1 || !fillPrice2) return null
  const s = parseFloat(sizeUSD)
  if (!s || s <= 0) return null

  const qty = s / Math.max(fillPrice1, fillPrice2)

  const notional1  = qty * fillPrice1
  const notional2  = qty * fillPrice2
  const deltaUSD   = Math.abs(notional1 - notional2)
  const deltaScore = deltaUSD / s   // fraction, ≈ inter-exchange spread

  return {
    qty,
    notional1,
    notional2,
    deltaUSD,
    deltaScore,
    cheaperLeg:   fillPrice1 < fillPrice2 ? 1 : fillPrice2 < fillPrice1 ? 2 : null,
    expensiveLeg: fillPrice1 > fillPrice2 ? 1 : fillPrice2 > fillPrice1 ? 2 : null,
  }
}

/** CSS color for the delta score indicator */
export function deltaScoreColor(score) {
  if (score == null) return 'var(--color-text-faint)'
  if (score < 0.0005) return 'var(--color-success)'  // < 0.05% ✓
  if (score < 0.002)  return 'var(--color-gold)'     // < 0.20% ⚠
  return 'var(--color-error)'                         // ≥ 0.20% ✗
}

/** Text label for the delta score indicator */
export function deltaScoreLabel(score) {
  if (score == null) return '—'
  const pct = (score * 100).toFixed(4)
  if (score < 0.0005) return `✓ ${pct}%`
  if (score < 0.002)  return `⚠ ${pct}%`
  return `✗ ${pct}%`
}
