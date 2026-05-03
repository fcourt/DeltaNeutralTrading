/*
import { useTranslation } from 'react-i18next'
import Card from '../components/ui/Card.jsx'

export default function FuturePage() {
  const { t } = useTranslation()
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">{t('future.title')}</h1>
        <p className="page-desc">{t('future.description')}</p>
      </div>
      <Card>
        <div className="future-card">
          <div className="future-card__orb" aria-hidden="true" />
          <div className="future-card__icon" aria-hidden="true">◈</div>
          <p className="future-card__msg">{t('future.comingSoon')}</p>
        </div>
      </Card>
    </>
  )
}
*/

// ============================================================
// stats.js v3 — Intégration WalletContext
// ============================================================

import React, { useState, useEffect, useCallback } from 'react'
import { useWallet } from '../context/WalletContext'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWeekRange() {
  const now = new Date()
  const day = now.getDay()
  const diffToMonday = (day === 0 ? -6 : 1 - day)
  const monday = new Date(now)
  monday.setDate(now.getDate() + diffToMonday)
  monday.setHours(0, 1, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { start: monday.getTime(), end: sunday.getTime() }
}

function getPeriodRange(period) {
  const now = Date.now()
  if (period === 'all')   return { start: 0, end: now }
  if (period === 'day')   return { start: now - 86400000, end: now }
  if (period === 'week')  return getWeekRange()
  if (period === 'month') {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0)
    return { start: d.getTime(), end: now }
  }
  return { start: 0, end: now }
}

function fmtMoney(val, sign = false) {
  const n = parseFloat(val) || 0
  const prefix = sign ? (n >= 0 ? '+' : '') : ''
  return prefix + n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $'
}

function fmtVol(val) {
  const n = parseFloat(val) || 0
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M $'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K $'
  return n.toFixed(2) + ' $'
}

// Nado : wallet (20 bytes) + subaccount name padded to 12 bytes → bytes32 hex
function addressToSubaccount(address, name = 'default') {
  const addrHex  = address.toLowerCase().replace('0x', '')
  const nameHex  = Array.from(name).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
  const namePadded = nameHex.padEnd(24, '0').slice(0, 24)
  return '0x' + addrHex + namePadded
}

// ─── HL fetch ─────────────────────────────────────────────────────────────────

async function fetchHLFills(address, startTime) {
  const res = await fetch('https://api.hyperliquid.xyz/info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'userFillsByTime', user: address, startTime, aggregateByTime: false })
  })
  if (!res.ok) throw new Error(`HL fills error (${res.status})`)
  return res.json()
}

async function fetchHLSubAccounts(address) {
  const res = await fetch('https://api.hyperliquid.xyz/info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'subAccounts', user: address })
  })
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

function aggregateHLFills(fills, startTs, endTs) {
  const hl   = { pnlGross: 0, fees: 0, volume: 0, trades: 0 }
  const hip3 = { pnlGross: 0, fees: 0, volume: 0, trades: 0 }
  for (const f of fills) {
    if (f.time < startTs || f.time > endTs) continue
    const isHip3 = typeof f.coin === 'string' && f.coin.includes('xyz')
    const t = isHip3 ? hip3 : hl
    t.pnlGross += parseFloat(f.closedPnl || 0)
    t.fees     += parseFloat(f.fee       || 0)
    t.volume   += parseFloat(f.px || 0) * parseFloat(f.sz || 0)
    t.trades   += 1
  }
  return { hl, hip3 }
}

// ─── Extended fetch ────────────────────────────────────────────────────────────

async function fetchExtendedPositions(apiKey, baseUrl, startTime, endTime) {
  let cursor = null, all = []
  while (true) {
    const params = new URLSearchParams({ startTime, endTime, limit: 500 })
    if (cursor) params.set('cursor', cursor)
    const res = await fetch(`${baseUrl}/api/v1/user/positions/history?${params}`, { headers: { 'X-Api-Key': apiKey } })
    if (!res.ok) break
    const json = await res.json()
    if (json.data) all = all.concat(json.data)
    if (!json.pagination?.cursor || json.data?.length < 500) break
    cursor = json.pagination.cursor
  }
  return all
}

