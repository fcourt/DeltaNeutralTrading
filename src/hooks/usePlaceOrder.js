// src/hooks/usePlaceOrder.js
import { placeOrder as servicePlaceOrder, canTrade } from '../services/orderService.js'
import { setLeverage as extSetLeverage }         from '../platforms/extended.js'
import { updateLeverageByName as hlSetLeverage } from '../platforms/hyperliquid.js'

/**
 * Hook de placement d'ordre.
 * Les credentials sont passés explicitement depuis DeltaNeutralPage.
 *
 * Nouveautés :
 *   - params.leverage    → met à jour le levier sur la plateforme AVANT l'ordre
 *   - params.tpSlConfig  → { tpPct, slPct, prices: { upPrice, downPrice } } | null
 *                          transmis à servicePlaceOrder pour injection TP/SL
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
      leverage,    // ← nouveau : number | null
      tpSlConfig,  // ← nouveau : { tpPct, slPct, prices } | null
    } = params

    const credentials = {
      hlAddress, hlVaultAddress, hlAgentPk,
      extApiKey, extStarkPk, extL2Vault,
      nadoAddress, nadoAgentPk, nadoSubaccount,
    }

    // ── 1. Mise à jour du levier avant l'ordre ──────────────────────────────
    if (leverage != null && leverage > 0) {
      try {
        if (platformId === 'extended' && extApiKey) {
          await extSetLeverage(market.extKey, leverage, extApiKey)
        } else if (platformId === 'hyperliquid' && hlAgentPk && hlAddress) {
          await hlSetLeverage({
            hlAgentPk,
            hlAddress,
            coin:     market.hlKey,
            leverage,
            isCross:  false,
          })
        }
        console.log(`[usePlaceOrder] Levier ×${leverage} appliqué sur ${platformId}`)
      } catch (e) {
        // On log mais on ne bloque pas le placement de l'ordre
        console.warn(`[usePlaceOrder] setLeverage échoué sur ${platformId} :`, e.message)
      }
    }

    // ── 2. Placement de l'ordre + transmission du tpSlConfig ────────────────
    // tpSlConfig est transmis à servicePlaceOrder qui gère :
    //   - Extended  : injection inline dans le body de l'ordre
    //   - HL        : requête séparée après l'ordre principal
    return servicePlaceOrder(
      { platformId, marketId, isBuy, size, limitPrice, orderType, reduceOnly, market, tpSlConfig },
      credentials
    )
  }

  const canTradeHL   = (creds) => canTrade('hyperliquid', creds)
  const canTradeExt  = (creds) => canTrade('extended', creds)
  const canTradeNado = (creds) => canTrade('nado', creds)

  return { placeOrder, canTradeHL, canTradeExt, canTradeNado }
}
