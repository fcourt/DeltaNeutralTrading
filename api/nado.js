/*
// api/nado.js — si proxy toujours nécessaire
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    // Paramètre optionnel ?action=execute pour router vers /v1/execute
    const action = req.query?.action === 'execute' ? 'execute' : 'query';
    const response = await fetch(`https://gateway.prod.nado.xyz/v1/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Encoding': 'gzip',
      },
      body: JSON.stringify(req.body),
    });
    const text = await response.text();
    res.setHeader('Content-Type', 'application/json');
    res.status(response.status).send(text);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
*/

// api/nado.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { action = 'query', endpoint = 'gateway' } = req.query

  const BASE_URLS = {
    gateway: 'https://gateway.prod.nado.xyz/v1',
    trigger: 'https://trigger.prod.nado.xyz/v1',
  }

  const base = BASE_URLS[endpoint] ?? BASE_URLS.gateway
  const route = endpoint === 'trigger' ? 'execute' : (action === 'execute' ? 'execute' : 'query')

  try {
    const response = await fetch(`${base}/${route}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept-Encoding': 'gzip',
      },
      body: JSON.stringify(req.body),
    })
    const text = await response.text()
    res.setHeader('Content-Type', 'application/json')
    res.status(response.status).send(text)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
}

/*// Ordre normal
fetch('/api/nado?action=execute', ...)

// Query marché
fetch('/api/nado?action=query', ...)

// TP/SL trigger
fetch('/api/nado?endpoint=trigger', ...)
*/
