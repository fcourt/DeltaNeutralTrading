import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Card from '../components/ui/Card.jsx'

export default function Configuration() {
  const { t } = useTranslation()
  const [s, setS] = useState({
    theme: 'dark', slippage: '0.5', maxDrawdown: '10',
    autoRebalance: true, rebalanceThreshold: '0.05',
    emailNotifications: false, telegramNotifications: false,
    apiKey: '', apiSecret: '',
  })
  const [saved, setSaved] = useState(false)

  const handle = (e) => {
    const { name, value, type, checked } = e.target
    setS((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
    setSaved(false)
  }
  const handleSave = (e) => {
    e.preventDefault(); setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">{t('configuration.title')}</h1>
        <p className="page-desc">{t('configuration.description')}</p>
      </div>

      {saved && <div className="alert alert--success" role="alert"><span>✓</span> {t('configuration.saved')}</div>}

      <form onSubmit={handleSave} className="config-form">
        {/* General */}
        <Card>
          <h2 className="config-section-title">{t('configuration.sections.general')}</h2>
          <div className="config-fields">
            <div className="config-field">
              <label className="config-label">{t('configuration.theme')}</label>
              <div className="config-radio-group">
                {['light','dark','system'].map((th) => (
                  <label key={th} className={`config-radio-option${s.theme===th ? ' config-radio-option--active' : ''}`}>
                    <input type="radio" name="theme" value={th} checked={s.theme===th} onChange={handle} className="sr-only" />
                    {t(`configuration.theme${th.charAt(0).toUpperCase()+th.slice(1)}`)}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Risk */}
        <Card>
          <h2 className="config-section-title">{t('configuration.sections.risk')}</h2>
          <div className="config-fields">
            {[['slippage', t('configuration.slippageTolerance')], ['maxDrawdown', t('configuration.maxDrawdown')]].map(([name, label]) => (
              <div className="config-field" key={name}>
                <label htmlFor={name} className="config-label">{label}</label>
                <input id={name} name={name} type="number" step="0.1" value={s[name]} onChange={handle} className="config-input" />
              </div>
            ))}
            <div className="config-field-row">
              <label className="config-label">{t('configuration.autoRebalance')}</label>
              <label className="config-toggle">
                <input type="checkbox" name="autoRebalance" checked={s.autoRebalance} onChange={handle} className="sr-only" />
                <span className={`config-toggle__track${s.autoRebalance ? ' config-toggle__track--on' : ''}`}>
                  <span className="config-toggle__thumb" />
                </span>
              </label>
            </div>
            {s.autoRebalance && (
              <div className="config-field">
                <label htmlFor="rebalanceThreshold" className="config-label">{t('configuration.rebalanceThreshold')}</label>
                <input id="rebalanceThreshold" name="rebalanceThreshold" type="number" step="0.01" value={s.rebalanceThreshold} onChange={handle} className="config-input" />
              </div>
            )}
          </div>
        </Card>

        {/* Notifications */}
        <Card>
          <h2 className="config-section-title">{t('configuration.sections.notifications')}</h2>
          <div className="config-fields">
            {['emailNotifications','telegramNotifications'].map((key) => (
              <div key={key} className="config-field-row">
                <label className="config-label">{t(`configuration.${key}`)}</label>
                <label className="config-toggle">
                  <input type="checkbox" name={key} checked={s[key]} onChange={handle} className="sr-only" />
                  <span className={`config-toggle__track${s[key] ? ' config-toggle__track--on' : ''}`}>
                    <span className="config-toggle__thumb" />
                  </span>
                </label>
              </div>
            ))}
          </div>
        </Card>

        {/* API */}
        <Card>
          <h2 className="config-section-title">{t('configuration.sections.api')}</h2>
          <div className="config-fields">
            <div className="config-field">
              <label htmlFor="apiKey" className="config-label">{t('configuration.apiKey')}</label>
              <input id="apiKey" name="apiKey" type="text" value={s.apiKey} onChange={handle} placeholder="pk_..." className="config-input" />
            </div>
            <div className="config-field">
              <label htmlFor="apiSecret" className="config-label">{t('configuration.apiSecret')}</label>
              <input id="apiSecret" name="apiSecret" type="password" value={s.apiSecret} onChange={handle} placeholder="••••••••" className="config-input" />
            </div>
          </div>
        </Card>

        <div className="config-form__actions">
          <button type="button" className="btn-ghost">{t('configuration.resetDefaults')}</button>
          <button type="submit" className="config-save-btn">{t('configuration.saveSettings')}</button>
        </div>
      </form>
    </>
  )
}
