// src/hooks/useLivePrices.js
import { useState, useEffect, useRef, useCallback } from 'react'
import { getAllMarkets }              from '../services/marketService.js'
import { getAllPrices, resolvePrice } from '../services/priceService.js'
import { PLATFORMS }                 from '../platforms/index.js'

export { PLATFORMS }

export function useLivePrices(intervalMs = 3000) {
  const [markets,    setMarkets]    = useState([])
  const [prices,     setPrices]     = useState({})
  const [lastUpdate, setLastUpdate] = useState(null)
  const timer = useRef(null)

  const fetchAll = useCallback(async () => {
    try {
      const [allMarkets, allPrices] = await Promise.all([getAllMarkets(), getAllPrices()])
      setMarkets(allMarkets)
      setPrices(allPrices)
      setLastUpdate(new Date())
    } catch (e) { console.warn('[useLivePrices]', e.message) }
  }, [])

  useEffect(() => {
    fetchAll()
    timer.current = setInterval(fetchAll, intervalMs)
    return () => clearInterval(timer.current)
  }, [fetchAll, intervalMs])

  const getPrice      = useCallback((marketId, platformId) => resolvePrice(marketId, platformId, markets, prices), [markets, prices])
  const getStepSize   = useCallback((marketId) => { const m = markets.find(m => m.id === marketId); return m?.hlKey ? (prices.hlSteps?.[m.hlKey] ?? 0.01) : 0.01 }, [markets, prices])
  const getAssetMeta  = useCallback((hlKey) => hlKey ? (prices.hlMeta?.[hlKey] ?? prices.hlMeta?.[hlKey.replace(/^(xyz:|hyna:)/, '')] ?? null) : null, [prices])
  const getExtPrecision = useCallback((extKey) => prices.extPrecisions?.[extKey] ?? { szDecimals: 2, pxDecimals: 2 }, [prices])

  return {
    markets, prices, lastUpdate,
    getPrice, getStepSize, getAssetMeta, getExtPrecision,
    hlMids:   prices.hlPrices   ?? {},
    extMids:  prices.extPrices  ?? {},
    nadoMids: prices.nadoPrices ?? {},
  }
}
