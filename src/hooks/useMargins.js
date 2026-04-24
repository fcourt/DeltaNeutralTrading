// src/hooks/useMargins.js
import { useState, useEffect, useCallback } from 'react'
import { getAllMargins } from '../services/accountService.js'

export function useMargins(credentials, intervalMs = 15_000) {
  const [margins, setMargins] = useState({
    hyperliquid: null, xyz: null, hyena: null, extended: null, nado: null,
  })

  const refresh = useCallback(async () => {
    try { setMargins(await getAllMargins(credentials)) }
    catch (e) { console.warn('[useMargins]', e.message) }
  }, [
    credentials?.hlAddress,
    credentials?.hlVaultAddress,
    credentials?.extApiKey,
    credentials?.nadoAddress,
    credentials?.nadoSubaccount,
  ])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, intervalMs)
    return () => clearInterval(t)
  }, [refresh, intervalMs])

  return { margins, refresh }
}
