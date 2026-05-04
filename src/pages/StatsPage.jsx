// ============================================================
// stats.js v4 — PLATFORMS dynamiques depuis Index.js
// ============================================================

import React, { useState, useEffect, useCallback } from 'react'
import { useWallet } from '../context/WalletContext'
import { PLATFORMS } from '../platforms/index'

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
  const addrHex    = address.toLowerCase().replace('0x', '')
  const nameHex    = Array.from(name).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
  const namePadded = nameHex.padEnd(24, '0').slice(0, 24)
  return '0x' + addrHex + namePadded
}

// ─── Couleurs par keysField ────────────────────────────────────────────────────
// Couleur par id de plateforme (pour distinguer Hyperliquid / trade.xyz / HyENA visuellement)
const PLATFORM_COLORS_BY_ID = {
  hyperliquid: '#93c5fd',
  xyz:         '#c4b5fd',
  hyena:       '#a5b4fc',
  extended:    '#6cdfa9',
  nado:        '#e1ac83',
}

// Couleur de stats agrégées par keysField
const STATS_COLORS = {
  hl:   '#93c5fd',
  ext:  '#6cdfa9',
  nado: '#e1ac83',
}

// Label affiché dans les stats par keysField
const STATS_LABELS = {
  hl:   'Hyperliquid / HIP-3',
  ext:  'Extended',
  nado: 'Nado',
}

// ─── Clés de stats distinctes ─────────────────────────────────────────────────
// Les stats sont agrégées par keysField (hl, ext, nado) + hip3 séparé
const STATS_KEYS = ['hl', 'hip3', 'ext', 'nado']
const STATS_LABELS_FULL = {
  hl:   'Hyperliquid Perps',
  hip3: 'HIP-3 DEX (trade.xyz / HyENA)',
  ext:  'Extended',
  nado: 'Nado',
}
const STATS_COLORS_FULL = {
  hl:   '#93c5fd',
  hip3: '#c4b5fd',
  ext:  '#6cdfa9',
  nado: '#e1ac83',
}

