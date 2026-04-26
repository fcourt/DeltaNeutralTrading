// src/hooks/useLivePrices.js
import { useState, useEffect, useRef, useCallback } from 'react'
import { getAllMarkets }  from '../services/marketService.js'
import * as HL           from '../platforms/hyperliquid.js'
import * as Extended     from '../platforms/extended.js'
import * as Nado         from '../platforms/nado.js'
import { resolvePrice }  from '../services/priceService.js'
import { PLATFORMS }     from '../platforms/index.js'

export { PLATFORMS }

export function useLivePrices(intervalMs = 3000) {
  const [markets,    setMarkets]    = useState([])
  const [prices,     setPrices]     = useState({})
  const [lastUpdate, setLastUpdate] = useState(null)
  const timer = useRef(null)

  const fetchAll = useCallback(async () => {
    try {
      // getAllMarkets() appelle HL.getMarkets() → on récupère discoveredMarkets + prices + stepSizes + assetMeta
      // getAllPrices() ne doit PAS refaire le fetch HL — on le fait en parallèle ici directement
      const [hlResult, nadoSymbols, extResult, nadoResult] = await Promise.all([
        HL.getMarkets(),
        Nado.getSymbols().catch(() => ({})),
        Extended.getPrices().catch(() => ({ priceMap: {}, precisionMap: {} })),
        //Nado.getPrices().catch(() => ({})),
        Nado.getPrices().catch(() => ({ prices: {}, bidPrices: {}, askPrices: {} })),
      ])

      // Construire la liste unifiée des marchés
      const { NADO_ONLY_MARKETS, EMPTY_MARKET } = await import('../config/markets.js')
      const baseMarkets = [
        ...hlResult.discoveredMarkets.values(),
        ...NADO_ONLY_MARKETS.filter(m => !hlResult.discoveredMarkets.has(m.id)),
      ]
      const allMarkets = [
        EMPTY_MARKET,
        ...baseMarkets.map(m => ({ ...m, ...(nadoSymbols[m.id] ?? {}) })),
      ]

      setMarkets(allMarkets)
      setPrices({
        hlPrices:      hlResult.prices        || {},
        hlSteps:       hlResult.stepSizes     || {},
        hlMeta:        hlResult.assetMeta     || {},
        extPrices:     extResult.priceMap     || {},
        extPrecisions: extResult.precisionMap || {},
        //nadoPrices,
        nadoPrices:    nadoResult.prices      || {},      
        nadoBidPrices: nadoResult.bidPrices   || {},      
        nadoAskPrices: nadoResult.askPrices   || {},
      })
      setLastUpdate(new Date())
    } catch (e) { console.warn('[useLivePrices]', e.message) }
  }, [])

  useEffect(() => {
    fetchAll()
    timer.current = setInterval(fetchAll, intervalMs)
    return () => clearInterval(timer.current)
  }, [fetchAll, intervalMs])

  const getPrice = useCallback((marketId, platformId) =>
    resolvePrice(marketId, platformId, markets, prices)
  , [markets, prices])

  const getStepSize = useCallback((marketId) => {
    const market = markets.find(m => m.id === marketId)
    if (!market?.hlKey) return 0.01
    return prices.hlSteps?.[market.hlKey] ?? 0.01
  }, [markets, prices])

  const getAssetMeta = useCallback((hlKey) => {
    if (!hlKey) return null
    return prices.hlMeta?.[hlKey]
      ?? prices.hlMeta?.[hlKey.replace(/^(xyz:|hyna:)/, '')]
      ?? null
  }, [prices])

  const getExtPrecision = useCallback((extKey) =>
    prices.extPrecisions?.[extKey] ?? { szDecimals: 2, pxDecimals: 2 }
  , [prices])

  return {
    markets, prices, lastUpdate,
    getPrice, getStepSize, getAssetMeta, getExtPrecision,
    hlMids:   prices.hlPrices   ?? {},
    extMids:  prices.extPrices  ?? {},
    nadoMids: prices.nadoPrices ?? {},
  }
}
