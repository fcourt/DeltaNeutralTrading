import { useState } from 'react'
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

export default function SettingKeys() {
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

  const [open, setOpen] = useState(!hlAddress && !extApiKey && !nadoAddress)

  const hlFields = [
    { label: 'Adresse compte principal', val: hlAddress,      setter: saveHlAddress,      type: 'text',     hint: 'Lecture positions & marge' },
    { label: 'Clé privée Agent Wallet',  val: hlAgentPk,      setter: saveHlAgentPk,      type: 'password', hint: '⚠️ Une seule fois à la création — ne peut que trader' },
    { label: 'Adresse sous-compte',      val: hlVaultAddress, setter: saveHlVaultAddress, type: 'text',     hint: 'Optionnel — laisser vide pour compte principal' },
  ]

  const extFields = [
    { label: 'Clé API (lecture)',     val: extApiKey,  setter: saveExtApiKey,  type: 'password', hint: 'Marge, positions, funding rates' },
    { label: 'Stark Private Key',     val: extStarkPk, setter: saveExtStarkPk, type: 'password', hint: '⚠️ Une seule fois à la création — ne peut que trader' },
    { label: 'l2Vault (ID position)', val: extL2Vault, setter: saveExtL2Vault, type: 'text',     hint: 'Extended › Account › API Management' },
  ]

  const nadoFields = [
    { label: 'Adresse compte principal', val: nadoAddress,    setter: saveNadoAddress,    type: 'text',     hint: 'Lecture positions & marge disponible' },
    { label: 'Clé privée Linked Signer', val: nadoAgentPk,    setter: saveNadoAgentPk,    type: 'password', hint: '⚠️ Nado › Settings › 1-Click Trading — ne peut que trader' },
    { label: 'Nom du sous-compte',       val: nadoSubaccount, setter: saveNadoSubaccount, type: 'text',     hint: 'Laisser "default" pour le compte principal' },
  ]

  const handleReset = () => {
    if (!confirm('Effacer toutes les clés sauvegardées ?')) return
    resetAll()
  }

  return (
    <div className="wc-wrapper">
      <button
        onClick={() => setOpen(o => !o)}
        className="wc-toggle"
      >
        <span className="wc-toggle-left">
          🔑 Wallets &amp; API Keys
          <span className={hlAddress    ? 'wc-dot wc-dot--green' : 'wc-dot wc-dot--red'}>● HL connecté</span>
          <span className={canTradeHL   ? 'wc-dot wc-dot--green' : 'wc-dot wc-dot--yellow'}>● HL trading</span>
          <span className={extApiKey    ? 'wc-dot wc-dot--green' : 'wc-dot wc-dot--yellow'}>● EXT connecté</span>
          <span className={canTradeExt  ? 'wc-dot wc-dot--green' : 'wc-dot wc-dot--yellow'}>● EXT trading</span>
          <span className={nadoAddress  ? 'wc-dot wc-dot--green' : 'wc-dot wc-dot--gray'}>● Nado connecté</span>
          <span className={canTradeNado ? 'wc-dot wc-dot--green' : 'wc-dot wc-dot--gray'}>● Nado trading</span>
        </span>
        <span>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="wc-body">

          {/* Hyperliquid */}
          <div className="wc-section">
            <p className="wc-section-title wc-section-title--blue">
              Hyperliquid / trade.xyz / HyENA
            </p>
            <FieldGroup fields={hlFields} accentColor="blue" />
          </div>

          {/* Extended */}
          <div className="wc-section">
            <p className="wc-section-title wc-section-title--purple">
              Extended Exchange
            </p>
            <FieldGroup fields={extFields} accentColor="purple" />
          </div>

          {/* Nado */}
          <div className="wc-section">
            <p className="wc-section-title wc-section-title--green">
              Nado Exchange
            </p>
            <FieldGroup fields={nadoFields} accentColor="green" />
          </div>

          {/* Reset */}
          <div className="wc-reset-zone">
            <button onClick={handleReset} className="wc-reset-btn">
              🗑️ Effacer toutes les clés
            </button>
          </div>

        </div>
      )}
    </div>
  )
}
