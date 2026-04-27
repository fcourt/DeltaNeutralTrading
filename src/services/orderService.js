// src/services/orderService.js
import { getPlatform } from '../platforms/index.js'

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
    leverage:   params.leverage   ?? null, // ← transmis à l'adaptateur (setLeverage avant l'ordre)
    tpSlConfig: params.tpSlConfig ?? null, // ← transmis à l'adaptateur (TP/SL après/inline l'ordre)
  }

  return platform.adapter.placeOrder(order, credentials)
}

export function canTrade(platformId, credentials) {
  if (['hyperliquid', 'xyz', 'hyena'].includes(platformId)) return !!credentials.hlAgentPk
  if (platformId === 'extended') return !!credentials.extStarkPk && !!credentials.extL2Vault
  if (platformId === 'nado')     return !!credentials.nadoAgentPk && !!credentials.nadoAddress
  return false
}
