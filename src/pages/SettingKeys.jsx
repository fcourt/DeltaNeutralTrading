// src/pages/SettingKeys.jsx
//import { useState, useEffect } from 'react'
import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useWallet } from '../context/WalletContext'
import { PLATFORMS, CREDENTIAL_FIELDS } from '../platforms/index.js'


function FieldGroup({ fields, accentColor }) {
  const [localValues, setLocalValues] = useState(() =>
    fields.reduce((acc, f) => {
      acc[f.label] = f.val || ''
      return acc
    }, {})
  )

  // Sync si wallet change (ex: reset)
  useEffect(() => {
    setLocalValues(
      fields.reduce((acc, f) => {
        acc[f.label] = f.val || ''
        return acc
      }, {})
    )
  }, [fields])

  const handleChange = (label, value, setter) => {
    setLocalValues(prev => ({ ...prev, [label]: value }))
    setter(value) // update wallet
  }

  return fields.map(({ label, setter, type, hint }) => (
    <div key={label} className="wc-field-group">
      <label className="wc-field-label">{label}</label>
      <div className="wc-field-row">
        <input
          type={type}
          value={localValues[label] || ''}
          onChange={e => handleChange(label, e.target.value, setter)}
          placeholder={type === 'text' ? '0x...' : '••••••'}
          className={`wc-input wc-input--${accentColor}`}
        />
        {localValues[label] && <span className="wc-field-check">✓</span>}
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
/*
export default function SettingKeys() {
  const { t } = useTranslation()
  const wallet = useWallet()

  // ── Déclaration centralisée des blocs plateforme ────────────────────────
  // Pour ajouter une plateforme : ajouter un bloc ici uniquement.
  const platformBlocks = [
    {
      title:       t('settingKeys.platforms.hl'),
      accentColor: 'blue',
      statusDots: [
        { label: t('settingKeys.status.connected'), color: wallet.hlAddress  ? 'green' : 'red'    },
        { label: t('settingKeys.status.trading'),   color: wallet.canTradeHL ? 'green' : 'yellow' },
      ],
      fields: [
        { label: t('settingKeys.hl.address'), val: wallet.hlAddress,      setter: wallet.saveHlAddress,      type: 'text',     hint: t('settingKeys.hl.addressHint') },
        { label: t('settingKeys.hl.agentPk'), val: wallet.hlAgentPk,      setter: wallet.saveHlAgentPk,      type: 'password', hint: t('settingKeys.hl.agentPkHint') },
        { label: t('settingKeys.hl.vault'),   val: wallet.hlVaultAddress, setter: wallet.saveHlVaultAddress, type: 'text',     hint: t('settingKeys.hl.vaultHint')    },
      ],
    },
    {
      title:       t('settingKeys.platforms.ext'),
      accentColor: 'purple',
      statusDots: [
        { label: t('settingKeys.status.connected'), color: wallet.extApiKey   ? 'green' : 'yellow' },
        { label: t('settingKeys.status.trading'),   color: wallet.canTradeExt ? 'green' : 'yellow' },
      ],
      fields: [
        { label: t('settingKeys.ext.apiKey'),  val: wallet.extApiKey,  setter: wallet.saveExtApiKey,  type: 'password', hint: t('settingKeys.ext.apiKeyHint')  },
        { label: t('settingKeys.ext.starkPk'), val: wallet.extStarkPk, setter: wallet.saveExtStarkPk, type: 'password', hint: t('settingKeys.ext.starkPkHint') },
        { label: t('settingKeys.ext.l2Vault'), val: wallet.extL2Vault, setter: wallet.saveExtL2Vault, type: 'text',     hint: t('settingKeys.ext.l2VaultHint') },
      ],
    },
    {
      title:       t('settingKeys.platforms.nado'),
      accentColor: 'green',
      statusDots: [
        { label: t('settingKeys.status.connected'), color: wallet.nadoAddress  ? 'green' : 'gray' },
        { label: t('settingKeys.status.trading'),   color: wallet.canTradeNado ? 'green' : 'gray' },
      ],
      fields: [
        { label: t('settingKeys.nado.address'),    val: wallet.nadoAddress,    setter: wallet.saveNadoAddress,    type: 'text',     hint: t('settingKeys.nado.addressHint')    },
        { label: t('settingKeys.nado.agentPk'),    val: wallet.nadoAgentPk,    setter: wallet.saveNadoAgentPk,    type: 'password', hint: t('settingKeys.nado.agentPkHint')    },
        { label: t('settingKeys.nado.subaccount'), val: wallet.nadoSubaccount, setter: wallet.saveNadoSubaccount, type: 'text',     hint: t('settingKeys.nado.subaccountHint') },
      ],
    },
    // ── Nouvelle plateforme ──────────────────────────────────────────────
    // {
    //   title:       t('settingKeys.platforms.maPf'),
    //   accentColor: 'orange',
    //   statusDots: [
    //     { label: t('settingKeys.status.connected'), color: wallet.maPfApiKey    ? 'green' : 'gray' },
    //     { label: t('settingKeys.status.trading'),   color: wallet.canTradeMaPf  ? 'green' : 'gray' },
    //   ],
    //   fields: [
    //     { label: t('settingKeys.maPf.apiKey'), val: wallet.maPfApiKey, setter: wallet.saveMaPfApiKey, type: 'password', hint: t('settingKeys.maPf.apiKeyHint') },
    //   ],
    // },
  ]

  const handleReset = () => {
    if (!confirm(t('settingKeys.confirmReset'))) return
    wallet.resetAll()
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">{t('settingKeys.title')}</h1>
        <p className="page-desc">{t('settingKeys.description')}</p>
      </div>

      <div className="wc-platforms">
        {platformBlocks.map(block => (
          <PlatformBlock key={block.title} {...block} />
        ))}

        <div className="wc-reset-zone">
          <button onClick={handleReset} className="wc-reset-btn">
            🗑️ {t('settingKeys.resetAll')}
          </button>
        </div>
      </div>
    </>
  )
}
*/

export default function SettingKeys() {
  const { t } = useTranslation()
  const wallet = useWallet()

  // Dédupliquer les keysField — hl/xyz/hyena partagent le même bloc credentials
  const uniqueKeysFields = [...new Set(PLATFORMS.map(p => p.keysField))]

  const platformBlocks = useMemo(() =>
    uniqueKeysFields.map(kf => {
      // Prendre la première platform du groupe pour le titre et l'accentColor
      const platform = PLATFORMS.find(p => p.keysField === kf)
      const fields   = CREDENTIAL_FIELDS[kf] ?? []

      return {
        key:         kf,
        title:       t(`settingKeys.platforms.${kf}`),
        accentColor: platform?.accentColor ?? 'gray',
        statusDots: [
          { label: t('settingKeys.status.connected'), color: fields[0] && wallet[fields[0].stateKey] ? 'green' : 'gray' },
          { label: t('settingKeys.status.trading'),   color: wallet.canTradeMap[kf] ? 'green' : 'gray' },
        ],
        fields: fields.map(f => ({
          label:  t(f.label),
          val:    wallet[f.stateKey] ?? '',
          setter: v => wallet.save(f.stateKey, v),
          type:   f.type,
          hint:   t(f.hint),
        })),
      }
    }),
  [wallet, t, uniqueKeysFields])

  const handleReset = () => {
    if (!confirm(t('settingKeys.confirmReset'))) return
    wallet.resetAll()
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">{t('settingKeys.title')}</h1>
        <p className="page-desc">{t('settingKeys.description')}</p>
      </div>
      <div className="wc-platforms">
        {platformBlocks.map(block => (
          <PlatformBlock key={block.key} {...block} />
        ))}
        <div className="wc-reset-zone">
          <button onClick={handleReset} className="wc-reset-btn">
            🗑️ {t('settingKeys.resetAll')}
          </button>
        </div>
      </div>
    </>
  )
}
