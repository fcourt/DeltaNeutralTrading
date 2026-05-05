// src/pages/SettingKeys.jsx
import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useWallet } from '../context/WalletContext'

function FieldGroup({ fields, accentColor, draft, setDraft, onSave }) {
  return fields.map(({ label, key, type, hint }) => (
    <div key={key} className="wc-field-group">
      <label className="wc-field-label">{label}</label>
      <div className="wc-field-row">
        <input
          type={type}
          value={draft[key] ?? ''}
          onChange={e => setDraft(prev => ({ ...prev, [key]: e.target.value }))}
          onBlur={() => onSave(key, draft[key] ?? '')}
          placeholder={type === 'text' ? '0x...' : '••••••'}
          className={`wc-input wc-input--${accentColor}`}
        />
        {draft[key] && <span className="wc-field-check">✓</span>}
      </div>
      <p className="wc-field-hint">{hint}</p>
    </div>
  ))
}

function PlatformBlock({ title, accentColor, statusDots, fields, initialValues, savers }) {
  const [open, setOpen]   = useState(false)
  const [draft, setDraft] = useState(initialValues)

  const handleSave = useCallback((key, value) => {
    savers[key]?.(value)
  }, [savers])

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
            <FieldGroup
              fields={fields}
              accentColor={accentColor}
              draft={draft}
              setDraft={setDraft}
              onSave={handleSave}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default function SettingKeys() {
  const { t }    = useTranslation()
  const wallet   = useWallet()

  const platformBlocks = [
    {
      title:         t('settingKeys.platforms.hl'),
      accentColor:   'blue',
      statusDots: [
        { label: t('settingKeys.status.connected'), color: wallet.hlAddress  ? 'green' : 'red'    },
        { label: t('settingKeys.status.trading'),   color: wallet.canTradeHL ? 'green' : 'yellow' },
      ],
      initialValues: {
        hlAddress:      wallet.hlAddress      ?? '',
        hlAgentPk:      wallet.hlAgentPk      ?? '',
        hlVaultAddress: wallet.hlVaultAddress ?? '',
      },
      savers: {
        hlAddress:      wallet.saveHlAddress,
        hlAgentPk:      wallet.saveHlAgentPk,
        hlVaultAddress: wallet.saveHlVaultAddress,
      },
      fields: [
        { label: t('settingKeys.hl.address'), key: 'hlAddress',      type: 'text',     hint: t('settingKeys.hl.addressHint') },
        { label: t('settingKeys.hl.agentPk'), key: 'hlAgentPk',      type: 'password', hint: t('settingKeys.hl.agentPkHint') },
        { label: t('settingKeys.hl.vault'),   key: 'hlVaultAddress', type: 'text',     hint: t('settingKeys.hl.vaultHint')   },
      ],
    },
    {
      title:         t('settingKeys.platforms.ext'),
      accentColor:   'purple',
      statusDots: [
        { label: t('settingKeys.status.connected'), color: wallet.extApiKey   ? 'green' : 'yellow' },
        { label: t('settingKeys.status.trading'),   color: wallet.canTradeExt ? 'green' : 'yellow' },
      ],
      initialValues: {
        extApiKey:  wallet.extApiKey  ?? '',
        extStarkPk: wallet.extStarkPk ?? '',
        extL2Vault: wallet.extL2Vault ?? '',
      },
      savers: {
        extApiKey:  wallet.saveExtApiKey,
        extStarkPk: wallet.saveExtStarkPk,
        extL2Vault: wallet.saveExtL2Vault,
      },
      fields: [
        { label: t('settingKeys.ext.apiKey'),  key: 'extApiKey',  type: 'password', hint: t('settingKeys.ext.apiKeyHint')  },
        { label: t('settingKeys.ext.starkPk'), key: 'extStarkPk', type: 'password', hint: t('settingKeys.ext.starkPkHint') },
        { label: t('settingKeys.ext.l2Vault'), key: 'extL2Vault', type: 'text',     hint: t('settingKeys.ext.l2VaultHint') },
      ],
    },
    {
      title:         t('settingKeys.platforms.nado'),
      accentColor:   'green',
      statusDots: [
        { label: t('settingKeys.status.connected'), color: wallet.nadoAddress  ? 'green' : 'gray' },
        { label: t('settingKeys.status.trading'),   color: wallet.canTradeNado ? 'green' : 'gray' },
      ],
      initialValues: {
        nadoAddress:    wallet.nadoAddress    ?? '',
        nadoAgentPk:    wallet.nadoAgentPk    ?? '',
        nadoSubaccount: wallet.nadoSubaccount ?? '',
      },
      savers: {
        nadoAddress:    wallet.saveNadoAddress,
        nadoAgentPk:    wallet.saveNadoAgentPk,
        nadoSubaccount: wallet.saveNadoSubaccount,
      },
      fields: [
        { label: t('settingKeys.nado.address'),    key: 'nadoAddress',    type: 'text',     hint: t('settingKeys.nado.addressHint')    },
        { label: t('settingKeys.nado.agentPk'),    key: 'nadoAgentPk',    type: 'password', hint: t('settingKeys.nado.agentPkHint')    },
        { label: t('settingKeys.nado.subaccount'), key: 'nadoSubaccount', type: 'text',     hint: t('settingKeys.nado.subaccountHint') },
      ],
    },
    // ── Nouvelle plateforme ──────────────────────────────────────────────
    // {
    //   title:         t('settingKeys.platforms.maPf'),
    //   accentColor:   'orange',
    //   statusDots: [
    //     { label: t('settingKeys.status.connected'), color: wallet.maPfApiKey   ? 'green' : 'gray' },
    //     { label: t('settingKeys.status.trading'),   color: wallet.canTradeMaPf ? 'green' : 'gray' },
    //   ],
    //   initialValues: { maPfApiKey: wallet.maPfApiKey ?? '' },
    //   savers:        { maPfApiKey: wallet.saveMaPfApiKey },
    //   fields: [
    //     { label: t('settingKeys.maPf.apiKey'), key: 'maPfApiKey', type: 'password', hint: t('settingKeys.maPf.apiKeyHint') },
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
