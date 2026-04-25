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
