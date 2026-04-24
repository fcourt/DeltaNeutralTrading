import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Card from '../components/ui/Card.jsx'
import styles from './OpenTrade.module.css'

const ASSETS = ['ETH', 'BTC', 'SOL', 'ARB', 'OP', 'AVAX']

export default function OpenTrade() {
  const { t } = useTranslation()
  const [form, setForm] = useState({ asset: '', size: '', leverage: '', deltaTarget: '0' })
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
  const handleSubmit = (e) => { e.preventDefault(); setShowConfirm(true) }
  const handleConfirm = () => {
    setShowConfirm(false)
    setSubmitted(true)
    setForm({ asset: '', size: '', leverage: '', deltaTarget: '0' })
  }
  const handleReset = () => { setForm({ asset: '', size: '', leverage: '', deltaTarget: '0' }); setSubmitted(false) }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('openTrade.title')}</h1>
        <p className={styles.desc}>{t('openTrade.description')}</p>
      </div>

      <Card glass className={styles.formCard}>
        {submitted && (
          <div className={styles.successBanner} role="alert">
            <span>✓</span> {t('configuration.saved')}
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.form} noValidate>
          <div className={styles.field}>
            <label htmlFor="asset" className={styles.label}>{t('openTrade.asset')}</label>
            <select id="asset" name="asset" value={form.asset} onChange={handleChange} className={styles.select} required>
              <option value="" disabled>{t('openTrade.assetPlaceholder')}</option>
              {ASSETS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="size" className={styles.label}>{t('openTrade.size')}</label>
            <input
              id="size" name="size" type="number" min="0"
              placeholder={t('openTrade.sizePlaceholder')}
              value={form.size} onChange={handleChange}
              className={styles.input} required
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="leverage" className={styles.label}>{t('openTrade.leverage')}</label>
            <input
              id="leverage" name="leverage" type="number" min="1" max="100"
              placeholder={t('openTrade.leveragePlaceholder')}
              value={form.leverage} onChange={handleChange}
              className={styles.input} required
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="deltaTarget" className={styles.label}>{t('openTrade.deltaTarget')}</label>
            <input
              id="deltaTarget" name="deltaTarget" type="number"
              placeholder={t('openTrade.deltaTargetPlaceholder')}
              value={form.deltaTarget} onChange={handleChange}
              className={styles.input}
            />
          </div>

          <div className={styles.actions}>
            <button type="button" onClick={handleReset} className="btn-ghost">{t('openTrade.reset')}</button>
            <button type="submit" className="btn-primary">{t('openTrade.submit')}</button>
          </div>
        </form>
      </Card>

      {showConfirm && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className={styles.modal}>
            <h2 id="confirm-title" className={styles.modalTitle}>{t('openTrade.confirmTitle')}</h2>
            <p className={styles.modalBody}>{t('openTrade.confirmBody')}</p>
            <div className={styles.modalSummary}>
              <div className={styles.summaryRow}><span>{t('openTrade.asset')}</span><strong>{form.asset}</strong></div>
              <div className={styles.summaryRow}><span>{t('openTrade.size')}</span><strong>${form.size}</strong></div>
              <div className={styles.summaryRow}><span>{t('openTrade.leverage')}</span><strong>{form.leverage}x</strong></div>
              <div className={styles.summaryRow}><span>{t('openTrade.deltaTarget')}</span><strong>Δ {form.deltaTarget}</strong></div>
            </div>
            <div className={styles.modalActions}>
              <button className="btn-ghost" onClick={() => setShowConfirm(false)}>{t('openTrade.cancel')}</button>
              <button className="btn-primary" onClick={handleConfirm}>{t('openTrade.confirm')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
