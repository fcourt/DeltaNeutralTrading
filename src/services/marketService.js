// src/services/marketService.js
import * as HL   from '../platforms/hyperliquid.js'
import * as Nado from '../platforms/nado.js'
import { EMPTY_MARKET, NADO_ONLY_MARKETS } from '../config/markets.js'

export async function getAllMarkets() {
  const [hlResult, nadoSymbols] = await Promise.all([
    HL.getMarkets(),
    Nado.getSymbols().catch(() => ({})),
  ])
  const baseMarkets = [
    ...hlResult.discoveredMarkets.values(),
    ...NADO_ONLY_MARKETS.filter(m => !hlResult.discoveredMarkets.has(m.id)),
  ]
  return [
    EMPTY_MARKET,
    ...baseMarkets.map(m => ({ ...m, ...(nadoSymbols[m.id] ?? {}) })),
  ]
}

export function filterMarkets(p1Id, p2Id, allMarkets) {
  const hasP1 = (m) => {
    if (!p1Id) return false
    if (['hyperliquid', 'xyz', 'hyena'].includes(p1Id)) return !!m.hlKey
    if (p1Id === 'extended') return !!m.extKey
    if (p1Id === 'nado')     return !!m.nadoProductId
    return false
  }
  const hasP2 = (m) => {
    if (!p2Id) return true
    if (['hyperliquid', 'xyz', 'hyena'].includes(p2Id)) return !!m.hlKey
    if (p2Id === 'extended') return !!m.extKey
    //if (p2Id === 'nado')     return !!m.nadoProductId
    if (p1Id === 'nado') return !!m.nadoProductId || !!m.nadoKey
    return false
  }
  const real      = allMarkets.filter(m => m.id !== '')
  const p1Markets = real.filter(hasP1)
  const p2Markets = real.filter(hasP2)
  const markets   = p2Id
    ? p1Markets.filter(m => p2Markets.some(m2 => m2.id === m.id))
    : p1Markets
  return {
    markets: [EMPTY_MARKET, ...markets],
    isIntersection: !!p2Id,
    counts: { [p1Id]: p1Markets.length, [p2Id]: p2Markets.length },
  }
}
