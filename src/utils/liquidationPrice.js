// src/utils/liquidationPrice.js
// Formule isolated margin standard
// Long  : liqPrice = entryPrice × (1 - 1/leverage + MMR)
// Short : liqPrice = entryPrice × (1 + 1/leverage - MMR)
// MMR (Maintenance Margin Rate) : 0.5% par défaut, récupérable via API marché

export const DEFAULT_MMR = 0.005 // 0.5% — valeur conservatrice

/**
 * @param {number} entryPrice
 * @param {number} leverage
 * @param {'long'|'short'} side
 * @param {number} [mmr=0.005]  — récupérer via tradingConfig.riskFactor (Extended) ou marginTiers (HL)
 * @returns {number|null}
 */
export function estimateLiqPrice({ entryPrice, leverage, side, mmr = DEFAULT_MMR }) {
  if (!entryPrice || !leverage || leverage <= 0) return null
  const p   = Number(entryPrice)
  const lev = Number(leverage)
  if (side === 'long')  return p * (1 - 1 / lev + mmr)
  if (side === 'short') return p * (1 + 1 / lev - mmr)
  return null
}

/**
 * % de distance entre entryPrice et liqPrice → indique le "coussin" de l'utilisateur
 */
export function liqMarginPct({ entryPrice, liqPrice, side }) {
  if (!entryPrice || !liqPrice) return null
  const p = Number(entryPrice)
  const l = Number(liqPrice)
  return side === 'long'
    ? ((p - l) / p * 100).toFixed(1)
    : ((l - p) / p * 100).toFixed(1)
}
