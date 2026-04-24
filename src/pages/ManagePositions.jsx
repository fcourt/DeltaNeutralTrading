import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Card from '../components/ui/Card.jsx'
import styles from './ManagePositions.module.css'

const DEMO_POSITIONS = [
  { id: 1, asset: 'ETH', size: '$10,000', delta: '0.02', pnl: '+$245.50', status: 'neutral' },
  { id: 2, asset: 'BTC', size: '$25,000', delta: '-0.08', pnl: '-$120.00', status: 'drift' },
]

export default function ManagePositions() {
  const { t } = useTranslation()
  const [positions, setPositions] = useState(DEMO_POSITIONS)

  const handleClose = (id) => setPositions((p) => p.filter((pos) => pos.id !== id))

  const statusLabel = (status) => {
    if (status === 'neutral') return t('managePositions.statusNeutral')
    if (status === 'drift')   return t('managePositions.statusDrift')
    return t('managePositions.statusClosed')
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('managePositions.title')}</h1>
        <p className={styles.desc}>{t('managePositions.description')}</p>
      </div>

      {positions.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon} aria-hidden="true">⊞</div>
          <h3>{t('managePositions.noPositions')}</h3>
          <p>{t('managePositions.noPositionsHint')}</p>
        </div>
      ) : (
        <Card glass>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t('managePositions.columns.asset')}</th>
                  <th>{t('managePositions.columns.size')}</th>
                  <th>{t('managePositions.columns.delta')}</th>
                  <th>{t('managePositions.columns.pnl')}</th>
                  <th>{t('managePositions.columns.status')}</th>
                  <th>{t('managePositions.columns.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((pos) => (
                  <tr key={pos.id}>
                    <td><span className={styles.assetBadge}>{pos.asset}</span></td>
                    <td className={styles.mono}>{pos.size}</td>
                    <td className={styles.mono}>Δ {pos.delta}</td>
                    <td className={`${styles.mono} ${pos.pnl.startsWith('+') ? styles.green : styles.red}`}>{pos.pnl}</td>
                    <td>
                      <span className={`${styles.statusBadge} ${styles[pos.status]}`}>
                        {statusLabel(pos.status)}
                      </span>
                    </td>
                    <td>
                      <div className={styles.rowActions}>
                        <button className="btn-ghost" style={{padding:'0.25rem 0.75rem', fontSize:'var(--text-xs)'}}>
                          {t('managePositions.rebalance')}
                        </button>
                        <button
                          className={styles.closeBtn}
                          onClick={() => handleClose(pos.id)}
                          aria-label={`Close ${pos.asset} position`}
                        >
                          {t('managePositions.close')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
