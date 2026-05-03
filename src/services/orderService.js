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

  //pour Nado avec appel vers TP/SL à voir si HL & Ext fonctionne encore avec
  const result = await platform.adapter.placeOrder(order, credentials)

if (order.tpSlConfig && platform.adapter.placeTpSl) {
  await platform.adapter.placeTpSl(order, credentials)
}

return result

  //return avant chang. pour Nado au-dessus
  //return platform.adapter.placeOrder(order, credentials)
}

export function canTrade(platformId, credentials) {
  const platform = getPlatform(platformId)
  if (!platform?.adapter?.canTrade) return false
  return platform.adapter.canTrade(credentials)
}
