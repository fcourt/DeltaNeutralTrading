// src/pages/SettingKeys.jsx
import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useWallet } from '../context/WalletContext'

function FieldGroup({ fields, accentColor, draft, setDraft }) {
  return fields.map(({ label, key, setter, type, hint }) => (
    <div key={label} className="wc-field-group">
      <label className="wc-field-label">{label}</label>
      <div className="wc-field-row">
        <input
          type={type}
          value={draft[key] ?? ''}
          onChange={e => setDraft(prev => ({ ...prev, [key]: e.target.value }))}
          onBlur={e => setter(e.target.value)}
          placeholder={type === 'text' ? '0x...' : '••••••'}
          className={`wc-input wc-input--${accentColor}`}
        />
        {draft[key] && <span className="wc-field-check">✓</span>}
      </div>
      <p className="wc-field-hint">{hint}</p>
    </div>
  ))
}

function PlatformBlock({ title, accentColor, statusDots, fields }) {
  const [open, setOpen] = useState(false)

  // État tampon local — isolé du contexte, ne provoque pas de re-render global
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(fields.map(f => [f.key, f.val ?? '']))
  )

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
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default function SettingKeys() {
  const { t }  = useTranslation()
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
        { label: t('settingKeys.hl.address'), key: 'hlAddress',      val: wallet.hlAddress,      setter: wallet.saveHlAddress,      type: 'text',     hint: t('settingKeys.hl.addressHint') },
        { label: t('settingKeys.hl.agentPk'), key: 'hlAgentPk',      val: wallet.hlAgentPk,      setter: wallet.saveHlAgentPk,      type: 'password', hint: t('settingKeys.hl.agentPkHint') },
        { label: t('settingKeys.hl.vault'),   key: 'hlVaultAddress', val: wallet.hlVaultAddress, setter: wallet.saveHlVaultAddress, type: 'text',     hint: t('settingKeys.hl.vaultHint')   },
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
        { label: t('settingKeys.ext.apiKey'),  key: 'extApiKey',  val: wallet.extApiKey,  setter: wallet.saveExtApiKey,  type: 'password', hint: t('settingKeys.ext.apiKeyHint')  },
        { label: t('settingKeys.ext.starkPk'), key: 'extStarkPk', val: wallet.extStarkPk, setter: wallet.saveExtStarkPk, type: 'password', hint: t('settingKeys.ext.starkPkHint') },
        { label: t('settingKeys.ext.l2Vault'), key: 'extL2Vault', val: wallet.extL2Vault, setter: wallet.saveExtL2Vault, type: 'text',     hint: t('settingKeys.ext.l2VaultHint') },
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
        { label: t('settingKeys.nado.address'),    key: 'nadoAddress',    val: wallet.nadoAddress,    setter: wallet.saveNadoAddress,    type: 'text',     hint: t('settingKeys.nado.addressHint')    },
        { label: t('settingKeys.nado.agentPk'),    key: 'nadoAgentPk',    val: wallet.nadoAgentPk,    setter: wallet.saveNadoAgentPk,    type: 'password', hint: t('settingKeys.nado.agentPkHint')    },
        { label: t('settingKeys.nado.subaccount'), key: 'nadoSubaccount', val: wallet.nadoSubaccount, setter: wallet.saveNadoSubaccount, type: 'text',     hint: t('settingKeys.nado.subaccountHint') },
      ],
    },
    // ── Nouvelle plateforme ──────────────────────────────────────────────
    // {
    //   title:       t('settingKeys.platforms.maPf'),
    //   accentColor: 'orange',
    //   statusDots: [
    //     { label: t('settingKeys.status.connected'), color: wallet.maPfApiKey   ? 'green' : 'gray' },
    //     { label: t('settingKeys.status.trading'),   color: wallet.canTradeMaPf ? 'green' : 'gray' },
    //   ],
    //   fields: [
    //     { label: t('settingKeys.maPf.apiKey'), key: 'maPfApiKey', val: wallet.maPfApiKey, setter: wallet.saveMaPfApiKey, type: 'password', hint: t('settingKeys.maPf.apiKeyHint') },
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
