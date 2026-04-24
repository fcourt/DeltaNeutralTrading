import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Card from '../components/ui/Card.jsx'

const DEMO = [
  { id: 1, asset: 'ETH', size: '$10,000', delta: '0.02',  pnl: '+$245.50', status: 'neutral' },
  { id: 2, asset: 'BTC', size: '$25,000', delta: '-0.08', pnl: '-$120.00', status: 'drift' },
]

export default function ManagePositions() {
  const { t } = useTranslation()
  const [positions, setPositions] = useState(DEMO)
  const close = (id) => setPositions((p) => p.filter((x) => x.id !== id))

  const statusLabel = (s) => ({
    neutral: t('managePositions.statusNeutral'),
    drift:   t('managePositions.statusDrift'),
  }[s] ?? t('managePositions.statusClosed'))

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">{t('managePositions.title')}</h1>
        <p className="page-desc">{t('managePositions.description')}</p>
      </div>

      <Card>
        {positions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon" aria-hidden="true">⊞</div>
            <h3>{t('managePositions.noPositions')}</h3>
            <p>{t('managePositions.noPositionsHint')}</p>
          </div>
        ) : (
          <div className="positions-table-wrapper">
            <table className="positions-table">
              <thead>
                <tr>
                  {['asset','size','delta','pnl','status','actions'].map((col) => (
                    <th key={col}>{t(`managePositions.columns.${col}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {positions.map((pos) => (
                  <tr key={pos.id}>
                    <td><span className="asset-badge">{pos.asset}</span></td>
                    <td className="text-mono">{pos.size}</td>
                    <td className="text-mono">Δ {pos.delta}</td>
                    <td className={`text-mono ${pos.pnl.startsWith('+') ? 'text-success' : 'text-error'}`}>{pos.pnl}</td>
                    <td><span className={`status-badge status-badge--${pos.status}`}>{statusLabel(pos.status)}</span></td>
                    <td>
                      <div className="row-actions">
                        <button className="btn-rebalance">{t('managePositions.rebalance')}</button>
                        <button className="btn-close-pos" onClick={() => close(pos.id)} aria-label={`Close ${pos.asset}`}>
                          {t('managePositions.close')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
