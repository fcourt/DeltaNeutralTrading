// ============================================================
// stats.jsx v5 — PLATFORMS dynamiques + DateRangePicker + comptes fixes
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useWallet } from '../context/WalletContext'
import { PLATFORMS, STATS_KEYS } from '../platforms/index'

// ─── Helpers date ─────────────────────────────────────────────────────────────

function startOfDay(d)   { const r = new Date(d); r.setHours(0,0,0,0);       return r }
function endOfDay(d)     { const r = new Date(d); r.setHours(23,59,59,999);   return r }
function startOfWeek(d)  {
  const r = new Date(d)
  const day = r.getDay()
  r.setDate(r.getDate() - (day === 0 ? 6 : day - 1))
  r.setHours(0,1,0,0)
  return r
}
function endOfWeek(d)    {
  const s = startOfWeek(d)
  const r = new Date(s)
  r.setDate(s.getDate() + 6)
  r.setHours(23,59,59,999)
  return r
}
function startOfMonth(d) { const r = new Date(d.getFullYear(), d.getMonth(), 1, 0,0,0,0);   return r }
function endOfMonth(d)   { const r = new Date(d.getFullYear(), d.getMonth()+1, 0, 23,59,59,999); return r }
function isSameDay(a, b) { return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate() }
function isSameMonth(a, b) { return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() }

const MONTH_NAMES = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
const DAY_NAMES   = ['L','M','M','J','V','S','D']

function computeRange(mode, customStart, customEnd) {
  const now = new Date()
  if (mode === 'all')     return { start: 0, end: Date.now() }
  if (mode === 'day')     return { start: startOfDay(now).getTime(),   end: endOfDay(now).getTime() }
  if (mode === 'week')    return { start: startOfWeek(now).getTime(),  end: endOfWeek(now).getTime() }
  if (mode === 'month')   return { start: startOfMonth(now).getTime(), end: endOfMonth(now).getTime() }
  if (mode === 'custom')  return { start: customStart ?? 0, end: customEnd ?? Date.now() }
  if (mode?.type === 'calDay') {
    const d = new Date(mode.ts)
    return { start: startOfDay(d).getTime(), end: endOfDay(d).getTime() }
  }
  if (mode?.type === 'calWeek') {
    const d = new Date(mode.ts)
    return { start: startOfWeek(d).getTime(), end: endOfWeek(d).getTime() }
  }
  if (mode?.type === 'calMonth') {
    const d = new Date(mode.ts)
    return { start: startOfMonth(d).getTime(), end: endOfMonth(d).getTime() }
  }
  return { start: 0, end: Date.now() }
}

// ─── DateRangePicker ──────────────────────────────────────────────────────────

