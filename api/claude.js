exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  try {
    const body = JSON.parse(event.body);

    // Sheets save request
    if (body.sheetsUrl) {
      const { sheetsUrl, ...record } = body;
      const res = await fetch(sheetsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
        redirect: 'follow'
      });
      const text = await res.text();
      return { statusCode: 200, headers: corsHeaders, body: text };
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
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(data) };

  } catch (err) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
  }
};
