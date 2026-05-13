// src/pages/ManagePositions.jsx
import { useEffect, useState, useCallback, useRef } from 'react'
import { useWallet }               from '../context/WalletContext'
import { useLivePrices }           from '../hooks/useLivePrices'
import { useOpenPositions }        from '../hooks/useOpenPositions'
import { useDeltaNeutralPairs }    from '../hooks/useDeltaNeutralPairs'
import { usePlaceOrder }           from '../hooks/usePlaceOrder'
import { canTrade }                from '../services/orderService'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtUSD = v => {
  if (v == null || isNaN(v)) return '—'
  const abs = Math.abs(v)
  const s = abs >= 1000
    ? abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : abs.toFixed(2)
  return (v < 0 ? '-' : '+') + '$' + s
}

const fmtPx = v => v != null && !isNaN(v)
  ? `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`
  : '—'

const fmtSize = v => v != null && !isNaN(v)
  ? Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })
  : '—'

const pnlClass = v => `mp-pnl--${(v ?? 0) >= 0 ? 'pos' : 'neg'}`

const PLATFORM_LABELS = {
  hyperliquid: 'Hyperliquid', extended: 'Extended',
  nado: 'Nado', xyz: 'HIP-3', hyena: 'HyENA',
}
const platLabel = id => PLATFORM_LABELS[id] ?? id
const platClass = id => `mp-leg__platform mp-leg__platform--${id}`

// ─── Hook : calcule MID / BEST BID / BEST ASK pour un leg ────────────────────
function useLimitPriceOptions(pos, markets, getPrice) {
  const [bestBid, setBestBid] = useState(null)
  const [bestAsk, setBestAsk] = useState(null)

  const market = markets.find(m => m.id === pos?.marketId)
  const mid    = pos ? (getPrice?.(pos.marketId) ?? pos.markPx ?? pos.entryPx) : null

  useEffect(() => {
    if (!market || !pos) return
    let cancelled = false

    // xyz et hyena vivent dans hyperliquid.js
    const platformFile = ['xyz', 'hyena'].includes(pos.platform)
      ? 'hyperliquid'
      : pos.platform

    import('../platforms/' + platformFile + '.js')
      .then(mod => {
        if (!mod.getFundingRate) {
          console.warn(`[useLimitPriceOptions] ${pos.platform} n'a pas getFundingRate`)
          return null
        }
        return mod.getFundingRate(market, {})
      })
      .then(data => {
        if (cancelled || !data) return
        console.log(`[useLimitPriceOptions] ${pos.platform}/${pos.marketId}`, {
          bid: data.bid, ask: data.ask, mid,
        })
        setBestBid(data?.bid ?? null)
        setBestAsk(data?.ask ?? null)
      })
      .catch(e => {
        console.error(`[useLimitPriceOptions] ${pos.platform} getFundingRate error:`, e.message)
      })

    return () => { cancelled = true }
  }, [pos?.marketId, pos?.platform])

  return { mid, bestBid, bestAsk }
}

// ─── Calcul breakeven ─────────────────────────────────────────────────────────
function computeBreakevenPrices({ long, short, includeFees, feePct = 0.0005 }) {
  const entryL = long.entryPx  || 0, entryS = short.entryPx || 0
  const markL  = long.markPx   || entryL, markS = short.markPx || entryS
  const sziL   = long.szi      || 0,      sziS  = short.szi   || 0
  const pnlL   = (markL - entryL) * sziL, pnlS  = (entryS - markS) * sziS
  const feesL  = includeFees ? markL * sziL * feePct : 0
  const feesS  = includeFees ? markS * sziS * feePct : 0
  const totalFees = feesL + feesS
  const pnlNet    = pnlL + pnlS - totalFees
  const adjFeeL   = includeFees ? (1 - feePct) : 1
  const adjFeeS   = includeFees ? (1 + feePct) : 1
  const tpLong    = sziL > 0 ? (entryL * sziL - pnlS + feesS) / (sziL * adjFeeL) : null
  const slShort   = sziS > 0 ? (entryS * sziS + pnlL - feesL) / (sziS * adjFeeS) : null
  return { tpLong, slShort, pnlNet, pnlL, pnlS, totalFees }
}

