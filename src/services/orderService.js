// src/services/orderService.js
import { getPlatform, PLATFORMS } from '../platforms/index.js'

export async function placeOrder(params, credentials) {
  const platform = getPlatform(params.platformId)
  if (!platform) throw new Error(`Plateforme inconnue : ${params.platformId}`)

  const order = {
    marketId:   params.marketId,
    isBuy:      params.isBuy,
    size:       params.size,
    limitPrice: params.limitPrice,
    orderType:  params.orderType  ?? 'maker',
    reduceOnly: params.reduceOnly ?? false,
    market:     params.market,
    leverage:   params.leverage   ?? null,
    tpSlConfig: params.tpSlConfig ?? null,
  }

  return platform.adapter.placeOrder(order, credentials)
}

export function canTrade(platformId, credentials) {
  const platform = getPlatform(platformId)
  if (!platform?.adapter?.canTrade) return false
  return platform.adapter.canTrade(credentials)
}
