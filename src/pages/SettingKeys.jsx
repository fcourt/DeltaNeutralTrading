import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useWallet } from '../context/WalletContext'

function FieldGroup({ fields, accentColor }) {
  return fields.map(({ label, val, setter, type, hint }) => (
    <div key={label} className="wc-field-group">
      <label className="wc-field-label">{label}</label>
      <div className="wc-field-row">
        <input
          type={type}
          value={val || ''}
          onChange={e => setter(e.target.value)}
          placeholder={type === 'text' ? '0x...' : '••••••'}
          className={`wc-input wc-input--${accentColor}`}
        />
        {val && <span className="wc-field-check">✓</span>}
      </div>
      <p className="wc-field-hint">{hint}</p>
    </div>
  ))
}

function PlatformBlock({ title, accentColor, statusDots, fields }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="wc-wrapper">
      <button onClick={() => setOpen(o => !o)} className="wc-toggle">
        <span className="wc-toggle-left">
          {title}
          {statusDots.map((dot, i) => (
            <span key={i} className={`wc-dot wc-dot--${dot.color}`}>● {dot.label}</span>
          ))}
        </span>
        <span>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="wc-body">
          <div className="wc-section">
            <FieldGroup fields={fields} accentColor={accentColor} />
          </div>
        </div>
      )}
    </div>
  )
}

export default function SettingKeys() {
  const { t } = useTranslation()
  const {
    hlAddress,      saveHlAddress,
    hlVaultAddress, saveHlVaultAddress,
    hlAgentPk,      saveHlAgentPk,
    extApiKey,      saveExtApiKey,
    extStarkPk,     saveExtStarkPk,
    extL2Vault,     saveExtL2Vault,
    nadoAddress,    saveNadoAddress,
    nadoAgentPk,    saveNadoAgentPk,
    nadoSubaccount, saveNadoSubaccount,
    canTradeHL, canTradeExt, canTradeNado,
    resetAll,
  } = useWallet()

  const hlFields = [
    { label: t('settingKeys.hl.address'),    val: hlAddress,      setter: saveHlAddress,      type: 'text',     hint: t('settingKeys.hl.addressHint') },
    { label: t('settingKeys.hl.agentPk'),    val: hlAgentPk,      setter: saveHlAgentPk,      type: 'password', hint: t('settingKeys.hl.agentPkHint') },
    { label: t('settingKeys.hl.vault'),      val: hlVaultAddress, setter: saveHlVaultAddress, type: 'text',     hint: t('settingKeys.hl.vaultHint') },
  ]

  const extFields = [
    { label: t('settingKeys.ext.apiKey'),    val: extApiKey,  setter: saveExtApiKey,  type: 'password', hint: t('settingKeys.ext.apiKeyHint') },
    { label: t('settingKeys.ext.starkPk'),   val: extStarkPk, setter: saveExtStarkPk, type: 'password', hint: t('settingKeys.ext.starkPkHint') },
    { label: t('settingKeys.ext.l2Vault'),   val: extL2Vault, setter: saveExtL2Vault, type: 'text',     hint: t('settingKeys.ext.l2VaultHint') },
  ]

  const nadoFields = [
    { label: t('settingKeys.nado.address'),     val: nadoAddress,    setter: saveNadoAddress,    type: 'text',     hint: t('settingKeys.nado.addressHint') },
    { label: t('settingKeys.nado.agentPk'),     val: nadoAgentPk,    setter: saveNadoAgentPk,    type: 'password', hint: t('settingKeys.nado.agentPkHint') },
    { label: t('settingKeys.nado.subaccount'),  val: nadoSubaccount, setter: saveNadoSubaccount, type: 'text',     hint: t('settingKeys.nado.subaccountHint') },
  ]

  const handleReset = () => {
    if (!confirm(t('settingKeys.confirmReset'))) return
    resetAll()
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">{t('settingKeys.title')}</h1>
        <p className="page-desc">{t('settingKeys.description')}</p>
      </div>

      <div className="wc-platforms">

        <PlatformBlock
          title={t('settingKeys.platforms.hl')}
          accentColor="blue"
          fields={hlFields}
          statusDots={[
            { label: t('settingKeys.status.connected'),  color: hlAddress   ? 'green' : 'red'    },
            { label: t('settingKeys.status.trading'),    color: canTradeHL  ? 'green' : 'yellow' },
          ]}
        />

        <PlatformBlock
          title={t('settingKeys.platforms.ext')}
          accentColor="purple"
          fields={extFields}
          statusDots={[
            { label: t('settingKeys.status.connected'),  color: extApiKey   ? 'green' : 'yellow' },
            { label: t('settingKeys.status.trading'),    color: canTradeExt ? 'green' : 'yellow' },
          ]}
        />

        <PlatformBlock
          title={t('settingKeys.platforms.nado')}
          accentColor="green"
          fields={nadoFields}
          statusDots={[
            { label: t('settingKeys.status.connected'),  color: nadoAddress  ? 'green' : 'gray' },
            { label: t('settingKeys.status.trading'),    color: canTradeNado ? 'green' : 'gray' },
          ]}
        />

        <div className="wc-reset-zone">
          <button onClick={handleReset} className="wc-reset-btn">
            🗑️ {t('settingKeys.resetAll')}
          </button>
        </div>

      </div>
    </>
  )
}
