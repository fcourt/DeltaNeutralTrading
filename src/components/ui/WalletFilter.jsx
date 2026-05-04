// src/components/ui/WalletFilter.jsx
/**
 * Zone comptes/wallet — une section par entrée PLATFORMS (pas de dédup par keysField).
 *
 * Props
 * ─────
 * selectedAccounts  : Set<string>                         – clés actives ("hyperliquid::0xABCD")
 * onToggle          : (key: string) => void
 * onAddAddress      : (platformId, label, address) => void
 * onRemoveAddress   : (platformId, key) => void
 * savedAccounts     : Record<platformId, Array<{ key, label, address }>>
 *
 * Exemple de savedAccounts :
 * {
 *   hyperliquid: [ { key: "hyperliquid::0xAB", label: "Principal", address: "0xAB..." } ],
 *   xyz:         [],
 *   hyena:       [ { key: "hyena::0xCD",       label: "Vault",     address: "0xCD..." } ],
 *   extended:    [],
 *   nado:        [ { key: "nado::0xEF",        label: "Default",   address: "0xEF..." } ],
 * }
 */

import { useState } from 'react'
import { PLATFORMS } from '../../platforms/index.js'

/* ── helpers ─────────────────────────────────── */
const abbrev = (addr) =>
  addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : ''

/* Couleurs par keysField (plusieurs plateformes peuvent partager la même famille) */
const COLOR_MAP = {
  hl:   { dot: '#93c5fd', cls: 'wc-input--blue',   title: 'wc-section-title--blue'   },
  ext:  { dot: '#c4b5fd', cls: 'wc-input--purple', title: 'wc-section-title--purple' },
  nado: { dot: '#6cdfa9', cls: 'wc-input--green',  title: 'wc-section-title--green'  },
}
const getColor = (keysField) => COLOR_MAP[keysField] ?? COLOR_MAP.hl

/* ── AccountRow ──────────────────────────────── */
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
        title="Supprimer"
        onClick={(e) => { e.preventDefault(); onRemove(accountKey) }}
        aria-label={`Supprimer ${label}`}
      >
        ✕
      </button>
    </label>
  )
}

/* ── AddAddressForm ──────────────────────────── */
function AddAddressForm({ platformId, colorCls, onAdd }) {
  const [label,   setLabel]   = useState('')
  const [address, setAddress] = useState('')
  const [error,   setError]   = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    const trimAddr = address.trim()
    if (!trimAddr) { setError('Adresse requise'); return }
    onAdd(platformId, label.trim() || 'Compte', trimAddr)
    setLabel('')
    setAddress('')
    setError('')
  }

  return (
    <form className="wf-add-form" onSubmit={handleSubmit} noValidate>
      <div className="wf-add-row">
        <input
          className={`wc-input wf-input-label ${colorCls}`}
          placeholder="Nom (ex : Principal)"
          value={label}
          onChange={e => setLabel(e.target.value)}
          maxLength={32}
        />
        <input
          className={`wc-input wf-input-addr ${colorCls}`}
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

/* ── WalletFilter ────────────────────────────── */
export default function WalletFilter({
  selectedAccounts = new Set(),
  onToggle         = () => {},
  onAddAddress     = () => {},
  onRemoveAddress  = () => {},
  savedAccounts    = {},
}) {
  return (
    <div className="wf-wrapper">
      {PLATFORMS.map(({ id, label, keysField }) => {
        const color    = getColor(keysField)
        const accounts = savedAccounts[id] ?? []
        const hasAny   = accounts.length > 0

        return (
          <div key={id} className="wc-section">

            {/* ── Titre de plateforme ── */}
            <div className={`wc-section-title ${color.title}`}>
              <span className="wf-dot" style={{ color: color.dot }}>●</span>
              {label}
            </div>

            {/* ── Comptes ou warning ── */}
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
                    onRemove={(key) => onRemoveAddress(id, key)}
                  />
                ))}
              </div>
            ) : (
              <div className="wf-no-address alert alert--warning">
                <span>⚠</span>
                <span>
                  Aucune adresse associée à <strong>{label}</strong>
                </span>
              </div>
            )}

            {/* ── Formulaire ajout ── */}
            <AddAddressForm
              platformId={id}
              colorCls={color.cls}
              onAdd={onAddAddress}
            />

          </div>
        )
      })}
    </div>
  )
}
