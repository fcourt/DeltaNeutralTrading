// src/hooks/useChunkedDNExecutor.js

import { useState, useRef, useCallback } from 'react'
import { PLATFORMS, getPlatform } from '../platforms/index.js'

// ─── Statuts internes d'une slice ────────────────────────────────────────────
// 'pending' | 'placing' | 'waiting_fill' | 'filled' | 'switching_taker' | 'failed'

const SLICE_STATUS = {
  PENDING:         'pending',
  PLACING:         'placing',
  WAITING_FILL:    'waiting_fill',
  FILLED:          'filled',
  SWITCHING_TAKER: 'switching_taker',
  FAILED:          'failed',
}

// ─── État global de l'exécution ───────────────────────────────────────────────
// 'idle' | 'running' | 'paused' | 'completed' | 'aborted' | 'error'

function buildInitialState() {
  return {
    status:        'idle',
    currentSlice:  0,
    totalSlices:   0,
    slices:        [],      // tableau de SliceResult
    totalFilledA:  0,       // total rempli leg A (en asset)
    totalFilledB:  0,       // total rempli leg B (en asset)
    deltaAsset:    0,       // totalFilledA - totalFilledB
    errorMsg:      null,
    log:           [],      // messages horodatés pour l'UI
  }
}

function buildSlice(index, targetSizeA, targetSizeB) {
  return {
    index,
    targetSizeA,
    targetSizeB,
    filledA:   0,
    filledB:   0,
    orderIdA:  null,
    orderIdB:  null,
    statusA:   SLICE_STATUS.PENDING,
    statusB:   SLICE_STATUS.PENDING,
    priceA:    null,
    priceB:    null,
    attempts:  0,
  }
}

// ─── Helper : sleep ───────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// ─── Helper : arrondi step size ───────────────────────────────────────────────
function applyStep(size, stepSize, useStepSize) {
  if (!useStepSize || !stepSize) return size
  return Math.floor(size / stepSize) * stepSize
}

// ─── Helper : poll order status jusqu'à fill ou timeout ──────────────────────
async function pollUntilFilled({
  orderId,
  platformId,
  credentials,
  pollIntervalMs = 2000,
  makerTimeoutMs = 10000,
  abortSignal,
}) {
  //if (!orderId) return { status: 'failed', filled: 0, remaining: 0 }
  if (!orderId) return { status: 'filled', filled: null, remaining: 0 }

  const plat = getPlatform(platformId)
  if (!plat?.adapter?.getOrderStatus) return { status: 'filled', filled: null, remaining: 0 }

  const deadline = Date.now() + makerTimeoutMs
  while (true) {
    if (abortSignal?.aborted) return { status: 'aborted', filled: 0, remaining: 0 }

    const result = await plat.adapter.getOrderStatus(orderId, credentials)
    if (!result) {
      await sleep(pollIntervalMs)
      continue
    }

    if (result.status === 'filled')   return { status: 'filled',   filled: result.filled, remaining: 0 }
    if (result.status === 'canceled') return { status: 'canceled', filled: result.filled, remaining: result.remaining }
    if (result.status === 'rejected') return { status: 'rejected', filled: 0, remaining: 0 }

    if (Date.now() >= deadline) return { status: 'timeout', filled: result.filled, remaining: result.remaining }

    await sleep(pollIntervalMs)
  }
}

