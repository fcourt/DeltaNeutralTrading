// src/hooks/useDeltaNeutralPairs.js
// Detecte les paires delta-neutral cross-platform :
// deux positions sur le meme marketId, cotes opposes (LONG/SHORT),
// et notional proche (tolerance configurable)

/**
 * @param {Array} positions   - tableau normalise { platform, marketId, label, side, szi, entryPx, unrealizedPnl, fundingPnl? }
 * @param {Function} getPrice - (marketId, platformId) => number|null  (depuis useLivePrices)
 * @param {number} [tolerancePct=0.05] - ecart max de notional entre les deux legs (5% par defaut)
 * @returns {{ pairs: Array, singles: Array }}
 *
 * Chaque pair :
 * {
 *   id         : string  (cle unique)
 *   marketId   : string
 *   label      : string
 *   long       : Position  (leg long)
 *   short      : Position  (leg short)
 *   longNotional  : number  (szi × markPx ou entryPx)
 *   shortNotional : number
 *   deltaUsd   : number   (longNotional - shortNotional, >0 = exposition longue residuelle)
 *   pnlNet     : number   (unrealizedPnl long + unrealizedPnl short)
 * }
 */
export function useDeltaNeutralPairs(positions = [], getPrice = null, tolerancePct = 0.05) {
  // Groupe par marketId
  const byMarket = {}
  for (const pos of positions) {
    const key = pos.marketId ?? pos.coin
    if (!key) continue
    if (!byMarket[key]) byMarket[key] = []
    byMarket[key].push(pos)
  }

  const pairs   = []
  const singles = []
  const paired  = new Set()

  for (const [marketId, group] of Object.entries(byMarket)) {
    const longs  = group.filter(p => p.side === 'LONG')
    const shorts = group.filter(p => p.side === 'SHORT')

    // Tente le meilleur matching LONG x SHORT cross-platform
    for (const long of longs) {
      for (const short of shorts) {
        // Cross-platform uniquement en V1
        if (long.platform === short.platform) continue
        // Pas deja apparie
        if (paired.has(long) || paired.has(short)) continue

        const longPx  = (getPrice ? getPrice(marketId, long.platform)  : null) ?? long.entryPx
        const shortPx = (getPrice ? getPrice(marketId, short.platform) : null) ?? short.entryPx

        const longNotional  = long.szi  * (longPx  || long.entryPx  || 0)
        const shortNotional = short.szi * (shortPx || short.entryPx || 0)

        if (!longNotional || !shortNotional) continue

        const diff = Math.abs(longNotional - shortNotional) / Math.max(longNotional, shortNotional)
        if (diff > tolerancePct) continue

        paired.add(long)
        paired.add(short)

        const pnlNet = (long.unrealizedPnl ?? 0) + (short.unrealizedPnl ?? 0)
          + (long.fundingPnl ?? 0) + (short.fundingPnl ?? 0)

        pairs.push({
          id            : `${long.platform}-${short.platform}-${marketId}`,
          marketId,
          label         : long.label ?? marketId,
          long,
          short,
          longNotional,
          shortNotional,
          deltaUsd      : longNotional - shortNotional,
          pnlNet,
        })
      }
    }

    // Positions non appariees
    for (const pos of group) {
      if (!paired.has(pos)) singles.push(pos)
    }
  }

  return { pairs, singles }
}
