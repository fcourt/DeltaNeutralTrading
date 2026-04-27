// src/pages/OpenTrade.jsx
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useWallet } from '../context/WalletContext'
import { useLivePrices, PLATFORMS } from '../hooks/useLivePrices'
import { useMarketFilter }          from '../hooks/useMarketFilter'
import { useFundingRates }          from '../hooks/useFundingRates'
import { usePlaceOrder }            from '../hooks/usePlaceOrder'
import { useMargins }               from '../hooks/useMargins'
import { fmt, fmtUSD, fmtPct }     from '../utils/format'
import { loadFees, minLeverageFor, roundToHLPrice } from '../utils/trading'
import LeverageSlider   from '../components/ui/LeverageSlider'
import LiqPriceEstimate from '../components/ui/LiqPriceEstimate'
import TpSlPanel        from '../components/ui/TpSlPanel'
import {
  estimateFillPrice, calcDeltaNeutral,
  deltaScoreColor, deltaScoreLabel,
} from '../utils/deltaNeutral'

const PRICE_OFFSET = 0.0005

// ── LegCard ───────────────────────────────────────────────────────────────────
function LegCard({
  side, platform, price, limitPrice, leverage, sizeUSD, sizeAsset, marginAvailable,
  fundingRate, isSuggested, feesMaker, feesTaker, useStepSize, stepSize,
  onPlaceOrder, isPlacingOrder, canTrade, orderType, onOrderTypeChange,
  bid, ask, priceMode, onPriceModeChange, customPrice, onCustomPriceChange,
  isAdjustedLeg, leverageValue, onLeverageChange, autoLeverage, market, credentials,
}) {
  const { t } = useTranslation()
  const isLong     = side === 'LONG'
  const fundingNet = fundingRate != null ? (isLong ? -fundingRate : fundingRate) : null
  const receivePay = fundingNet == null ? null : fundingNet >= 0 ? t('openTrade.receives') : t('openTrade.pays')
  const sizeDisplay = useStepSize && stepSize && sizeAsset
    ? Math.floor(sizeAsset / stepSize) * stepSize
    : sizeAsset
  const feeMaker = sizeUSD != null ? sizeUSD * feesMaker : null
  const feeTaker = sizeUSD != null ? sizeUSD * feesTaker : null

  return (
    <div className={`leg-card ${isLong ? 'leg-card--long' : 'leg-card--short'}`}>

      <div className="leg-card__header">
        <div className="leg-card__header-left">
          <span className={`leg-badge ${isLong ? 'leg-badge--long' : 'leg-badge--short'}`}>{side}</span>
          <span className="leg-card__platform">{platform?.label}</span>
          {isAdjustedLeg && (
            <span className="leg-card__adjusted" title="Notionnel réduit pour delta neutral">⚡ Δ ajusté</span>
          )}
        </div>
        {isSuggested && <span className="leg-card__optimal">⭐ {t('openTrade.optimal')}</span>}
      </div>

      {/* Prix marché seul */}
      <div className="leg-stat">
        <p className="leg-stat__label">{t('openTrade.marketPrice')}</p>
        <p className="leg-stat__value">{price ? fmtUSD(price) : '—'}</p>
      </div>

      {/* Sélecteur de prix — bloc full-width */}
      <div className="leg-price-selector">
        <div className="leg-price-header">
          <p className="leg-stat__label">{t('openTrade.limitMaker')}</p>
          <div className="leg-price-btns">
            <button
              className={`leg-price-btn ${priceMode === 'market' ? 'leg-price-btn--active' : ''}`}
              onClick={() => onPriceModeChange('market')}
              title="Prix suggéré ±0.05%"
            >Market</button>
            <button
              className={`leg-price-btn ${priceMode === 'mid' ? 'leg-price-btn--active' : ''}`}
              onClick={() => onPriceModeChange('mid')}
              title="Mid du carnet"
            >Mid</button>
            <button
              className={`leg-price-btn ${priceMode === 'best' ? 'leg-price-btn--active' : ''}`}
              onClick={() => onPriceModeChange('best')}
              disabled={isLong ? !bid : !ask}
              title={isLong
                ? (bid ? `Best Bid : ${fmtUSD(bid)}` : 'Bid indisponible')
                : (ask ? `Best Ask : ${fmtUSD(ask)}` : 'Ask indisponible')}
            >
              {isLong ? 'Best Bid' : 'Best Ask'}
            </button>
          </div>
        </div>
        <input
          type="number"
          className={`leg-price-input ${priceMode === 'manual' ? 'leg-price-input--manual' : 'leg-price-input--auto'}`}
          value={priceMode === 'manual' ? customPrice : (limitPrice != null ? limitPrice.toFixed(2) : '')}
          onChange={e => {
            onCustomPriceChange(e.target.value)
            onPriceModeChange(e.target.value ? 'manual' : 'market')
          }}
          placeholder={limitPrice != null ? limitPrice.toFixed(2) : '—'}
        />
        {priceMode === 'manual' && (
          <button
            className="leg-price-reset"
            onClick={() => { onCustomPriceChange(''); onPriceModeChange('market') }}
          >↺ Reset</button>
        )}
      </div>

      <div className="leg-grid-2">
        <div className="leg-stat">
          <p className="leg-stat__label">{t('openTrade.notionalUSD')}</p>
          <p className="leg-stat__value">
            {fmtUSD(sizeUSD)}
            {isAdjustedLeg && sizeUSD != null && (
              <span className="leg-stat__sublabel" style={{ color: 'var(--color-gold)' }}> Δ ajusté</span>
            )}
          </p>
        </div>
        <div className="leg-stat">
          <p className="leg-stat__label">
            {t('openTrade.size')} {useStepSize && <span className="leg-step-badge">step</span>}
          </p>
          <p className="leg-stat__value">{sizeDisplay ? fmt(sizeDisplay, 6) : '—'}</p>
        </div>
      </div>

      <div className="leg-stat">
      <LeverageSlider
        value={leverageValue}
        onChange={onLeverageChange}
        min={1}
        max={50}
        side={isLong ? 'long' : 'short'}
        platform={platform?.id}
        market={market}
        credentials={credentials}
      />
      <LiqPriceEstimate
        entryPrice={limitPrice ?? price}
        leverage={leverageValue}
        side={isLong ? 'long' : 'short'}
      />
      </div>
      
        <div className="leg-stat">
          <p className="leg-stat__label">{t('openTrade.availableMargin')}</p>
          <p className={`leg-stat__value ${
            marginAvailable == null ? 'leg-stat__value--faint'
            : marginAvailable > 0  ? 'leg-stat__value--green'
            : 'leg-stat__value--red'
          }`}>
            {marginAvailable != null ? fmtUSD(marginAvailable) : '—'}
          </p>
        </div>
      </div>

      <div className="leg-stat leg-stat--block">
        <p className="leg-stat__label">{t('openTrade.funding1h')}</p>
        <div className="leg-funding-row">
          <div>
            <span className={`leg-funding-rate ${
              fundingRate == null ? 'leg-stat__value--faint'
              : fundingRate >= 0  ? 'leg-funding-rate--pos'
              : 'leg-funding-rate--neg'
            }`}>
              {fmtPct(fundingRate)}
            </span>
            <span className="leg-funding-annual">
              ({fmtPct(fundingRate != null ? fundingRate * 24 * 365 : null)} /an)
            </span>
          </div>
          {fundingNet != null && (
            <span className={`leg-funding-badge ${fundingNet >= 0 ? 'leg-funding-badge--pos' : 'leg-funding-badge--neg'}`}>
              {side} {receivePay} {t('openTrade.theFunding')}
            </span>
          )}
        </div>
      </div>

      <div className="leg-grid-2">
        <div className={`leg-stat ${orderType === 'taker' ? 'leg-stat--taker-active' : ''}`}>
          <p className="leg-stat__label">{t('openTrade.feesTaker')}</p>
          <p className="leg-stat__value leg-stat__value--yellow">{feeTaker != null ? fmtUSD(feeTaker) : '—'}</p>
          <p className="leg-stat__sublabel">{(feesTaker * 100).toFixed(3)}%</p>
        </div>
        <div className={`leg-stat ${orderType === 'maker' ? 'leg-stat--maker-active' : ''}`}>
          <p className="leg-stat__label">{t('openTrade.feesMaker')}</p>
          <p className="leg-stat__value leg-stat__value--yellow">{feeMaker != null ? fmtUSD(feeMaker) : '—'}</p>
          <p className="leg-stat__sublabel">{(feesMaker * 100).toFixed(3)}%</p>
        </div>
      </div>

      <div className="leg-order-toggle">
        <button
          onClick={() => onOrderTypeChange('taker')}
          className={`leg-order-btn ${orderType === 'taker' ? 'leg-order-btn--taker-active' : 'leg-order-btn--inactive'}`}
        >
          ⚡ Market — Taker
        </button>
        <button
          onClick={() => onOrderTypeChange('maker')}
          className={`leg-order-btn ${orderType === 'maker' ? 'leg-order-btn--maker-active' : 'leg-order-btn--inactive'}`}
        >
          📋 Limit — Maker
        </button>
      </div>

      {sizeDisplay && (
        <div className="leg-actions">
          <button
            onClick={() => navigator.clipboard.writeText(sizeDisplay.toFixed(6))}
            className="leg-copy-btn"
          >
            📋 {t('openTrade.copySize')} : {fmt(sizeDisplay, 6)}
          </button>
          {canTrade ? (
            <button
              onClick={onPlaceOrder}
              disabled={isPlacingOrder || !limitPrice || !sizeDisplay}
              className={`leg-place-btn ${isLong ? 'leg-place-btn--long' : 'leg-place-btn--short'}`}
            >
              {isPlacingOrder
                ? <><span className="leg-spin">⟳</span> {t('openTrade.sending')}</>
                : <>{isLong ? '🟢' : '🔴'} {t('openTrade.openSide')} {side} {t('openTrade.on')} {platform?.label}</>}
            </button>
          ) : (
            <div className="leg-locked">🔒 {t('openTrade.configureKeys')}</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── OpenTrade page ────────────────────────────────────────────────────────────
export default function OpenTrade() {
  const { t } = useTranslation()
  const {
    hlAddress, hlVaultAddress, hlAgentPk,
    extApiKey, extStarkPk, extL2Vault,
    nadoAddress, nadoAgentPk, nadoSubaccount,
    canTradeHL, canTradeExt, canTradeNado,
  } = useWallet()

  const [platform1,        setPlatform1]        = useState('hyperliquid')
  const [platform2,        setPlatform2]        = useState('extended')
  const [marketId,         setMarketId]         = useState('')
  const [sizeUSD,          setSizeUSD]          = useState('')
  const [useStepSize,      setUseStepSize]      = useState(false)
  const [fees,             setFees]             = useState(loadFees)
  const [orderType1,       setOrderType1]       = useState('maker')
  const [orderType2,       setOrderType2]       = useState('maker')
  const [placingLeg1,      setPlacingLeg1]      = useState(false)
  const [placingLeg2,      setPlacingLeg2]      = useState(false)
  const [tradeStatus,      setTradeStatus]      = useState(null)
  const [loadedPosition1,  setLoadedPosition1]  = useState(null)
  const [loadedPosition2,  setLoadedPosition2]  = useState(null)
  const [priceMode1,       setPriceMode1]       = useState('market')
  const [priceMode2,       setPriceMode2]       = useState('market')
  const [customPrice1,     setCustomPrice1]     = useState('')
  const [customPrice2,     setCustomPrice2]     = useState('')
  //const [leverageOverride, setLeverageOverride] = useState('')  // '' = auto
  const [leverage1,  setLeverage1]  = useState(null) // null = auto
  const [leverage2,  setLeverage2]  = useState(null) // null = auto
  const [tpSlConfig, setTpSlConfig] = useState(null)

  const credentials = useMemo(() => ({
    hlAddress, hlVaultAddress, hlAgentPk,
    extApiKey, extStarkPk, extL2Vault,
    nadoAddress, nadoAgentPk, nadoSubaccount,
  }), [hlAddress, hlVaultAddress, hlAgentPk, extApiKey, extStarkPk, extL2Vault,
      nadoAddress, nadoAgentPk, nadoSubaccount])

  const { markets, getPrice, getStepSize, getAssetMeta, getExtPrecision, lastUpdate } = useLivePrices(3000)
  const { filteredMarkets, loading, errors, isIntersection, counts } = useMarketFilter(platform1, platform2, markets)
  const { p1: fundingP1, p2: fundingP2, p1Bid, p1Ask, p2Bid, p2Ask } =
    useFundingRates(marketId, platform1, platform2, extApiKey, markets)
  const { margins } = useMargins(credentials)
  const { placeOrder } = usePlaceOrder(markets)

  // Reset controls when market changes
  useEffect(() => {
    setPriceMode1('market')
    setPriceMode2('market')
    setCustomPrice1('')
    setCustomPrice2('')
    //setLeverageOverride('')
    setLeverage1(null)
    setLeverage2(null)
    setTpSlConfig(null)
  }, [marketId])

  useEffect(() => {
    if (!loading && filteredMarkets.length > 0 && marketId !== '') {
      if (!filteredMarkets.find(m => m.id === marketId)) setMarketId('')
    }
  }, [filteredMarkets, loading, marketId])

  const price1 = getPrice(marketId, platform1)
  const price2 = getPrice(marketId, platform2)
  const plat1  = PLATFORMS.find(p => p.id === platform1)
  const plat2  = PLATFORMS.find(p => p.id === platform2)
  const market = markets.find(m => m.id === marketId)

  const canTradePlatform     = (id) => id === 'extended' ? canTradeExt : id === 'nado' ? canTradeNado : canTradeHL
  const getMarginForPlatform = (id) => margins[id] ?? null

  const suggestion = useMemo(() => {
    if (fundingP1 == null || fundingP2 == null) return null
    return fundingP1 <= fundingP2 ? { p1: 'LONG', p2: 'SHORT' } : { p1: 'SHORT', p2: 'LONG' }
  }, [fundingP1, fundingP2])

  const side1 = suggestion?.p1 ?? 'LONG'
  const side2 = suggestion?.p2 ?? 'SHORT'

  const getDefaultLimitPrice = useCallback((platformId, side, price, bid, ask) => {
    if (platformId === 'extended')
      return side === 'LONG' ? (bid ?? price * (1 - PRICE_OFFSET)) : (ask ?? price * (1 + PRICE_OFFSET))
    if (platformId === 'nado')
      return Math.round(side === 'LONG' ? price * (1 - PRICE_OFFSET) : price * (1 + PRICE_OFFSET))
    return roundToHLPrice(side === 'LONG' ? price * (1 - PRICE_OFFSET) : price * (1 + PRICE_OFFSET))
  }, [])

  const getLimitPrice = useCallback((platformId, side, price, mode, customPx, bid, ask) => {
    if (!price) return null
    switch (mode) {
      case 'manual': return customPx ? parseFloat(customPx) : getDefaultLimitPrice(platformId, side, price, bid, ask)
      case 'mid':    return price
      case 'best':   return side === 'LONG' ? (bid ?? price * (1 - PRICE_OFFSET)) : (ask ?? price * (1 + PRICE_OFFSET))
      default:       return getDefaultLimitPrice(platformId, side, price, bid, ask)
    }
  }, [getDefaultLimitPrice])

  const calc = useMemo(() => {
    const val = parseFloat(sizeUSD)
    if (!val || val <= 0 || !price1 || !price2) return null

    const lp1 = getLimitPrice(platform1, side1, price1, priceMode1, customPrice1, p1Bid, p1Ask)
    const lp2 = getLimitPrice(platform2, side2, price2, priceMode2, customPrice2, p2Bid, p2Ask)

    // ── Estimated fill prices (most precise) ──────────────────────────────
    // Taker → fill at best ask (LONG) or best bid (SHORT)
    // Maker → fill at computed limit price
    const fill1 = estimateFillPrice({ orderType: orderType1, side: side1, mid: price1, bid: p1Bid, ask: p1Ask, limitPrice: lp1 })
    const fill2 = estimateFillPrice({ orderType: orderType2, side: side2, mid: price2, bid: p2Bid, ask: p2Ask, limitPrice: lp2 })

    // ── Delta neutral sizing ───────────────────────────────────────────────
    const dn = calcDeltaNeutral({ sizeUSD: val, fillPrice1: fill1, fillPrice2: fill2 })

    const notional1 = dn?.notional1 ?? val
    const notional2 = dn?.notional2 ?? val
    const qty       = dn?.qty ?? null   // same for both legs

    // ── Leverage ──────────────────────────────────────────────────────────
    const margin1    = getMarginForPlatform(platform1)
    const margin2    = getMarginForPlatform(platform2)
    const autoLev1   = minLeverageFor(notional1, margin1) ?? 1
    const autoLev2   = minLeverageFor(notional2, margin2) ?? 1
    const autoLeverage = Math.max(autoLev1, autoLev2)    // align both to highest required
    //const leverage = leverageOverride
    //  ? Math.max(parseFloat(leverageOverride), 1)
    //  : autoLeverage

    return {
      // ── Sizes ──────────────────────────────────────────────────────────
      asset1:    qty ?? val / price1,
      asset2:    qty ?? val / price2,
      notional1,
      notional2,
      // ── Prices ─────────────────────────────────────────────────────────
      limitP1:   lp1,
      limitP2:   lp2,
      fillP1:    fill1,
      fillP2:    fill2,
      // ── Spread & delta ─────────────────────────────────────────────────
      spreadPct: ((price1 - price2) / price2) * 100,
      deltaScore: dn?.deltaScore ?? null,
      deltaUSD:   dn?.deltaUSD   ?? null,
      cheaperLeg: dn?.cheaperLeg ?? null,
      // ── Leverage ───────────────────────────────────────────────────────
      //leverage,
      //autoLeverage,
      //leverageWarning: leverageOverride && parseFloat(leverageOverride) < autoLeverage,
      autoLeverage,
    }
  }, [
    sizeUSD, price1, price2, side1, side2, platform1, platform2, margins,
    priceMode1, priceMode2, customPrice1, customPrice2,
    p1Bid, p1Ask, p2Bid, p2Ask,
    orderType1, orderType2, getLimitPrice,
  ])

  const effLev1 = leverage1 ?? calc?.autoLeverage ?? 1
  const effLev2 = leverage2 ?? calc?.autoLeverage ?? 1

  const buildOrderParams = (platformId, side, sizeAsset, limitPrice, orderType, leverage) => {
    if (!market) throw new Error('Marché non résolu')
    const stepSize = getStepSize(marketId)
    const meta     = getAssetMeta(market.hlKey)
    const raw      = useStepSize && stepSize
      ? Math.floor(sizeAsset / stepSize) * stepSize
      : sizeAsset
    let finalSize
    if (platformId === 'extended') {
      finalSize = raw
    } else {
      const szDecimals = platformId === 'nado'
        ? (market.nadoSzDecimals ?? 6)
        : (meta?.szDecimals ?? Math.round(-Math.log10(stepSize || 0.01)))
      finalSize = parseFloat(raw.toFixed(szDecimals))
    }
    return {
      platformId, marketId,
      isBuy: side === 'LONG',
      size: finalSize,
      limitPrice, orderType, reduceOnly: false,
      leverage: leverage ?? null,
      market, ...credentials,
    }
  }

  const handlePlaceLeg = async (legNum) => {
    const setter     = legNum === 1 ? setPlacingLeg1 : setPlacingLeg2
    const platformId = legNum === 1 ? platform1 : platform2
    const side       = legNum === 1 ? side1 : side2
    const sizeAsset  = legNum === 1 ? calc?.asset1 : calc?.asset2
    const limitPx    = legNum === 1 ? calc?.limitP1 : calc?.limitP2
    const orderType  = legNum === 1 ? orderType1 : orderType2
    setter(true); setTradeStatus(null)
    try {
      await placeOrder(buildOrderParams(platformId, side, sizeAsset, limitPx, orderType, calc?.leverage))
      setTradeStatus({ type: 'success', msg: `✅ Ordre ${side} envoyé sur ${PLATFORMS.find(p => p.id === platformId)?.label}` })
    } catch (e) {
      setTradeStatus({ type: 'error', msg: `❌ ${e.message}` })
    } finally { setter(false) }
  }

  const handlePlaceBothLegs = async () => {
    setPlacingLeg1(true); setPlacingLeg2(true); setTradeStatus(null)
    try {
      await Promise.all([
        placeOrder(buildOrderParams(platform1, side1, calc?.asset1, calc?.limitP1, orderType1, calc?.leverage)),
        placeOrder(buildOrderParams(platform2, side2, calc?.asset2, calc?.limitP2, orderType2, calc?.leverage)),
      ])
      setTradeStatus({ type: 'success', msg: '✅ Les 2 legs envoyés simultanément !' })
    } catch (e) {
      setTradeStatus({ type: 'error', msg: `❌ ${e.message}` })
    } finally { setPlacingLeg1(false); setPlacingLeg2(false) }
  }

  const fresh = lastUpdate && (Date.now() - lastUpdate.getTime()) < 6000

  return (
    <div className="page-header">

      {/* Header statut */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <h2 className="page-title" style={{ marginBottom: 0 }}>{t('openTrade.title')}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--color-text-faint)' }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: fresh ? '#6cdfa9' : '#fbbf24' }} />
          {lastUpdate ? `MAJ ${lastUpdate.toLocaleTimeString('fr-FR')}` : t('openTrade.loading')}
        </div>
      </div>

      {/* Sélecteurs */}
      <div className="ot-selectors">
        <div className="ot-select-group">
          <label className="ot-label">{t('openTrade.platform1')}</label>
          <select value={platform1} onChange={e => setPlatform1(e.target.value)} className="ot-select">
            {PLATFORMS.filter(p => p.id !== platform2).map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>

        <div className="ot-select-group">
          <label className="ot-label">{t('openTrade.platform2')}</label>
          <select value={platform2} onChange={e => setPlatform2(e.target.value)} className="ot-select">
            <option value="">— {t('openTrade.none')} —</option>
            {PLATFORMS.filter(p => p.id !== platform1).map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>

        <div className="ot-select-group">
          <label className="ot-label ot-label--row">
            {t('openTrade.market')}
            {loading && <span className="ot-loading">chargement…</span>}
            {!loading && isIntersection && (
              <span className="ot-count">
                {filteredMarkets.length - 1} communs ({counts[platform1]} ∩ {counts[platform2]})
              </span>
            )}
            {Object.keys(errors).length > 0 && (
              <span className="ot-error-badge">⚠️ {Object.keys(errors).join(', ')}</span>
            )}
          </label>
          <select
            value={marketId}
            onChange={e => setMarketId(e.target.value)}
            disabled={loading && filteredMarkets.length <= 1}
            className="ot-select"
          >
            <option value="">— {t('openTrade.selectMarket')} —</option>
            {['Crypto', 'Indices', 'Commodités', 'Equities', 'FX'].map(cat => {
              const catMarkets = filteredMarkets.filter(m => m.category === cat)
              if (!catMarkets.length) return null
              return (
                <optgroup key={cat} label={`${cat} (${catMarkets.length})`}>
                  {catMarkets.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </optgroup>
              )
            })}
          </select>
        </div>

        <div className="ot-select-group">
          <label className="ot-label">{t('openTrade.sizeUSD')}</label>
          <input
            type="number"
            value={sizeUSD}
            onChange={e => setSizeUSD(e.target.value)}
            placeholder="ex: 1000"
            className="ot-select"
          />
        </div>

        {/* ── Levier ────────────────────────────────────────────────────── */}
        <div className="ot-select-group">
          <label className="ot-label ot-label--row">
            Levier
            {calc?.autoLeverage != null && (
              <span className="ot-auto-badge">
                {leverageOverride ? `auto: ${calc.autoLeverage}×` : `auto: ${calc.autoLeverage}×`}
              </span>
            )}
          </label>
          <div className="ot-leverage-row">
            <input
              type="number"
              min="1"
              step="1"
              value={leverageOverride}
              onChange={e => setLeverageOverride(e.target.value)}
              placeholder={calc?.autoLeverage ? `${calc.autoLeverage} (auto)` : 'Auto'}
              className={`ot-select ${calc?.leverageWarning ? 'ot-select--warning' : ''}`}
            />
            {leverageOverride && (
              <button
                className="ot-reset-btn"
                onClick={() => setLeverageOverride('')}
                title="Revenir au levier automatique"
              >↺</button>
            )}
          </div>
          {calc?.leverageWarning && (
            <p className="ot-leverage-warning">
              ⚠ Min requis : {calc.autoLeverage}×
            </p>
          )}
        </div>
      </div>

      {/* Funding banner */}
      {(suggestion || fundingP1 != null || fundingP2 != null) && (
        <div className="ot-funding-banner">
          <div className="ot-funding-info">
            <p className="ot-funding-title">💡 {t('openTrade.optimalDirection')}</p>
            <p className="ot-funding-detail">
              {suggestion && (
                <>
                  <span className="ot-funding-long">{plat1?.label} → {suggestion.p1}</span>
                  {' · '}
                  <span className="ot-funding-short">{plat2?.label} → {suggestion.p2}</span>
                  {' · '}
                </>
              )}
              {fundingP1 != null && fundingP2 != null && (
                <span className="ot-funding-diff">
                  Diff : {fmtPct(Math.abs(fundingP1 - fundingP2))} /h
                  ({fmtPct(Math.abs(fundingP1 - fundingP2) * 24 * 365)} /an)
                </span>
              )}
            </p>
          </div>
          <div className="ot-stepsize-toggle" onClick={() => setUseStepSize(s => !s)}>
            <div className={`ot-toggle-track ${useStepSize ? 'ot-toggle-track--on' : ''}`}>
              <div className={`ot-toggle-thumb ${useStepSize ? 'ot-toggle-thumb--on' : ''}`} />
            </div>
            <span className="ot-toggle-label">Step size</span>
          </div>
        </div>
      )}

      {/* Spread inter-exchange */}
      {calc?.spreadPct != null && (
        <div className={`ot-spread ${Math.abs(calc.spreadPct) > 0.1 ? 'ot-spread--warning' : ''}`}>
          <span className="ot-spread__label">Écart {plat1?.label} / {plat2?.label}</span>
          <span className={`ot-spread__value ${Math.abs(calc.spreadPct) > 0.1 ? 'ot-spread__value--warning' : ''}`}>
            {calc.spreadPct > 0 ? '+' : ''}{calc.spreadPct.toFixed(4)}%
          </span>
        </div>
      )}

      {/* ── Score Δ Neutralité ────────────────────────────────────────────── */}
      {calc?.deltaScore != null && (
        <div className="ot-delta-score">
          <div className="ot-delta-score__left">
            <span className="ot-delta-score__title">Δ Neutralité</span>
            <span
              className="ot-delta-score__value"
              style={{ color: deltaScoreColor(calc.deltaScore) }}
            >
              {deltaScoreLabel(calc.deltaScore)}
            </span>
          </div>
          <div className="ot-delta-score__right">
            <span className="ot-delta-score__residual">
              Δ résiduel : {fmtUSD(calc.deltaUSD ?? 0)}
            </span>
            {calc.cheaperLeg != null && (
              <span className="ot-delta-score__adjusted">
                Leg {calc.cheaperLeg} ajusté →{' '}
                {fmtUSD(calc.cheaperLeg === 1 ? calc.notional1 : calc.notional2)}
              </span>
            )}
            <span className="ot-delta-score__leverage">
              Levier : {calc.leverage}×
              {!leverageOverride && <span className="ot-auto-badge">auto</span>}
            </span>
          </div>
        </div>
      )}

      {/* Leg cards */}
      <div className="ot-legs">
        <LegCard
          side={side1} platform={plat1} price={price1} limitPrice={calc?.limitP1}
          leverage={calc?.leverage} sizeUSD={calc?.notional1 ?? (parseFloat(sizeUSD) || null)} sizeAsset={calc?.asset1}
          marginAvailable={getMarginForPlatform(platform1)} fundingRate={fundingP1}
          isSuggested={!!suggestion} feesMaker={fees[platform1]?.maker ?? 0} feesTaker={fees[platform1]?.taker ?? 0}
          useStepSize={useStepSize} stepSize={getStepSize(marketId)}
          orderType={orderType1} onOrderTypeChange={setOrderType1}
          canTrade={canTradePlatform(platform1)} onPlaceOrder={() => handlePlaceLeg(1)} isPlacingOrder={placingLeg1}
          bid={p1Bid} ask={p1Ask}
          priceMode={priceMode1} onPriceModeChange={setPriceMode1}
          customPrice={customPrice1} onCustomPriceChange={setCustomPrice1}
          isAdjustedLeg={calc?.cheaperLeg === 1}
          leverageValue={effLev1}                  // effLev2 pour le 2e
          onLeverageChange={v => setLeverage1(v)}  // setLeverage2 pour le 2e
          autoLeverage={calc?.autoLeverage}
          market={market}
          credentials={credentials}
        />
        <LegCard
          side={side2} platform={plat2} price={price2} limitPrice={calc?.limitP2}
          leverage={calc?.leverage} sizeUSD={calc?.notional2 ?? (parseFloat(sizeUSD) || null)} sizeAsset={calc?.asset2}
          marginAvailable={getMarginForPlatform(platform2)} fundingRate={fundingP2}
          isSuggested={!!suggestion} feesMaker={fees[platform2]?.maker ?? 0} feesTaker={fees[platform2]?.taker ?? 0}
          useStepSize={useStepSize} stepSize={getStepSize(marketId)}
          orderType={orderType2} onOrderTypeChange={setOrderType2}
          canTrade={canTradePlatform(platform2)} onPlaceOrder={() => handlePlaceLeg(2)} isPlacingOrder={placingLeg2}
          bid={p2Bid} ask={p2Ask}
          priceMode={priceMode2} onPriceModeChange={setPriceMode2}
          customPrice={customPrice2} onCustomPriceChange={setCustomPrice2}
          isAdjustedLeg={calc?.cheaperLeg === 2}
          leverageValue={effLev2}                  // effLev2 pour le 2e
          onLeverageChange={v => setLeverage2(v)}  // setLeverage2 pour le 2e
          autoLeverage={calc?.autoLeverage}
          market={market}
          credentials={credentials}
        />
      </div>

      {calc && (
        <TpSlPanel
          entryPrice={calc.limitP1 ?? price1}
          onTpSlChange={setTpSlConfig}
        />
      )}

      {/* Feedback */}
      {tradeStatus && (
        <div className={`alert ${tradeStatus.type === 'success' ? 'alert--success' : 'alert--error'}`}>
          {tradeStatus.msg}
        </div>
      )}

      {/* Bouton 2 legs */}
      {calc && !loadedPosition1 && !loadedPosition2 && (
        <button
          onClick={handlePlaceBothLegs}
          disabled={placingLeg1 || placingLeg2 || !calc.limitP1 || !calc.limitP2}
          className="ot-both-legs-btn"
        >
          {(placingLeg1 || placingLeg2)
            ? <><span className="leg-spin">⟳</span> Envoi des 2 legs…</>
            : <>🚀 Ouvrir les 2 legs — {plat1?.label} + {plat2?.label}</>}
        </button>
      )}

      {/* 1 leg manquant */}
      {calc && (loadedPosition1 || loadedPosition2) && !(loadedPosition1 && loadedPosition2) && (
        <div className="ot-missing-leg">
          <p className="ot-missing-leg__info">
            ⚡ Position {(loadedPosition1 ?? loadedPosition2).side} déjà ouverte sur{' '}
            {PLATFORMS.find(p => p.id === (loadedPosition1 ?? loadedPosition2).platform)?.label} — leg manquant uniquement
          </p>
          <button
            onClick={() => handlePlaceLeg(loadedPosition1 ? 2 : 1)}
            disabled={placingLeg1 || placingLeg2}
            className="ot-missing-leg__btn"
          >
            {placingLeg1 || placingLeg2
              ? <><span className="leg-spin">⟳</span> Envoi…</>
              : <>🚀 Ouvrir le leg manquant</>}
          </button>
          <button
            onClick={() => { setLoadedPosition1(null); setLoadedPosition2(null) }}
            className="ot-missing-leg__cancel"
          >
            ✕ Annuler
          </button>
        </div>
      )}
    </div>
  )
}
