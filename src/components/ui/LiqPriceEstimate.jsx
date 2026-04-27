// components/LiqPriceEstimate.jsx
// Affiche le prix de liquidation estimé (côté client uniquement, avant l'ordre)
// Formule isolated margin : Long  → entry × (1 - 1/lev + MMR)
//                           Short → entry × (1 + 1/lev - MMR)

import { estimateLiqPrice, liqMarginPct } from '../utils/liquidationPrice'

/**
 * @param {number}          props.entryPrice  - prix d'entrée estimé
 * @param {number}          props.leverage     - levier actif
 * @param {'long'|'short'}  props.side
 * @param {number}          [props.mmr]        - taux de marge de maintenance (défaut 0.5%)
 */
export default function LiqPriceEstimate({ entryPrice, leverage, side, mmr }) {
  const liqPrice = estimateLiqPrice({ entryPrice, leverage, side, mmr })
  if (!liqPrice || liqPrice <= 0) return null

  const marginPct = liqMarginPct({ entryPrice, liqPrice, side })
  const risk = Number(marginPct)
  const riskClass = risk < 10 ? 'danger' : risk < 25 ? 'warning' : 'safe'

  return (
    <div className={`liq-estimate liq-estimate--${riskClass}`} title="Estimation avant ordre — indicatif uniquement">
      <span className="liq-estimate__icon">
        {riskClass === 'danger' ? '🔴' : riskClass === 'warning' ? '🟡' : '🟢'}
      </span>
      <span className="liq-estimate__label">Liq. est.</span>
      <span className="liq-estimate__price">
        ${liqPrice.toLocaleString('en-US', { maximumFractionDigits: 1 })}
      </span>
      <span className="liq-estimate__margin">({marginPct}% de coussin)</span>
    </div>
  )
}
