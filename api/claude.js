export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body;

    // Sheets save request
    if (body.sheetsUrl) {
      const { sheetsUrl, ...record } = body;
      const response = await fetch(sheetsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
        redirect: 'follow'
      });
      const text = await response.text();
      return res.status(200).json({ status: 'ok', response: text });
    }

    // Claude AI request
    const { apiKey, mime, base64 } = body;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } },
            { type: 'text', text: 'Analizează eticheta și extrage câmpurile. Răspunde DOAR JSON pur fără markdown:\n{"partNumber":"...","descriere":"...","lot":"...","ms":"...","data":"..."}\n- partNumber: numărul principal de parte\n- descriere: descrierea componentei\n- lot: numărul LOT\n- ms: valoarea COMPLETĂ M/S cu durata (ex: "MS3 - 168 Hours", "MS2A - Four Weeks", "MS1 - Unlimited", "MSY - M/S - exact time")\n- data: data în DD.MM.YYYY\n- Câmpuri lipsă: ""' }
          ]
        }]
      })
    });
    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
