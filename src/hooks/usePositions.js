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
