// src/hooks/useFundingRates.js
import { useState, useEffect } from 'react'
import { getFundingRate } from '../services/priceService.js'

export function useFundingRates(marketId, platform1Id, platform2Id, markets = [], credentials = {}, intervalMs = 60_000) {
  const [rates, setRates] = useState({ p1: null, p2: null, extBid: null, extAsk: null })

  useEffect(() => {
    if (!marketId || !platform1Id) return
    const refresh = async () => {
      try {
        const market = markets.find(m => m.id === marketId)
        if (!market) return
        const [r1, r2] = await Promise.all([
          getFundingRate(platform1Id, market, credentials),
          platform2Id ? getFundingRate(platform2Id, market, credentials) : Promise.resolve({ rate: null }),
        ])
        setRates({ p1: r1.rate, p2: r2.rate, extBid: r1.bid ?? r2.bid ?? null, extAsk: r1.ask ?? r2.ask ?? null })
      } catch (e) { console.warn('[useFundingRates]', e.message) }
    }
    refresh()
    const t = setInterval(refresh, intervalMs)
    return () => clearInterval(t)
  }, [marketId, platform1Id, platform2Id, markets, credentials, intervalMs])

  return rates
}