function DateRangePicker({ mode, onMode, customStart, customEnd, onCustom }) {
  const today     = new Date()
  const yearStart = today.getFullYear()
  const [calMode,   setCalMode]   = useState('month')
  const [picking,   setPicking]   = useState(null)
  const [hoverDay,  setHoverDay]  = useState(null)

  const quickBtns = [
    ['all',   'All time'],
    ['day',   "Aujourd'hui"],
    ['week',  'Cette semaine'],
    ['month', 'Ce mois'],
  ]

  const months = Array.from({ length: 12 }, (_, i) => new Date(yearStart, i, 1))

  function daysInMonth(year, month) {
    const first   = new Date(year, month, 1)
    const firstDow = (first.getDay() + 6) % 7
    const total   = new Date(year, month + 1, 0).getDate()
    const cells   = []
    for (let i = 0; i < firstDow; i++) cells.push(null)
    for (let d = 1; d <= total; d++) cells.push(new Date(year, month, d))
    return cells
  }

  function isDaySelected(d) {
    if (!d) return false
    const r = computeRange(mode, customStart, customEnd)
    return d.getTime() >= r.start && d.getTime() <= r.end
  }

  function isDayInHover(d) {
    if (!d || !picking || !hoverDay) return false
    if (picking === 'end' && customStart) {
      const s = Math.min(customStart, hoverDay.getTime())
      const e = Math.max(customStart, hoverDay.getTime())
      return d.getTime() >= s && d.getTime() <= e
    }
    return false
  }

  function handleDayClick(d) {
    if (calMode === 'day') { onMode({ type: 'calDay', ts: d.getTime() }); return }
    if (calMode === 'week') { onMode({ type: 'calWeek', ts: d.getTime() }); return }
    if (!picking || picking === 'start') {
      onCustom(startOfDay(d).getTime(), null)
      setPicking('end')
      onMode('custom')
    } else {
      const s = customStart ?? startOfDay(d).getTime()
      const sorted = [s, endOfDay(d).getTime()].sort((a,b)=>a-b)
      onCustom(sorted[0], sorted[1])
      setPicking(null)
      onMode('custom')
    }
  }

  function handleMonthClick(d) {
    if (calMode === 'month') onMode({ type: 'calMonth', ts: d.getTime() })
  }

  function modeLabel() {
    if (mode === 'all')   return 'All time'
    if (mode === 'day')   return "Aujourd'hui"
    if (mode === 'week')  return 'Cette semaine'
    if (mode === 'month') return 'Ce mois'
    if (mode?.type === 'calDay')   return `Jour — ${new Date(mode.ts).toLocaleDateString('fr-FR')}`
    if (mode?.type === 'calWeek')  { const sw = startOfWeek(new Date(mode.ts)); return `Semaine du ${sw.toLocaleDateString('fr-FR')}` }
    if (mode?.type === 'calMonth') return `${MONTH_NAMES[new Date(mode.ts).getMonth()]} ${new Date(mode.ts).getFullYear()}`
    if (mode === 'custom' && customStart && customEnd) {
      return `${new Date(customStart).toLocaleDateString('fr-FR')} → ${new Date(customEnd).toLocaleDateString('fr-FR')}`
    }
    return 'Personnalisé…'
  }

  return (
    <div className="drp">
      <div className="drp__quick">
        {quickBtns.map(([v, l]) => (
          <button key={v}
            className={`stats-period-btn${mode === v ? ' stats-period-btn--active' : ''}`}
            onClick={() => { onMode(v); setPicking(null) }}>{l}</button>
        ))}
      </div>
      <div className="drp__calmodes">
        <span className="stats-filter-label" style={{ marginBottom: 0 }}>Calendrier :</span>
        {[['day','Jour'],['week','Semaine'],['month','Mois'],['custom','Intervalle']].map(([v,l]) => (
          <button key={v}
            className={`drp__calmode-btn${calMode === v ? ' drp__calmode-btn--active' : ''}`}
            onClick={() => { setCalMode(v); if (v !== 'custom') setPicking(null) }}>
            {l}
          </button>
        ))}
      </div>
      <div className="drp__year-grid">
        {months.map((mDate, mi) => {
          const cells = daysInMonth(yearStart, mi)
          const isCurrentMonth = isSameMonth(mDate, today)
          const mSelected = mode?.type === 'calMonth' && isSameMonth(new Date(mode.ts), mDate)
          return (
            <div key={mi}
              className={`drp__month${mSelected ? ' drp__month--selected' : ''}`}
              onClick={calMode === 'month' ? () => handleMonthClick(mDate) : undefined}
              style={calMode === 'month' ? { cursor: 'pointer' } : {}}>
              <div className="drp__month-name" style={isCurrentMonth ? { color: 'var(--color-primary)', fontWeight: 700 } : {}}>
                {MONTH_NAMES[mi]}
              </div>
              {calMode !== 'month' && (
                <>
                  <div className="drp__day-headers">
                    {DAY_NAMES.map((d,i) => <span key={i}>{d}</span>)}
                  </div>
                  <div className="drp__days">
                    {cells.map((d, ci) => {
                      if (!d) return <span key={ci} className="drp__day drp__day--empty" />
                      const isToday    = isSameDay(d, today)
                      const isFuture   = d > today
                      const isSel      = isDaySelected(d)
                      const isHov      = isDayInHover(d)
                      const isWeekSel  = mode?.type === 'calWeek' && isSel
                      return (
                        <span key={ci}
                          className={[
                            'drp__day',
                            isToday   ? 'drp__day--today'   : '',
                            isFuture  ? 'drp__day--future'  : '',
                            isSel     ? 'drp__day--sel'     : '',
                            isHov     ? 'drp__day--hover'   : '',
                            isWeekSel ? 'drp__day--week'    : '',
                          ].filter(Boolean).join(' ')}
                          onClick={!isFuture ? () => handleDayClick(d) : undefined}
                          onMouseEnter={() => picking === 'end' && setHoverDay(d)}
                          onMouseLeave={() => setHoverDay(null)}>
                          {d.getDate()}
                        </span>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
      {calMode === 'custom' && (
        <div className="drp__custom-inputs">
          <div className="drp__custom-row">
            <span className="drp__custom-label">Début</span>
            <input type="date" className="wc-input drp__date-input"
              value={customStart ? new Date(customStart).toISOString().slice(0,10) : ''}
              max={new Date().toISOString().slice(0,10)}
              onChange={e => { onCustom(new Date(e.target.value).getTime(), customEnd); onMode('custom') }} />
          </div>
          <div className="drp__custom-row">
            <span className="drp__custom-label">Fin</span>
            <input type="date" className="wc-input drp__date-input"
              value={customEnd ? new Date(customEnd).toISOString().slice(0,10) : ''}
              min={customStart ? new Date(customStart).toISOString().slice(0,10) : ''}
              max={new Date().toISOString().slice(0,10)}
              onChange={e => { onCustom(customStart, endOfDay(new Date(e.target.value)).getTime()); onMode('custom') }} />
          </div>
          {picking === 'end' && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-1)' }}>
              Cliquez une date de fin dans le calendrier…
            </div>
          )}
        </div>
      )}
      <div className="drp__summary">
        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        {modeLabel()}
      </div>
    </div>
  )
}

// ─── Formatters ───────────────────────────────────────────────────────────────

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

// ─── Nado helper ──────────────────────────────────────────────────────────────

function addressToSubaccount(address, name = 'default') {
  const addrHex    = address.toLowerCase().replace('0x', '')
  const nameHex    = Array.from(name).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
  const namePadded = nameHex.padEnd(24, '0').slice(0, 24)
  return '0x' + addrHex + namePadded
}

// ─── Couleurs ─────────────────────────────────────────────────────────────────
/*
const PLATFORM_COLORS_BY_ID = {
  hyperliquid: '#93c5fd',
  xyz:         '#c4b5fd',
  hyena:       '#a5b4fc',
  extended:    '#6cdfa9',
  nado:        '#e1ac83',
}

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
*/
const STORAGE_KEY    = 'stats_options_v5'
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
  const wallet = useWallet()
  const {
    hlAddress,
    hlVaultAddress,
    extApiKey,
    extMainApiKey,
    nadoAddress,
    nadoSubaccount,
  } = wallet

  const savedOpts = (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) } catch { return null } })()

  const defaultPlatforms = Object.fromEntries(PLATFORMS.map(p => [p.id, true]))

  // ── État filtres ──
  const [periodMode,     setPeriodMode]     = useState(savedOpts?.periodMode     ?? 'all')
  const [customStart,    setCustomStart]    = useState(savedOpts?.customStart    ?? null)
  const [customEnd,      setCustomEnd]      = useState(savedOpts?.customEnd      ?? null)
  const [viewMode,       setViewMode]       = useState(savedOpts?.viewMode       ?? 'unified')
  const [feesInPnl,      setFeesInPnl]      = useState(savedOpts?.feesInPnl      ?? true)
  const [platforms,      setPlatforms]      = useState(savedOpts?.platforms      ?? defaultPlatforms)
  const [accounts,       setAccounts]       = useState(savedOpts?.accounts       ?? {})
  const [extraAddresses, setExtraAddresses] = useState(savedOpts?.extraAddresses ?? [])
  const [newAddress,     setNewAddress]     = useState({})
  const [filtersOpen,    setFiltersOpen]    = useState(true)

  // ── Data ──
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)
  const [subAccounts, setSubAccounts] = useState([])
  const [stats,       setStats]       = useState(null)

  // ── Adresses HL ──
  const hlEffectiveAddress = hlVaultAddress?.trim() || hlAddress?.trim() || null
  const hlPrincipalAddress = hlAddress?.trim()      || null
  const hlVaultAddr        = hlVaultAddress?.trim()  || null

  // ── Disponibilité des keysField ──
  /*
  const keysFieldAvailable = {
    hl:   !!hlEffectiveAddress,
    ext:  !!extApiKey?.trim() || !!extMainApiKey?.trim(),
    nado: !!nadoAddress?.trim(),
  }
  */

  const keysFieldAvailable = Object.fromEntries(
  [...new Set(PLATFORMS.map(p => p.keysField))].map(kf => {
    const plat = PLATFORMS.find(p => p.keysField === kf)
    return [kf, plat?.isAvailable(wallet) ?? false]
  })
)


  // ── Initialiser accounts dès que les adresses sont connues ──
  /*
  useEffect(() => {
    setAccounts(prev => {
      const next = { ...prev }
      if (hlPrincipalAddress && !(hlPrincipalAddress in next)) next[hlPrincipalAddress] = true
      if (hlVaultAddr        && !(hlVaultAddr        in next)) next[hlVaultAddr]        = true
      if (extMainApiKey?.trim() && !('ext-main' in next)) next['ext-main'] = true
      if (extApiKey?.trim()     && !('ext-sub'  in next)) next['ext-sub']  = true
      for (const e of extraAddresses) if (!(e.address in next)) next[e.address] = true
      return next
    })
  }, [hlPrincipalAddress, hlVaultAddr, extMainApiKey, extApiKey])
  */

  useEffect(() => {
  setAccounts(prev => {
    const next = { ...prev }
    for (const plat of PLATFORMS) {
      for (const entry of plat.getAccounts(wallet, subAccounts, extraAddresses)) {
        if (entry.address && !(entry.address in next)) next[entry.address] = true
      }
    }
    return next
  })
}, [wallet, subAccounts, extraAddresses])

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
        for (const s of list) if (!(s.address in next)) next[s.address] = true
        return next
      })
    }).catch(() => {})
  }, [hlEffectiveAddress])

  // ── Persist options ──
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        periodMode, customStart, customEnd, viewMode, feesInPnl, platforms, accounts, extraAddresses
      }))
    } catch {}
  }, [periodMode, customStart, customEnd, viewMode, feesInPnl, platforms, accounts, extraAddresses])

  // ── Adresses sauvegardées par platformId ──────────────────────────────────────
  function savedAddressesFor(platformId) {
    const plat = PLATFORMS.find(p => p.id === platformId)
    if (!plat) return []

    if (plat.keysField === 'hl') {
      const list = []
      if (hlPrincipalAddress) {
        list.push({ address: hlPrincipalAddress, name: 'Principal', badge: 'HL', removable: false })
      }
      if (hlVaultAddr && hlVaultAddr !== hlPrincipalAddress) {
        list.push({ address: hlVaultAddr, name: 'Vault', badge: 'HL', removable: false })
      }
      if (platformId === 'hyperliquid') {
        subAccounts.forEach(s => list.push({ address: s.address, name: s.name, badge: 'sub', removable: false }))
      }
      extraAddresses
        .filter(e => e.platformId === platformId)
        .forEach(e => list.push({ address: e.address, name: null, badge: 'extra', removable: true }))
      return list
    }

    if (plat.keysField === 'ext') {
      const list = []
      if (extMainApiKey?.trim()) list.push({ address: 'ext-main', name: 'Compte principal', badge: 'main', removable: false })
      if (extApiKey?.trim())     list.push({ address: 'ext-sub',  name: 'Sous-compte',      badge: 'sub',  removable: false })
      return list
    }

    if (plat.keysField === 'nado') {
      const addr = nadoAddress?.trim()
      const list = []
      if (addr) {
        list.push({ address: addr, name: nadoSubaccount?.trim() || 'default', badge: 'nado', removable: false })
      }
      extraAddresses
        .filter(e => e.platformId === platformId)
        .forEach(e => list.push({ address: e.address, name: null, badge: 'extra', removable: true }))
      return list
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
      const { start, end } = computeRange(periodMode, customStart, customEnd)

      const hlPerpsActive = !!platforms['hyperliquid']
      const xyzActive     = !!platforms['xyz']
      const hyenaActive   = !!platforms['hyena']
      const anyHLActive   = hlPerpsActive || xyzActive || hyenaActive
      const anyHIP3Active = xyzActive || hyenaActive
      const extActive     = PLATFORMS.filter(p => p.keysField === 'ext').some(p => platforms[p.id])
      const nadoActive    = PLATFORMS.filter(p => p.keysField === 'nado').some(p => platforms[p.id])

      const allHLAddresses = [
        hlPrincipalAddress,
        hlVaultAddr,
        ...subAccounts.map(s => s.address),
        ...extraAddresses.filter(e => ['hyperliquid','xyz','hyena'].includes(e.platformId)).map(e => e.address),
      ].filter(Boolean)

      const uniqueHLAddresses = [...new Set(allHLAddresses)]
      const activeHLAddresses = uniqueHLAddresses.filter(a => accounts[a] !== false)

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
      if (extActive) {
        const BASE = 'https://api.starknet.extended.exchange'

        // Compte principal
        if (extMainApiKey?.trim() && accounts['ext-main'] !== false) {
          try {
            const [positions, trades] = await Promise.all([
              fetchExtendedPositions(extMainApiKey, BASE, start, end),
              fetchExtendedTrades(extMainApiKey, BASE, start, end),
            ])
            const part = aggregateExtended(positions, trades)
            res.ext.pnlGross += part.pnlGross
            res.ext.fees     += part.fees
            res.ext.volume   += part.volume
            res.ext.trades   += part.trades
          } catch (e) {
            console.warn('Extended main error:', e.message)
          }
        }

        // Sous-compte
        if (extApiKey?.trim() && accounts['ext-sub'] !== false) {
          try {
            const [positions, trades] = await Promise.all([
              fetchExtendedPositions(extApiKey, BASE, start, end),
              fetchExtendedTrades(extApiKey, BASE, start, end),
            ])
            const part = aggregateExtended(positions, trades)
            res.ext.pnlGross += part.pnlGross
            res.ext.fees     += part.fees
            res.ext.volume   += part.volume
            res.ext.trades   += part.trades
          } catch (e) {
            console.warn('Extended sub error:', e.message)
          }
        }
      }

      // ── Nado ──
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

      // ── Total ──
      /*
      const activeStatsKeys = STATS_KEYS.filter(k => {
        if (k === 'hl')   return hlPerpsActive
        if (k === 'hip3') return anyHIP3Active
        if (k === 'ext')  return extActive
        if (k === 'nado') return nadoActive
        return false
      })
      */
      const activeStatsKeys = STATS_KEYS.filter(k =>
  PLATFORMS.some(p => p.statsKey === k && platforms[p.id] && p.isAvailable(wallet))
)
      
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
  }, [periodMode, customStart, customEnd, platforms, accounts, extraAddresses,
      hlPrincipalAddress, hlVaultAddr, subAccounts,
      extApiKey, extMainApiKey,
      nadoAddress, nadoSubaccount])

  useEffect(() => { compute() }, [compute])

  const displayPnl = (pnlGross, fees) => feesInPnl ? pnlGross - fees : pnlGross

  // ─────────────────────────────────────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  //const nothingConfigured = !hlEffectiveAddress && !extApiKey?.trim() && !extMainApiKey?.trim() && !nadoAddress?.trim()
  const nothingConfigured = PLATFORMS.every(p => !p.isAvailable(wallet))

  
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
              <DateRangePicker
                mode={periodMode}
                onMode={setPeriodMode}
                customStart={customStart}
                customEnd={customEnd}
                onCustom={(s, e) => { setCustomStart(s); setCustomEnd(e) }}
              />
            </div>

            {/* ── Plateformes ── */}
            <div className="stats-filter-section">
              <div className="stats-filter-label">Plateformes</div>
              <div className="stats-chips">
                {PLATFORMS.map(p => {
                  const available = keysFieldAvailable[p.keysField] ?? false
                  const active    = platforms[p.id] && available
                  //const color     = PLATFORM_COLORS_BY_ID[p.id] ?? '#94a3b8'
                  //const color = p.color ?? '#94a3b8'
                  const color     = plat.color ?? '#94a3b8' 
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

            {/* ── Comptes ── */}
            <div className="stats-filter-section">
              <div className="stats-filter-label">Comptes</div>
              <div className="stats-accounts-platforms">
                {PLATFORMS.map(plat => {
                  //const color     = PLATFORM_COLORS_BY_ID[plat.id] ?? '#94a3b8'
                  const color     = plat.color ?? '#94a3b8' 
                  const available = keysFieldAvailable[plat.keysField] ?? false
                  const addrs     = savedAddressesFor(plat.id)
                  const hasAddrs  = addrs.length > 0

                  return (
                    <div key={plat.id} className="stats-accounts-platform">

                      <div className="stats-accounts-platform__header">
                        <span className="stats-accounts-platform__dot" style={{ background: color }} />
                        <span className="stats-accounts-platform__name" style={{ color }}>
                          {plat.label}
                        </span>
                        {!available && (
                          <span className="stats-accounts-platform__lock" title="Clé non configurée">🔒</span>
                        )}
                      </div>

                      {!hasAddrs ? (
                        <div className="stats-no-addr-warning">
                          <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ flexShrink:0 }}>
                            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                          </svg>
                          Aucune adresse associée
                        </div>
                      ) : (
                        <div className="stats-accounts">
                          {addrs.map((entry, i) => (
                            <label key={entry.address ?? `api-${i}`}
                              className={`stats-account-row${entry.apiOnly ? ' stats-account-row--api' : ''}`}>
                              {!entry.apiOnly && (
                                <input type="checkbox"
                                  checked={accounts[entry.address] !== false}
                                  onChange={() => toggleAccount(entry.address)} />
                              )}
                              <span className="stats-account-name"
                                style={!entry.name ? { color: 'var(--color-text-muted)' } : {}}>
                                {entry.name ?? '—'}
                              </span>
                              {entry.address && !entry.apiOnly && plat.keysField !== 'ext' && (
                                <span className="stats-account-addr">
                                  {entry.address.slice(0,6)}…{entry.address.slice(-4)}
                                </span>
                              )}
                              <span className="badge"
                                style={{ marginLeft:'auto', fontSize:'10px', color, border: `1px solid ${color}40` }}>
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

                      {/* Champ ajout adresse — pas pour Extended */}
                      {plat.hasAddressField && (
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
            <div className="stats-main-cards stats-main-cards--4">
              <StatCard label={feesInPnl ? 'PnL Réalisé (net)' : 'PnL Réalisé (brut)'} value={fmtMoney(totalPnl, true)} positive={totalPnl >= 0} large />
              <StatCard label="Fees payés" value={fmtMoney(totalFees)} accent="warning" large />
              <StatCard label="Volume" value={fmtVol(totalVol)} large />
              <StatCard label="Trades" value={totalTrades.toLocaleString()} large />
            </div>

            {viewMode === 'split' ? (
              <div className="stats-platform-grid">
                {stats.activeStatsKeys.map(k => {
                  const d     = stats.byPlatform[k] || EMPTY_PLATFORM
                  const pnl   = displayPnl(d.pnlGross, d.fees)
                  //const color = STATS_COLORS_FULL[k]
                  //const label = STATS_LABELS_FULL[k]
                  const meta  = PLATFORMS.find(p => p.statsKey === k)
                  const color = meta?.color      ?? '#94a3b8'
                  const label = meta?.statsLabel ?? k
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
                      //const color = STATS_COLORS_FULL[k]
                      //const label = STATS_LABELS_FULL[k]
                      const meta  = PLATFORMS.find(p => p.statsKey === k)
                      const color = meta?.color      ?? '#94a3b8'
                      const label = meta?.statsLabel ?? k
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
