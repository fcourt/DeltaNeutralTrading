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
    targetSizeA,  // size visée pour la leg A (en asset)
    targetSizeB,  // size visée pour la leg B (en asset, peut ≠ A si compensation delta)
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
// FIX #4 — applique le step size comme buildOrderParams dans OpenTrade
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
  makerTimeoutMs = 10000,  // après ce délai → signal pour passer taker
  abortSignal,
}) {
  if (!orderId) return { status: 'failed', filled: 0, remaining: 0 }

  // FIX : getOrderStatus via adapter (plat.adapter.getOrderStatus) et non plat.getOrderStatus
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

    // Toujours open
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
  const abortRef   = useRef(null)   // AbortController
  const pauseRef   = useRef(false)  // flag pause — lu à chaque itération
  const runningRef = useRef(false)  // évite double-start

  // ── Log helper ───────────────────────────────────────────────────────────
  const addLog = useCallback((msg, type = 'info') => {
    const entry = { ts: Date.now(), msg, type }  // type: 'info'|'warn'|'error'|'success'
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
    // FIX #3 : legA/legB contiennent maintenant orderType et leverage
    legA,             // { marketId, platformId, isBuy, market, orderType, leverage }
    legB,             // { marketId, platformId, isBuy, market, orderType, leverage }
    credentials,

    // Paramètres d'exécution
    totalUsd,         // montant total à ouvrir en USD
    sliceUsd,         // taille par slice en USD
    delayBetweenMs,   // délai inter-slice en ms (ex: 2000)
    makerTimeoutMs,   // délai avant passage taker (ex: 8000)
    maxRetries,       // tentatives max par slice (ex: 3)
    onErrorMode,      // 'continue' | 'pause' | 'abort'

    // FIX #4 : step size transmis depuis handleStartChunked
    stepSize,         // valeur du step size du marché (ex: 0.001)
    useStepSize,      // boolean — arrondi step size activé

    // Fonctions externes
    getMarkPrice,     // async (marketId, platformId) => number
    placeOrderFn,     // async (params) => result avec resolvedOid
    // NOTE FIX #1 : placeOrderFn ne prend plus qu'un seul argument.
    // Les credentials sont spreadés dans params directement par le hook.
    getLimitPriceFn,    // (platformId, side, markPrice) => limitPrice leg A
    getLimitPriceFnB,   // (platformId, side, markPrice) => limitPrice leg B
  }) => {
    if (runningRef.current) return
    runningRef.current = true
    pauseRef.current   = false

    const abort = new AbortController()
    abortRef.current = abort

    const totalSlices = Math.ceil(totalUsd / sliceUsd)

    // Init state
    const initialSlices = Array.from({ length: totalSlices }, (_, i) =>
      buildSlice(i, 0, 0)  // sizes calculées dynamiquement à chaque slice
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
        continue  // 'continue' → skip cette slice
      }

      // ── Calcul des sizes avec compensation delta ───────────────────────────
      const baseSizeA      = sliceUsd / markPriceA
      const deltaAsset     = totalFilledA - totalFilledB
      const remainingSlices = totalSlices - i
      const isLast          = remainingSlices === 1
      const targetTotalA    = totalUsd / markPriceA

      const sizeA = isLast
        ? Math.max(0, targetTotalA - totalFilledA)
        : baseSizeA

      // Size B = size A + compensation du delta accumulé
      const sizeB = Math.max(0, sizeA + deltaAsset)

      // ── FIX #4 : appliquer le step size comme buildOrderParams ────────────
      const rawSizeA = applyStep(sizeA, stepSize, useStepSize)
      const rawSizeB = applyStep(sizeB, stepSize, useStepSize)

      if (rawSizeA <= 0 && rawSizeB <= 0) {
        addLog(`✅ Slice ${i + 1} ignorée — target atteint`, 'success')
        continue
      }

      patchSlice(i, {
        targetSizeA: rawSizeA,
        targetSizeB: rawSizeB,
        statusA: SLICE_STATUS.PLACING,
        statusB: SLICE_STATUS.PLACING,
      })

      // ── Place les deux ordres en parallèle ────────────────────────────────
      // FIX #1 : credentials spreadés dans params (comme buildOrderParams dans OpenTrade)
      //          placeOrderFn n'accepte plus qu'un seul argument
      // FIX #3 : orderType et leverage lus depuis legA/legB
      let orderIdA = null, orderIdB = null
      let errA = null,     errB = null

      const placeA = placeOrderFn({
        platformId:  legA.platformId,
        marketId:    legA.marketId,
        isBuy:       legA.isBuy,
        market:      legA.market,
        size:        rawSizeA,
        orderType:   legA.orderType ?? 'maker',   // FIX #3
        leverage:    legA.leverage  ?? null,       // FIX #3
        //limitPrice:  markPriceA,
        limitPrice: getLimitPriceFn(legA.platformId, legA.isBuy ? 'LONG' : 'SHORT', markPriceA),
        reduceOnly:  false,
        tpSlConfig:  null,
        ...credentials,                            // FIX #1
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
        orderType:   legB.orderType ?? 'maker',   // FIX #3
        leverage:    legB.leverage  ?? null,       // FIX #3
        //limitPrice:  markPriceB,
        limitPrice: getLimitPriceFnB(legB.platformId, legB.isBuy ? 'LONG' : 'SHORT', markPriceB),
        reduceOnly:  false,
        tpSlConfig:  null,
        ...credentials,                            // FIX #1
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

      if (errA || errB) {
        addLog(`⚠️ Erreur placement slice ${i + 1} — A: ${errA ?? 'ok'} | B: ${errB ?? 'ok'}`, 'warn')
        if (onErrorMode === 'abort') { setState(s => ({ ...s, status: 'error', errorMsg: errA ?? errB })); break }
        if (onErrorMode === 'pause') { pauseRef.current = true }
        continue
      }

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

        // FIX #1 : credentials spreadés dans params ici aussi
        // FIX #3 : leverage depuis leg
        const switchToTaker = async (leg, orderId, size, currentFilled, patchKey) => {
          if (orderId) await cancelOrder({ orderId, market: leg.market, platformId: leg.platformId, credentials })
          const remaining = Math.max(0, size - (currentFilled ?? 0))
          if (remaining <= 0) return { orderId: null, status: 'filled' }

          patchSlice(i, { [patchKey]: SLICE_STATUS.SWITCHING_TAKER })
          try {
            const price = await getMarkPrice(leg.marketId, leg.platformId)
            const res   = await placeOrderFn({
              platformId:  leg.platformId,
              marketId:    leg.marketId,
              isBuy:       leg.isBuy,
              market:      leg.market,
              size:        remaining,
              orderType:   'taker',
              leverage:    leg.leverage ?? null,   // FIX #3
              limitPrice:  price,
              reduceOnly:  false,
              tpSlConfig:  null,
              ...credentials,                      // FIX #1
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
          !aOk ? switchToTaker(legA, currentOrderIdA, rawSizeA, resA.filled, 'statusA') : Promise.resolve({ status: 'filled' }),
          !bOk ? switchToTaker(legB, currentOrderIdB, rawSizeB, resB.filled, 'statusB') : Promise.resolve({ status: 'filled' }),
        ])

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
