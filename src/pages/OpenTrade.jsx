import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useWallet } from '../context/WalletContext'

// ── Stubs en attendant les hooks ──────────────────────────────────────────────
const PLATFORMS = [
  { id: 'hyperliquid', label: 'Hyperliquid' },
  { id: 'extended',   label: 'Extended' },
  { id: 'nado',       label: 'Nado' },
]

const useLivePrices  = () => ({ markets: [], getPrice: () => null, getStepSize: () => null, getAssetMeta: () => null, getExtPrecision: () => null, lastUpdate: null })
const useMarketFilter = () => ({ filteredMarkets: [], loading: false, errors: {}, isIntersection: false, counts: {} })
const getMarginForPlatform = () => null
const fmt    = (v, d = 6) => v != null ? Number(v).toFixed(d) : '—'
const fmtUSD = (v) => v != null ? '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'
const fmtPct = (v) => v != null ? (v * 100).toFixed(4) + '%' : '—'

// ── LegCard ───────────────────────────────────────────────────────────────────
function LegCard({
  side, platform, price, limitPrice, leverage, sizeUSD, sizeAsset, marginAvailable,
  fundingRate, isSuggested, feesMaker, feesTaker, useStepSize, stepSize,
  onPlaceOrder, isPlacingOrder, canTrade, orderType, onOrderTypeChange,
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

      {/* Header */}
      <div className="leg-card__header">
        <div className="leg-card__header-left">
          <span className={`leg-badge ${isLong ? 'leg-badge--long' : 'leg-badge--short'}`}>{side}</span>
          <span className="leg-card__platform">{platform?.label}</span>
        </div>
        {isSuggested && <span className="leg-card__optimal">⭐ {t('openTrade.optimal')}</span>}
      </div>

      {/* Prix */}
      <div className="leg-grid-2">
        <div className="leg-stat">
          <p className="leg-stat__label">{t('openTrade.marketPrice')}</p>
          <p className="leg-stat__value">{price ? fmtUSD(price) : '—'}</p>
        </div>
        <div className="leg-stat">
          <p className="leg-stat__label">{t('openTrade.limitMaker')}</p>
          <p className="leg-stat__value leg-stat__value--blue">{limitPrice ? fmtUSD(limitPrice) : '—'}</p>
        </div>
      </div>

      {/* Taille */}
      <div className="leg-grid-2">
        <div className="leg-stat">
          <p className="leg-stat__label">{t('openTrade.notionalUSD')}</p>
          <p className="leg-stat__value">{fmtUSD(sizeUSD)}</p>
        </div>
        <div className="leg-stat">
          <p className="leg-stat__label">
            {t('openTrade.size')} {useStepSize && <span className="leg-step-badge">step</span>}
          </p>
          <p className="leg-stat__value">{sizeDisplay ? fmt(sizeDisplay, 6) : '—'}</p>
        </div>
      </div>

      {/* Levier + Marge */}
      <div className="leg-grid-2">
        <div className="leg-stat">
          <p className="leg-stat__label">{t('openTrade.minLeverage')}</p>
          <p className="leg-stat__value leg-stat__value--blue leg-stat__value--lg">
            {leverage != null ? `${leverage}x` : '—'}
          </p>
        </div>
        <div className="leg-stat">
          <p className="leg-stat__label">{t('openTrade.availableMargin')}</p>
          <p className={`leg-stat__value ${marginAvailable == null ? 'leg-stat__value--faint' : marginAvailable > 0 ? 'leg-stat__value--green' : 'leg-stat__value--red'}`}>
            {marginAvailable != null ? fmtUSD(marginAvailable) : '—'}
          </p>
        </div>
      </div>

      {/* Funding */}
      <div className="leg-stat leg-stat--block">
        <p className="leg-stat__label">{t('openTrade.funding1h')}</p>
        <div className="leg-funding-row">
          <div>
            <span className={`leg-funding-rate ${fundingRate == null ? 'leg-stat__value--faint' : fundingRate >= 0 ? 'leg-funding-rate--pos' : 'leg-funding-rate--neg'}`}>
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

      {/* Fees */}
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

      {/* Order type toggle */}
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

      {/* Actions */}
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
            <div className="leg-locked">
              🔒 {t('openTrade.configureKeys')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── OpenTrade page ────────────────────────────────────────────────────────────
export default function OpenTrade() {
  const { t } = useTranslation()
  const { canTradeHL, canTradeExt, canTradeNado } = useWallet()

  const [platform1,   setPlatform1]   = useState('hyperliquid')
  const [platform2,   setPlatform2]   = useState('extended')
  const [marketId,    setMarketId]    = useState('')
  const [sizeUSD,     setSizeUSD]     = useState('')
  const [useStepSize, setUseStepSize] = useState(false)
  const [orderType1,  setOrderType1]  = useState('maker')
  const [orderType2,  setOrderType2]  = useState('maker')
  const [placingLeg1, setPlacingLeg1] = useState(false)
  const [placingLeg2, setPlacingLeg2] = useState(false)
  const [tradeStatus, setTradeStatus] = useState(null)
  const [loadedPosition1, setLoadedPosition1] = useState(null)
  const [loadedPosition2, setLoadedPosition2] = useState(null)
  const [fees] = useState({
    hyperliquid: { maker: 0.0002, taker: 0.0005 },
    extended:    { maker: 0.0002, taker: 0.0005 },
    nado:        { maker: 0.0002, taker: 0.0005 },
  })

  // Stubs — remplacés quand les hooks arrivent
  const { markets, getPrice, getStepSize } = useLivePrices()
  const { filteredMarkets, loading, errors, isIntersection, counts } = useMarketFilter(platform1, platform2, markets)

  useEffect(() => {
    if (!loading && filteredMarkets.length > 0 && marketId !== '') {
      if (!filteredMarkets.find(m => m.id === marketId)) setMarketId('')
    }
  }, [filteredMarkets, loading, marketId])

  const price1 = getPrice?.(marketId, platform1) ?? null
  const price2 = getPrice?.(marketId, platform2) ?? null
  const plat1  = PLATFORMS.find(p => p.id === platform1)
  const plat2  = PLATFORMS.find(p => p.id === platform2)

  const fundingP1 = null
  const fundingP2 = null

  const suggestion = useMemo(() => {
    if (fundingP1 == null || fundingP2 == null) return null
    return fundingP1 <= fundingP2 ? { p1: 'LONG', p2: 'SHORT' } : { p1: 'SHORT', p2: 'LONG' }
  }, [fundingP1, fundingP2])

  const side1 = suggestion?.p1 ?? 'LONG'
  const side2 = suggestion?.p2 ?? 'SHORT'

  const calc = useMemo(() => {
    const val = parseFloat(sizeUSD)
    if (!val || val <= 0 || !price1 || !price2) return null
    return {
      asset1:    val / price1,
      asset2:    val / price2,
      spreadPct: ((price1 - price2) / price2) * 100,
      limitP1:   side1 === 'LONG' ? price1 * 0.9995 : price1 * 1.0005,
      limitP2:   side2 === 'LONG' ? price2 * 0.9995 : price2 * 1.0005,
      leverage1: null,
      leverage2: null,
    }
  }, [sizeUSD, price1, price2, side1, side2])

  const canTradePlatform = (platformId) => {
    if (platformId === 'extended')    return canTradeExt
    if (platformId === 'nado')        return canTradeNado
    return canTradeHL
  }

  // Stubs de trading
  const handlePlaceLeg = async (legNum) => {
    const setter = legNum === 1 ? setPlacingLeg1 : setPlacingLeg2
    setter(true)
    setTradeStatus(null)
    try {
      console.log(`[stub] Place leg ${legNum}`)
      await new Promise(r => setTimeout(r, 500))
      setTradeStatus({ type: 'success', msg: `✅ [stub] Leg ${legNum} envoyé` })
    } catch (e) {
      setTradeStatus({ type: 'error', msg: `❌ ${e.message}` })
    } finally {
      setter(false)
    }
  }

  const handlePlaceBothLegs = async () => {
    setPlacingLeg1(true); setPlacingLeg2(true); setTradeStatus(null)
    try {
      console.log('[stub] Place both legs')
      await new Promise(r => setTimeout(r, 500))
      setTradeStatus({ type: 'success', msg: '✅ [stub] Les 2 legs envoyés' })
    } catch (e) {
      setTradeStatus({ type: 'error', msg: `❌ ${e.message}` })
    } finally {
      setPlacingLeg1(false); setPlacingLeg2(false)
    }
  }

  const canTrade = canTradeHL || canTradeExt || canTradeNado

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">{t('openTrade.title')}</h1>
        <p className="page-desc">{t('openTrade.description')}</p>
      </div>

      {!canTrade && (
        <div className="card">
          <div className="alert alert--warning">
            ⚠️ {t('openTrade.noKeysWarning')}{' '}
            <a href="/setting-keys" className="wc-alert-link">{t('openTrade.configureKeysLink')} →</a>
          </div>
        </div>
      )}

      <div className="card">

        {/* Sélecteurs */}
        <div className="ot-selectors">

          <div className="ot-select-group">
            <label className="ot-label">{t('openTrade.platform1')}</label>
            <select
              value={platform1}
              onChange={e => setPlatform1(e.target.value)}
              className="ot-select"
            >
              {PLATFORMS.filter(p => p.id !== platform2).map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>

          <div className="ot-select-group">
            <label className="ot-label">{t('openTrade.platform2')}</label>
            <select
              value={platform2}
              onChange={e => setPlatform2(e.target.value)}
              className="ot-select"
            >
              <option value="">— {t('openTrade.none')} —</option>
              {PLATFORMS.filter(p => p.id !== platform1).map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>

          <div className="ot-select-group">
            <label className="ot-label ot-label--row">
              {t('openTrade.market')}
              {loading && <span className="ot-loading">{t('openTrade.loading')}</span>}
              {!loading && isIntersection && (
                <span className="ot-count">
                  {filteredMarkets.length} {t('openTrade.common')} ({counts[platform1]} ∩ {counts[platform2]})
                </span>
              )}
              {Object.keys(errors).length > 0 && (
                <span className="ot-error-badge">⚠️ {Object.keys(errors).join(', ')} {t('openTrade.unavailable')}</span>
              )}
            </label>
            <select
              value={marketId}
              onChange={e => setMarketId(e.target.value)}
              disabled={loading && filteredMarkets.length === 0}
              className="ot-select"
            >
              <option value="">— {t('openTrade.select')} —</option>
              {['Crypto', 'Indices', 'Commodités', 'Equities'].map(cat => {
                const catMarkets = filteredMarkets.filter(m => m.category === cat)
                if (catMarkets.length === 0) return null
                return (
                  <optgroup key={cat} label={`${cat} (${catMarkets.length})`}>
                    {catMarkets.map(m => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
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

        </div>

        {/* Direction optimale + step size */}
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
                    {t('openTrade.diff')} : {fmtPct(Math.abs(fundingP1 - fundingP2))} /h
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

        {/* Spread */}
        {calc?.spreadPct != null && (
          <div className={`ot-spread ${Math.abs(calc.spreadPct) > 0.1 ? 'ot-spread--warning' : ''}`}>
            <span className="ot-spread__label">{t('openTrade.priceGap')} {plat1?.label} / {plat2?.label}</span>
            <span className={`ot-spread__value ${Math.abs(calc.spreadPct) > 0.1 ? 'ot-spread__value--warning' : ''}`}>
              {calc.spreadPct > 0 ? '+' : ''}{calc.spreadPct.toFixed(4)}%
            </span>
          </div>
        )}

        {/* Leg cards */}
        <div className="ot-legs">
          <LegCard
            side={side1} platform={plat1} price={price1} limitPrice={calc?.limitP1} leverage={calc?.leverage1}
            sizeUSD={parseFloat(sizeUSD) || null} sizeAsset={calc?.asset1}
            marginAvailable={getMarginForPlatform(platform1)} fundingRate={fundingP1}
            isSuggested={!!suggestion} feesMaker={fees[platform1]?.maker ?? 0} feesTaker={fees[platform1]?.taker ?? 0}
            useStepSize={useStepSize} stepSize={getStepSize?.(marketId) ?? null}
            orderType={orderType1} onOrderTypeChange={setOrderType1}
            canTrade={canTradePlatform(platform1)} onPlaceOrder={() => handlePlaceLeg(1)} isPlacingOrder={placingLeg1}
          />
          <LegCard
            side={side2} platform={plat2} price={price2} limitPrice={calc?.limitP2} leverage={calc?.leverage2}
            sizeUSD={parseFloat(sizeUSD) || null} sizeAsset={calc?.asset2}
            marginAvailable={getMarginForPlatform(platform2)} fundingRate={fundingP2}
            isSuggested={!!suggestion} feesMaker={fees[platform2]?.maker ?? 0} feesTaker={fees[platform2]?.taker ?? 0}
            useStepSize={useStepSize} stepSize={getStepSize?.(marketId) ?? null}
            orderType={orderType2} onOrderTypeChange={setOrderType2}
            canTrade={canTradePlatform(platform2)} onPlaceOrder={() => handlePlaceLeg(2)} isPlacingOrder={placingLeg2}
          />
        </div>

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
              ? <><span className="leg-spin">⟳</span> {t('openTrade.sendingBoth')}</>
              : <>🚀 {t('openTrade.openBothLegs')} — {plat1?.label} + {plat2?.label}</>}
          </button>
        )}

        {/* 1 seul leg manquant */}
        {calc && (loadedPosition1 || loadedPosition2) && !(loadedPosition1 && loadedPosition2) && (
          <div className="ot-missing-leg">
            <p className="ot-missing-leg__info">
              ⚡ {t('openTrade.positionAlreadyOpen')} {(loadedPosition1 ?? loadedPosition2).side} {t('openTrade.on')} {PLATFORMS.find(p => p.id === (loadedPosition1 ?? loadedPosition2).platform)?.label}
            </p>
            <button
              onClick={() => handlePlaceLeg(loadedPosition1 ? 2 : 1)}
              disabled={placingLeg1 || placingLeg2}
              className="ot-missing-leg__btn"
            >
              {(placingLeg1 || placingLeg2)
                ? <><span className="leg-spin">⟳</span> {t('openTrade.sending')}</>
                : <>🚀 {t('openTrade.openMissingLeg')}</>}
            </button>
            <button
              onClick={() => { setLoadedPosition1(null); setLoadedPosition2(null) }}
              className="ot-missing-leg__cancel"
            >
              ✕ {t('openTrade.cancelOpenBoth')}
            </button>
          </div>
        )}

      </div>
    </>
  )
}
