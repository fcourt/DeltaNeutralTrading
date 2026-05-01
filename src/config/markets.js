// src/config/markets.js

export const EMPTY_MARKET = {
  id: '', label: '— Sélectionner un marché —',
  category: null,
  keys: { hl: null, ext: null, nado: null },
  // ── Nouvelle plateforme ──
  // keys: { hl: null, ext: null, nado: null, maPf: null },
  assetIndex: null, nadoProductId: null,
}

export const HL_KEY_OVERRIDES = {
  'xyz:XYZ100':   { id: 'NASDAQ' },
  'xyz:CL':       { id: 'OIL'    },
  'xyz:BRENTOIL': { id: 'BRENT'  },
  'xyz:PLATINUM': { id: 'PLAT'   },
  'xyz:NATGAS':   { id: 'NGAS'   },
}

export const MARKET_LABELS = {
  NASDAQ: 'Nasdaq',   OIL: 'WTI Oil',    BRENT: 'Brent',
  PLAT: 'Platinum',   NGAS: 'Nat. Gas',  SP500: 'S&P 500',
  JP225: 'Nikkei 225',GOLD: 'Gold',      SILVER: 'Silver',
  COPPER: 'Copper',   PALLADIUM: 'Palladium', URANIUM: 'Uranium',
  COIN: 'Coinbase',   PLTR: 'Palantir',  MSTR: 'MicroStrategy',
  GOOGL: 'Google',    META: 'Meta',      LLY: 'Eli Lilly',
  TSM: 'TSMC',        HOOD: 'Robinhood', CRCL: 'Circle',
  SNDK: 'SanDisk',    NFLX: 'Netflix',   ORCL: 'Oracle',
}

const INDICES = new Set(['SP500','NASDAQ','JP225','VIX','DXY'])
const COMMOS  = new Set(['GOLD','SILVER','OIL','BRENT','COPPER','PLAT','PALLADIUM','NGAS','URANIUM'])

export function inferCategory(id) {
  if (INDICES.has(id)) return 'Indices'
  if (COMMOS.has(id))  return 'Commodités'
  return 'Equities'
}

// Overrides par source — à étendre pour chaque nouvelle plateforme
export const KEY_OVERRIDES = {
  hl: {
    // Aucun override côté HL (les clés sont construites dynamiquement via getMarkets)
  },
  ext: {
    GOLD: 'XAU-USD',  SILVER: 'XAG-USD',  OIL: 'WTI-USD',
    BRENT: 'XBR-USD', COPPER: 'XCU-USD',  PLAT: 'XPT-USD',
    NGAS: 'XNG-USD',  SP500: 'SPX500m-USD', NASDAQ: 'TECH100m-USD',
  },
  nado: {
    SILVER: 'XAG',
    OIL:    'WTI',
  },
  // ── Nouvelle plateforme ──
  // maPf: {
  //   GOLD: 'XAUUSDT',
  //   OIL:  'WTIUSDT',
  // },
}

// Rétrocompatibilité — à supprimer après migration des consommateurs
export const EXT_KEY_OVERRIDES  = KEY_OVERRIDES.ext
export const NADO_KEY_OVERRIDES = KEY_OVERRIDES.nado

export const NADO_ONLY_MARKETS = [
  { id: 'XRP',    label: 'XRP',      keys: { nado: 'XRP'    }, category: 'Crypto'  },
  { id: 'BNB',    label: 'BNB',      keys: { nado: 'BNB'    }, category: 'Crypto'  },
  { id: 'HYPE',   label: 'HYPE',     keys: { nado: 'HYPE'   }, category: 'Crypto'  },
  { id: 'SUI',    label: 'SUI',      keys: { nado: 'SUI'    }, category: 'Crypto'  },
  { id: 'DOGE',   label: 'DOGE',     keys: { nado: 'DOGE'   }, category: 'Crypto'  },
  { id: 'AAVE',   label: 'AAVE',     keys: { nado: 'AAVE'   }, category: 'Crypto'  },
  { id: 'LINK',   label: 'LINK',     keys: { nado: 'LINK'   }, category: 'Crypto'  },
  { id: 'EURUSD', label: 'EUR/USD',  keys: { nado: 'EURUSD' }, category: 'FX'      },
  { id: 'GBPUSD', label: 'GBP/USD',  keys: { nado: 'GBPUSD' }, category: 'FX'      },
  { id: 'USDJPY', label: 'USD/JPY',  keys: { nado: 'USDJPY' }, category: 'FX'      },
  { id: 'SPY',    label: 'SPY ETF',  keys: { nado: 'SPY'    }, category: 'Indices' },
  { id: 'QQQ',    label: 'QQQ ETF',  keys: { nado: 'QQQ'    }, category: 'Indices' },
]

/*
KEY_OVERRIDES — objet unifié indexé par source, remplace EXT_KEY_OVERRIDES et NADO_KEY_OVERRIDES séparés ; les anciens exports sont conservés en rétrocompat
*/
