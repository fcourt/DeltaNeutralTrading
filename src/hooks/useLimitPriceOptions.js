// ─── Hook : calcule MID / BEST pour un leg ────────────────────────────────────
function useLimitPriceOptions(pos, markets, getPrice) {
  const [bestBid, setBestBid] = useState(null)
  const [bestAsk, setBestAsk] = useState(null)

  const market = markets.find(m => m.id === pos?.marketId)
  const mid    = pos ? (getPrice?.(pos.marketId) ?? pos.markPx ?? pos.entryPx) : null

  useEffect(() => {
    if (!market || !pos) return
    let cancelled = false

    const platformFile = ['xyz', 'hyena'].includes(pos.platform)
      ? 'hyperliquid'
      : pos.platform
    
    import('../platforms/' + platformFile + '.js')
      .then(mod => mod.getFundingRate?.(market, {}))  // bid/ask publics, pas de credentials
      .then(data => {
        if (cancelled) return
        setBestBid(data?.bid ?? null)
        setBestAsk(data?.ask ?? null)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [pos?.marketId, pos?.platform])

  return { mid, bestBid, bestAsk }
}