// ─── LegCard ─────────────────────────────────────────────────────────────────
function LegCard({ pos }) {
  const notional = pos.szi * (pos.markPx ?? pos.entryPx ?? 0)
  return (
    <div className="mp-leg">
      <div className="mp-leg__header">
        <span className={platClass(pos.platform)}>{platLabel(pos.platform)}</span>
        <span className={`mp-leg__side mp-leg__side--${pos.side.toLowerCase()}`}>{pos.side}</span>
      </div>
      <div className="mp-leg__rows">
        <div className="mp-leg__row">
          <span className="mp-leg__row-label">Size</span>
          <span className="mp-leg__row-value">
            {fmtSize(pos.szi)}{' '}
            <span style={{ color: 'var(--color-text-faint)' }}>
              ({fmtUSD(notional).replace(/^[+-]/, '')})
            </span>
          </span>
        </div>
        <div className="mp-leg__row">
          <span className="mp-leg__row-label">Entry</span>
          <span className="mp-leg__row-value">{fmtPx(pos.entryPx)}</span>
        </div>
        <div className="mp-leg__row">
          <span className="mp-leg__row-label">Mark</span>
          <span className="mp-leg__row-value">{fmtPx(pos.markPx)}</span>
        </div>
        <div className="mp-leg__row">
          <span className="mp-leg__row-label">PnL non-réalisé</span>
          <span className={`mp-leg__row-value ${pnlClass(pos.unrealizedPnl ?? 0)}`}>
            {fmtUSD(pos.unrealizedPnl ?? 0)}
          </span>
        </div>
        {pos.fundingPnl != null && pos.fundingPnl !== 0 && (
          <div className="mp-leg__row">
            <span className="mp-leg__row-label">Funding</span>
            <span className={`mp-leg__row-value ${pnlClass(pos.fundingPnl)}`}>
              {fmtUSD(pos.fundingPnl)}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── LimitPriceSelector — sélecteur de prix + input + bouton envoyer ─────────
// onSend(price, 'maker') est appelé uniquement au clic du bouton "Fermer en limite"
function LimitPriceSelector({ pos, markets, getPrice, disabled, onSend, label = 'Fermer en limite' }) {
  const [limitPrice, setLimitPrice] = useState(null)
  const { mid, bestBid, bestAsk }   = useLimitPriceOptions(pos, markets, getPrice)

  const isLong    = pos.side === 'LONG'
  const bestPrice = isLong ? bestBid : bestAsk
  const bestLabel = isLong ? 'BEST BID' : 'BEST ASK'

  return (
    <div className="mp-limit-selector">
      {/* Ligne 1 : boutons de présélection */}
      <div className="mp-limit-preset-btns">
        <button
          className={`mp-limit-preset${limitPrice === mid ? ' mp-limit-preset--active' : ''}`}
          disabled={disabled || mid == null}
          onClick={() => setLimitPrice(mid)}
          title={mid ? `Mid : ${fmtPx(mid)}` : 'Indisponible'}
        >
          MID{mid ? ` ${fmtPx(mid)}` : ''}
        </button>
        <button
          className={`mp-limit-preset${limitPrice === bestPrice ? ' mp-limit-preset--active' : ''}`}
          disabled={disabled || bestPrice == null}
          onClick={() => setLimitPrice(bestPrice)}
          title={bestPrice ? `${bestLabel} : ${fmtPx(bestPrice)}` : 'Indisponible'}
        >
          {bestLabel}{bestPrice ? ` ${fmtPx(bestPrice)}` : ''}
        </button>
      </div>

      {/* Ligne 2 : input + bouton envoi */}
      <div className="mp-limit-send-row">
        <input
          className="mp-limit-input"
          type="number"
          step="any"
          placeholder="Prix limite"
          value={limitPrice ?? ''}
          onChange={e => setLimitPrice(e.target.value ? parseFloat(e.target.value) : null)}
        />
        <button
          className="mp-limit-send-btn"
          disabled={disabled || limitPrice == null}
          onClick={() => onSend(limitPrice, 'maker')}
        >
          {label}
        </button>
      </div>
    </div>
  )
}

// ─── PairRow ─────────────────────────────────────────────────────────────────
function PairRow({ pair, credentials, markets, getPrice, onFeedback }) {
  const [open,        setOpen]        = useState(false)
  const [includeFees, setIncludeFees] = useState(true)
  const [sending,     setSending]     = useState(false)

  // Prix limites pour la fermeture simultanée des 2 legs
  const [limitPriceLong,  setLimitPriceLong]  = useState(null)
  const [limitPriceShort, setLimitPriceShort] = useState(null)

  const { placeOrder } = usePlaceOrder(markets)

  const be     = computeBreakevenPrices({ long: pair.long, short: pair.short, includeFees })
  const market = markets.find(m => m.id === pair.marketId)

  // Ferme un seul leg (marché ou limite)
  const doCloseLeg = useCallback(async (leg, orderType = 'taker', limitPrice = null) => {
    if (!market) throw new Error(`Marché ${pair.marketId} introuvable`)
    return placeOrder({
      platformId: leg.platform, marketId: pair.marketId,
      isBuy: leg.side === 'SHORT', size: leg.szi,
      limitPrice: limitPrice ?? leg.markPx ?? leg.entryPx,
      orderType, reduceOnly: true, ...credentials,
    })
  }, [market, pair.marketId, placeOrder, credentials])

  // Ferme un leg en limite depuis LimitPriceSelector
  const doCloseLegLimit = useCallback(async (leg, price, orderType) => {
    setSending(true); onFeedback?.(null)
    try {
      await doCloseLeg(leg, orderType, price)
      onFeedback?.({ ok: true, msg: `✅ Leg ${leg.side} fermé en limite (${fmtPx(price)})` })
    } catch (e) {
      onFeedback?.({ ok: false, msg: `❌ ${e.message}` })
    } finally { setSending(false) }
  }, [doCloseLeg, onFeedback])

  // Ferme les 2 legs simultanément au marché
  const doCloseBothMarket = useCallback(async () => {
    setSending(true); onFeedback?.(null)
    try {
      const results = await Promise.allSettled([
        doCloseLeg(pair.long,  'taker'),
        doCloseLeg(pair.short, 'taker'),
      ])
      const errors = results.filter(r => r.status === 'rejected').map(r => r.reason?.message)
      onFeedback?.(errors.length === 0
        ? { ok: true,  msg: '✅ Les deux legs fermés au marché' }
        : { ok: false, msg: `⚠️ Partiel : ${errors.join(' | ')}` })
    } catch (e) {
      onFeedback?.({ ok: false, msg: `❌ ${e.message}` })
    } finally { setSending(false) }
  }, [pair, doCloseLeg, onFeedback])

  // Ferme les 2 legs simultanément en limite
  const doCloseBothLimit = useCallback(async () => {
    if (limitPriceLong == null || limitPriceShort == null) return
    setSending(true); onFeedback?.(null)
    try {
      const results = await Promise.allSettled([
        doCloseLeg(pair.long,  'maker', limitPriceLong),
        doCloseLeg(pair.short, 'maker', limitPriceShort),
      ])
      const errors = results.filter(r => r.status === 'rejected').map(r => r.reason?.message)
      onFeedback?.(errors.length === 0
        ? { ok: true,  msg: '✅ Les deux legs fermés en limite' }
        : { ok: false, msg: `⚠️ Partiel : ${errors.join(' | ')}` })
    } catch (e) {
      onFeedback?.({ ok: false, msg: `❌ ${e.message}` })
    } finally { setSending(false) }
  }, [pair, doCloseLeg, limitPriceLong, limitPriceShort, onFeedback])

  const canCloseL    = canTrade(pair.long.platform,  credentials)
  const canCloseS    = canTrade(pair.short.platform, credentials)
  const canCloseBoth = canCloseL && canCloseS

  // Helpers bid/ask pour les sélecteurs de la fermeture simultanée
  const longOptions  = useLimitPriceOptions(pair.long,  markets, getPrice)
  const shortOptions = useLimitPriceOptions(pair.short, markets, getPrice)

  return (
    <div className="mp-pair">
      <button className="mp-pair__toggle" onClick={() => setOpen(o => !o)}>
        <div className="mp-pair__toggle-left">
          <span className="mp-pair__badge">ΔN</span>
          <span className="mp-pair__name">{pair.label}</span>
          <span className="mp-pair__platforms">
            {platLabel(pair.long.platform)} ↔ {platLabel(pair.short.platform)}
          </span>
        </div>
        <div className="mp-pair__toggle-right">
          <span className={`mp-pair__pnl ${pnlClass(pair.pnlNet)}`}>
            PnL net : {fmtUSD(pair.pnlNet)}
          </span>
          {Math.abs(pair.deltaUsd) > 1 && (
            <span className="mp-pair__delta-warn">Δ {fmtUSD(pair.deltaUsd)}</span>
          )}
          <span className="mp-chevron">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="mp-pair__body">
          <div className="mp-legs">
            <LegCard pos={pair.long} />
            <div className="mp-pair-center">
              <span className="mp-pair-center__name">{pair.label}</span>
              <span className={`mp-pair-center__pnl ${pnlClass(pair.pnlNet)}`}>{fmtUSD(pair.pnlNet)}</span>
              <span className="mp-pair-center__sub">PnL combiné</span>
              {Math.abs(pair.deltaUsd) > 1 && (
                <span className="mp-pair-center__delta">
                  Δ {Math.abs(pair.deltaUsd) < 1000
                    ? pair.deltaUsd.toFixed(0)
                    : (pair.deltaUsd / 1000).toFixed(1) + 'k'} $
                </span>
              )}
            </div>
            <LegCard pos={pair.short} />
          </div>

          <div className="mp-close-block">
            <div className="mp-close-block__header">
              <span className="mp-close-block__title">⚡ Fermeture simultanée</span>
              <label className="mp-close-block__fees-toggle">
                <input type="checkbox" checked={includeFees}
                  onChange={e => setIncludeFees(e.target.checked)} />
                Inclure les fees
              </label>
            </div>

            {/* Breakeven */}
            <div className="mp-be-grid">
              <div className="mp-be-card mp-be-card--long">
                <div className="mp-be-card__label">
                  Prix fermeture LONG{' '}
                  <span className={platClass(pair.long.platform)}>({platLabel(pair.long.platform)})</span>
                </div>
                <div className="mp-be-card__price">{fmtPx(be.tpLong)}</div>
                <div className="mp-be-card__sub">Pour PnL combiné ≈ 0</div>
              </div>
              <div className="mp-be-card mp-be-card--short">
                <div className="mp-be-card__label">
                  Prix fermeture SHORT{' '}
                  <span className={platClass(pair.short.platform)}>({platLabel(pair.short.platform)})</span>
                </div>
                <div className="mp-be-card__price">{fmtPx(be.slShort)}</div>
                <div className="mp-be-card__sub">Pour PnL combiné ≈ 0</div>
              </div>
            </div>

            <div className="mp-pnl-detail">
              <span>PnL long : <span className={pnlClass(be.pnlL)}>{fmtUSD(be.pnlL)}</span></span>
              <span>PnL short : <span className={pnlClass(be.pnlS)}>{fmtUSD(be.pnlS)}</span></span>
              {includeFees && (
                <span>Fees : <span style={{ color: 'var(--color-warning)' }}>{fmtUSD(-be.totalFees)}</span></span>
              )}
              <span>
                <strong className={pnlClass(be.pnlNet)}>PnL net estimé : {fmtUSD(be.pnlNet)}</strong>
              </span>
            </div>

            {/* ── Fermeture leg par leg en limite ───────────────────────── */}
            <div className="mp-leg-limit-block">
              <div className="mp-leg-limit-row">
                <span className="mp-leg-limit-label">
                  Fermer LONG{' '}
                  <span className={platClass(pair.long.platform)}>({platLabel(pair.long.platform)})</span>
                </span>
                <LimitPriceSelector
                  pos={pair.long}
                  markets={markets}
                  getPrice={getPrice}
                  disabled={!canCloseL || sending}
                  onSend={(price, type) => doCloseLegLimit(pair.long, price, type)}
                  label="Fermer ce leg"
                />
              </div>
              <div className="mp-leg-limit-row">
                <span className="mp-leg-limit-label">
                  Fermer SHORT{' '}
                  <span className={platClass(pair.short.platform)}>({platLabel(pair.short.platform)})</span>
                </span>
                <LimitPriceSelector
                  pos={pair.short}
                  markets={markets}
                  getPrice={getPrice}
                  disabled={!canCloseS || sending}
                  onSend={(price, type) => doCloseLegLimit(pair.short, price, type)}
                  label="Fermer ce leg"
                />
              </div>
            </div>

            {/* ── Fermeture simultanée des 2 legs ───────────────────────── */}
            <div className="mp-close-both-block">
              {/* Marché */}
              <button
                className="mp-close-both-btn mp-close-both-btn--market"
                disabled={!canCloseBoth || sending}
                onClick={doCloseBothMarket}
              >
                {sending
                  ? <><span className="mp-spin">⟳</span> Envoi en cours…</>
                  : '⚡ Fermer les 2 legs au marché'}
              </button>

              {/* Limite simultanée — sélection des 2 prix + bouton */}
              <div className="mp-close-both-limit">
                <span className="mp-close-both-limit__title">⚡ Fermer les 2 legs en limite</span>
                <div className="mp-close-both-limit__inputs">
                  {/* Prix LONG */}
                  <div className="mp-close-both-limit__leg">
                    <span className="mp-close-both-limit__leg-label">
                      LONG <span className={platClass(pair.long.platform)}>({platLabel(pair.long.platform)})</span>
                    </span>
                    <div className="mp-limit-preset-btns">
                      <button
                        className={`mp-limit-preset${limitPriceLong === longOptions.mid ? ' mp-limit-preset--active' : ''}`}
                        disabled={!canCloseBoth || sending || longOptions.mid == null}
                        onClick={() => setLimitPriceLong(longOptions.mid)}
                      >
                        MID{longOptions.mid ? ` ${fmtPx(longOptions.mid)}` : ''}
                      </button>
                      <button
                        className={`mp-limit-preset${limitPriceLong === longOptions.bestBid ? ' mp-limit-preset--active' : ''}`}
                        disabled={!canCloseBoth || sending || longOptions.bestBid == null}
                        onClick={() => setLimitPriceLong(longOptions.bestBid)}
                      >
                        BEST BID{longOptions.bestBid ? ` ${fmtPx(longOptions.bestBid)}` : ''}
                      </button>
                    </div>
                    <input
                      className="mp-limit-input"
                      type="number" step="any" placeholder="Prix LONG"
                      value={limitPriceLong ?? ''}
                      onChange={e => setLimitPriceLong(e.target.value ? parseFloat(e.target.value) : null)}
                    />
                  </div>

                  {/* Prix SHORT */}
                  <div className="mp-close-both-limit__leg">
                    <span className="mp-close-both-limit__leg-label">
                      SHORT <span className={platClass(pair.short.platform)}>({platLabel(pair.short.platform)})</span>
                    </span>
                    <div className="mp-limit-preset-btns">
                      <button
                        className={`mp-limit-preset${limitPriceShort === shortOptions.mid ? ' mp-limit-preset--active' : ''}`}
                        disabled={!canCloseBoth || sending || shortOptions.mid == null}
                        onClick={() => setLimitPriceShort(shortOptions.mid)}
                      >
                        MID{shortOptions.mid ? ` ${fmtPx(shortOptions.mid)}` : ''}
                      </button>
                      <button
                        className={`mp-limit-preset${limitPriceShort === shortOptions.bestAsk ? ' mp-limit-preset--active' : ''}`}
                        disabled={!canCloseBoth || sending || shortOptions.bestAsk == null}
                        onClick={() => setLimitPriceShort(shortOptions.bestAsk)}
                      >
                        BEST ASK{shortOptions.bestAsk ? ` ${fmtPx(shortOptions.bestAsk)}` : ''}
                      </button>
                    </div>
                    <input
                      className="mp-limit-input"
                      type="number" step="any" placeholder="Prix SHORT"
                      value={limitPriceShort ?? ''}
                      onChange={e => setLimitPriceShort(e.target.value ? parseFloat(e.target.value) : null)}
                    />
                  </div>
                </div>

                <button
                  className="mp-close-both-btn mp-close-both-btn--limit"
                  disabled={!canCloseBoth || sending || limitPriceLong == null || limitPriceShort == null}
                  onClick={doCloseBothLimit}
                >
                  {sending
                    ? <><span className="mp-spin">⟳</span> Envoi en cours…</>
                    : '⚡ Envoyer les 2 ordres limites'}
                </button>
              </div>
            </div>

            {!canCloseBoth && (
              <p className="mp-keys-warning">
                Clés manquantes pour{' '}
                {!canCloseL ? platLabel(pair.long.platform) : platLabel(pair.short.platform)}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── SingleRow ────────────────────────────────────────────────────────────────
function SingleRow({ pos, credentials, markets, getPrice, onFeedback }) {
  const [open,    setOpen]    = useState(false)
  const [sending, setSending] = useState(false)
  const { placeOrder } = usePlaceOrder(markets)

  const market   = markets.find(m => m.id === pos.marketId)
  const canClose = canTrade(pos.platform, credentials)
  const notional = pos.szi * (pos.markPx ?? pos.entryPx ?? 0)

  const doClose = useCallback(async (orderType = 'taker', price = null) => {
    if (!market) throw new Error(`Marché ${pos.marketId} introuvable`)
    setSending(true); onFeedback?.(null)
    try {
      await placeOrder({
        platformId: pos.platform, marketId: pos.marketId,
        isBuy: pos.side === 'SHORT', size: pos.szi,
        limitPrice: price ?? pos.markPx ?? pos.entryPx,
        orderType, reduceOnly: true, ...credentials,
      })
      onFeedback?.({ ok: true, msg: `✅ Ordre de fermeture envoyé (${pos.label})` })
    } catch (e) {
      onFeedback?.({ ok: false, msg: `❌ ${e.message}` })
    } finally { setSending(false) }
  }, [pos, market, placeOrder, credentials, onFeedback])

  return (
    <div className="mp-single">
      <button className="mp-single__toggle" onClick={() => setOpen(o => !o)}>
        <div className="mp-single__toggle-left">
          <span className={platClass(pos.platform)}>{platLabel(pos.platform)}</span>
          <span className="mp-single__name">{pos.label}</span>
          <span className={`mp-leg__side mp-leg__side--${pos.side.toLowerCase()}`}>{pos.side}</span>
        </div>
        <div className="mp-single__toggle-right">
          <span className="mp-single__notional">
            {fmtSize(pos.szi)} — {fmtUSD(notional).replace(/^[+-]/, '')} notionnel
          </span>
          <span className={`mp-single__pnl ${pnlClass(pos.unrealizedPnl ?? 0)}`}>
            {fmtUSD(pos.unrealizedPnl ?? 0)}
          </span>
          <span className="mp-chevron">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="mp-single__body">
          <div className="mp-single__stats">
            <div className="mp-single__stat">
              <span className="mp-single__stat-label">Entry</span>
              <span className="mp-single__stat-value">{fmtPx(pos.entryPx)}</span>
            </div>
            <div className="mp-single__stat">
              <span className="mp-single__stat-label">Mark</span>
              <span className="mp-single__stat-value">{fmtPx(pos.markPx)}</span>
            </div>
            <div className="mp-single__stat">
              <span className="mp-single__stat-label">Notionnel</span>
              <span className="mp-single__stat-value">{fmtUSD(notional).replace(/^[+-]/, '')}</span>
            </div>
            <div className="mp-single__stat">
              <span className="mp-single__stat-label">PnL non-réalisé</span>
              <span className={`mp-single__stat-value ${pnlClass(pos.unrealizedPnl ?? 0)}`}>
                {fmtUSD(pos.unrealizedPnl ?? 0)}
              </span>
            </div>
          </div>

          <div className="mp-single__actions">
            {/* Fermeture marché */}
            <button
              className="mp-single__close-market"
              disabled={!canClose || sending}
              onClick={() => doClose('taker')}
            >
              {sending ? <><span className="mp-spin">⟳</span> Envoi…</> : '✕ Fermer au marché'}
            </button>

            {/* Fermeture limite */}
            <div className="mp-single__limit-section">
              <span className="mp-single__limit-label">Fermer en limite :</span>
              <LimitPriceSelector
                pos={pos}
                markets={markets}
                getPrice={getPrice}
                disabled={!canClose || sending}
                onSend={(price, type) => doClose(type, price)}
                label="Fermer en limite"
              />
            </div>
          </div>

          {!canClose && (
            <p className="mp-keys-warning">Clés manquantes pour {platLabel(pos.platform)}</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function ManagePositions() {
  const credentials             = useWallet()
  const { markets, getPrice }   = useLivePrices(3000)
  const [feedback, setFeedback] = useState(null)

  const { positions, loading, reload } = useOpenPositions(credentials, markets, getPrice)
  const { pairs, singles }             = useDeltaNeutralPairs(positions, getPrice, 0.05)

  const reloadRef = useRef(reload)
  reloadRef.current = reload

  useEffect(() => {
    reloadRef.current()
    const t = setInterval(() => reloadRef.current(), 15_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!feedback) return
    const t = setTimeout(() => setFeedback(null), 5000)
    return () => clearTimeout(t)
  }, [feedback])

  return (
    <div className="mp-panel">
      <div className="mp-header">
        <div className="mp-header__left">
          <h2 className="mp-title">Positions ouvertes</h2>
          {(pairs.length > 0 || singles.length > 0) && (
            <span className="mp-count">
              {pairs.length > 0 && (
                <span className="mp-count__dn">
                  {pairs.length} paire{pairs.length > 1 ? 's' : ''} ΔN
                </span>
              )}
              {pairs.length > 0 && singles.length > 0 && ' · '}
              {singles.length > 0 && `${singles.length} solo`}
            </span>
          )}
        </div>
        <button className="mp-reload-btn" onClick={reload} disabled={loading}>
          {loading ? '⏳' : '↻'} Actualiser
        </button>
      </div>

      {feedback && (
        <div className={`mp-feedback mp-feedback--${feedback.ok ? 'ok' : 'error'}`}>
          {feedback.msg}
        </div>
      )}

      {!loading && pairs.length === 0 && singles.length === 0 && (
        <div className="mp-empty">
          <div className="mp-empty__icon">📭</div>
          <p className="mp-empty__text">Aucune position ouverte détectée</p>
        </div>
      )}

      {pairs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <p className="mp-section-label mp-section-label--dn">Paires delta-neutral détectées</p>
          {pairs.map(pair => (
            <PairRow key={pair.id} pair={pair}
              credentials={credentials} markets={markets}
              getPrice={getPrice} onFeedback={setFeedback} />
          ))}
        </div>
      )}

      {singles.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          {pairs.length > 0 && (
            <p className="mp-section-label mp-section-label--solo" style={{ paddingTop: 'var(--space-2)' }}>
              Positions individuelles
            </p>
          )}
          {singles.map(pos => (
            <SingleRow key={pos._id} pos={pos}
              credentials={credentials} markets={markets}
              getPrice={getPrice} onFeedback={setFeedback} />
          ))}
        </div>
      )}
    </div>
  )
}
