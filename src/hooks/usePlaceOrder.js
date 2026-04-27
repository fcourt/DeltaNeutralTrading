// src/hooks/usePlaceOrder.js
import { placeOrder as servicePlaceOrder, canTrade } from '../services/orderService.js'

/**
 * Hook de placement d'ordre.
 * Les credentials sont passés explicitement depuis DeltaNeutralPage.
 *
 * params attendus par placeOrder() :
 *   - platformId, marketId, isBuy, size, limitPrice, orderType, reduceOnly
 *   - hlAddress, hlVaultAddress, hlAgentPk
 *   - extApiKey, extStarkPk, extL2Vault
 *   - nadoAddress, nadoAgentPk, nadoSubaccount
 *   - leverage    {number|null}  → transmis à l'adaptateur (setLeverage avant l'ordre)
 *   - tpSlConfig  {object|null}  → { tpPct, slPct, prices: { upPrice, downPrice } }
 */
export function usePlaceOrder(markets = []) {

  const placeOrder = async (params) => {
    const market = markets.find(m => m.id === params.marketId)
    if (!market) throw new Error(`Marché inconnu : ${params.marketId}`)

    const {
      platformId, marketId, isBuy, size, limitPrice, orderType, reduceOnly,
      hlAddress, hlVaultAddress, hlAgentPk,
      extApiKey, extStarkPk, extL2Vault,
      nadoAddress, nadoAgentPk, nadoSubaccount,
      leverage,    // transmis à l'adaptateur via orderService
      tpSlConfig,  // transmis à l'adaptateur via orderService
    } = params

    const credentials = {
      hlAddress, hlVaultAddress, hlAgentPk,
      extApiKey, extStarkPk, extL2Vault,
      nadoAddress, nadoAgentPk, nadoSubaccount,
    }

    return servicePlaceOrder(
      { platformId, marketId, isBuy, size, limitPrice, orderType, reduceOnly,
        market, leverage, tpSlConfig },
      credentials
    )
  }

  const canTradeHL   = (creds) => canTrade('hyperliquid', creds)
  const canTradeExt  = (creds) => canTrade('extended', creds)
  const canTradeNado = (creds) => canTrade('nado', creds)

  return { placeOrder, canTradeHL, canTradeExt, canTradeNado }
}
