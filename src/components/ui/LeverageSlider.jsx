// components/LeverageSlider.jsx
// Slider de levier par leg card
// Envoie la requête de mise à jour du levier vers la plateforme correspondante
// Extended : PATCH /api/v1/user/leverage
// HL       : POST /exchange { type: 'updateLeverage', asset, isCross, leverage }

import { useState, useCallback } from 'react'
import { setLeverage as extSetLeverage }         from '../../platforms/extended'
import { updateLeverageByName as hlSetLeverage } from '../../platforms/hyperliquid'

/**
 * @param {object}   props
 * @param {number}   props.value             - levier courant
 * @param {Function} props.onChange          - (leverage: number) => void
 * @param {number}   props.min               - levier minimum du marché
 * @param {number}   props.max               - levier maximum du marché (ex: 50)
 * @param {'long'|'short'} props.side
 * @param {'extended'|'hyperliquid'|'nado'} props.platform
 * @param {object}   props.market            - { extKey, hlKey }
 * @param {object}   props.credentials       - { extApiKey, hlAgentPk, hlAddress }
 * @param {boolean}  [props.isCross=false]   - mode HL : cross ou isolated
 */
export default function LeverageSlider({
  value,
  onChange,
  min = 1,
  max = 50,
  side,
  platform,
  market,
  credentials,
  isCross = false,
}) {
  const [status, setStatus] = useState(null)   // null | 'loading' | 'ok' | 'error'
  const [errMsg, setErrMsg] = useState(null)

  const apply = useCallback(async () => {
    if (!market || !value) return
    setStatus('loading')
    setErrMsg(null)
    try {
      if (platform === 'extended') {
        await extSetLeverage(market.extKey, value, credentials.extApiKey)
      } else if (platform === 'hyperliquid') {
        await hlSetLeverage({
          hlAgentPk: credentials.hlAgentPk,
          hlAddress:  credentials.hlAddress,
          coin:       market.hlKey,
          leverage:   value,
          isCross,
        })
      }
      setStatus('ok')
    } catch (e) {
      setStatus('error')
      setErrMsg(e.message)
    }
    setTimeout(() => setStatus(null), 2500)
  }, [platform, market, credentials, value, isCross])

  const label = side === 'long' ? '🟢 Long' : '🔴 Short'

  return (
    <div className="lev-slider">
      <div className="lev-slider__header">
        <span className="lev-slider__side">{label}</span>
        <span className="lev-slider__value">×{value}</span>
        <button
          className={`lev-slider__apply ${status ? `lev-slider__apply--${status}` : ''}`}
          disabled={status === 'loading'}
          onClick={apply}
          title="Appliquer le levier sur la plateforme"
        >
          {status === 'loading' ? '…'
           : status === 'ok'      ? '✓'
           : status === 'error'   ? '✗'
           : '⚡'}
        </button>
      </div>

      <input
        type="range"
        className="lev-slider__range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
      />

      <div className="lev-slider__labels">
        <span>{min}×</span>
        <span>{Math.round((min + max) / 2)}×</span>
        <span>{max}×</span>
      </div>

      {status === 'error' && errMsg && (
        <p className="lev-slider__error">{errMsg}</p>
      )}
    </div>
  )
}