const STORAGE_KEY = 'stats_options_v4'
const EMPTY_PLATFORM = { pnlGross: 0, fees: 0, volume: 0, trades: 0 }

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
  // platforms : { [platformId]: boolean } — une entrée par id PLATFORMS
  const defaultPlatforms = Object.fromEntries(PLATFORMS.map(p => [p.id, true]))
  const [period,         setPeriod]        = useState(savedOpts?.period         ?? 'all')
  const [viewMode,       setViewMode]       = useState(savedOpts?.viewMode       ?? 'unified')
  const [feesInPnl,      setFeesInPnl]      = useState(savedOpts?.feesInPnl      ?? true)
  const [platforms,      setPlatforms]      = useState(savedOpts?.platforms      ?? defaultPlatforms)
  const [accounts,       setAccounts]       = useState(savedOpts?.accounts       ?? {})
  // extraAddresses : [{ address, platformId }]
  const [extraAddresses, setExtraAddresses] = useState(savedOpts?.extraAddresses ?? [])
  // newAddress : { [platformId]: string }
  const [newAddress,     setNewAddress]     = useState({})
  const [filtersOpen,    setFiltersOpen]    = useState(true)

  // ── Data ──
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)
  const [subAccounts, setSubAccounts] = useState([])
  const [stats,       setStats]       = useState(null)

  // ── Persist options ──
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ period, viewMode, feesInPnl, platforms, accounts, extraAddresses }))
    } catch {}
  }, [period, viewMode, feesInPnl, platforms, accounts, extraAddresses])

  // ── Adresse HL effective ──
  const hlEffectiveAddress = hlVaultAddress?.trim() || hlAddress?.trim() || null

  // ── Disponibilité des keysField ──
  const keysFieldAvailable = {
    hl:   !!hlEffectiveAddress,
    ext:  !!extApiKey?.trim(),
    nado: !!nadoAddress?.trim(),
  }

  // ── Charger les sous-comptes HL ──
  useEffect(() => {
    if (!hlEffectiveAddress) return
    fetchHLSubAccounts(hlEffectiveAddress).then(subs => {
      const list = subs.map(s => ({
        address: s.subAccountUser || s.address,
        name:    s.name || s.subAccountUser || 'Sub-account'
      }))
      setSubAccounts(list)
      setAccounts(prev => {
        const next = { ...prev }
        if (!(hlEffectiveAddress in next)) next[hlEffectiveAddress] = true
        for (const s of list) if (!(s.address in next)) next[s.address] = true
        for (const e of extraAddresses) if (!(e.address in next)) next[e.address] = true
        return next
      })
    }).catch(() => {})
  }, [hlEffectiveAddress])

  // ── Adresses sauvegardées par platformId ──────────────────────────────────────
  function savedAddressesFor(platformId) {
    const plat = PLATFORMS.find(p => p.id === platformId)
    if (!plat) return []

    if (plat.keysField === 'hl') {
      return [
        hlEffectiveAddress && {
          address: hlEffectiveAddress,
          name: hlVaultAddress?.trim() ? 'Vault' : 'Principal',
          badge: 'HL',
          removable: false,
        },
        ...subAccounts.map(s => ({
          address: s.address,
          name: s.name,
          badge: 'sub',
          removable: false,
        })),
        ...extraAddresses
          .filter(e => e.platformId === platformId)
          .map(e => ({ address: e.address, name: null, badge: 'extra', removable: true })),
      ].filter(Boolean)
    }

    if (plat.keysField === 'ext') {
      return extApiKey?.trim()
        ? [{ address: null, name: 'Clé API configurée', badge: 'API', removable: false, apiOnly: true }]
        : []
    }

    if (plat.keysField === 'nado') {
      const addr = nadoAddress?.trim()
      if (!addr) return []
      return [
        { address: addr, name: nadoSubaccount?.trim() || 'default', badge: 'nado', removable: false },
        ...extraAddresses
          .filter(e => e.platformId === platformId)
          .map(e => ({ address: e.address, name: null, badge: 'extra', removable: true })),
      ]
    }

    return []
  }

  // ── Handlers ──
  const togglePlatform = id => setPlatforms(prev => ({ ...prev, [id]: !prev[id] }))
  const toggleAccount  = addr => setAccounts(prev => ({ ...prev, [addr]: !prev[addr] }))

  function addExtra(platformId) {
    const a = (newAddress[platformId] ?? '').trim()
    if (!a || extraAddresses.find(e => e.address === a && e.platformId === platformId)) return
    setExtraAddresses(prev => [...prev, { address: a, platformId }])
    setAccounts(prev => ({ ...prev, [a]: true }))
    setNewAddress(prev => ({ ...prev, [platformId]: '' }))
  }

  function removeExtra(address, platformId) {
    setExtraAddresses(prev => prev.filter(e => !(e.address === address && e.platformId === platformId)))
    setAccounts(prev => { const n = { ...prev }; delete n[address]; return n })
  }

  // ── Compute stats ──────────────────────────────────────────────────────────────
  const compute = useCallback(async () => {
    setLoading(true); setError(null); setStats(null)
    try {
      const { start, end } = getPeriodRange(period)

      // Quelles plateformes HL sont actives ?
      const hlPlatformIds  = PLATFORMS.filter(p => p.keysField === 'hl').map(p => p.id)
      const anyHLActive    = hlPlatformIds.some(id => platforms[id])
      // HIP-3 se déclenche si trade.xyz ou hyena sont actifs
      const hip3PlatIds    = ['xyz', 'hyena']
      const anyHIP3Active  = hip3PlatIds.some(id => platforms[id])
      // HL perps se déclenche si hyperliquid est actif
      const hlPerpsActive  = platforms['hyperliquid']

      // Adresses HL actives
      const allHLAddresses = [
        hlEffectiveAddress,
        ...subAccounts.map(s => s.address),
        ...extraAddresses.filter(e => hlPlatformIds.includes(e.platformId)).map(e => e.address),
      ].filter(Boolean)
      const activeHLAddresses = allHLAddresses.filter(a => accounts[a] !== false)

      const res = {
        hl:   { ...EMPTY_PLATFORM },
        hip3: { ...EMPTY_PLATFORM },
        ext:  { ...EMPTY_PLATFORM },
        nado: { ...EMPTY_PLATFORM },
      }

      // ── HL + HIP-3 ──
      if (anyHLActive && activeHLAddresses.length > 0) {
        for (const addr of activeHLAddresses) {
          try {
            const fills = await fetchHLFills(addr, start)
            const { hl, hip3 } = aggregateHLFills(fills, start, end)
            if (hlPerpsActive) {
              res.hl.pnlGross += hl.pnlGross; res.hl.fees += hl.fees
              res.hl.volume   += hl.volume;   res.hl.trades += hl.trades
            }
            if (anyHIP3Active) {
              res.hip3.pnlGross += hip3.pnlGross; res.hip3.fees += hip3.fees
              res.hip3.volume   += hip3.volume;   res.hip3.trades += hip3.trades
            }
          } catch (e) {
            console.warn(`HL fills error for ${addr}:`, e.message)
          }
        }
      }

      // ── Extended ──
      const extActive = PLATFORMS.filter(p => p.keysField === 'ext').some(p => platforms[p.id])
      if (extActive && extApiKey?.trim()) {
        try {
          const base = 'https://api.starknet.extended.exchange'
          const [positions, trades] = await Promise.all([
            fetchExtendedPositions(extApiKey, base, start, end),
            fetchExtendedTrades(extApiKey, base, start, end),
          ])
          res.ext = aggregateExtended(positions, trades)
        } catch (e) {
          console.warn('Extended error:', e.message)
        }
      }

      // ── Nado ──
      const nadoActive = PLATFORMS.filter(p => p.keysField === 'nado').some(p => platforms[p.id])
      if (nadoActive && nadoAddress?.trim()) {
        try {
          const base     = 'https://archive.prod.nado.xyz'
          const subName  = nadoSubaccount?.trim() || 'default'
          const subBytes = addressToSubaccount(nadoAddress.trim(), subName)
          const matches  = await fetchNadoMatches(subBytes, base, start, end)
          res.nado = aggregateNado(matches)
        } catch (e) {
          console.warn('Nado error:', e.message)
        }
      }

      // ── Total sur les stats keys actives ──
      const activeStatsKeys = STATS_KEYS.filter(k => {
        if (k === 'hl')   return hlPerpsActive
        if (k === 'hip3') return anyHIP3Active
        if (k === 'ext')  return extActive
        if (k === 'nado') return nadoActive
        return false
      })
      const total = activeStatsKeys.reduce((acc, k) => ({
        pnlGross: acc.pnlGross + (res[k]?.pnlGross || 0),
        fees:     acc.fees     + (res[k]?.fees     || 0),
        volume:   acc.volume   + (res[k]?.volume   || 0),
        trades:   acc.trades   + (res[k]?.trades   || 0),
      }), { ...EMPTY_PLATFORM })

      setStats({ total, byPlatform: res, activeStatsKeys })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [period, platforms, accounts, extraAddresses, hlEffectiveAddress, subAccounts, extApiKey, nadoAddress, nadoSubaccount])

  useEffect(() => { compute() }, [compute])

  const displayPnl = (pnlGross, fees) => feesInPnl ? pnlGross - fees : pnlGross

  // ─────────────────────────────────────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────────────────────────────────────

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

            {/* ── Période ── */}
            <div className="stats-filter-section">
              <div className="stats-filter-label">Période</div>
              <div className="stats-period-btns">
                {[['all', 'All time'], ['day', "Aujourd'hui"], ['week', 'Cette semaine'], ['month', 'Ce mois']].map(([v, l]) => (
                  <button key={v} className={`stats-period-btn${period === v ? ' stats-period-btn--active' : ''}`} onClick={() => setPeriod(v)}>{l}</button>
                ))}
              </div>
            </div>

            {/* ── Plateformes — itération sur PLATFORMS ── */}
            <div className="stats-filter-section">
              <div className="stats-filter-label">Plateformes</div>
              <div className="stats-chips">
                {PLATFORMS.map(p => {
                  const available = keysFieldAvailable[p.keysField] ?? false
                  const active    = platforms[p.id] && available
                  const color     = PLATFORM_COLORS_BY_ID[p.id] ?? '#94a3b8'
                  return (
                    <button key={p.id}
                      className={`stats-chip${active ? ' stats-chip--on' : ''}${!available ? ' stats-chip--disabled' : ''}`}
                      style={active ? { borderColor: color, color, background: color + '1a' } : {}}
                      title={!available ? 'Clé non configurée' : ''}
                      onClick={() => available && togglePlatform(p.id)}>
                      {p.label}
                      {!available && <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.5 }}>🔒</span>}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── Mode affichage ── */}
            <div className="stats-filter-section">
              <div className="stats-filter-label">Affichage plateformes</div>
              <div className="stats-chips">
                {[['unified', 'Carte unifiée'], ['split', 'Cartes séparées']].map(([v, l]) => (
                  <button key={v} className={`stats-chip${viewMode === v ? ' stats-chip--on' : ''}`} onClick={() => setViewMode(v)}>{l}</button>
                ))}
              </div>
            </div>

            {/* ── Options PnL ── */}
            <div className="stats-filter-section">
              <div className="stats-filter-label">Options PnL</div>
              <label className="stats-toggle-row">
                <input type="checkbox" checked={feesInPnl} onChange={e => setFeesInPnl(e.target.checked)} />
                <span>Déduire les fees du PnL</span>
                <span className="stats-toggle-hint">{feesInPnl ? 'PnL net (après fees)' : 'PnL brut (hors fees)'}</span>
              </label>
            </div>

            {/* ── Comptes — une section par plateforme (PLATFORMS) ── */}
            <div className="stats-filter-section">
              <div className="stats-filter-label">Comptes</div>
              <div className="stats-accounts-platforms">
                {PLATFORMS.map(plat => {
                  const color     = PLATFORM_COLORS_BY_ID[plat.id] ?? '#94a3b8'
                  const available = keysFieldAvailable[plat.keysField] ?? false
                  const addrs     = savedAddressesFor(plat.id)
                  const hasAddrs  = addrs.length > 0

                  return (
                    <div key={plat.id} className="stats-accounts-platform">

                      {/* En-tête plateforme */}
                      <div className="stats-accounts-platform__header">
                        <span className="stats-accounts-platform__name" style={{ color }}>
                          {plat.label}
                        </span>
                        {!available && (
                          <span className="stats-accounts-platform__lock" title="Clé non configurée">🔒</span>
                        )}
                      </div>

                      {/* Aucune adresse */}
                      {!hasAddrs && (
                        <div className="stats-no-addr-warning">
                          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink:0 }}>
                            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                          </svg>
                          Aucune adresse associée
                        </div>
                      )}

                      {/* Liste des adresses */}
                      {hasAddrs && (
                        <div className="stats-accounts">
                          {addrs.map((entry, i) => (
                            <label key={entry.address ?? `api-${i}`} className={`stats-account-row${entry.apiOnly ? ' stats-account-row--api' : ''}`}>
                              {!entry.apiOnly && (
                                <input type="checkbox"
                                  checked={accounts[entry.address] !== false}
                                  onChange={() => toggleAccount(entry.address)} />
                              )}
                              <span className="stats-account-name" style={!entry.name ? { color: 'var(--color-text-muted)' } : {}}>
                                {entry.name ?? (entry.address ? `${entry.address.slice(0,6)}…${entry.address.slice(-4)}` : '—')}
                              </span>
                              {entry.address && !entry.apiOnly && (
                                <span className="stats-account-addr">
                                  {entry.address.slice(0, 6)}…{entry.address.slice(-4)}
                                </span>
                              )}
                              <span className="badge" style={{ marginLeft:'auto', fontSize:'10px', color }}>
                                {entry.badge}
                              </span>
                              {entry.removable && (
                                <button className="stats-account-remove"
                                  onClick={e => { e.preventDefault(); removeExtra(entry.address, plat.id) }}>
                                  ×
                                </button>
                              )}
                            </label>
                          ))}
                        </div>
                      )}

                      {/* Champ ajout adresse (sauf Extended qui est API-only) */}
                      {plat.keysField !== 'ext' && (
                        <div className="stats-add-addr">
                          <input className="wc-input"
                            placeholder={`Ajouter une adresse ${plat.label}…`}
                            value={newAddress[plat.id] ?? ''}
                            onChange={e => setNewAddress(prev => ({ ...prev, [plat.id]: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && addExtra(plat.id)} />
                          <button className="btn-secondary"
                            style={{ fontSize: 'var(--text-xs)', padding: 'var(--space-2) var(--space-4)' }}
                            onClick={() => addExtra(plat.id)}>+</button>
                        </div>
                      )}

                    </div>
                  )
                })}
              </div>
            </div>

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

            {/* Par stats key — split */}
            {viewMode === 'split' ? (
              <div className="stats-platform-grid">
                {stats.activeStatsKeys.map(k => {
                  const d     = stats.byPlatform[k] || EMPTY_PLATFORM
                  const pnl   = displayPnl(d.pnlGross, d.fees)
                  const color = STATS_COLORS_FULL[k]
                  const label = STATS_LABELS_FULL[k]
                  return (
                    <div key={k} className="stats-platform-card" style={{ '--plat-color': color }}>
                      <div className="stats-platform-card__header">
                        <span className="stats-platform-card__title" style={{ color }}>{label}</span>
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
              /* Par stats key — tableau unifié */
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
                    {stats.activeStatsKeys.map(k => {
                      const d     = stats.byPlatform[k] || EMPTY_PLATFORM
                      const pnl   = displayPnl(d.pnlGross, d.fees)
                      const color = STATS_COLORS_FULL[k]
                      const label = STATS_LABELS_FULL[k]
                      return (
                        <tr key={k}>
                          <td><span style={{ color, fontWeight: 600, fontSize: 'var(--text-xs)' }}>{label}</span></td>
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