async function fetchExtendedTrades(apiKey, baseUrl, startTime, endTime) {
  let cursor = null, all = []
  while (true) {
    const params = new URLSearchParams({ startTime, endTime, limit: 500 })
    if (cursor) params.set('cursor', cursor)
    const res = await fetch(`${baseUrl}/api/v1/user/trades?${params}`, { headers: { 'X-Api-Key': apiKey } })
    if (!res.ok) break
    const json = await res.json()
    if (json.data) all = all.concat(json.data)
    if (!json.pagination?.cursor || json.data?.length < 500) break
    cursor = json.pagination.cursor
  }
  return all
}

function aggregateExtended(positions, trades) {
  const pnlGross = positions.reduce((s, p) => s + parseFloat(p.realisedPnl || 0), 0)
  const fees     = trades.reduce((s, t) => s + parseFloat(t.payedFee || 0), 0)
  const volume   = trades.reduce((s, t) => s + parseFloat(t.value    || 0), 0)
  return { pnlGross, fees, volume, trades: trades.length }
}

// ─── Nado fetch ────────────────────────────────────────────────────────────────

async function fetchNadoMatches(subaccountBytes32, baseUrl, startTime, endTime) {
  let cursor = null, all = []
  while (true) {
    const body = { type: 'matches', subaccounts: [subaccountBytes32], limit: 500 }
    if (cursor) body.cursor = cursor
    const res = await fetch(`${baseUrl}/v1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!res.ok) break
    const json = await res.json()
    const matches = json.matches || []
    const filtered = matches.filter(m => {
      const ts = (m.timestamp || 0) * 1000
      return ts >= startTime && ts <= endTime
    })
    all = all.concat(filtered)
    if (!json.cursor || matches.length < 500 || filtered.length < matches.length) break
    cursor = json.cursor
  }
  return all
}

function aggregateNado(matches) {
  const pnlGross = matches.reduce((s, m) => s + parseFloat(m.closednetentry || 0) / 1e18, 0)
  const fees     = matches.reduce((s, m) => s + Math.abs(parseFloat(m.fee  || 0) / 1e18), 0)
  const volume   = matches.reduce((s, m) => s + Math.abs(parseFloat(m.quotefilled || 0) / 1e18), 0)
  return { pnlGross, fees, volume, trades: matches.length }
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const PLATFORM_LABELS = { hl: 'Hyperliquid Perps', hip3: 'HIP-3 DEX', extended: 'Extended', nado: 'Nado' }
const PLATFORM_COLORS = { hl: '#93c5fd', hip3: '#c4b5fd', extended: '#6cdfa9', nado: '#e1ac83' }
const STORAGE_KEY = 'stats_options_v3'

const EMPTY_PLATFORM = { pnlGross: 0, fees: 0, volume: 0, trades: 0 }

// ─── Main Component ────────────────────────────────────────────────────────────

export default function StatsPage() {
  // ── Clés depuis WalletContext ──
  const {
    hlAddress,
    hlVaultAddress,
    extApiKey,
    nadoAddress,
    nadoSubaccount,
  } = useWallet()

  // ── Chargement options sauvegardées ──
  const savedOpts = (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) } catch { return null } })()

  // ── Filtres ──
  const [period,         setPeriod]        = useState(savedOpts?.period         ?? 'all')
  const [viewMode,       setViewMode]       = useState(savedOpts?.viewMode       ?? 'unified')
  const [feesInPnl,      setFeesInPnl]      = useState(savedOpts?.feesInPnl      ?? true)
  const [platforms,      setPlatforms]      = useState(savedOpts?.platforms      ?? { hl: true, hip3: true, extended: true, nado: true })
  const [accounts,       setAccounts]       = useState(savedOpts?.accounts       ?? {})
  const [extraAddresses, setExtraAddresses] = useState(savedOpts?.extraAddresses ?? [])
  const [newAddress,     setNewAddress]     = useState('')
  const [filtersOpen,    setFiltersOpen]    = useState(true)

  // ── Data ──
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)
  const [subAccounts, setSubAccounts] = useState([]) // sous-comptes HL fetchés
  const [stats,       setStats]       = useState(null)

  // ── Persist options ──
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ period, viewMode, feesInPnl, platforms, accounts, extraAddresses }))
    } catch {}
  }, [period, viewMode, feesInPnl, platforms, accounts, extraAddresses])

  // ── Adresse HL effective (vault ou address) ──
  const hlEffectiveAddress = hlVaultAddress?.trim() || hlAddress?.trim() || null

  // ── Charger les sous-comptes HL dès que l'adresse est connue ──
  useEffect(() => {
    if (!hlEffectiveAddress) return
    fetchHLSubAccounts(hlEffectiveAddress).then(subs => {
      const list = subs.map(s => ({
        address: s.subAccountUser || s.address,
        name:    s.name || s.subAccountUser || 'Sub-account'
      }))
      setSubAccounts(list)
      // Initialiser les comptes cochés (principal + sous-comptes + extra)
      setAccounts(prev => {
        const next = { ...prev }
        if (!(hlEffectiveAddress in next)) next[hlEffectiveAddress] = true
        for (const s of list) if (!(s.address in next)) next[s.address] = true
        for (const a of extraAddresses) if (!(a in next)) next[a] = true
        return next
      })
    }).catch(() => {})
  }, [hlEffectiveAddress])

  // ── Disponibilité des plateformes (clés configurées ?) ──
  const platformAvailable = {
    hl:       !!hlEffectiveAddress,
    hip3:     !!hlEffectiveAddress,
    extended: !!extApiKey?.trim(),
    nado:     !!nadoAddress?.trim(),
  }

  // ── Compute stats ──
  const compute = useCallback(async () => {
    setLoading(true); setError(null); setStats(null)
    try {
      const { start, end } = getPeriodRange(period)

      // Adresses HL actives (principal + sous-comptes + extra)
      const allHLAddresses = [
        hlEffectiveAddress,
        ...subAccounts.map(s => s.address),
        ...extraAddresses,
      ].filter(Boolean)
      const activeHLAddresses = allHLAddresses.filter(a => accounts[a] !== false)

      const res = {
        hl:       { ...EMPTY_PLATFORM },
        hip3:     { ...EMPTY_PLATFORM },
        extended: { ...EMPTY_PLATFORM },
        nado:     { ...EMPTY_PLATFORM },
      }

      // ── HL + HIP-3 ──
      if ((platforms.hl || platforms.hip3) && activeHLAddresses.length > 0) {
        for (const addr of activeHLAddresses) {
          try {
            const fills = await fetchHLFills(addr, start)
            const { hl, hip3 } = aggregateHLFills(fills, start, end)
            if (platforms.hl) {
              res.hl.pnlGross += hl.pnlGross; res.hl.fees += hl.fees
              res.hl.volume   += hl.volume;   res.hl.trades += hl.trades
            }
            if (platforms.hip3) {
              res.hip3.pnlGross += hip3.pnlGross; res.hip3.fees += hip3.fees
              res.hip3.volume   += hip3.volume;   res.hip3.trades += hip3.trades
            }
          } catch (e) {
            console.warn(`HL fills error for ${addr}:`, e.message)
          }
        }
      }

      // ── Extended ──
      if (platforms.extended && extApiKey?.trim()) {
        try {
          const base = 'https://api.starknet.extended.exchange'
          const [positions, trades] = await Promise.all([
            fetchExtendedPositions(extApiKey, base, start, end),
            fetchExtendedTrades(extApiKey, base, start, end),
          ])
          res.extended = aggregateExtended(positions, trades)
        } catch (e) {
          console.warn('Extended error:', e.message)
        }
      }

      // ── Nado ──
      if (platforms.nado && nadoAddress?.trim()) {
        try {
          const base = 'https://archive.prod.nado.xyz'
          const subName    = nadoSubaccount?.trim() || 'default'
          const subBytes32 = addressToSubaccount(nadoAddress.trim(), subName)
          const matches = await fetchNadoMatches(subBytes32, base, start, end)
          res.nado = aggregateNado(matches)
        } catch (e) {
          console.warn('Nado error:', e.message)
        }
      }

      // ── Total ──
      const activePlatforms = Object.keys(platforms).filter(p => platforms[p])
      const total = activePlatforms.reduce((acc, p) => ({
        pnlGross: acc.pnlGross + (res[p]?.pnlGross || 0),
        fees:     acc.fees     + (res[p]?.fees     || 0),
        volume:   acc.volume   + (res[p]?.volume   || 0),
        trades:   acc.trades   + (res[p]?.trades   || 0),
      }), { ...EMPTY_PLATFORM })

      setStats({ total, byPlatform: res })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [period, platforms, accounts, extraAddresses, hlEffectiveAddress, subAccounts, extApiKey, nadoAddress, nadoSubaccount])

  useEffect(() => { compute() }, [compute])

  // ── PnL affiché ──
  const displayPnl = (pnlGross, fees) => feesInPnl ? pnlGross - fees : pnlGross

  // ── Handlers ──
  const togglePlatform = p => setPlatforms(prev => ({ ...prev, [p]: !prev[p] }))
  const toggleAccount  = addr => setAccounts(prev => ({ ...prev, [addr]: !prev[addr] }))

  function addExtra() {
    const a = newAddress.trim()
    if (!a || extraAddresses.includes(a)) return
    setExtraAddresses(prev => [...prev, a])
    setAccounts(prev => ({ ...prev, [a]: true }))
    setNewAddress('')
  }
  function removeExtra(addr) {
    setExtraAddresses(prev => prev.filter(a => a !== addr))
    setAccounts(prev => { const n = { ...prev }; delete n[addr]; return n })
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  // Aucune clé configurée ?
  const nothingConfigured = !hlEffectiveAddress && !extApiKey?.trim() && !nadoAddress?.trim()

  if (nothingConfigured) {
    return (
      <div className="stats-page">
        <div className="card">
          <div className="empty-state">
            <svg width="40" height="40" fill="none" stroke="var(--color-text-faint)" strokeWidth="1.5" viewBox="0 0 24 24">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <div className="empty-state__title">Aucune clé configurée</div>
            <div className="empty-state__desc">Configure tes clés dans la page <strong>Keys</strong> pour voir tes statistiques.</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="stats-page">

      {/* ─── Filtres ─── */}
      <div className="card stats-filters">
        <button className="stats-filters__toggle" onClick={() => setFiltersOpen(o => !o)}>
          <span style={{ display:'flex', alignItems:'center', gap:'var(--space-2)', fontWeight:700, fontSize:'var(--text-sm)', color:'var(--color-text)' }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            Filtres
            {loading && <span className="stats-spin">⟳</span>}
          </span>
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
            style={{ transform: filtersOpen ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>

        {filtersOpen && (
          <div className="stats-filters__body">

            {/* Période */}
            <div className="stats-filter-section">
              <div className="stats-filter-label">Période</div>
              <div className="stats-period-btns">
                {[['all', 'All time'], ['day', "Aujourd'hui"], ['week', 'Cette semaine'], ['month', 'Ce mois']].map(([v, l]) => (
                  <button key={v} className={`stats-period-btn${period === v ? ' stats-period-btn--active' : ''}`} onClick={() => setPeriod(v)}>{l}</button>
                ))}
              </div>
            </div>

            {/* Plateformes disponibles */}
            <div className="stats-filter-section">
              <div className="stats-filter-label">Plateformes</div>
              <div className="stats-chips">
                {Object.entries(PLATFORM_LABELS).map(([p, label]) => {
                  const available = platformAvailable[p]
                  const active    = platforms[p] && available
                  return (
                    <button key={p}
                      className={`stats-chip${active ? ' stats-chip--on' : ''}${!available ? ' stats-chip--disabled' : ''}`}
                      style={active ? { borderColor: PLATFORM_COLORS[p], color: PLATFORM_COLORS[p], background: PLATFORM_COLORS[p] + '1a' } : {}}
                      title={!available ? 'Clé non configurée' : ''}
                      onClick={() => available && togglePlatform(p)}>
                      {label}
                      {!available && <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.5 }}>🔒</span>}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Mode affichage */}
            <div className="stats-filter-section">
              <div className="stats-filter-label">Affichage plateformes</div>
              <div className="stats-chips">
                {[['unified', 'Carte unifiée'], ['split', 'Cartes séparées']].map(([v, l]) => (
                  <button key={v} className={`stats-chip${viewMode === v ? ' stats-chip--on' : ''}`} onClick={() => setViewMode(v)}>{l}</button>
                ))}
              </div>
            </div>

            {/* Options PnL */}
            <div className="stats-filter-section">
              <div className="stats-filter-label">Options PnL</div>
              <label className="stats-toggle-row">
                <input type="checkbox" checked={feesInPnl} onChange={e => setFeesInPnl(e.target.checked)} />
                <span>Déduire les fees du PnL</span>
                <span className="stats-toggle-hint">{feesInPnl ? 'PnL net (après fees)' : 'PnL brut (hors fees)'}</span>
              </label>
            </div>

            {/* Comptes HL */}
            {hlEffectiveAddress && (
              <div className="stats-filter-section">
                <div className="stats-filter-label">Comptes Hyperliquid</div>
                <div className="stats-accounts">

                  {/* Compte principal (ou vault) */}
                  <label className="stats-account-row">
                    <input type="checkbox" checked={accounts[hlEffectiveAddress] !== false} onChange={() => toggleAccount(hlEffectiveAddress)} />
                    <span className="stats-account-name">{hlVaultAddress?.trim() ? 'Vault' : 'Principal'}</span>
                    <span className="stats-account-addr">{hlEffectiveAddress.slice(0, 6)}…{hlEffectiveAddress.slice(-4)}</span>
                    <span className="badge badge--primary" style={{ marginLeft: 'auto', fontSize: '10px' }}>HL</span>
                  </label>

                  {/* Sous-comptes fetchés */}
                  {subAccounts.map(s => (
                    <label key={s.address} className="stats-account-row">
                      <input type="checkbox" checked={accounts[s.address] !== false} onChange={() => toggleAccount(s.address)} />
                      <span className="stats-account-name">{s.name}</span>
                      <span className="stats-account-addr">{s.address.slice(0, 6)}…{s.address.slice(-4)}</span>
                      <span className="badge badge--primary" style={{ marginLeft: 'auto', fontSize: '10px' }}>sub</span>
                    </label>
                  ))}

                  {/* Adresses extra */}
                  {extraAddresses.map(addr => (
                    <label key={addr} className="stats-account-row">
                      <input type="checkbox" checked={accounts[addr] !== false} onChange={() => toggleAccount(addr)} />
                      <span className="stats-account-name" style={{ color: 'var(--color-text-muted)' }}>{addr.slice(0, 6)}…{addr.slice(-4)}</span>
                      <span className="stats-account-addr" style={{ flex: 1 }} />
                      <button className="stats-account-remove" onClick={e => { e.preventDefault(); removeExtra(addr) }}>×</button>
                    </label>
                  ))}

                  {/* Ajout adresse */}
                  <div className="stats-add-addr">
                    <input className="wc-input" placeholder="Ajouter une adresse 0x…" value={newAddress}
                      onChange={e => setNewAddress(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addExtra()} />
                    <button className="btn-secondary" style={{ fontSize: 'var(--text-xs)', padding: 'var(--space-2) var(--space-4)' }} onClick={addExtra}>+</button>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      {/* ─── Erreur ─── */}
      {error && <div className="alert alert--error">⚠ {error}</div>}

      {/* ─── Loading ─── */}
      {loading && !stats && (
        <div className="stats-loading">
          <span className="stats-spin" style={{ fontSize: '1.5rem' }}>⟳</span>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Chargement des statistiques…</span>
        </div>
      )}

      {/* ─── Stats ─── */}
      {stats && (() => {
        const totalPnl    = displayPnl(stats.total.pnlGross, stats.total.fees)
        const totalFees   = stats.total.fees
        const totalVol    = stats.total.volume
        const totalTrades = stats.total.trades

        return (
          <>
            {/* 4 grandes cartes */}
            <div className="stats-main-cards stats-main-cards--4">
              <StatCard label={feesInPnl ? 'PnL Réalisé (net)' : 'PnL Réalisé (brut)'} value={fmtMoney(totalPnl, true)} positive={totalPnl >= 0} large />
              <StatCard label="Fees payés" value={fmtMoney(totalFees)} accent="warning" large />
              <StatCard label="Volume" value={fmtVol(totalVol)} large />
              <StatCard label="Trades" value={totalTrades.toLocaleString()} large />
            </div>

            {/* Par plateforme — split */}
            {viewMode === 'split' ? (
              <div className="stats-platform-grid">
                {Object.entries(PLATFORM_LABELS).filter(([p]) => platforms[p] && platformAvailable[p]).map(([p, label]) => {
                  const d   = stats.byPlatform[p] || EMPTY_PLATFORM
                  const pnl = displayPnl(d.pnlGross, d.fees)
                  return (
                    <div key={p} className="stats-platform-card" style={{ '--plat-color': PLATFORM_COLORS[p] }}>
                      <div className="stats-platform-card__header">
                        <span className="stats-platform-card__title" style={{ color: PLATFORM_COLORS[p] }}>{label}</span>
                      </div>
                      <div className="stats-platform-card__row">
                        <MiniStat label={feesInPnl ? 'PnL net' : 'PnL brut'} value={fmtMoney(pnl, true)} positive={pnl >= 0} />
                        <MiniStat label="Fees"   value={fmtMoney(d.fees)} accent="warning" />
                        <MiniStat label="Volume" value={fmtVol(d.volume)} />
                        <MiniStat label="Trades" value={d.trades.toLocaleString()} />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              /* Par plateforme — tableau unifié */
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table className="positions-table">
                  <thead>
                    <tr>
                      <th>Plateforme</th>
                      <th style={{ textAlign: 'right' }}>{feesInPnl ? 'PnL net' : 'PnL brut'}</th>
                      <th style={{ textAlign: 'right' }}>Fees</th>
                      <th style={{ textAlign: 'right' }}>Volume</th>
                      <th style={{ textAlign: 'right' }}>Trades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(PLATFORM_LABELS).filter(([p]) => platforms[p] && platformAvailable[p]).map(([p, label]) => {
                      const d   = stats.byPlatform[p] || EMPTY_PLATFORM
                      const pnl = displayPnl(d.pnlGross, d.fees)
                      return (
                        <tr key={p}>
                          <td><span style={{ color: PLATFORM_COLORS[p], fontWeight: 600, fontSize: 'var(--text-xs)' }}>{label}</span></td>
                          <td style={{ textAlign:'right', color: pnl >= 0 ? 'var(--color-success)' : 'var(--color-error)', fontWeight: 600 }}>{fmtMoney(pnl, true)}</td>
                          <td style={{ textAlign:'right', color: 'var(--color-warning)', fontWeight: 600 }}>{fmtMoney(d.fees)}</td>
                          <td style={{ textAlign:'right' }}>{fmtVol(d.volume)}</td>
                          <td style={{ textAlign:'right' }}>{d.trades.toLocaleString()}</td>
                        </tr>
                      )
                    })}
                    <tr style={{ borderTop: '2px solid var(--color-divider)' }}>
                      <td style={{ fontWeight: 700, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>TOTAL</td>
                      <td style={{ textAlign:'right', color: totalPnl >= 0 ? 'var(--color-success)' : 'var(--color-error)', fontWeight: 700 }}>{fmtMoney(totalPnl, true)}</td>
                      <td style={{ textAlign:'right', color: 'var(--color-warning)', fontWeight: 700 }}>{fmtMoney(totalFees)}</td>
                      <td style={{ textAlign:'right', fontWeight: 700 }}>{fmtVol(totalVol)}</td>
                      <td style={{ textAlign:'right', fontWeight: 700 }}>{totalTrades.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </>
        )
      })()}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, positive, accent, large }) {
  let color = 'var(--color-text)'
  if (positive === true)    color = 'var(--color-success)'
  if (positive === false)   color = 'var(--color-error)'
  if (accent === 'warning') color = 'var(--color-warning)'
  return (
    <div className={`stats-card${large ? ' stats-card--large' : ''}`}>
      <div className="stats-card__label">{label}</div>
      <div className="stats-card__value" style={{ color }}>{value ?? '—'}</div>
    </div>
  )
}

function MiniStat({ label, value, positive, accent }) {
  let color = 'var(--color-text)'
  if (positive === true)    color = 'var(--color-success)'
  if (positive === false)   color = 'var(--color-error)'
  if (accent === 'warning') color = 'var(--color-warning)'
  return (
    <div className="stats-mini-stat">
      <div className="stats-mini-stat__label">{label}</div>
      <div className="stats-mini-stat__value" style={{ color }}>{value ?? '—'}</div>
    </div>
  )
}

