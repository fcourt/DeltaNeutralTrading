// src/hooks/usePlaceOrder.js
import { placeOrder as servicePlaceOrder, canTrade } from '../services/orderService.js'

/**
 * Hook de placement d'ordre.
 * Les credentials sont passés explicitement depuis DeltaNeutralPage.
 */
export function usePlaceOrder(markets = []) {
  // DeltaNeutralPage gère les credentials en state local (pas de WalletContext)
  // → on expose une factory qui reçoit les params au moment du call

  const placeOrder = async (params) => {
    const market = markets.find(m => m.id === params.marketId)
    if (!market) throw new Error(`Marché inconnu : ${params.marketId}`)

    // Les credentials sont embarqués dans params par buildOrderParams via handlePlaceLeg
    const { platformId, marketId, isBuy, size, limitPrice, orderType, reduceOnly,
            hlAddress, hlVaultAddress, hlAgentPk,
            extApiKey, extStarkPk, extL2Vault,
            nadoAddress, nadoAgentPk, nadoSubaccount } = params

    const credentials = {
      hlAddress, hlVaultAddress, hlAgentPk,
      extApiKey, extStarkPk, extL2Vault,
      nadoAddress, nadoAgentPk, nadoSubaccount,
    }

    return servicePlaceOrder({ platformId, marketId, isBuy, size, limitPrice, orderType, reduceOnly, market }, credentials)
  }

  const canTradeHL   = (creds) => canTrade('hyperliquid', creds)
  const canTradeExt  = (creds) => canTrade('extended', creds)
  const canTradeNado = (creds) => canTrade('nado', creds)

  return { placeOrder, canTradeHL, canTradeExt, canTradeNado }
}
