// src/services/accountService.js
import * as HL       from '../platforms/hyperliquid.js'
import * as Extended from '../platforms/extended.js'
import * as Nado     from '../platforms/nado.js'

export async function getAllMargins(credentials) {
  const results = await Promise.allSettled([
    HL.getMargin({ ...credentials, platformId: 'hyperliquid' }),
    HL.getMargin({ ...credentials, platformId: 'xyz'         }),
    HL.getMargin({ ...credentials, platformId: 'hyena'       }),
    Extended.getMargin(credentials),
    Nado.getMargin(credentials),
  ])
  const keys = ['hyperliquid', 'xyz', 'hyena', 'extended', 'nado']
  return Object.fromEntries(
    keys.map((key, i) => [key, results[i].status === 'fulfilled' ? results[i].value : null])
  )
}

export async function getAllPositions(credentials, markets = []) {
  const [hlPos, extPos, nadoPos] = await Promise.allSettled([
    HL.getPositions(credentials, markets),
    Extended.getPositions(credentials, markets),
    Nado.getPositions(credentials, markets),
  ])
  return [
    ...(hlPos.status   === 'fulfilled' ? hlPos.value   : []),
    ...(extPos.status  === 'fulfilled' ? extPos.value  : []),
    ...(nadoPos.status === 'fulfilled' ? nadoPos.value : []),
  ]
}
