import { useState } from 'react'
import { useTranslation } from 'react-i18next'

const KEY_FIELDS = [
  { id: 'apiKey',     type: 'text',     labelKey: 'settingKeys.apiKey',     placeholderKey: 'settingKeys.apiKeyPlaceholder' },
  { id: 'apiSecret',  type: 'password', labelKey: 'settingKeys.apiSecret',  placeholderKey: 'settingKeys.apiSecretPlaceholder' },
  { id: 'passphrase', type: 'password', labelKey: 'settingKeys.passphrase', placeholderKey: 'settingKeys.passphrasePlaceholder' },
]

export default function SettingKeys() {
  const { t } = useTranslation()
  const [form, setForm] = useState({ apiKey: '', apiSecret: '', passphrase: '' })
  const [show, setShow] = useState({ apiSecret: false, passphrase: false })
  const [saved, setSaved] = useState(false)

  const handle = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))
    setSaved(false)
  }

  const toggleShow = (field) => setShow((s) => ({ ...s, [field]: !s[field] }))

  const handleSubmit = (e) => {
    e.preventDefault()
    setSaved(true)
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">{t('settingKeys.title')}</h1>
        <p className="page-desc">{t('settingKeys.description')}</p>
      </div>

      <div className="card">
        {saved && (
          <div className="alert alert--success" role="alert">
            ✓ {t('settingKeys.savedSuccess')}
          </div>
        )}

        <form onSubmit={handleSubmit} className="keys-form" noValidate>
          {KEY_FIELDS.map(({ id, type, labelKey, placeholderKey }) => (
            <div key={id} className="trade-input-block">
              <span className="trade-label">{t(labelKey)}</span>
              <div className="trade-input-row">
                <input
                  id={id}
                  name={id}
                  type={show[id] === false ? 'password' : (show[id] ? 'text' : type)}
                  placeholder={t(placeholderKey)}
                  value={form[id]}
                  onChange={handle}
                  className="trade-input"
                  autoComplete="off"
                  spellCheck="false"
                />
                {type === 'password' && (
                  <button
                    type="button"
                    className="keys-toggle-btn"
                    onClick={() => toggleShow(id)}
                    aria-label={show[id] ? t('settingKeys.hide') : t('settingKeys.show')}
                  >
                    {show[id] ? '🙈' : '👁'}
                  </button>
                )}
              </div>
              {form[id] && (
                <span className="trade-sub keys-filled">
                  ✓ {t('settingKeys.filled')}
                </span>
              )}
            </div>
          ))}

          <div className="keys-actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => { setForm({ apiKey: '', apiSecret: '', passphrase: '' }); setSaved(false) }}
            >
              {t('settingKeys.clear')}
            </button>
            <button type="submit" className="trade-cta" style={{ width: 'auto', padding: '0.75rem 2rem', marginTop: 0 }}>
              {t('settingKeys.save')}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
