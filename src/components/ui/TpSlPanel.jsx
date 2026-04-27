// src/components/ui/TpSlPanel.jsx
// Panel TP/SL delta-neutral avec case à cocher
// TP/SL SYMÉTRIQUES : les deux legs se ferment aux mêmes prix pivot
//   upPrice   = entry × (1 + tpPct%)  → TP Long / SL Short
//   downPrice = entry × (1 - slPct%)  → SL Long / TP Short
// Exécution : MARKET · Référence trigger : MARK (anti-wick)
//
// tpPct et slPct sont librement réglables via slider + input number
// Valeurs par défaut : props.defaultTpPct (10%) / props.defaultSlPct (10%)

import { useState, useMemo, useEffect } from 'react'
import { calcDeltaNeutralPrices } from '../../utils/tpsl'

/**
 * @param {number}   props.entryPrice          - prix d'entrée estimé du trade
 * @param {Function} props.onTpSlChange        - ({ tpPct, slPct, prices } | null) => void
 * @param {number}   [props.defaultTpPct=10]   - % TP par défaut (modifiable par l'utilisateur)
 * @param {number}   [props.defaultSlPct=10]   - % SL par défaut (modifiable par l'utilisateur)
 * @param {number}   [props.maxTpPct=200]      - % TP maximum autorisé
 * @param {number}   [props.maxSlPct=50]       - % SL maximum autorisé
 */
export default function TpSlPanel({
  entryPrice,
  onTpSlChange,
  defaultTpPct = 10,
  defaultSlPct = 10,
  maxTpPct     = 200,
  maxSlPct     = 50,
}) {
  const [enabled, setEnabled] = useState(false)
  const [tpPct,   setTpPct]   = useState(defaultTpPct)
  const [slPct,   setSlPct]   = useState(defaultSlPct)

  const prices = useMemo(() => {
    if (!enabled || !entryPrice) return null
    return calcDeltaNeutralPrices({ entryPrice, tpPct, slPct })
  }, [enabled, entryPrice, tpPct, slPct])

  useEffect(() => {
    onTpSlChange?.(enabled && prices ? { tpPct, slPct, prices } : null)
  }, [enabled, tpPct, slPct, prices])

  return (
    <div className="tpsl-panel">

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

          <TpSlRow
            label="Take Profit"
            sign="+"
            pct={tpPct}
            onChange={setTpPct}
            min={0.5}
            max={maxTpPct}
            step={0.5}
            colorClass="tp"
            priceA={prices?.upPrice}
            priceB={prices?.downPrice}
            labelA="Long TP"
            labelB="Short TP"
          />

          <TpSlRow
            label="Stop Loss"
            sign="−"
            pct={slPct}
            onChange={setSlPct}
            min={0.5}
            max={maxSlPct}
            step={0.5}
            colorClass="sl"
            priceA={prices?.downPrice}
            priceB={prices?.upPrice}
            labelA="Long SL"
            labelB="Short SL"
          />

          <div className="tpsl-panel__info">
            <span>⚡ Market · Mark price · Les deux legs se ferment ensemble</span>
          </div>

        </div>
      )}
    </div>
  )
}

function TpSlRow({ label, sign, pct, onChange, min, max, step, colorClass, priceA, priceB, labelA, labelB }) {
  const clamp = v => Math.max(min, Math.min(max, Number(v)))

  return (
    <div className={`tpsl-row tpsl-row--${colorClass}`}>
      <div className="tpsl-row__header">
        <span className="tpsl-row__label">{label}</span>
        <input
          type="number"
          className="tpsl-row__pct-input"
          min={min}
          max={max}
          step={step}
          value={pct}
          onChange={e => onChange(clamp(e.target.value))}
        />
        <span className="tpsl-row__pct-unit">{sign}%</span>
      </div>

      <input
        type="range"
        className="tpsl-row__range"
        min={min}
        max={max}
        step={step}
        value={pct}
        onChange={e => onChange(Number(e.target.value))}
      />

      {priceA != null && (
        <div className="tpsl-row__prices">
          <span>
            {labelA}: <strong>${priceA.toLocaleString('en-US', { maximumFractionDigits: 1 })}</strong>
          </span>
          <span>
            {labelB}: <strong>${priceB.toLocaleString('en-US', { maximumFractionDigits: 1 })}</strong>
          </span>
        </div>
      )}
    </div>
  )
}
