// src/components/ManagePositions.jsx
// Panel de positions ouvertes avec detection delta-neutral automatique
// V1 : matching cross-platform uniquement
// Style coherent avec le reste de l'app (classes Tailwind dark-first)

import { useEffect, useState, useCallback, useRef } from 'react'
import { useOpenPositions }     from '../hooks/useOpenPositions.js'
import { useDeltaNeutralPairs } from '../hooks/useDeltaNeutralPairs.js'
import { usePlaceOrder }        from '../hooks/usePlaceOrder.js'
import { canTrade }             from '../services/orderService.js'
// ─── Composant principal ─────────────────────────────────────────────────────

import { useWallet }     from '../context/WalletContext.js'
import { useLivePrices } from '../hooks/useLivePrices.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtUSD = v => {
  if (v == null || isNaN(v)) return '—'
  const abs = Math.abs(v)
  const s   = abs >= 1000
    ? abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : abs.toFixed(2)
  return (v < 0 ? '-' : '+') + '$' + s
}

const fmtPx = v =>
  v != null && !isNaN(v)
    ? `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`
    : '—'

const fmtSize = v =>
  v != null && !isNaN(v)
    ? Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })
    : '—'

const pnlClass = v => (v >= 0 ? 'text-green-400' : 'text-red-400')

const PLATFORM_LABELS = {
  hyperliquid : 'Hyperliquid',
  extended    : 'Extended',
  nado        : 'Nado',
  xyz         : 'HIP-3',
  hyena       : 'HyENA',
}

const PLATFORM_COLORS = {
  hyperliquid : 'text-blue-400',
  extended    : 'text-purple-400',
  nado        : 'text-orange-400',
  xyz         : 'text-cyan-400',
  hyena       : 'text-pink-400',
}

function platformLabel(id) { return PLATFORM_LABELS[id] ?? id }
function platformColor(id) { return PLATFORM_COLORS[id] ?? 'text-gray-300' }

// ─── Calcul breakeven ─────────────────────────────────────────────────────────
// Deux prix independants :
// tpLong  : prix de fermeture du LONG pour que PnL combiné = 0 (SHORT ferme a son mark)
// slShort : prix de fermeture du SHORT pour que PnL combiné = 0 (LONG ferme a son mark)
function computeBreakevenPrices({ long, short, includeFees, feePct = 0.0005 }) {
  const entryL = long.entryPx  || 0
  const entryS = short.entryPx || 0
  const markL  = long.markPx   || entryL
  const markS  = short.markPx  || entryS
  const sziL   = long.szi      || 0
  const sziS   = short.szi     || 0

  const pnlL = (markL - entryL) * sziL
  const pnlS = (entryS - markS) * sziS

  const feesL     = includeFees ? markL * sziL * feePct : 0
  const feesS     = includeFees ? markS * sziS * feePct : 0
  const totalFees = feesL + feesS
  const pnlNet    = pnlL + pnlS - totalFees

  const adjFeeL = includeFees ? (1 - feePct) : 1
  const adjFeeS = includeFees ? (1 + feePct) : 1

  const tpLong  = sziL > 0 ? (entryL * sziL - pnlS + feesS) / (sziL * adjFeeL) : null
  const slShort = sziS > 0 ? (entryS * sziS + pnlL - feesL) / (sziS * adjFeeS) : null

  return { tpLong, slShort, pnlNet, pnlL, pnlS, totalFees }
}

// ─── LegCard ─────────────────────────────────────────────────────────────────

