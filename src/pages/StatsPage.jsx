// ============================================================
// stats.jsx v6 — + section Trades Delta-Neutral
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useWallet } from '../context/WalletContext'
import { PLATFORMS, STATS_KEYS } from '../platforms/index'
import { loadOrderGroups } from '../services/orderTracker'

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
  if (mode === 'all')    return { start: 0, end: Date.now() }
  if (mode === 'day')    return { start: startOfDay(now).getTime(),   end: endOfDay(now).getTime() }
  if (mode === 'week')   return { start: startOfWeek(now).getTime(),  end: endOfWeek(now).getTime() }
  if (mode === 'month')  return { start: startOfMonth(now).getTime(), end: endOfMonth(now).getTime() }
  if (mode === 'custom') return { start: customStart ?? 0, end: customEnd ?? Date.now() }
  if (mode?.type === 'calDay')   { const d = new Date(mode.ts); return { start: startOfDay(d).getTime(),   end: endOfDay(d).getTime() } }
  if (mode?.type === 'calWeek')  { const d = new Date(mode.ts); return { start: startOfWeek(d).getTime(),  end: endOfWeek(d).getTime() } }
  if (mode?.type === 'calMonth') { const d = new Date(mode.ts); return { start: startOfMonth(d).getTime(), end: endOfMonth(d).getTime() } }
  return { start: 0, end: Date.now() }
}

// ─── DateRangePicker ──────────────────────────────────────────────────────────

