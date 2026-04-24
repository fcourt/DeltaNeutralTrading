import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Card from '../components/ui/Card.jsx'
import { useWallet } from '../context/WalletContext'

const ASSETS = ['ETH', 'BTC', 'SOL', 'ARB', 'OP', 'AVAX']

export default function OpenTrade() {

  const { canTradeHL, canTradeExt, canTradeNado } = useWallet()
  const canTrade = canTradeHL || canTradeExt || canTradeNado
  
  const { t } = useTranslation()
  const [form, setForm] = useState({ asset: 'ETH', size: '', leverage: '', deltaTarget: '0' })
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handle = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
  const handleSubmit = (e) => { e.preventDefault(); if (form.size) setShowConfirm(true) }
  const handleConfirm = () => {
    setShowConfirm(false); setSubmitted(true)
    setForm({ asset: 'ETH', size: '', leverage: '', deltaTarget: '0' })
  }
  const handleReset = () => { setForm({ asset: 'ETH', size: '', leverage: '', deltaTarget: '0' }); setSubmitted(false) }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">{t('openTrade.title')}</h1>
        <p className="page-desc">{t('openTrade.description')}</p>
      </div>

      {/* ── Bannière si aucune clé configurée ── */}
      {!canTrade && (
        <div className="card">
          <div className="alert alert--warning">
            ⚠️ Aucune clé de trading configurée.{' '}
            <a href="/setting-keys" className="wc-alert-link">
              Configurer mes clés →
            </a>
          </div>
        </div>
      )}
      
      <Card>
        {submitted && (
          <div className="alert alert--success" role="alert">
            <span>✓</span> Position opened successfully!
          </div>
        )}

        <form onSubmit={handleSubmit} className="trade-form" noValidate>
          {/* Asset + Size */}
          <div className="trade-input-block">
            <span className="trade-label">{t('openTrade.asset')} / {t('openTrade.size')}</span>
            <div className="trade-input-row">
              <input
                id="size" name="size" type="number" min="0"
                placeholder="0.00" value={form.size} onChange={handle}
                className="trade-input"
              />
              <select name="asset" value={form.asset} onChange={handle} className="trade-asset-select">
                {ASSETS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <span className="trade-sub">{form.size ? `$${Number(form.size).toLocaleString()}` : '$0.00'}</span>
          </div>

          {/* Leverage */}
          <div className="trade-input-block">
            <span className="trade-label">{t('openTrade.leverage')}</span>
            <div className="trade-input-row">
              <input id="leverage" name="leverage" type="number" min="1" max="100" placeholder="1" value={form.leverage} onChange={handle} className="trade-input" />
              <span className="trade-badge">× leverage</span>
            </div>
            <span className="trade-sub">Max 100x</span>
          </div>

          {/* Delta */}
          <div className="trade-input-block">
            <span className="trade-label">{t('openTrade.deltaTarget')}</span>
            <div className="trade-input-row">
              <input id="deltaTarget" name="deltaTarget" type="number" placeholder="0" value={form.deltaTarget} onChange={handle} className="trade-input" />
              <span className="trade-badge">Δ delta</span>
            </div>
            <span className="trade-sub">{t('openTrade.deltaTargetPlaceholder')}</span>
          </div>

          <button type="button" className="trade-reset" onClick={handleReset}>{t('openTrade.reset')}</button>
          <button type="submit" className="trade-cta">{t('openTrade.submit')}</button>
        </form>
      </Card>

      {showConfirm && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="modal">
            <h2 id="confirm-title" className="modal__title">{t('openTrade.confirmTitle')}</h2>
            <p className="modal__body">{t('openTrade.confirmBody')}</p>
            <div className="modal__summary">
              <div className="modal__summary-row"><span>{t('openTrade.asset')}</span><strong>{form.asset}</strong></div>
              <div className="modal__summary-row"><span>{t('openTrade.size')}</span><strong>${form.size}</strong></div>
              <div className="modal__summary-row"><span>{t('openTrade.leverage')}</span><strong>{form.leverage || 1}x</strong></div>
              <div className="modal__summary-row"><span>{t('openTrade.deltaTarget')}</span><strong>Δ {form.deltaTarget}</strong></div>
            </div>
            <div className="modal__actions">
              <button className="btn-ghost" onClick={() => setShowConfirm(false)}>{t('openTrade.cancel')}</button>
              <button className="trade-cta" style={{width:'auto',padding:'0.5rem 1.5rem',marginTop:0}} onClick={handleConfirm}>{t('openTrade.confirm')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
