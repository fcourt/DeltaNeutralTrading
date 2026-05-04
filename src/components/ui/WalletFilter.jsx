// src/components/filters/WalletFilter.jsx
/**
 * Zone comptes/wallet pilotée par PLATFORMS.
 *
 * Chaque plateforme affiche :
 *   - la liste des adresses sauvegardées (avec checkbox + nom + adresse abrégée)
 *   - un warning si aucune adresse n'est associée
 *   - un champ pour ajouter une nouvelle adresse
 *
 * Props
 * ─────
 * selectedAccounts  : Set<string>           – clés actives ("hl::0xAbcd", "nado::0xDef2")
 * onToggle          : (key: string) => void  – coche / décoche
 * onAddAddress      : (platformId, label, address) => void
 * onRemoveAddress   : (platformId, addressKey) => void
 * savedAccounts     : Record<platformId, Array<{ key, label, address }>>
 *
 * Exemple de savedAccounts :
 * {
 *   hl:   [ { key: "hl::0xABCD", label: "Compte principal", address: "0xABCD1234..." } ],
 *   nado: [ { key: "nado::0xEF01", label: "Vault", address: "0xEF012345..." } ],
 * }
 *
 * Note : le keysField de PLATFORMS est utilisé comme clé dans savedAccounts
 * pour grouper les adresses par "famille" (hl, ext, nado).
 * Hyperliquid / trade.xyz / HyENA partagent la même famille "hl" →
 * leurs adresses sont mutualisées.
 */

import { useState } from 'react'
import { PLATFORMS } from '../../platforms/index.js'

/* ── helpers ─────────────────────────────────── */
const abbrev = (addr) =>
  addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : ''

/* Déduplique les plateformes par keysField pour ne pas afficher
   3 sections "hl" (Hyperliquid + trade.xyz + HyENA). */
const PLATFORM_GROUPS = PLATFORMS.reduce((acc, p) => {
  if (!acc.find(g => g.keysField === p.keysField)) {
    /* label du groupe = premier label rencontré pour ce keysField */
    const siblings = PLATFORMS
      .filter(q => q.keysField === p.keysField)
      .map(q => q.label)
    acc.push({ keysField: p.keysField, labels: siblings })
  }
  return acc
}, [])

/* ── Couleurs par keysField ───────────────────── */
const COLOR = {
  hl:   { dot: '#93c5fd', accent: '--wc-input--blue:focus',  cls: 'wc-input--blue',   title: 'wc-section-title--blue'   },
  ext:  { dot: '#c4b5fd', accent: '--wc-input--purple:focus', cls: 'wc-input--purple', title: 'wc-section-title--purple' },
  nado: { dot: '#6cdfa9', accent: '--wc-input--green:focus',  cls: 'wc-input--green',  title: 'wc-section-title--green'  },
}
const getColor = (keysField) => COLOR[keysField] ?? COLOR.hl

/* ── Sub-component : une ligne compte avec checkbox ── */
function AccountRow({ accountKey, label, address, checked, onToggle, onRemove }) {
  return (
    <label className="wf-account-row" style={{ cursor: 'pointer' }}>
      <input
        type="checkbox"
        className="wf-checkbox"
        checked={checked}
        onChange={() => onToggle(accountKey)}
      />
      <span className="wf-account-info">
        <span className="wf-account-label">{label || 'Compte'}</span>
        <span className="wf-account-addr" title={address}>{abbrev(address)}</span>
      </span>
      <button
        className="wf-remove-btn"
        title="Supprimer cette adresse"
        onClick={(e) => { e.preventDefault(); onRemove(accountKey) }}
        aria-label={`Supprimer ${label}`}
      >
        ✕
      </button>
    </label>
  )
}

/* ── Sub-component : formulaire ajout adresse ── */
function AddAddressForm({ keysField, color, onAdd }) {
  const [label,   setLabel]   = useState('')
  const [address, setAddress] = useState('')
  const [error,   setError]   = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    const trimAddr = address.trim()
    if (!trimAddr) { setError('Adresse requise'); return }
    onAdd(keysField, label.trim() || 'Compte', trimAddr)
    setLabel('')
    setAddress('')
    setError('')
  }

  return (
    <form className="wf-add-form" onSubmit={handleSubmit} noValidate>
      <div className="wf-add-row">
        <input
          className={`wc-input wf-input-label ${color.cls}`}
          placeholder="Nom (ex : Principal)"
          value={label}
          onChange={e => setLabel(e.target.value)}
          maxLength={32}
        />
        <input
          className={`wc-input wf-input-addr ${color.cls}`}
          placeholder="0x…"
          value={address}
          onChange={e => { setAddress(e.target.value); setError('') }}
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" className="wf-add-btn btn-ghost">
          + Ajouter
        </button>
      </div>
      {error && <p className="wf-add-error">{error}</p>}
    </form>
  )
}

/* ── Composant principal ──────────────────────── */
export default function WalletFilter({
  selectedAccounts = new Set(),
  onToggle         = () => {},
  onAddAddress     = () => {},
  onRemoveAddress  = () => {},
  savedAccounts    = {},
}) {
  return (
    <div className="wf-wrapper">
      {PLATFORM_GROUPS.map(({ keysField, labels }) => {
        const color    = getColor(keysField)
        const accounts = savedAccounts[keysField] ?? []
        const hasAny   = accounts.length > 0

        return (
          <div key={keysField} className="wc-section">
            {/* ── Titre de groupe ── */}
            <div className={`wc-section-title ${color.title}`}>
              <span className="wf-dot" style={{ color: color.dot }}>●</span>
              {labels.join(' / ')}
            </div>

            {/* ── Liste des adresses ou warning ── */}
            {hasAny ? (
              <div className="wf-accounts-list">
                {accounts.map(acc => (
                  <AccountRow
                    key={acc.key}
                    accountKey={acc.key}
                    label={acc.label}
                    address={acc.address}
                    checked={selectedAccounts.has(acc.key)}
                    onToggle={onToggle}
                    onRemove={(key) => onRemoveAddress(keysField, key)}
                  />
                ))}
              </div>
            ) : (
              <div className="wf-no-address alert alert--warning">
                <span>⚠</span>
                <span>Aucune adresse associée à <strong>{labels[0]}</strong></span>
              </div>
            )}

            {/* ── Champ ajout adresse ── */}
            <AddAddressForm
              keysField={keysField}
              color={color}
              onAdd={onAddAddress}
            />
          </div>
        )
      })}
    </div>
  )
}
