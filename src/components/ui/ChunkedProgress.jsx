// src/components/ChunkedProgress.jsx

import { useEffect, useRef } from 'react'

const STATUS_ICON = {
  pending:         '○',
  placing:         '⋯',
  waiting_fill:    '⏳',
  filled:          '✅',
  switching_taker: '🔄',
  failed:          '❌',
}

const LOG_COLOR = {
  info:    'var(--color-text-muted)',
  warn:    'var(--color-warning)',
  error:   'var(--color-error)',
  success: 'var(--color-success)',
}

export function ChunkedProgress({ state, onPause, onResume, onAbort }) {
  const logRef = useRef(null)
  const { status, currentSlice, totalSlices, slices,
          totalFilledA, totalFilledB, deltaAsset, log } = state

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [log])

  const pct = totalSlices > 0
    ? Math.round(((currentSlice + 1) / totalSlices) * 100)
    : 0

  const deltaColor = Math.abs(deltaAsset) < 0.0005
    ? 'var(--color-success)'
    : Math.abs(deltaAsset) < 0.002
      ? 'var(--color-warning)'
      : 'var(--color-error)'

  return (
    <div className="chunked-progress">

      {/* ── Barre de progression ── */}
      <div className="chunked-progress__header">
        <span className="chunked-progress__label">
          Slice {Math.min(currentSlice + 1, totalSlices)} / {totalSlices}
        </span>
        <span className="chunked-progress__pct">{pct}%</span>
      </div>

      <div className="chunked-progress__bar-track">
        <div
          className="chunked-progress__bar-fill"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* ── Stats delta ── */}
      <div className="chunked-progress__stats">
        <div className="chunked-progress__stat">
          <span>Leg A remplie</span>
          <strong>{totalFilledA.toFixed(5)}</strong>
        </div>
        <div className="chunked-progress__stat">
          <span>Leg B remplie</span>
          <strong>{totalFilledB.toFixed(5)}</strong>
        </div>
        <div className="chunked-progress__stat">
          <span>Δ Delta</span>
          <strong style={{ color: deltaColor }}>
            {deltaAsset >= 0 ? '+' : ''}{deltaAsset.toFixed(5)}
          </strong>
        </div>
      </div>

      {/* ── Slices visuelles ── */}
      <div className="chunked-progress__slices">
        {slices.map((sl, i) => {
          const done  = sl.statusA === 'filled' && sl.statusB === 'filled'
          const failed = sl.statusA === 'failed' || sl.statusB === 'failed'
          const active = i === currentSlice
          return (
            <div
              key={i}
              className={[
                'chunked-progress__slice-dot',
                done   ? 'chunked-progress__slice-dot--done'   : '',
                failed ? 'chunked-progress__slice-dot--failed' : '',
                active ? 'chunked-progress__slice-dot--active' : '',
              ].join(' ')}
              title={`Slice ${i + 1} — A: ${STATUS_ICON[sl.statusA]} B: ${STATUS_ICON[sl.statusB]}`}
            />
          )
        })}
      </div>

      {/* ── Log ── */}
      <div className="chunked-progress__log" ref={logRef}>
        {log.map((entry, i) => (
          <div
            key={i}
            className="chunked-progress__log-line"
            style={{ color: LOG_COLOR[entry.type] ?? 'inherit' }}
          >
            <span className="chunked-progress__log-ts">
              {new Date(entry.ts).toLocaleTimeString('fr-FR')}
            </span>
            {entry.msg}
          </div>
        ))}
      </div>

      {/* ── Contrôles ── */}
      <div className="chunked-progress__controls">
        {status === 'running' && (
          <button className="btn btn-secondary" onClick={onPause}>
            ⏸ Pause
          </button>
        )}
        {status === 'paused' && (
          <button className="btn btn-primary" onClick={onResume}>
            ▶ Reprendre
          </button>
        )}
        {(status === 'running' || status === 'paused') && (
          <button className="btn btn-danger" onClick={onAbort}>
            ⏹ Arrêter
          </button>
        )}
        {(status === 'completed' || status === 'aborted' || status === 'error') && (
          <div className={`chunked-progress__final chunked-progress__final--${status}`}>
            {status === 'completed' && '✅ Exécution complète'}
            {status === 'aborted'   && '⏹ Exécution annulée'}
            {status === 'error'     && `❌ Erreur : ${state.errorMsg ?? 'inconnue'}`}
          </div>
        )}
      </div>

    </div>
  )
}
