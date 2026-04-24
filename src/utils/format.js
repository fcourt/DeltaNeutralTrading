// src/utils/format.js
export const fmt    = (n, d = 2) => n == null ? '—' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d }).format(n)
export const fmtUSD = (n) => n == null ? '—' : (n < 0 ? '-$' : '$') + fmt(Math.abs(n), 2)
export const fmtPct = (n) => n == null ? '—' : (n >= 0 ? '+' : '') + (n * 100).toFixed(4) + '%'
