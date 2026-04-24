import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Card from '../components/ui/Card.jsx'
import styles from './Configuration.module.css'

export default function Configuration() {
  const { t } = useTranslation()
  const [settings, setSettings] = useState({
    theme: 'dark',
    slippage: '0.5',
    maxDrawdown: '10',
    autoRebalance: true,
    rebalanceThreshold: '0.05',
    emailNotifications: false,
    telegramNotifications: false,
    apiKey: '',
    apiSecret: '',
  })
  const [saved, setSaved] = useState(false)

  const handle = (e) => {
    const { name, value, type, checked } = e.target
    setSettings((s) => ({ ...s, [name]: type === 'checkbox' ? checked : value }))
    setSaved(false)
  }

  const handleSave = (e) => {
    e.preventDefault()
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('configuration.title')}</h1>
        <p className={styles.desc}>{t('configuration.description')}</p>
      </div>

      {saved && (
        <div className={styles.savedBanner} role="alert">
          <span>✓</span> {t('configuration.saved')}
        </div>
      )}

      <form onSubmit={handleSave} className={styles.form}>
        <Card glass>
          <h2 className={styles.sectionTitle}>{t('configuration.sections.general')}</h2>
          <div className={styles.fields}>
            <div className={styles.field}>
              <label className={styles.label}>{t('configuration.theme')}</label>
              <div className={styles.radioGroup}>
                {['light', 'dark', 'system'].map((th) => (
                  <label key={th} className={`${styles.radioOption} ${settings.theme === th ? styles.radioActive : ''}`}>
                    <input type="radio" name="theme" value={th} checked={settings.theme === th} onChange={handle} className={styles.srOnly} />
                    {t(`configuration.theme${th.charAt(0).toUpperCase() + th.slice(1)}`)}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card glass>
          <h2 className={styles.sectionTitle}>{t('configuration.sections.risk')}</h2>
          <div className={styles.fields}>
            <div className={styles.field}>
              <label htmlFor="slippage" className={styles.label}>{t('configuration.slippageTolerance')}</label>
              <input id="slippage" name="slippage" type="number" step="0.1" min="0" max="100"
                value={settings.slippage} onChange={handle} className={styles.input} />
            </div>
            <div className={styles.field}>
              <label htmlFor="maxDrawdown" className={styles.label}>{t('configuration.maxDrawdown')}</label>
              <input id="maxDrawdown" name="maxDrawdown" type="number" step="1" min="0" max="100"
                value={settings.maxDrawdown} onChange={handle} className={styles.input} />
            </div>
            <div className={styles.fieldRow}>
              <label className={styles.label}>{t('configuration.autoRebalance')}</label>
              <label className={styles.toggle}>
                <input type="checkbox" name="autoRebalance" checked={settings.autoRebalance} onChange={handle} className={styles.srOnly} />
                <span className={`${styles.toggleTrack} ${settings.autoRebalance ? styles.toggleOn : ''}`}>
                  <span className={styles.toggleThumb} />
                </span>
              </label>
            </div>
            {settings.autoRebalance && (
              <div className={styles.field}>
                <label htmlFor="rebalanceThreshold" className={styles.label}>{t('configuration.rebalanceThreshold')}</label>
                <input id="rebalanceThreshold" name="rebalanceThreshold" type="number" step="0.01" min="0"
                  value={settings.rebalanceThreshold} onChange={handle} className={styles.input} />
              </div>
            )}
          </div>
        </Card>

        <Card glass>
          <h2 className={styles.sectionTitle}>{t('configuration.sections.notifications')}</h2>
          <div className={styles.fields}>
            {['emailNotifications', 'telegramNotifications'].map((key) => (
              <div key={key} className={styles.fieldRow}>
                <label className={styles.label}>{t(`configuration.${key}`)}</label>
                <label className={styles.toggle}>
                  <input type="checkbox" name={key} checked={settings[key]} onChange={handle} className={styles.srOnly} />
                  <span className={`${styles.toggleTrack} ${settings[key] ? styles.toggleOn : ''}`}>
                    <span className={styles.toggleThumb} />
                  </span>
                </label>
              </div>
            ))}
          </div>
        </Card>

        <Card glass>
          <h2 className={styles.sectionTitle}>{t('configuration.sections.api')}</h2>
          <div className={styles.fields}>
            <div className={styles.field}>
              <label htmlFor="apiKey" className={styles.label}>{t('configuration.apiKey')}</label>
              <input id="apiKey" name="apiKey" type="text" value={settings.apiKey} onChange={handle}
                placeholder="pk_..." className={styles.input} />
            </div>
            <div className={styles.field}>
              <label htmlFor="apiSecret" className={styles.label}>{t('configuration.apiSecret')}</label>
              <input id="apiSecret" name="apiSecret" type="password" value={settings.apiSecret} onChange={handle}
                placeholder="••••••••" className={styles.input} />
            </div>
          </div>
        </Card>

        <div className={styles.formActions}>
          <button type="button" className="btn-ghost" onClick={() => setSaved(false)}>{t('configuration.resetDefaults')}</button>
          <button type="submit" className="btn-primary">{t('configuration.saveSettings')}</button>
        </div>
      </form>
    </div>
  )
}
