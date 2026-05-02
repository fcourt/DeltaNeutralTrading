// src/services/marketService.js
import { PLATFORMS, getPlatform, platformHasMarket } from '../platforms/index.js'
import { KEY_OVERRIDES, EMPTY_MARKET, NADO_ONLY_MARKETS } from '../config/markets.js'

// Génère l'objet keys : { nado: 'XAG', coinex: 'XAGUSD', ... }
function buildKeys(id) {
  const keys = {}
  for (const [platform, overrides] of Object.entries(KEY_OVERRIDES)) {
    if (overrides[id]) keys[platform] = overrides[id]
  }
  return keys
}

/*
export function buildMarkets(baseMarkets, allSymbols) {
  return [
    EMPTY_MARKET,
    ...baseMarkets.map(m => {
      const extraKeys = buildKeys(m.id)
      // Fallback ext : si pas d'override → id + '-USD' (ex: BTC → BTC-USD)
      if (!extraKeys.ext && m.keys?.hl) {
        const isXyz = m.keys.hl.startsWith('xyz:')
        extraKeys.ext = isXyz ? `${m.id}_24_5-USD` : `${m.id}-USD`
      }
      const keys = { ...m.keys, ...extraKeys }
      return {
        ...m,
        keys,
        ...(allSymbols[m.id]
          ?? Object.values(keys).map(k => allSymbols[k]).find(Boolean)
          ?? {}),
      }
    }),
  ]
}
*/
export function buildMarkets(baseMarkets, allSymbols) {
  return [
    EMPTY_MARKET,
    ...baseMarkets.map(m => {
      const extraKeys = buildKeys(m.id)   // overrides explicites de KEY_OVERRIDES

      // Fallbacks génériques — chaque plateforme définit le sien dans index.js
      for (const p of PLATFORMS) {
        if (!extraKeys[p.keysField] && !m.keys?.[p.keysField] && p.keyFallback) {
          extraKeys[p.keysField] = p.keyFallback(m.id)
        }
      }

      const keys = { ...m.keys, ...extraKeys }
      return {
        ...m,
        keys,
        ...(allSymbols[m.id]
          ?? Object.values(keys).map(k => allSymbols[k]).find(Boolean)
          ?? {}),
      }
    }),
  ]
}

export async function getAllMarkets() {
  // Sources uniques qui exposent getMarkets()
  const seen = new Set()
  const marketSources = PLATFORMS.filter(p => {
    if (seen.has(p.source)) return false
    seen.add(p.source)    
    return typeof p.adapter.getMarkets === 'function'
  })

  // Récupérer tous les marchés de toutes les sources en parallèle
  const results = await Promise.allSettled(
    marketSources.map(p => p.adapter.getMarkets())
  )

  // Fusionner les marchés découverts
  const discoveredMarkets = new Map()
  for (const result of results) {
    if (result.status !== 'fulfilled') continue
    for (const [id, market] of result.value.discoveredMarkets ?? new Map()) {
      if (!discoveredMarkets.has(id)) discoveredMarkets.set(id, market)
    }
  }

  // Sources qui exposent getSymbols() pour enrichissement
  const symbolSources = PLATFORMS.filter((p, i, arr) =>
    arr.findIndex(x => x.source === p.source) === i &&
    typeof p.adapter.getSymbols === 'function'
  )
  const symbolResults = await Promise.allSettled(
    symbolSources.map(p => p.adapter.getSymbols())
  )
  const allSymbols = symbolResults
    .filter(r => r.status === 'fulfilled')
    .reduce((acc, r) => ({ ...acc, ...r.value }), {})

  const baseMarkets = [
    ...discoveredMarkets.values(),
    ...NADO_ONLY_MARKETS.filter(m => !discoveredMarkets.has(m.id)),
  ]

  console.log('[marketService] baseMarkets[0]:', baseMarkets[0])
  console.log('[marketService] keys BTC:', buildKeys('BTC'))
  console.log('[marketService] keys SILVER:', buildKeys('SILVER'))
  console.log('[marketService] allSymbols sample:', Object.keys(allSymbols).slice(0, 5))

  /*
  return [
    EMPTY_MARKET,
    ...baseMarkets.map(m => ({ ...m, ...(allSymbols[m.id] ?? {}) })),
  ]
  
  return [
    EMPTY_MARKET,
    ...baseMarkets.map(m => {
      const keys = { ...m.keys, ...buildKeys(m.id) }
        return {
          ...m,
          keys,
          ...(allSymbols[m.id]
              ?? Object.values(keys).map(k => allSymbols[k]).find(Boolean)
              ?? {}),
        }
    }),
  ]
  */

  return buildMarkets(baseMarkets, allSymbols)
}


export function filterMarkets(p1Id, p2Id, allMarkets) {
  const real      = allMarkets.filter(m => m.id !== '')
  const p1Markets = p1Id ? real.filter(m => platformHasMarket(p1Id, m)) : []
  const p2Markets = p2Id ? real.filter(m => platformHasMarket(p2Id, m)) : real

  const markets = p2Id
    ? p1Markets.filter(m => p2Markets.some(m2 => m2.id === m.id))
    : p1Markets

  return {
    markets: [EMPTY_MARKET, ...markets],
    isIntersection: !!p2Id,
    counts: { [p1Id]: p1Markets.length, [p2Id]: p2Markets.length },
  }
}
