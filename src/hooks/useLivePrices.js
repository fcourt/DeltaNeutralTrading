// src/hooks/useLivePrices.js
import { useState, useEffect, useRef, useCallback } from 'react'
import { PLATFORMS, getPlatform }  from '../platforms/index.js'
import { resolvePrice }            from '../services/priceService.js'
import { buildMarkets } from '../services/marketService.js'


export { PLATFORMS }

export function useLivePrices(intervalMs = 3000) {
  const [markets,    setMarkets]    = useState([])
  const [prices,     setPrices]     = useState({})
  const [lastUpdate, setLastUpdate] = useState(null)
  const timer = useRef(null)

  const fetchAll = useCallback(async () => {
    try {
      const { NADO_ONLY_MARKETS, EMPTY_MARKET } = await import('../config/markets.js')

      // ── 1. Sources ────────────────────────────────────────────────────────────
      const seenMarket = new Set()
        const marketSources = PLATFORMS.filter(p => {
          if (seenMarket.has(p.source)) return false
            seenMarket.add(p.source)
              return typeof p.adapter.getMarkets === 'function'
        })
          
      const seenPrice = new Set()
        const priceSources = PLATFORMS.filter(p => {
          if (seenPrice.has(p.source)) return false
            seenPrice.add(p.source)
              return typeof p.adapter.getPrices === 'function'
        })
          
      const seenSymbol = new Set()
        const symbolSources = PLATFORMS.filter(p => {
          if (seenSymbol.has(p.source)) return false
            seenSymbol.add(p.source)
              return typeof p.adapter.getSymbols === 'function'
        })
      
      // ── 2. Fetch en parallèle ─────────────────────────────────────────────────
      const [marketResults, priceResults, symbolResults] = await Promise.all([
        Promise.allSettled(marketSources.map(p => p.adapter.getMarkets())),
        Promise.allSettled(priceSources.map(p => p.adapter.getPrices().catch(() => ({})))),
        Promise.allSettled(symbolSources.map(p => p.adapter.getSymbols().catch(() => ({})))),
      ])

      // ── 3. allSymbols ─────────────────────────────────────────────────────────
      const allSymbols = symbolResults
        .filter(r => r.status === 'fulfilled')
        .reduce((acc, r) => ({ ...acc, ...r.value }), {})
      
      // ── 4. Construire la liste unifiée des marchés ────────────────────────
      const discoveredMarkets = new Map()
      for (const result of marketResults) {
        if (result.status !== 'fulfilled') continue
        for (const [id, market] of result.value.discoveredMarkets ?? new Map()) {
          if (!discoveredMarkets.has(id)) discoveredMarkets.set(id, market)
        }
      }

      /*
      // Symboles enrichissants (ex: Nado.getSymbols)
      const allSymbols = priceResults
        .filter((r, i) => r.status === 'fulfilled' && !priceSources[i].adapter.getPrices)
        .reduce((acc, r) => ({ ...acc, ...r.value }), {})
        */

      const baseMarkets = [
        ...discoveredMarkets.values(),
        ...NADO_ONLY_MARKETS.filter(m => !discoveredMarkets.has(m.id)),
      ]
      /*
      const allMarkets = [
        EMPTY_MARKET,
        ...baseMarkets.map(m => ({ ...m, ...(allSymbols[m.id] ?? {}) })),
      ]
      */

      const allMarkets = buildMarkets(baseMarkets, allSymbols)

      // ── 5. Construire prices indexé par source ────────────────────────────
      // prices['hl']   = { prices, stepSizes, assetMeta, … }  (shape HL.getMarkets)
      // prices['ext']  = { priceMap, precisionMap }
      // prices['nado'] = { prices, bidPrices, askPrices }

      // getMarkets() expose aussi prices/stepSizes/assetMeta côté HL → les fusionner
      const nextPrices = {}
      for (let i = 0; i < marketSources.length; i++) {
        if (marketResults[i].status !== 'fulfilled') continue
        const p = marketSources[i]
        nextPrices[p.source] = {
          ...(nextPrices[p.source] ?? {}),
          ...marketResults[i].value,
        }
      }
      for (let i = 0; i < priceSources.length; i++) {
        if (priceResults[i].status !== 'fulfilled') continue
        if (!priceSources[i].adapter.getPrices) continue  // symbols-only, déjà traité
        const p = priceSources[i]
        nextPrices[p.source] = {
          ...(nextPrices[p.source] ?? {}),
          ...priceResults[i].value,
        }
      }

      setMarkets(allMarkets)
      setPrices(nextPrices)
      setLastUpdate(new Date())
    } catch (e) { console.warn('[useLivePrices]', e.message) }
  }, [])

  useEffect(() => {
    fetchAll()
    timer.current = setInterval(fetchAll, intervalMs)
    return () => clearInterval(timer.current)
  }, [fetchAll, intervalMs])

  const getPrice = useCallback(
    (marketId, platformId) => resolvePrice(marketId, platformId, markets, prices),
    [markets, prices]
  )

  // getStepSize — via market.keys[source] plutôt que market.hlKey
  const getStepSize = useCallback((marketId) => {
    const market = markets.find(m => m.id === marketId)
    if (!market) return 0.01
    // Cherche stepSizes dans toutes les sources qui l'exposent
    for (const [source, data] of Object.entries(prices)) {
      const key = market.keys?.[source]
      if (key && data.stepSizes?.[key] != null) return data.stepSizes[key]
    }
    return 0.01
  }, [markets, prices])

  // getAssetMeta — cherche dans toutes les sources qui exposent assetMeta
  const getAssetMeta = useCallback((marketKeyOrId) => {
    if (!marketKeyOrId) return null
    for (const data of Object.values(prices)) {
      const meta = data.assetMeta?.[marketKeyOrId]
               ?? data.assetMeta?.[marketKeyOrId.replace(/^(xyz:|hyena:)/, '')]
      if (meta) return meta
    }
    return null
  }, [prices])

  // getExtPrecision — cherche precisionMap dans toutes les sources
  const getExtPrecision = useCallback((key) => {
    for (const data of Object.values(prices)) {
      if (data.precisionMap?.[key]) return data.precisionMap[key]
    }
    return { szDecimals: 2, pxDecimals: 2 }
  }, [prices])

  return {
    markets, prices, lastUpdate,
    getPrice, getStepSize, getAssetMeta, getExtPrecision,
    // Rétrocompatibilité — accès directs aux mids par source
    //hlMids:   prices['hl']?.prices   ?? {},
    //extMids:  prices['ext']?.priceMap ?? {},
    //nadoMids: prices['nado']?.prices  ?? {},
  }
}

/*
Changements clés :

Plus aucun import direct de HL, Extended, Nado — tout passe par PLATFORMS

getStepSize — itère sur toutes les sources via market.keys[source] au lieu de market.hlKey

getAssetMeta — cherche assetMeta dans toutes les sources

getExtPrecision — cherche precisionMap dans toutes les sources

hlMids / extMids / nadoMids — conservés en rétrocompatibilité, à supprimer progressivement quand les composants consommateurs seront migrés
*/
