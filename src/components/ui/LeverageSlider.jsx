// src/components/ui/LeverageSlider.jsx
// src/components/ui/LeverageSlider.jsx
import { useState, useCallback } from 'react'
import { getPlatform } from '../../platforms/index.js'

export default function LeverageSlider({
  value,
  onChange,
  min = 1,
  max = 50,
  side,
  platformId,
  market,
  credentials,
  isCross = false,
}) {
  const [status, setStatus] = useState(null)
  const [errMsg, setErrMsg] = useState(null)

  const applyOnRelease = useCallback(async (leverage) => {
    if (!market) return
    const platform = getPlatform(platformId)
    if (!platform?.adapter?.setLeverage) return  // Nado → no-op

    setStatus('loading')
    setErrMsg(null)
    try {
      await platform.adapter.setLeverage({ market, leverage, isCross, credentials })
      setStatus('ok')
    } catch (e) {
      setStatus('error')
      setErrMsg(e.message)
    }
    setTimeout(() => setStatus(null), 2500)
  }, [platformId, market, credentials, isCross])

  const handleChange  = (e) => onChange(Number(e.target.value))
  const handleRelease = (e) => applyOnRelease(Number(e.target.value))

  const label      = side === 'long' ? '🟢 Long' : '🔴 Short'
  const statusIcon = status === 'loading' ? '…'
                   : status === 'ok'      ? '✓'
                   : status === 'error'   ? '✗'
                   : null

  return (
    <div className="lev-slider">
      <div className="lev-slider__header">
        <span className="lev-slider__side">{label}</span>
        <span className="lev-slider__value">
          ×{value}
          {statusIcon && (
            <span className={`lev-slider__status lev-slider__status--${status}`}>
              {statusIcon}
            </span>
          )}
        </span>
      </div>

      <input
        type="range"
        className="lev-slider__range"
        min={min} max={max} step={1}
        value={value}
        onChange={handleChange}
        onMouseUp={handleRelease}
        onTouchEnd={handleRelease}
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


/*
// src/components/ui/LeverageSlider.jsx
import { useState, useCallback } from 'react'
import { getPlatform } from '../../platforms/index.js'

/**
 * @param {object}   props
 * @param {number}   props.value
 * @param {Function} props.onChange          - (leverage: number) => void
 * @param {number}   props.min
 * @param {number}   props.max
 * @param {'long'|'short'} props.side
 * @param {string}   props.platformId        - 'hyperliquid' | 'extended' | 'nado' | …
 * @param {object}   props.market            - { keys: { hl, ext, nado, … } }
 * @param {object}   props.credentials
 * @param {boolean}  [props.isCross=false]
 
export default function LeverageSlider({
  value,
  onChange,
  min = 1,
  max = 50,
  side,
  platformId,
  market,
  credentials,
  isCross = false,
}) {
  const [status, setStatus] = useState(null)  // null | 'loading' | 'ok' | 'error'
  const [errMsg, setErrMsg] = useState(null)

  const apply = useCallback(async () => {
    if (!market || !value) return

    const platform = getPlatform(platformId)
    //if (!platform?.adapter?.setLeverage) return  // plateforme sans setLeverage → silencieux
    if (!getPlatform(platformId)?.adapter?.setLeverage) return // plateforme sans setLeverage → bouton désactivé
    

    setStatus('loading')
    setErrMsg(null)
    try {
      await platform.adapter.setLeverage({
        market,
        leverage: value,
        isCross,
        credentials,
      })
      setStatus('ok')
    } catch (e) {
      setStatus('error')
      setErrMsg(e.message)
    }
    setTimeout(() => setStatus(null), 2500)
  }, [platformId, market, credentials, value, isCross])

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
           : status === 'ok'    ? '✓'
           : status === 'error' ? '✗'
           : '⚡'}
        </button>
      </div>

      <input
        type="range"
        className="lev-slider__range"
        min={min} max={max} step={1}
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

/*
Chaque adapter expose setLeverage avec une signature unifiée :

// src/platforms/hyperliquid.js
export async function setLeverage({ market, leverage, isCross, credentials }) {
  return updateLeverageByName({
    hlAgentPk:      credentials.hlAgentPk,
    hlAddress:      credentials.hlAddress,
    hlVaultAddress: credentials.hlVaultAddress,
    coin:           market.keys?.hl,
    leverage,
    isCross,
  })
}

// src/platforms/extended.js
export async function setLeverage({ market, leverage, credentials }) {
  return extSetLeverage(market.keys?.ext, leverage, credentials.extApiKey)
}

// src/platforms/nado.js — ne supporte pas setLeverage → ne pas exposer la fn
*/
