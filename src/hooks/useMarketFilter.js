// src/hooks/useMarketFilter.js
import { useState, useEffect } from 'react'
import { filterMarkets } from '../services/marketService.js'
import { EMPTY_MARKET }  from '../config/markets.js'

/**
 * Filtre les marchés disponibles pour une ou deux plateformes.
 * Retourne l'intersection si deux plateformes, sinon tous les marchés de p1.
 */
export function useMarketFilter(platform1, platform2, allMarkets = []) {
  const [filteredMarkets, setFilteredMarkets] = useState([EMPTY_MARKET])
  const [loading,         setLoading]         = useState(false)
  const [errors,          setErrors]          = useState({})

  useEffect(() => {
    if (!allMarkets || allMarkets.length <= 1) {
      setLoading(true)
      return
    }
    setLoading(false)
    setErrors({})

    try {
      const result = filterMarkets(platform1, platform2, allMarkets)
      setFilteredMarkets(result.markets)
    } catch (e) {
      console.warn('[useMarketFilter]', e.message)
      setErrors({ filter: e.message })
      setFilteredMarkets([EMPTY_MARKET])
    }
  }, [platform1, platform2, allMarkets])

  const result = filterMarkets(
    platform1, platform2,
    allMarkets.length > 1 ? allMarkets : [EMPTY_MARKET]
  )

  return {
    filteredMarkets: result.markets,
    loading:         allMarkets.length <= 1,
    errors,
    isIntersection:  result.isIntersection,
    counts:          result.counts,
  }
}