function LegCard({ pos }) {
  const notional = pos.szi * (pos.markPx ?? pos.entryPx ?? 0)
  return (
    <div className="flex flex-col gap-1 bg-gray-800/60 rounded-xl px-4 py-3 min-w-0 flex-1 border border-gray-700/50">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-semibold uppercase tracking-wide ${platformColor(pos.platform)}`}>
          {platformLabel(pos.platform)}
        </span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
          pos.side === 'LONG' ? 'bg-green-900/60 text-green-400' : 'bg-red-900/60 text-red-400'
        }`}>
          {pos.side}
        </span>
      </div>

      <div className="mt-1 space-y-0.5 text-xs text-gray-300">
        <div className="flex justify-between">
          <span className="text-gray-500">Size</span>
          <span>
            {fmtSize(pos.szi)}{' '}
            <span className="text-gray-500">({fmtUSD(notional).replace(/^[+-]/, '')})</span>
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Entry</span>
          <span>{fmtPx(pos.entryPx)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Mark</span>
          <span>{fmtPx(pos.markPx)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">PnL non-réalisé</span>
          <span className={pnlClass(pos.unrealizedPnl ?? 0)}>
            {fmtUSD(pos.unrealizedPnl ?? 0)}
          </span>
        </div>
        {pos.fundingPnl != null && pos.fundingPnl !== 0 && (
          <div className="flex justify-between">
            <span className="text-gray-500">Funding</span>
            <span className={pnlClass(pos.fundingPnl)}>{fmtUSD(pos.fundingPnl)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── PairRow ─────────────────────────────────────────────────────────────────

function PairRow({ pair, credentials, markets, onFeedback }) {
  const [open,        setOpen]        = useState(false)
  const [includeFees, setIncludeFees] = useState(true)
  const [sending,     setSending]     = useState(false)
  const { placeOrder } = usePlaceOrder(markets)

  const be     = computeBreakevenPrices({ long: pair.long, short: pair.short, includeFees })
  const market = markets.find(m => m.id === pair.marketId)

  const doCloseLeg = useCallback(async (leg) => {
    if (!market) throw new Error(`Marché ${pair.marketId} introuvable`)
    return placeOrder({
      platformId : leg.platform,
      marketId   : pair.marketId,
      isBuy      : leg.side === 'SHORT',
      size       : leg.szi,
      limitPrice : leg.markPx ?? leg.entryPx,
      orderType  : 'taker',
      reduceOnly : true,
      ...credentials,
    })
  }, [market, pair.marketId, placeOrder, credentials])

  const doCloseBoth = useCallback(async () => {
    setSending(true)
    onFeedback?.(null)
    try {
      const results = await Promise.allSettled([
        doCloseLeg(pair.long),
        doCloseLeg(pair.short),
      ])
      const errors = results.filter(r => r.status === 'rejected').map(r => r.reason?.message)
      if (errors.length === 0) {
        onFeedback?.({ ok: true, msg: '✅ Les deux legs fermés avec succès' })
      } else {
        onFeedback?.({ ok: false, msg: `⚠️ Partiel : ${errors.join(' | ')}` })
      }
    } catch (e) {
      onFeedback?.({ ok: false, msg: `❌ ${e.message}` })
    } finally {
      setSending(false)
    }
  }, [pair, doCloseLeg, onFeedback])

  const canCloseL    = canTrade(pair.long.platform,  credentials)
  const canCloseS    = canTrade(pair.short.platform, credentials)
  const canCloseBoth = canCloseL && canCloseS

  return (
    <div className="rounded-2xl border border-indigo-700/40 bg-gray-900/80 shadow-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-800/40 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          <span className="text-indigo-400 text-xs font-semibold uppercase tracking-widest bg-indigo-900/40 px-2 py-0.5 rounded-full">
            ΔN
          </span>
          <span className="font-bold text-white text-base">{pair.label}</span>
          <span className="text-xs text-gray-500">
            {platformLabel(pair.long.platform)} ↔ {platformLabel(pair.short.platform)}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className={`text-sm font-bold ${pnlClass(pair.pnlNet)}`}>
            PnL net : {fmtUSD(pair.pnlNet)}
          </span>
          {Math.abs(pair.deltaUsd) > 1 && (
            <span className="text-xs text-yellow-400">
              Δ {fmtUSD(pair.deltaUsd)}
            </span>
          )}
          <span className="text-gray-500 text-sm">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4">
          <div className="flex gap-3 items-stretch">
            <LegCard pos={pair.long} />
            <div className="flex flex-col items-center justify-center gap-1 min-w-[110px]
              bg-gray-800/40 rounded-xl px-3 py-3 border border-indigo-700/30">
              <span className="font-black text-white text-xl tracking-tight">{pair.label}</span>
              <span className={`text-sm font-bold ${pnlClass(pair.pnlNet)}`}>{fmtUSD(pair.pnlNet)}</span>
              <span className="text-xs text-gray-500">PnL combiné</span>
              {Math.abs(pair.deltaUsd) > 1 && (
                <span className="text-xs text-yellow-400 mt-1">
                  Δ {Math.abs(pair.deltaUsd) < 1000
                    ? pair.deltaUsd.toFixed(0)
                    : (pair.deltaUsd / 1000).toFixed(1) + 'k'} $
                </span>
              )}
            </div>
            <LegCard pos={pair.short} />
          </div>

          <div className="rounded-xl border border-gray-700/60 bg-gray-800/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-200">⚡ Fermeture simultanée</span>
              <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeFees}
                  onChange={e => setIncludeFees(e.target.checked)}
                  className="accent-indigo-500"
                />
                Inclure les fees dans le calcul
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-green-900/20 rounded-lg px-3 py-2 border border-green-700/30">
                <div className="text-gray-400 mb-1">
                  Prix fermeture LONG{' '}
                  <span className={platformColor(pair.long.platform)}>
                    ({platformLabel(pair.long.platform)})
                  </span>
                </div>
                <div className="font-bold text-green-300 text-sm">{fmtPx(be.tpLong)}</div>
                <div className="text-gray-500 mt-0.5">Pour PnL combiné ≈ 0</div>
              </div>
              <div className="bg-red-900/20 rounded-lg px-3 py-2 border border-red-700/30">
                <div className="text-gray-400 mb-1">
                  Prix fermeture SHORT{' '}
                  <span className={platformColor(pair.short.platform)}>
                    ({platformLabel(pair.short.platform)})
                  </span>
                </div>
                <div className="font-bold text-red-300 text-sm">{fmtPx(be.slShort)}</div>
                <div className="text-gray-500 mt-0.5">Pour PnL combiné ≈ 0</div>
              </div>
            </div>

            <div className="text-xs text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
              <span>PnL long actuel : <span className={pnlClass(be.pnlL)}>{fmtUSD(be.pnlL)}</span></span>
              <span>PnL short actuel : <span className={pnlClass(be.pnlS)}>{fmtUSD(be.pnlS)}</span></span>
              {includeFees && (
                <span>Fees estimées : <span className="text-yellow-400">{fmtUSD(-be.totalFees)}</span></span>
              )}
              <span className={`font-semibold ${pnlClass(be.pnlNet)}`}>
                PnL net estimé : {fmtUSD(be.pnlNet)}
              </span>
            </div>

            <button
              disabled={!canCloseBoth || sending}
              onClick={doCloseBoth}
              className="w-full py-2.5 rounded-xl text-sm font-bold transition-colors
                disabled:opacity-40 disabled:cursor-not-allowed
                bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white"
            >
              {sending ? '⏳ Envoi en cours…' : '⚡ Fermer les 2 legs au prix de marché'}
            </button>
            {!canCloseBoth && (
              <p className="text-xs text-yellow-500 text-center">
                Clés manquantes pour{' '}
                {!canCloseL ? platformLabel(pair.long.platform) : platformLabel(pair.short.platform)}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── SingleRow ────────────────────────────────────────────────────────────────

function SingleRow({ pos, credentials, markets, onFeedback }) {
  const [open,    setOpen]    = useState(false)
  const [sending, setSending] = useState(false)
  const { placeOrder } = usePlaceOrder(markets)

  const market   = markets.find(m => m.id === pos.marketId)
  const canClose = canTrade(pos.platform, credentials)
  const notional = pos.szi * (pos.markPx ?? pos.entryPx ?? 0)

  const doClose = useCallback(async (orderType = 'taker') => {
    if (!market) throw new Error(`Marché ${pos.marketId} introuvable`)
    setSending(true)
    onFeedback?.(null)
    try {
      await placeOrder({
        platformId : pos.platform,
        marketId   : pos.marketId,
        isBuy      : pos.side === 'SHORT',
        size       : pos.szi,
        limitPrice : pos.markPx ?? pos.entryPx,
        orderType,
        reduceOnly : true,
        ...credentials,
      })
      onFeedback?.({ ok: true, msg: `✅ Ordre de fermeture envoyé (${pos.label})` })
    } catch (e) {
      onFeedback?.({ ok: false, msg: `❌ ${e.message}` })
    } finally {
      setSending(false)
    }
  }, [pos, market, placeOrder, credentials, onFeedback])

  return (
    <div className="rounded-xl border border-gray-700/50 bg-gray-900/60 overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-800/30 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3">
          <span className={`text-xs font-semibold uppercase tracking-wide ${platformColor(pos.platform)}`}>
            {platformLabel(pos.platform)}
          </span>
          <span className="font-semibold text-white">{pos.label}</span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            pos.side === 'LONG' ? 'bg-green-900/60 text-green-400' : 'bg-red-900/60 text-red-400'
          }`}>
            {pos.side}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-400">
            {fmtSize(pos.szi)} — {fmtUSD(notional).replace(/^[+-]/, '')} notionnel
          </span>
          <span className={`text-sm font-bold ${pnlClass(pos.unrealizedPnl ?? 0)}`}>
            {fmtUSD(pos.unrealizedPnl ?? 0)}
          </span>
          <span className="text-gray-500 text-sm">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-gray-300">
            <div><span className="text-gray-500 block">Entry</span>{fmtPx(pos.entryPx)}</div>
            <div><span className="text-gray-500 block">Mark</span>{fmtPx(pos.markPx)}</div>
            <div>
              <span className="text-gray-500 block">Notionnel</span>
              {fmtUSD(notional).replace(/^[+-]/, '')}
            </div>
            <div>
              <span className="text-gray-500 block">PnL non-réalisé</span>
              <span className={pnlClass(pos.unrealizedPnl ?? 0)}>
                {fmtUSD(pos.unrealizedPnl ?? 0)}
              </span>
            </div>
            {pos.fundingPnl != null && pos.fundingPnl !== 0 && (
              <div>
                <span className="text-gray-500 block">Funding</span>
                <span className={pnlClass(pos.fundingPnl)}>{fmtUSD(pos.fundingPnl)}</span>
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <button
              disabled={!canClose || sending}
              onClick={() => doClose('taker')}
              className="flex-1 py-2 rounded-lg text-xs font-bold transition-colors
                disabled:opacity-40 disabled:cursor-not-allowed
                bg-red-700/80 hover:bg-red-600 active:bg-red-800 text-white"
            >
              {sending ? '⏳ Envoi…' : '✕ Fermer au marché'}
            </button>
            <button
              disabled={!canClose || sending}
              onClick={() => doClose('maker')}
              className="flex-1 py-2 rounded-lg text-xs font-bold transition-colors
                disabled:opacity-40 disabled:cursor-not-allowed
                bg-gray-700 hover:bg-gray-600 active:bg-gray-800 text-white"
            >
              Fermer en limite
            </button>
          </div>
          {!canClose && (
            <p className="text-xs text-yellow-500">
              Clés manquantes pour {platformLabel(pos.platform)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Composant principal ─────────────────────────────────────────────────────

/**
 * @param {object}   credentials   - cles de toutes les plateformes
 * @param {Array}    markets       - liste unifiee des marches (depuis useLivePrices)
 * @param {Function} getPrice      - (marketId, platformId) => number|null
 * @param {number}   [refreshMs=15000]   - intervalle de rafraichissement des positions en ms
 * @param {number}   [tolerancePct=0.05] - tolerance notional pour le matching DN
 */
export default function OpenTradesPanel({
  refreshMs    = 15_000,
  tolerancePct = 0.05,
}) {
  const credentials              = useWallet()
  const { markets, getPrice }    = useLivePrices(3000)
  const [feedback, setFeedback] = useState(null)

  // reload() a une reference stable grace aux refs internes de useOpenPositions
  const { positions, loading, reload } = useOpenPositions(credentials, markets, getPrice)

  const { pairs, singles } = useDeltaNeutralPairs(positions, getPrice, tolerancePct)

  // Chargement initial uniquement — l'intervalle utilise une ref pour eviter
  // de recrer le setInterval si reload change (il ne change pas, mais par securite)
  const reloadRef = useRef(reload)
  reloadRef.current = reload

  useEffect(() => {
    reloadRef.current()
    const t = setInterval(() => reloadRef.current(), refreshMs)
    return () => clearInterval(t)
  }, [refreshMs]) // <- reload absent des deps : l'interval ne redémarre jamais

  useEffect(() => {
    if (!feedback) return
    const t = setTimeout(() => setFeedback(null), 5000)
    return () => clearTimeout(t)
  }, [feedback])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-white">Positions ouvertes</h2>
          {(pairs.length > 0 || singles.length > 0) && (
            <span className="text-xs text-gray-400">
              {pairs.length > 0 && (
                <span className="text-indigo-400 font-semibold">
                  {pairs.length} paire{pairs.length > 1 ? 's' : ''} ΔN
                </span>
              )}
              {pairs.length > 0 && singles.length > 0 && ' · '}
              {singles.length > 0 && `${singles.length} solo`}
            </span>
          )}
        </div>
        <button
          onClick={reload}
          disabled={loading}
          className="text-xs text-gray-400 hover:text-white transition-colors disabled:opacity-40"
          title="Rafraîchir"
        >
          {loading ? '⏳' : '↻'} Actualiser
        </button>
      </div>

      {feedback && (
        <div className={`text-sm px-4 py-2 rounded-lg font-medium ${
          feedback.ok ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'
        }`}>
          {feedback.msg}
        </div>
      )}

      {!loading && pairs.length === 0 && singles.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <div className="text-3xl mb-2">📭</div>
          <p>Aucune position ouverte détectée</p>
        </div>
      )}

      {pairs.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-indigo-400 uppercase tracking-widest font-semibold px-1">
            Paires delta-neutral détectées
          </p>
          {pairs.map(pair => (
            <PairRow
              key={pair.id}
              pair={pair}
              credentials={credentials}
              markets={markets}
              onFeedback={setFeedback}
            />
          ))}
        </div>
      )}

      {singles.length > 0 && (
        <div className="space-y-2">
          {pairs.length > 0 && (
            <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold px-1 pt-2">
              Positions individuelles
            </p>
          )}
          {singles.map(pos => (
            <SingleRow
              key={pos._id}
              pos={pos}
              credentials={credentials}
              markets={markets}
              onFeedback={setFeedback}
            />
          ))}
        </div>
      )}
    </div>
  )
}
