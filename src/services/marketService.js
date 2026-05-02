// src/services/marketService.js
import { PLATFORMS, getPlatform, platformHasMarket } from '../platforms/index.js'
import { EMPTY_MARKET, NADO_ONLY_MARKETS } from '../config/markets.js'

export async function getAllMarkets() {
  // Sources uniques qui exposent getMarkets()
  const seen = new Set()
  const marketSources = PLATFORMS.filter(p => {
    if (seen.has(p.source)) return false
    seen.add(p.source)

    console.log('[marketService] allSymbols keys:', Object.keys(allSymbols).slice(0, 5))
    console.log('[marketService] ETH symbols entry:', allSymbols['ETH'])
    const eth = baseMarkets.find(m => m.id === 'ETH')
    console.log('[marketService] ETH avant enrichissement:', eth)
    
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

  return [
    EMPTY_MARKET,
    ...baseMarkets.map(m => ({ ...m, ...(allSymbols[m.id] ?? {}) })),
  ]
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
