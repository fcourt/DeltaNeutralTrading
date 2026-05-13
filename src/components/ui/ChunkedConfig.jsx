// src/components/ChunkedConfig.jsx

import { useState } from 'react'

const DEFAULT_CONFIG = {
  sliceUsd:       500,
  delayBetweenMs: 2000,
  makerTimeoutMs: 8000,
  maxRetries:     3,
  onErrorMode:    'pause',  // 'continue' | 'pause' | 'abort'
}

export function ChunkedConfig({ totalUsd, config, onChange, disabled }) {
  const totalSlices = totalUsd > 0 && config.sliceUsd > 0
    ? Math.ceil(totalUsd / config.sliceUsd)
    : '—'

  const set = (key, val) => onChange({ ...config, [key]: val })

  return (
    <div className="chunked-config">
      <div className="chunked-config__grid">

        {/* Taille par slice */}
        <label className="chunked-config__field">
          <span>Taille par slice</span>
          <div className="chunked-config__input-row">
            <input
              type="number"
              min={50}
              step={50}
              value={config.sliceUsd}
              disabled={disabled}
              onChange={e => set('sliceUsd', Number(e.target.value))}
            />
            <span className="chunked-config__unit">USD</span>
          </div>
          <span className="chunked-config__hint">
            → {totalSlices} slice{totalSlices !== 1 ? 's' : ''}
          </span>
        </label>

        {/* Délai inter-slice */}
        <label className="chunked-config__field">
          <span>Délai entre slices</span>
          <div className="chunked-config__input-row">
            <input
              type="number"
              min={500}
              max={30000}
              step={500}
              value={config.delayBetweenMs}
              disabled={disabled}
              onChange={e => set('delayBetweenMs', Number(e.target.value))}
            />
            <span className="chunked-config__unit">ms</span>
          </div>
        </label>

        {/* Timeout maker → taker */}
        <label className="chunked-config__field">
          <span>Timeout maker → taker</span>
          <div className="chunked-config__input-row">
            <input
              type="number"
              min={2000}
              max={60000}
              step={1000}
              value={config.makerTimeoutMs}
              disabled={disabled}
              onChange={e => set('makerTimeoutMs', Number(e.target.value))}
            />
            <span className="chunked-config__unit">ms</span>
          </div>
        </label>

        {/* Max retries */}
        <label className="chunked-config__field">
          <span>Max tentatives</span>
          <input
            type="number"
            min={1}
            max={10}
            step={1}
            value={config.maxRetries}
            disabled={disabled}
            onChange={e => set('maxRetries', Number(e.target.value))}
          />
        </label>

        {/* On error */}
        <label className="chunked-config__field chunked-config__field--full">
          <span>Si erreur</span>
          <div className="chunked-config__radio-group">
            {[
              { value: 'continue', label: 'Continuer' },
              { value: 'pause',    label: 'Pause'     },
              { value: 'abort',    label: 'Arrêter'   },
            ].map(opt => (
              <label key={opt.value} className="chunked-config__radio">
                <input
                  type="radio"
                  name="onErrorMode"
                  value={opt.value}
                  checked={config.onErrorMode === opt.value}
                  disabled={disabled}
                  onChange={() => set('onErrorMode', opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </label>

      </div>
    </div>
  )
}

export { DEFAULT_CONFIG as DEFAULT_CHUNKED_CONFIG }
