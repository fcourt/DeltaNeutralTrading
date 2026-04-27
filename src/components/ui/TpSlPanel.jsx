// components/TpSlPanel.jsx
// Panel TP/SL delta-neutral avec case à cocher
// TP/SL sont SYMÉTRIQUES : les deux legs se ferment aux mêmes prix pivot
//   upPrice   = entry × (1 + tpPct%)  → TP Long / SL Short
//   downPrice = entry × (1 - slPct%)  → SL Long / TP Short
// Exécution : MARKET · Référence : MARK (anti-wick)

import { useState, useMemo, useEffect } from 'react'
import { calcDeltaNeutralPrices } from '../utils/tpsl'

/**
 * @param {number}   props.entryPrice   - prix d'entrée estimé du trade
 * @param {Function} props.onTpSlChange - ({ tpPct, slPct, prices } | null) => void
 */
export default function TpSlPanel({ entryPrice, onTpSlChange }) {
  const [enabled, setEnabled] = useState(false)
  const [tpPct,   setTpPct]   = useState(10)
  const [slPct,   setSlPct]   = useState(10)

  const prices = useMemo(() => {
    if (!enabled || !entryPrice) return null
    return calcDeltaNeutralPrices({ entryPrice, tpPct, slPct })
  }, [enabled, entryPrice, tpPct, slPct])

  useEffect(() => {
    onTpSlChange?.(enabled && prices ? { tpPct, slPct, prices } : null)
  }, [enabled, tpPct, slPct, prices])

  return (
    <div className="tpsl-panel">

      {/* Toggle */}
      <label className="tpsl-panel__toggle">
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => setEnabled(e.target.checked)}
        />
        <span className="tpsl-panel__toggle-label">TP / SL</span>
        <span className="tpsl-panel__badge">delta-neutral</span>
      </label>

      {enabled && (
        <div className="tpsl-panel__body">

          {/* Take Profit row */}
          <TpSlRow
            label="Take Profit"
            sign="+"
            pct={tpPct}
            onChange={setTpPct}
            min={0.5} max={200} step={0.5}
            colorClass="tp"
            priceA={prices?.upPrice}
            priceB={prices?.downPrice}
            labelA="Long TP" labelB="Short TP"
          />

          {/* Stop Loss row */}
          <TpSlRow
            label="Stop Loss"
            sign="−"
            pct={slPct}
            onChange={setSlPct}
            min={0.5} max={50} step={0.5}
            colorClass="sl"
            priceA={prices?.downPrice}
            priceB={prices?.upPrice}
            labelA="Long SL" labelB="Short SL"
          />

          {/* Info */}
          <div className="tpsl-panel__info">
            <span>⚡ Market · Mark price · Les deux legs se ferment ensemble</span>
          </div>

        </div>
      )}
    </div>
  )
}

function TpSlRow({ label, sign, pct, onChange, min, max, step, colorClass, priceA, priceB, labelA, labelB }) {
  return (
    <div className={`tpsl-row tpsl-row--${colorClass}`}>
      <div className="tpsl-row__header">
        <span className="tpsl-row__label">{label}</span>
        <input
          type="number"
          className="tpsl-row__pct-input"
          min={min} max={max} step={step}
          value={pct}
          onChange={e => onChange(Math.max(min, Math.min(max, Number(e.target.value))))}
        />
        <span className="tpsl-row__pct-unit">{sign}%</span>
      </div>
      <input
        type="range"
        className="tpsl-row__range"
        min={min} max={max} step={step}
        value={pct}
        onChange={e => onChange(Number(e.target.value))}
      />
      {priceA != null && (
        <div className="tpsl-row__prices">
          <span>{labelA}: <strong>${priceA.toLocaleString('en-US', { maximumFractionDigits: 1 })}</strong></span>
          <span>{labelB}: <strong>${priceB.toLocaleString('en-US', { maximumFractionDigits: 1 })}</strong></span>
        </div>
      )}
    </div>
  )
}
