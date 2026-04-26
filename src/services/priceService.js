// src/services/priceService.js
/*
import * as HL       from '../platforms/hyperliquid.js'
import * as Extended from '../platforms/extended.js'
import * as Nado     from '../platforms/nado.js'

export async function getAllPrices() {
  const [hlResult, extResult, nadoPricesRaw] = await Promise.all([
    HL.getMarkets(),
    Extended.getPrices().catch(() => ({ priceMap: {}, precisionMap: {} })),
    Nado.getPrices().catch(() => ({})),
  ])
  return {
    hlPrices:      hlResult.prices        || {},
    hlSteps:       hlResult.stepSizes     || {},
    hlMeta:        hlResult.assetMeta     || {},
    extPrices:     extResult.priceMap     || {},
    extPrecisions: extResult.precisionMap || {},
    nadoPrices:    nadoPricesRaw,
  }
}

export function resolvePrice(marketId, platformId, markets, prices) {
  const market = markets.find(m => m.id === marketId)
  if (!market) return null
  if (['hyperliquid', 'xyz', 'hyena'].includes(platformId))
    return market.hlKey  ? parseFloat(prices.hlPrices[market.hlKey])  || null : null
  if (platformId === 'extended')
    return market.extKey ? parseFloat(prices.extPrices[market.extKey]) || null : null
  if (platformId === 'nado')
    return market.nadoKey ? prices.nadoPrices[market.nadoKey] ?? null : null
  return null
}

export async function getFundingRate(platformId, market, credentials = {}) {
  if (['hyperliquid', 'xyz', 'hyena'].includes(platformId)) {
    const rates = await HL.getFunding()
    return { rate: market.hlKey ? (rates[market.hlKey] ?? null) : null }
  }
  if (platformId === 'extended') {
    const { fundingRate, bid, ask } = await Extended.getFunding(market.extKey, credentials.extApiKey)
    return { rate: fundingRate, bid, ask }
  }
  if (platformId === 'nado') {
    const rates = await Nado.getFunding()
    return { rate: market.nadoKey ? (rates[market.nadoKey] ?? null) : null }
  }
  return { rate: null }
}
*/

import * as HL       from '../platforms/hyperliquid.js'
import * as Extended from '../platforms/extended.js'
import * as Nado     from '../platforms/nado.js'

export async function getAllPrices() {
  const [hlResult, extResult, nadoResult] = await Promise.all([
    HL.getMarkets(),
    Extended.getPrices().catch(() => ({ priceMap: {}, precisionMap: {} })),
    Nado.getPrices().catch(() => ({ prices: {}, bidPrices: {}, askPrices: {} })),
  ])
  return {
    hlPrices:      hlResult.prices        || {},
    hlSteps:       hlResult.stepSizes     || {},
    hlMeta:        hlResult.assetMeta     || {},
    extPrices:     extResult.priceMap     || {},
    extPrecisions: extResult.precisionMap || {},
    nadoPrices:    nadoResult.prices      || {},
    nadoBidPrices: nadoResult.bidPrices   || {},
    nadoAskPrices: nadoResult.askPrices   || {},
  }
}

export function resolvePrice(marketId, platformId, markets, prices) {
  const market = markets.find(m => m.id === marketId)
  if (!market) return null
  if (['hyperliquid', 'xyz', 'hyena'].includes(platformId))
    return market.hlKey  ? parseFloat(prices.hlPrices?.[market.hlKey])  || null : null
  if (platformId === 'extended')
    return market.extKey ? parseFloat(prices.extPrices?.[market.extKey]) || null : null
  if (platformId === 'nado')
    return market.nadoKey ? prices.nadoPrices?.[market.nadoKey] ?? null : null
  return null
}

export async function getFundingRate(platformId, market, credentials = {}) {
  if (['hyperliquid', 'xyz', 'hyena'].includes(platformId)) {
    const isXyz = market.hlKey?.startsWith('xyz:') || platformId === 'xyz'
    const [rates, bidAsk] = await Promise.all([
      HL.getFunding(),
      market.hlKey
        ? HL.getBidAsk(market.hlKey, isXyz).catch(() => ({ bid: null, ask: null }))
        : Promise.resolve({ bid: null, ask: null }),
    ])
    return {
      rate: market.hlKey ? (rates[market.hlKey] ?? null) : null,
      bid:  bidAsk.bid,
      ask:  bidAsk.ask,
    }
  }
  if (platformId === 'extended') {
    const { fundingRate, bid, ask } = await Extended.getFunding(market.extKey, credentials.extApiKey)
    return { rate: fundingRate, bid, ask }
  }
  if (platformId === 'nado') {
    const [rates, nadoData] = await Promise.all([
      Nado.getFunding(),
      Nado.getPrices(),  // ← cache 5s, pas de requête dupliquée
    ])
    return {
      rate: market.nadoKey ? (rates[market.nadoKey] ?? null) : null,
      bid:  market.nadoKey ? (nadoData.bidPrices?.[market.nadoKey] ?? null) : null,
      ask:  market.nadoKey ? (nadoData.askPrices?.[market.nadoKey] ?? null) : null,
    }
  }
  return { rate: null, bid: null, ask: null }
}
