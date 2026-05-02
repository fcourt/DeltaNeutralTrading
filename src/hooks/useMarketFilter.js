// src/hooks/useMarketFilter.js
import { useMemo }       from 'react'
import { filterMarkets } from '../services/marketService.js'
import { EMPTY_MARKET }  from '../config/markets.js'

/**
 * Filtre les marchés disponibles pour une ou deux plateformes.
 * Retourne l'intersection si deux plateformes, sinon tous les marchés de p1.
 */
export function useMarketFilter(platform1, platform2, allMarkets = []) {
  //const safeMarkets = allMarkets.length > 1 ? allMarkets : [EMPTY_MARKET]
  const safeMarkets = useMemo(
    () => allMarkets.length > 1 ? allMarkets : [EMPTY_MARKET],
    [allMarkets]
  )

  const result = useMemo(
    () => filterMarkets(platform1, platform2, safeMarkets),
    [platform1, platform2, safeMarkets]
  )

  return {
    filteredMarkets: result.markets,
    loading:         allMarkets.length <= 1,
    errors:          {},
    isIntersection:  result.isIntersection,
    counts:          result.counts,
  }
}