// ─── Helper : annuler un ordre ────────────────────────────────────────────────
async function cancelOrder({ orderId, market, platformId, credentials }) {
  if (!orderId) return
  const plat = getPlatform(platformId)
  try {
    await plat?.adapter?.cancelOrder?.({ orderId, market, credentials })
  } catch (e) {
    console.warn(`[Chunk] cancelOrder ${platformId} ${orderId}:`, e.message)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook principal
// ─────────────────────────────────────────────────────────────────────────────

export function useChunkedDNExecutor() {
  const [state, setState] = useState(buildInitialState)
  const abortRef   = useRef(null)
  const pauseRef   = useRef(false)
  const runningRef = useRef(false)

  // ── Log helper ───────────────────────────────────────────────────────────
  const addLog = useCallback((msg, type = 'info') => {
    const entry = { ts: Date.now(), msg, type }
    setState(s => ({ ...s, log: [...s.log, entry] }))
  }, [])

  // ── Patch une slice dans le state ─────────────────────────────────────────
  const patchSlice = useCallback((index, patch) => {
    setState(s => {
      const slices = s.slices.map((sl, i) => i === index ? { ...sl, ...patch } : sl)
      return { ...s, slices }
    })
  }, [])

  // ─────────────────────────────────────────────────────────────────────────
  // start — point d'entrée public
  // ─────────────────────────────────────────────────────────────────────────
  const start = useCallback(async ({
    // Legs
    legA,             // { marketId, platformId, isBuy, market, orderType, leverage }
    legB,             // { marketId, platformId, isBuy, market, orderType, leverage }
    credentials,

    // Paramètres d'exécution
    totalUsd,
    sliceUsd,
    delayBetweenMs,
    makerTimeoutMs,
    maxRetries,
    onErrorMode,      // 'continue' | 'pause' | 'abort'

    // Step size
    stepSize,
    useStepSize,

    // Fonctions externes
    getMarkPrice,     // async (marketId, platformId) => number (prix mark)
    getLimitPriceFn,  // (platformId, side, markPrice) => limitPrice pour leg A
    getLimitPriceFnB, // (platformId, side, markPrice) => limitPrice pour leg B
    placeOrderFn,     // async (params) => result avec resolvedOid
  }) => {
    if (runningRef.current) return
    runningRef.current = true
    pauseRef.current   = false

    const abort = new AbortController()
    abortRef.current = abort

    const totalSlices = Math.ceil(totalUsd / sliceUsd)

    const initialSlices = Array.from({ length: totalSlices }, (_, i) =>
      buildSlice(i, 0, 0)
    )
    setState({
      status:       'running',
      currentSlice: 0,
      totalSlices,
      slices:       initialSlices,
      totalFilledA: 0,
      totalFilledB: 0,
      deltaAsset:   0,
      errorMsg:     null,
      log:          [],
    })

    addLog(`🚀 Démarrage — ${totalSlices} slices de $${sliceUsd}`, 'info')

    let totalFilledA = 0
    let totalFilledB = 0

    // ── Boucle principale ─────────────────────────────────────────────────
    for (let i = 0; i < totalSlices; i++) {
      if (abort.signal.aborted) break

      // ── Pause ────────────────────────────────────────────────────────────
      while (pauseRef.current && !abort.signal.aborted) {
        await sleep(500)
      }
      if (abort.signal.aborted) break

      setState(s => ({ ...s, currentSlice: i }))
      addLog(`— Slice ${i + 1}/${totalSlices}`, 'info')

      // ── Prix mark pour cette slice ────────────────────────────────────────
      let markPriceA, markPriceB
      try {
        ;[markPriceA, markPriceB] = await Promise.all([
          getMarkPrice(legA.marketId, legA.platformId),
          getMarkPrice(legB.marketId, legB.platformId),
        ])
      } catch (e) {
        addLog(`⚠️ Impossible de fetcher le prix : ${e.message}`, 'warn')
        if (onErrorMode === 'abort') { setState(s => ({ ...s, status: 'error', errorMsg: e.message })); break }
        if (onErrorMode === 'pause') { pauseRef.current = true; i--; continue }
        continue
      }

      // ── Prix limit via getLimitPriceFn — respecte priceMode, bid/ask, offset ──
      // C'est la même logique que getLimitPrice() dans OpenTrade.
      // Sans ça, Extended rejette l'ordre (post-only violation).
      const sideA = legA.isBuy ? 'LONG' : 'SHORT'
      const sideB = legB.isBuy ? 'LONG' : 'SHORT'
      const limitPriceA = getLimitPriceFn(legA.platformId, sideA, markPriceA)
      const limitPriceB = getLimitPriceFnB(legB.platformId, sideB, markPriceB)

      // ── Calcul des sizes avec compensation delta ───────────────────────────
      const baseSizeA       = sliceUsd / markPriceA
      const deltaAsset      = totalFilledA - totalFilledB
      const remainingSlices = totalSlices - i
      const isLast          = remainingSlices === 1
      const targetTotalA    = totalUsd / markPriceA

      const sizeA = isLast
        ? Math.max(0, targetTotalA - totalFilledA)
        : baseSizeA

      const sizeB = Math.max(0, sizeA + deltaAsset)

      // ── Step size ─────────────────────────────────────────────────────────
      const rawSizeA = applyStep(sizeA, stepSize, useStepSize)
      const rawSizeB = applyStep(sizeB, stepSize, useStepSize)

      if (rawSizeA <= 0 && rawSizeB <= 0) {
        addLog(`✅ Slice ${i + 1} ignorée — target atteint`, 'success')
        continue
      }

      patchSlice(i, {
        targetSizeA: rawSizeA,
        targetSizeB: rawSizeB,
        priceA:      limitPriceA,
        priceB:      limitPriceB,
        statusA:     SLICE_STATUS.PLACING,
        statusB:     SLICE_STATUS.PLACING,
      })

      // ── Place les deux ordres en parallèle ────────────────────────────────
      let orderIdA = null, orderIdB = null
      let errA = null,     errB = null

      const placeA = placeOrderFn({
        platformId:  legA.platformId,
        marketId:    legA.marketId,
        isBuy:       legA.isBuy,
        market:      legA.market,
        size:        rawSizeA,
        orderType:   legA.orderType ?? 'maker',
        leverage:    legA.leverage  ?? null,
        limitPrice:  limitPriceA,    // ← prix avec offset/bid/ask correct
        reduceOnly:  false,
        tpSlConfig:  null,
        ...credentials,
      }).then(res => {
        const plat = PLATFORMS.find(p => p.id === legA.platformId)
        orderIdA = plat?.normalizeOrderId?.(res) ?? null
        patchSlice(i, { orderIdA, statusA: SLICE_STATUS.WAITING_FILL })
        addLog(`  Leg A placée — orderId: ${orderIdA}`, 'info')
      }).catch(e => {
        errA = e.message
        patchSlice(i, { statusA: SLICE_STATUS.FAILED })
        addLog(`  ❌ Leg A erreur : ${e.message}`, 'error')
      })

      const placeB = placeOrderFn({
        platformId:  legB.platformId,
        marketId:    legB.marketId,
        isBuy:       legB.isBuy,
        market:      legB.market,
        size:        rawSizeB,
        orderType:   legB.orderType ?? 'maker',
        leverage:    legB.leverage  ?? null,
        limitPrice:  limitPriceB,    // ← prix avec offset/bid/ask correct
        reduceOnly:  false,
        tpSlConfig:  null,
        ...credentials,
      }).then(res => {
        const plat = PLATFORMS.find(p => p.id === legB.platformId)
        orderIdB = plat?.normalizeOrderId?.(res) ?? null
        patchSlice(i, { orderIdB, statusB: SLICE_STATUS.WAITING_FILL })
        addLog(`  Leg B placée — orderId: ${orderIdB}`, 'info')
      }).catch(e => {
        errB = e.message
        patchSlice(i, { statusB: SLICE_STATUS.FAILED })
        addLog(`  ❌ Leg B erreur : ${e.message}`, 'error')
      })

      await Promise.all([placeA, placeB])

      console.log('[Chunk] orderIdA résolu:', orderIdA, '| orderIdB résolu:', orderIdB)

      if (abort.signal.aborted) break
      
      /*
      if (errA || errB) {
        addLog(`⚠️ Erreur placement slice ${i + 1} — A: ${errA ?? 'ok'} | B: ${errB ?? 'ok'}`, 'warn')
        if (onErrorMode === 'abort') { setState(s => ({ ...s, status: 'error', errorMsg: errA ?? errB })); break }
        if (onErrorMode === 'pause') { pauseRef.current = true }
        // 'continue' ou après pause : on passe à la slice suivante sans bloquer
        continue
      }
      */
      // Remplace le bloc errA || errB actuel
      if (errA && errB) {
        // Les deux ont échoué → selon onErrorMode
        addLog(`⚠️ Les deux legs ont échoué slice ${i + 1}`, 'warn')
          if (onErrorMode === 'abort') { setState(s => ({ ...s, status: 'error', errorMsg: errA ?? errB })); break }
        if (onErrorMode === 'pause') { pauseRef.current = true }
        continue
      }
      // Si une seule leg a échoué, on continue le poll sur celle qui a réussi
      // (l'autre a orderId null → pollUntilFilled retourne filled immédiat via Fix 2)

      // ── Poll fill des deux ordres ─────────────────────────────────────────
      let attempt = 0
      let filledA = 0, filledB = 0
      let currentOrderIdA = orderIdA
      let currentOrderIdB = orderIdB

      while (attempt < maxRetries) {
        if (abort.signal.aborted) break

        const [resA, resB] = await Promise.all([
          pollUntilFilled({
            orderId:      currentOrderIdA,
            platformId:   legA.platformId,
            credentials,
            makerTimeoutMs,
            abortSignal:  abort.signal,
          }),
          pollUntilFilled({
            orderId:      currentOrderIdB,
            platformId:   legB.platformId,
            credentials,
            makerTimeoutMs,
            abortSignal:  abort.signal,
          }),
        ])

        filledA = resA.filled ?? rawSizeA
        filledB = resB.filled ?? rawSizeB

        const aOk = resA.status === 'filled'
        const bOk = resB.status === 'filled'

        if (aOk && bOk) {
          patchSlice(i, { filledA, filledB, statusA: SLICE_STATUS.FILLED, statusB: SLICE_STATUS.FILLED })
          addLog(`  ✅ Slice ${i + 1} remplie — A: ${filledA.toFixed(5)} | B: ${filledB.toFixed(5)}`, 'success')
          break
        }

        // Timeout → switch taker
        attempt++
        addLog(`  🔄 Timeout slice ${i + 1} tentative ${attempt}/${maxRetries} — switch taker`, 'warn')

        const switchToTaker = async (leg, getLimitFn, orderId, size, currentFilled, patchKey) => {
          if (orderId) await cancelOrder({ orderId, market: leg.market, platformId: leg.platformId, credentials })
          const remaining = Math.max(0, size - (currentFilled ?? 0))
          if (remaining <= 0) return { orderId: null, status: 'filled' }

          patchSlice(i, { [patchKey]: SLICE_STATUS.SWITCHING_TAKER })
          try {
            // Re-fetch prix frais + recalcul limit via getLimitFn
            const freshMark   = await getMarkPrice(leg.marketId, leg.platformId)
            const freshSide   = leg.isBuy ? 'LONG' : 'SHORT'
            const freshLimit  = getLimitFn(leg.platformId, freshSide, freshMark)
            const res = await placeOrderFn({
              platformId:  leg.platformId,
              marketId:    leg.marketId,
              isBuy:       leg.isBuy,
              market:      leg.market,
              size:        remaining,
              orderType:   'taker',
              leverage:    leg.leverage ?? null,
              limitPrice:  freshLimit,
              reduceOnly:  false,
              tpSlConfig:  null,
              ...credentials,
            })
            const plat  = PLATFORMS.find(p => p.id === leg.platformId)
            const newId = plat?.normalizeOrderId?.(res) ?? null
            patchSlice(i, { [patchKey]: SLICE_STATUS.WAITING_FILL })
            return { orderId: newId, status: 'open' }
          } catch (e) {
            addLog(`  ❌ Switch taker échoué (${leg.platformId}): ${e.message}`, 'error')
            patchSlice(i, { [patchKey]: SLICE_STATUS.FAILED })
            return { orderId: null, status: 'failed' }
          }
        }

        const [newA, newB] = await Promise.all([
          !aOk ? switchToTaker(legA, getLimitPriceFn,  currentOrderIdA, rawSizeA, resA.filled, 'statusA') : Promise.resolve({ status: 'filled' }),
          !bOk ? switchToTaker(legB, getLimitPriceFnB, currentOrderIdB, rawSizeB, resB.filled, 'statusB') : Promise.resolve({ status: 'filled' }),
        ])

        if (abort.signal.aborted) break

        if (newA.orderId) currentOrderIdA = newA.orderId
        if (newB.orderId) currentOrderIdB = newB.orderId

        if (attempt >= maxRetries) {
          addLog(`  ❌ Slice ${i + 1} abandonnée après ${maxRetries} tentatives`, 'error')
          patchSlice(i, { statusA: SLICE_STATUS.FAILED, statusB: SLICE_STATUS.FAILED })
          if (onErrorMode === 'abort') { setState(s => ({ ...s, status: 'error' })); break }
          if (onErrorMode === 'pause') { pauseRef.current = true }
          break
        }
      }

      // ── Mise à jour des totaux accumulés ──────────────────────────────────
      totalFilledA += filledA
      totalFilledB += filledB
      const newDelta = totalFilledA - totalFilledB

      setState(s => ({
        ...s,
        totalFilledA,
        totalFilledB,
        deltaAsset: newDelta,
      }))

      addLog(
        `  \u0394 accumulé : ${newDelta >= 0 ? '+' : ''}${newDelta.toFixed(5)} asset` +
        ` | A: ${totalFilledA.toFixed(5)} | B: ${totalFilledB.toFixed(5)}`,
        Math.abs(newDelta) > 0.001 ? 'warn' : 'info'
      )

      // ── Délai inter-slice ─────────────────────────────────────────────────
      if (i < totalSlices - 1 && !abort.signal.aborted) {
        await sleep(delayBetweenMs)
      }
      if (abort.signal.aborted) break
    }

    // ── Fin d'exécution ───────────────────────────────────────────────────
    runningRef.current = false
    if (!abort.signal.aborted) {
      setState(s => ({
        ...s,
        status: s.status === 'error' ? 'error' : 'completed',
      }))
      addLog('🏁 Exécution terminée', 'success')
    }
  }, [addLog, patchSlice])

  // ── Contrôles publics ─────────────────────────────────────────────────────
  const pause  = useCallback(() => {
    pauseRef.current = true
    setState(s => ({ ...s, status: 'paused' }))
  }, [])

  const resume = useCallback(() => {
    pauseRef.current = false
    setState(s => ({ ...s, status: 'running' }))
  }, [])

  const abort  = useCallback(() => {
    abortRef.current?.abort()
    runningRef.current = false
    pauseRef.current   = false
    setState(s => ({ ...s, status: 'aborted' }))
  }, [])

  const reset  = useCallback(() => {
    abortRef.current?.abort()
    runningRef.current = false
    pauseRef.current   = false
    setState(buildInitialState)
  }, [])

  return { state, start, pause, resume, abort, reset }
}