function DateRangePicker({ mode, onMode, customStart, customEnd, onCustom }) {
  const today     = new Date()
  const yearStart = today.getFullYear()
  const [calMode,  setCalMode]  = useState('month')
  const [picking,  setPicking]  = useState(null)
  const [hoverDay, setHoverDay] = useState(null)

  const quickBtns = [
    ['all',   'All time'],
    ['day',   "Aujourd'hui"],
    ['week',  'Cette semaine'],
    ['month', 'Ce mois'],
  ]

  const months = Array.from({ length: 12 }, (_, i) => new Date(yearStart, i, 1))

  function daysInMonth(year, month) {
    const first    = new Date(year, month, 1)
    const firstDow = (first.getDay() + 6) % 7
    const total    = new Date(year, month + 1, 0).getDate()
    const cells    = []
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
    if (calMode === 'day')  { onMode({ type: 'calDay',  ts: d.getTime() }); return }
    if (calMode === 'week') { onMode({ type: 'calWeek', ts: d.getTime() }); return }
    if (!picking || picking === 'start') {
      onCustom(startOfDay(d).getTime(), null); setPicking('end'); onMode('custom')
    } else {
      const s = customStart ?? startOfDay(d).getTime()
      const sorted = [s, endOfDay(d).getTime()].sort((a,b) => a-b)
      onCustom(sorted[0], sorted[1]); setPicking(null); onMode('custom')
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
    if (mode === 'custom' && customStart && customEnd)
      return `${new Date(customStart).toLocaleDateString('fr-FR')} → ${new Date(customEnd).toLocaleDateString('fr-FR')}`
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
          const cells          = daysInMonth(yearStart, mi)
          const isCurrentMonth = isSameMonth(mDate, today)
          const mSelected      = mode?.type === 'calMonth' && isSameMonth(new Date(mode.ts), mDate)
          return (
            <div key={mi}
              className={`drp__month${mSelected ? ' drp__month--selected' : ''}`}
              onClick={calMode === 'month' ? () => handleMonthClick(mDate) : undefined}
              style={calMode === 'month' ? { cursor: 'pointer' } : {}}>
              <div className="drp__month-name"
                style={isCurrentMonth ? { color: 'var(--color-primary)', fontWeight: 700 } : {}}>
                {MONTH_NAMES[mi]}
              </div>
              {calMode !== 'month' && (
                <>
                  <div className="drp__day-headers">{DAY_NAMES.map((d,i) => <span key={i}>{d}</span>)}</div>
                  <div className="drp__days">
                    {cells.map((d, ci) => {
                      if (!d) return <span key={ci} className="drp__day drp__day--empty" />
                      const isToday   = isSameDay(d, today)
                      const isFuture  = d > today
                      const isSel     = isDaySelected(d)
                      const isHov     = isDayInHover(d)
                      const isWeekSel = mode?.type === 'calWeek' && isSel
                      return (
                        <span key={ci}
                          className={['drp__day', isToday?'drp__day--today':'', isFuture?'drp__day--future':'',
                            isSel?'drp__day--sel':'', isHov?'drp__day--hover':'', isWeekSel?'drp__day--week':'']
                            .filter(Boolean).join(' ')}
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
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
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

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const STORAGE_KEY    = 'stats_options_v5'
const EMPTY_PLATFORM = { pnlGross: 0, fees: 0, volume: 0, trades: 0 }

// ─── DN Groups matcher ────────────────────────────────────────────────────────
// Apparie les groupes sauvegardés avec les trades fetchés
// Chaque plateforme expose normalizeTradeId(trade) dans PLATFORMS

function matchDnGroups(groups, rawTradesByPlatform, start, end) {
  return groups
    .filter(g => g.createdAt >= start && g.createdAt <= end)
    .map(group => {
      const legs = group.legs.map(leg => {
        const plat   = PLATFORMS.find(p => p.id === leg.platformId)
        const trades = rawTradesByPlatform[leg.platformId] ?? []
        const match  = trades.find(t =>
          (plat?.normalizeTradeId?.(t) != null && plat.normalizeTradeId(t) === leg.orderId)
          || (Math.abs((t.timestamp ?? t.createdAt ?? t.time ?? 0) - leg.timestamp) < 10_000
              && Math.abs((t.size ?? t.sz ?? 0) - leg.size) / (leg.size || 1) < 0.01
              && (t.market ?? t.coin) === leg.market)
        )
        return { ...leg, trade: match ?? null, matched: !!match }
      })

      const fullyMatched = legs.every(l => l.matched)
      const pnlGross     = legs.reduce((s, l) => s + (l.trade?.pnlGross ?? l.trade?.closedPnl ?? 0), 0)
      const fees         = legs.reduce((s, l) => s + (l.trade?.fees ?? l.trade?.fee ?? 0), 0)
      const pnlNet       = pnlGross - fees

      return { ...group, legs, fullyMatched, pnlGross, fees, pnlNet }
    })
}

// ─── DnGroupsSection ─────────────────────────────────────────────────────────

function DnGroupsSection({ groups, feesInPnl }) {
  const [open, setOpen] = useState(true)

  if (!groups.length) return (
    <div className="card">
      <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
        <div className="empty-state__title" style={{ fontSize: 'var(--text-sm)' }}>Aucun groupe DN sur cette période</div>
        <div className="empty-state__desc">Les ordres envoyés via "Placer les 2 legs" apparaîtront ici.</div>
      </div>
    </div>
  )

  const totalPnl  = groups.reduce((s, g) => s + (feesInPnl ? g.pnlNet : g.pnlGross), 0)
  const totalFees = groups.reduce((s, g) => s + g.fees, 0)

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header */}
      <button className="stats-filters__toggle" onClick={() => setOpen(o => !o)}
        style={{ padding: 'var(--space-3) var(--space-4)' }}>
        <span style={{ display:'flex', alignItems:'center', gap:'var(--space-2)', fontWeight:700, fontSize:'var(--text-sm)', color:'var(--color-text)' }}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M18 20V10M12 20V4M6 20v-6"/>
          </svg>
          Trades Delta-Neutral
          <span className="badge" style={{ fontSize: '10px' }}>{groups.length} groupe{groups.length > 1 ? 's' : ''}</span>
        </span>
        <span style={{ display:'flex', alignItems:'center', gap:'var(--space-4)', fontSize:'var(--text-xs)' }}>
          <span style={{ color: totalPnl >= 0 ? 'var(--color-success)' : 'var(--color-error)', fontWeight: 700 }}>
            {fmtMoney(totalPnl, true)}
          </span>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
            style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </span>
      </button>

      {open && (
        <>
          {/* Résumé */}
          <div style={{ display:'flex', gap:'var(--space-6)', padding:'var(--space-2) var(--space-4) var(--space-3)', borderBottom:'1px solid var(--color-divider)', fontSize:'var(--text-xs)', color:'var(--color-text-muted)' }}>
            <span>Fees totaux : <strong style={{ color:'var(--color-warning)' }}>{fmtMoney(totalFees)}</strong></span>
            <span>{groups.filter(g => g.fullyMatched).length}/{groups.length} groupes appariés</span>
          </div>

          {/* Liste des groupes */}
          <div className="dn-groups-list">
            {groups.map(group => {
              const pnl   = feesInPnl ? group.pnlNet : group.pnlGross
              const color = pnl >= 0 ? 'var(--color-success)' : 'var(--color-error)'
              return (
                <div key={group.groupId} className={`dn-group${group.fullyMatched ? '' : ' dn-group--partial'}`}>
                  {/* Ligne principale */}
                  <div className="dn-group__header">
                    <span className="dn-group__date">{fmtDate(group.createdAt)}</span>
                    <span className="dn-group__market">
                      {[...new Set(group.legs.map(l => l.market))].join(' / ')}
                    </span>
                    {!group.fullyMatched && (
                      <span className="badge" style={{ fontSize:'10px', color:'var(--color-warning)', border:'1px solid var(--color-warning)40' }}>
                        ⚠ partiel
                      </span>
                    )}
                    <span className="dn-group__pnl" style={{ color, marginLeft:'auto' }}>
                      {fmtMoney(pnl, true)}
                    </span>
                    <span style={{ fontSize:'var(--text-xs)', color:'var(--color-warning)' }}>
                      -{fmtMoney(group.fees)}
                    </span>
                  </div>

                  {/* Legs */}
                  <div className="dn-group__legs">
                    {group.legs.map((leg, i) => {
                      const plat      = PLATFORMS.find(p => p.id === leg.platformId)
                      const platColor = plat?.color ?? '#94a3b8'
                      const legPnl    = leg.trade?.pnlGross ?? leg.trade?.closedPnl ?? null
                      return (
                        <div key={i} className="dn-leg">
                          <span className="dn-leg__dot" style={{ background: platColor }} />
                          <span className="dn-leg__platform" style={{ color: platColor }}>{plat?.label ?? leg.platformId}</span>
                          <span className={`dn-leg__side dn-leg__side--${leg.side}`}>{leg.side.toUpperCase()}</span>
                          <span className="dn-leg__size">{leg.size}</span>
                          <span className="dn-leg__market" style={{ color:'var(--color-text-muted)' }}>{leg.market}</span>
                          {leg.matched ? (
                            <span style={{ marginLeft:'auto', color: legPnl >= 0 ? 'var(--color-success)' : 'var(--color-error)', fontSize:'var(--text-xs)' }}>
                              {legPnl != null ? fmtMoney(legPnl, true) : '—'}
                            </span>
                          ) : (
                            <span style={{ marginLeft:'auto', color:'var(--color-text-faint)', fontSize:'var(--text-xs)' }}>non apparié</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StatsPage() {
  const wallet = useWallet()

  const savedOpts = (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) } catch { return null } })()
  const defaultPlatforms = Object.fromEntries(PLATFORMS.map(p => [p.id, true]))

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

  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)
  const [subAccounts, setSubAccounts] = useState({})
  const [stats,       setStats]       = useState(null)
  const [dnGroups,    setDnGroups]    = useState([])  // ← groupes DN appariés

  const keysFieldAvailable = Object.fromEntries(
    [...new Set(PLATFORMS.map(p => p.keysField))].map(kf => {
      const plat = PLATFORMS.find(p => p.keysField === kf)
      return [kf, plat?.isAvailable(wallet) ?? false]
    })
  )

  useEffect(() => {
    setAccounts(prev => {
      const next = { ...prev }
      for (const plat of PLATFORMS)
        for (const entry of plat.getAccounts(wallet, subAccounts, extraAddresses))
          if (entry.address && !(entry.address in next)) next[entry.address] = true
      return next
    })
  }, [wallet, subAccounts, extraAddresses])

  useEffect(() => {
    for (const plat of PLATFORMS) {
      if (!plat.fetchSubAccounts || !plat.isAvailable(wallet)) continue
      plat.fetchSubAccounts(wallet).then(list => {
        setSubAccounts(prev => ({ ...prev, [plat.id]: list }))
        setAccounts(prev => {
          const next = { ...prev }
          for (const s of list) if (!(s.address in next)) next[s.address] = true
          return next
        })
      }).catch(() => {})
    }
  }, [wallet])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        periodMode, customStart, customEnd, viewMode, feesInPnl, platforms, accounts, extraAddresses
      }))
    } catch {}
  }, [periodMode, customStart, customEnd, viewMode, feesInPnl, platforms, accounts, extraAddresses])

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

  const computingRef = useRef(false)

  const compute = useCallback(async () => {
    if (computingRef.current) return
    computingRef.current = true
    setLoading(true); setError(null); setStats(null); setDnGroups([])
    try {
      const { start, end } = computeRange(periodMode, customStart, customEnd)

      const res = Object.fromEntries(STATS_KEYS.map(k => [k, { pnlGross:0, fees:0, volume:0, trades:0 }]))

      // rawTradesByPlatform — collecte les trades bruts pour l'appariement DN
      const rawTradesByPlatform = {}

      const done = new Set()
      for (const plat of PLATFORMS) {
        if (!platforms[plat.id] || !plat.isAvailable(wallet) || !plat.fetchStats || done.has(plat.id)) continue
        try {
          const parts = await plat.fetchStats(wallet, accounts, extraAddresses, subAccounts, start, end)
          for (const [k, v] of Object.entries(parts)) {
            if (!res[k]) continue
            res[k].pnlGross += v.pnlGross
            res[k].fees     += v.fees
            res[k].volume   += v.volume
            res[k].trades   += v.trades
            // Stocker les trades bruts si la plateforme les expose
            if (v.rawTrades?.length) {
              rawTradesByPlatform[plat.id] = [
                ...(rawTradesByPlatform[plat.id] ?? []),
                ...v.rawTrades,
              ]
            }
          }
        } catch (e) { console.warn(`[${plat.id}] fetchStats:`, e.message) }
        done.add(plat.id)
      }

      const activeStatsKeys = STATS_KEYS.filter(k =>
        PLATFORMS.some(p => p.statsKey === k && platforms[p.id] && p.isAvailable(wallet))
      )

      const total = activeStatsKeys.reduce((acc, k) => ({
        pnlGross: acc.pnlGross + (res[k]?.pnlGross || 0),
        fees:     acc.fees     + (res[k]?.fees     || 0),
        volume:   acc.volume   + (res[k]?.volume   || 0),
        trades:   acc.trades   + (res[k]?.trades   || 0),
      }), { pnlGross:0, fees:0, volume:0, trades:0 })

      setStats({ total, byPlatform: res, activeStatsKeys })

      // Appariement DN
      const allGroups = loadOrderGroups()
      const matched   = matchDnGroups(allGroups, rawTradesByPlatform, start, end)
      setDnGroups(matched)

    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
      computingRef.current = false
    }
  }, [periodMode, customStart, customEnd, platforms, accounts, extraAddresses, subAccounts, wallet])

  useEffect(() => { compute() }, [compute])

  const displayPnl = (pnlGross, fees) => feesInPnl ? pnlGross - fees : pnlGross

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

            <div className="stats-filter-section">
              <div className="stats-filter-label">Période</div>
              <DateRangePicker mode={periodMode} onMode={setPeriodMode}
                customStart={customStart} customEnd={customEnd}
                onCustom={(s, e) => { setCustomStart(s); setCustomEnd(e) }} />
            </div>

            <div className="stats-filter-section">
              <div className="stats-filter-label">Plateformes</div>
              <div className="stats-chips">
                {PLATFORMS.map(p => {
                  const available = keysFieldAvailable[p.keysField] ?? false
                  const active    = platforms[p.id] && available
                  const color     = p.color ?? '#94a3b8'
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

            <div className="stats-filter-section">
              <div className="stats-filter-label">Affichage plateformes</div>
              <div className="stats-chips">
                {[['unified', 'Carte unifiée'], ['split', 'Cartes séparées']].map(([v, l]) => (
                  <button key={v} className={`stats-chip${viewMode === v ? ' stats-chip--on' : ''}`} onClick={() => setViewMode(v)}>{l}</button>
                ))}
              </div>
            </div>

            <div className="stats-filter-section">
              <div className="stats-filter-label">Options PnL</div>
              <label className="stats-toggle-row">
                <input type="checkbox" checked={feesInPnl} onChange={e => setFeesInPnl(e.target.checked)} />
                <span>Déduire les fees du PnL</span>
                <span className="stats-toggle-hint">{feesInPnl ? 'PnL net (après fees)' : 'PnL brut (hors fees)'}</span>
              </label>
            </div>

            <div className="stats-filter-section">
              <div className="stats-filter-label">Comptes</div>
              <div className="stats-accounts-platforms">
                {PLATFORMS.map(plat => {
                  const color     = plat.color ?? '#94a3b8'
                  const available = keysFieldAvailable[plat.keysField] ?? false
                  const addrs     = plat.getAccounts(wallet, subAccounts, extraAddresses) ?? []
                  const hasAddrs  = addrs.length > 0
                  return (
                    <div key={plat.id} className="stats-accounts-platform">
                      <div className="stats-accounts-platform__header">
                        <span className="stats-accounts-platform__dot" style={{ background: color }} />
                        <span className="stats-accounts-platform__name" style={{ color }}>{plat.label}</span>
                        {!available && <span className="stats-accounts-platform__lock" title="Clé non configurée">🔒</span>}
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
                              <span className="stats-account-name" style={!entry.name ? { color: 'var(--color-text-muted)' } : {}}>{entry.name ?? '—'}</span>
                              {entry.address && !entry.apiOnly && plat.hasAddressField && (
                                <span className="stats-account-addr">{entry.address.slice(0,6)}…{entry.address.slice(-4)}</span>
                              )}
                              <span className="badge" style={{ marginLeft:'auto', fontSize:'10px', color, border: `1px solid ${color}40` }}>{entry.badge}</span>
                              {entry.removable && (
                                <button className="stats-account-remove"
                                  onClick={e => { e.preventDefault(); removeExtra(entry.address, plat.id) }}>×</button>
                              )}
                            </label>
                          ))}
                        </div>
                      )}
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

      {error && <div className="alert alert--error">⚠ {error}</div>}

      {loading && !stats && (
        <div className="stats-loading">
          <span className="stats-spin" style={{ fontSize: '1.5rem' }}>⟳</span>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>Chargement des statistiques…</span>
        </div>
      )}

      {stats && (() => {
        const totalPnl    = displayPnl(stats.total.pnlGross, stats.total.fees)
        const totalFees   = stats.total.fees
        const totalVol    = stats.total.volume
        const totalTrades = stats.total.trades
        return (
          <>
            {/* ─── KPIs globaux ─── */}
            <div className="stats-main-cards stats-main-cards--4">
              <StatCard label={feesInPnl ? 'PnL Réalisé (net)' : 'PnL Réalisé (brut)'} value={fmtMoney(totalPnl, true)} positive={totalPnl >= 0} large />
              <StatCard label="Fees payés" value={fmtMoney(totalFees)} accent="warning" large />
              <StatCard label="Volume" value={fmtVol(totalVol)} large />
              <StatCard label="Trades" value={totalTrades.toLocaleString()} large />
            </div>

            {/* ─── Par plateforme ─── */}
            {viewMode === 'split' ? (
              <div className="stats-platform-grid" style={{ '--card-count': stats.activeStatsKeys.length }}>
                {stats.activeStatsKeys.map(k => {
                  const d     = stats.byPlatform[k] || EMPTY_PLATFORM
                  const pnl   = displayPnl(d.pnlGross, d.fees)
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

            {/* ─── Trades Delta-Neutral ─── */}
            <DnGroupsSection groups={dnGroups} feesInPnl={feesInPnl} />
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
