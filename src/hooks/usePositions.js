// src/hooks/usePositions.js
import { useState, useCallback, useRef } from 'react'
import { getAllPositions } from '../services/accountService.js'

export function usePositions(credentials, markets = []) {
  const [positions, setPositions] = useState([])
  const [loading,   setLoading]   = useState(false)

  // credentialsRef évite de lister chaque champ dans les deps
  const credentialsRef = useRef(credentials)
  credentialsRef.current = credentials

  const load = useCallback(async () => {
    setLoading(true)
    try { setPositions(await getAllPositions(credentialsRef.current, markets)) }
    catch (e) { console.warn('[usePositions]', e.message) }
    finally { setLoading(false) }
  }, [markets])
  // ^ plus besoin de lister les champs credentials un par un

  return { positions, loading, load }
}

/*
// src/hooks/usePositions.js
// FIX : markets stocke en ref pour que load() soit STABLE
// et ne relance pas les useEffect parents a chaque tick de useLivePrices

import { useState, useCallback, useRef } from 'react'
import { getAllPositions } from '../services/accountService.js'

export function usePositions(credentials, markets) {
  const [positions, setPositions] = useState([])
  const [loading,   setLoading]   = useState(false)

  const credentialsRef = useRef(credentials)
  const marketsRef     = useRef(markets)

  // Mise a jour des refs sans changer la reference de load()
  credentialsRef.current = credentials
  marketsRef.current     = markets

  // load() est STABLE : deps = []
  const load = useCallback(async () => {
    setLoading(true)
    try {
      setPositions(await getAllPositions(credentialsRef.current, marketsRef.current))
    } catch (e) {
      console.warn('[usePositions]', e.message)
    } finally {
      setLoading(false)
    }
  }, []) // <- vide : load ne change jamais de reference

  return { positions, loading, load }
}
*/
