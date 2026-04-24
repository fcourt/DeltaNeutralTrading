// src/hooks/usePlaceOrder.js
import { useWallet } from '../context/WalletContext'
import { placeOrder as servicePlaceOrder, canTrade } from '../services/orderService.js'

/**
 * Hook de placement d'ordre.
 * Les credentials sont lus depuis WalletContext au moment du clic.
 * @param {Market[]} markets
 */
export function usePlaceOrder(markets = []) {
  const wallet = useWallet()

  // Credentials extraits du context au moment de l'appel
  const getCredentials = () => ({
    hlAddress:      wallet.hlAddress,
    hlVaultAddress: wallet.hlVaultAddress,
    hlAgentPk:      wallet.hlAgentPk,
    extApiKey:      wallet.extApiKey,
    extStarkPk:     wallet.extStarkPk,
    extL2Vault:     wallet.extL2Vault,
    nadoAddress:    wallet.nadoAddress,
    nadoAgentPk:    wallet.nadoAgentPk,
    nadoSubaccount: wallet.nadoSubaccount,
  })

  const placeOrder = async (params) => {
    const market = markets.find(m => m.id === params.marketId)
    if (!market) throw new Error(`Marché inconnu : ${params.marketId}`)

    const credentials = getCredentials()
    return servicePlaceOrder({ ...params, market }, credentials)
  }

  const canTradePlatform = (platformId) => canTrade(platformId, getCredentials())

  return { placeOrder, canTradePlatform }
}
