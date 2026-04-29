// src/utils/tpsl.js
// TP/SL delta-neutral : les deux legs se ferment simultanément
// → PnL net le plus proche de 0$ possible
//
// Logique :
//   upPrice   = entryPrice × (1 + tpPct/100)  → TP du long  / SL du short
//   downPrice = entryPrice × (1 - slPct/100)  → SL du long  / TP du short
//
// Exécution : MARKET des deux côtés (isMarket: true pour HL, priceType: MARKET pour Extended)
// Référence trigger : MARK (résistant aux wicks)

/**
 * Calcule les deux prix pivot du trade delta-neutral
 * @param {number} entryPrice
 * @param {number} tpPct  - ex: 10 pour +10%
 * @param {number} slPct  - ex: 10 pour -10%
 */
export function calcDeltaNeutralPrices({ entryPrice, tpPct, slPct }) {
  const p = Number(entryPrice)
  return {
    upPrice:   +(p * (1 + tpPct / 100)).toFixed(2),
    downPrice: +(p * (1 - slPct / 100)).toFixed(2),
  }
}

// ─── EXTENDED ──────────────────────────────────────────────────────────────

/**
 * Construit le bloc tpsl à injecter dans le body POST /api/v1/user/order
 * @param {'long'|'short'} side
 * @param {{ upPrice: number, downPrice: number }} prices
 */

/*
export function buildExtendedTpSl({ side, prices }) {
  const isLong    = side === 'long'
  const tpTrigger = isLong ? prices.upPrice   : prices.downPrice
  const slTrigger = isLong ? prices.downPrice : prices.upPrice

  return {
    tpSlType: 'ORDER',
    takeProfit: {
      triggerPrice:     String(tpTrigger),
      triggerPriceType: 'MARK',    // résistant aux wicks
      price:            String(tpTrigger),
      priceType:        'MARKET',  // exécution au market après trigger
    },
    stopLoss: {
      triggerPrice:     String(slTrigger),
      triggerPriceType: 'MARK',
      price:            String(slTrigger),
      priceType:        'MARKET',
    },
  }
}
*/

export async function buildExtendedTpSl({
  side,
  prices,
  size,
  extStarkPk,
  vaultId,
  marketL2Config,
  feeRate    = 0.0005,
  expiryEpochMs,
  saltBase,      // nonce de base — +1 pour TP, +2 pour SL
  pxDecimals = 2,
}) {
  const isLong    = side === 'long'
  const tpTrigger = isLong ? prices.upPrice   : prices.downPrice
  const slTrigger = isLong ? prices.downPrice : prices.upPrice

  const [tpSettlement, slSettlement] = await Promise.all([
    signTpSlSettlement({
      extStarkPk, vaultId, side, size,
      triggerPrice:  tpTrigger,
      marketL2Config, feeRate, expiryEpochMs,
      salt: saltBase + 1,
    }),
    signTpSlSettlement({
      extStarkPk, vaultId, side, size,
      triggerPrice:  slTrigger,
      marketL2Config, feeRate, expiryEpochMs,
      salt: saltBase + 2,
    }),
  ])

  return {
    tpSlType: 'ORDER',
    takeProfit: {
      triggerPrice:     String(tpTrigger.toFixed(pxDecimals)),
      triggerPriceType: 'LAST',
      price:            String(tpTrigger.toFixed(pxDecimals)),
      priceType:        'MARKET',
      settlement:       tpSettlement,
    },
    stopLoss: {
      triggerPrice:     String(slTrigger.toFixed(pxDecimals)),
      triggerPriceType: 'LAST',
      price:            String(slTrigger.toFixed(pxDecimals)),
      priceType:        'MARKET',
      settlement:       slSettlement,
    },
  }
}

// ─── HYPERLIQUID ────────────────────────────────────────────────────────────

/**
 * Construit les deux ordres TP + SL pour HL (reduce-only, isMarket: true)
 * À envoyer via POST /exchange avec grouping: "positionTpsl"
 *
 * @param {'long'|'short'} side
 * @param {{ upPrice: number, downPrice: number }} prices
 * @param {number} assetIndex
 * @param {string|number} size  — taille de la position (sz)
 */
export function buildHlTpSlOrders({ side, prices, assetIndex, size }) {
  const isLong    = side === 'long'
  const closeSide = !isLong  // fermer un long → SELL (false) / un short → BUY (true)

  const tpTrigger = isLong ? prices.upPrice   : prices.downPrice
  const slTrigger = isLong ? prices.downPrice : prices.upPrice

  const makeOrder = (tpsl, triggerPx) => ({
    a: assetIndex,
    b: closeSide,
    //p: String(triggerPx),
    p: closeSide ? String((triggerPx * 1.1).toFixed(2)) : String((triggerPx * 0.9).toFixed(2)),
    s: String(size),
    r: true,                 // reduce-only obligatoire
    t: {
      trigger: {
        isMarket:  true,     // exécution market après trigger
        tpsl,                // 'tp' ou 'sl'
        triggerPx: String(triggerPx),
      },
    },
    isPositionTpsl: true,
  })
  
  return [
    makeOrder('tp', tpTrigger),
    makeOrder('sl', slTrigger),
  ]
}

/**
 * Enveloppe complète pour l'action HL
 * grouping "positionTpsl" → annulation auto si position fermée
 */
export function buildHlTpSlAction({ side, prices, assetIndex, size }) {
  return {
    type:     'order',
    orders:   buildHlTpSlOrders({ side, prices, assetIndex, size }),
    grouping: 'positionTpsl',
  }
}
