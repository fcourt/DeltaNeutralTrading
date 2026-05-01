// src/hooks/usePlaceOrder.js
import { placeOrder as servicePlaceOrder, canTrade } from '../services/orderService.js'
import { PLATFORMS } from '../platforms/index.js'

export function usePlaceOrder(markets = []) {

  const placeOrder = async (params) => {
    const market = markets.find(m => m.id === params.marketId)
    if (!market) throw new Error(`Marché inconnu : ${params.marketId}`)

    const {
      platformId, marketId, isBuy, size, limitPrice, orderType, reduceOnly,
      hlAddress, hlVaultAddress, hlAgentPk,
      extApiKey, extStarkPk, extL2Vault,
      nadoAddress, nadoAgentPk, nadoSubaccount,
      leverage,
      tpSlConfig,
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

  // canTradeOn — générique, remplace les 3 helpers hardcodés
  // Usage : canTradeOn('hyperliquid', creds)  canTradeOn('nado', creds)
  const canTradeOn = (platformId, creds) => canTrade(platformId, creds)

  // Rétrocompatibilité — à supprimer progressivement dans les composants consommateurs
  //const canTradeHL   = (creds) => canTradeOn('hyperliquid', creds)
  //const canTradeExt  = (creds) => canTradeOn('extended',    creds)
  //const canTradeNado = (creds) => canTradeOn('nado',        creds)

  // Map complète : { hyperliquid: fn, xyz: fn, nado: fn, … }
  const canTradeMap = Object.fromEntries(
    PLATFORMS.map(p => [p.id, (creds) => canTradeOn(p.id, creds)])
  )

  return { placeOrder, canTradeOn, canTradeHL, canTradeExt, canTradeNado, canTradeMap }
}
