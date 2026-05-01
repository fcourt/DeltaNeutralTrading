// src/services/priceService.js
import { getPlatform, PLATFORMS } from '../platforms/index.js'

// ---------------------------------------------------------------------------
// getAllPrices — dynamique, aucune source hardcodée
// ---------------------------------------------------------------------------
export async function getAllPrices() {
  const seen    = new Set()
  const sources = PLATFORMS.filter(p => {
    if (seen.has(p.source)) return false
    seen.add(p.source)
    return typeof p.adapter.getPrices  === 'function'
        || typeof p.adapter.getMarkets === 'function'
  })

  const results = await Promise.allSettled(
    sources.map(p =>
      p.adapter.getPrices
        ? p.adapter.getPrices().catch(() => ({}))
        : p.adapter.getMarkets().catch(() => ({}))
    )
  )

  // Résultat indexé par source : prices['hl'], prices['nado'], prices['maPf'], …
  return Object.fromEntries(
    sources.map((p, i) => [
      p.source,
      results[i].status === 'fulfilled' ? results[i].value : {},
    ])
  )
}

// ---------------------------------------------------------------------------
// resolvePrice — utilise market.keys[source] au lieu de market.hlKey / nadoKey
// ---------------------------------------------------------------------------
export function resolvePrice(marketId, platformId, markets, prices) {
  const platform = getPlatform(platformId)
  if (!platform) return null

  const market = markets.find(m => m.id === marketId)
  if (!market) return null

  const key = market.keys?.[platform.source]
  if (!key) return null

  const sourceData = prices[platform.source] ?? {}
  const raw = sourceData.priceMap?.[key]   // shape Extended  : { priceMap: {} }
           ?? sourceData.prices?.[key]     // shape Nado      : { prices: {} }
           ?? sourceData[key]              // shape plate HL  : { BTC: "100" }
  return raw != null ? parseFloat(raw) || null : null
}

// ---------------------------------------------------------------------------
// getFundingRate — délégation totale à l'adapter
// ---------------------------------------------------------------------------
export async function getFundingRate(platformId, market, credentials = {}) {
  const platform = getPlatform(platformId)
  if (!platform?.adapter?.getFundingRate) return { rate: null, bid: null, ask: null }

  return platform.adapter.getFundingRate(market, credentials)
}

/*
Ce qu'il faut aussi mettre à jour en parallèle :

market.keys dans src/config/markets.js → migrer hlKey/nadoKey/extKey vers keys: { hl: '...', nado: '...', ext: '...' }

Ajouter getFundingRate(market, credentials) dans chaque adapter (hyperliquid.js, extended.js, nado.js)
