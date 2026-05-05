const SUPABASE_URL = 'https://vhmpwqezzssxyaexmsaz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_moJ2s7yqKplEtQA6xYskxw_BhN2-Ewo';

async function supabase(method, path, body = null) {
  const opts = {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=representation' : undefined
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
  if (res.status === 204) return null;
  return res.json();
}

async function getClaudeKey() {
  const config = await supabase('GET', 'config?key=eq.claude_api_key&select=value');
  if (config && config.length > 0) return config[0].value;
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body;
    const { action } = body;

    // ── AUTH ──────────────────────────────────────────
    if (action === 'login') {
      const { username, password } = body;
      const users = await supabase('GET', `users?username=eq.${encodeURIComponent(username)}&password_hash=eq.${encodeURIComponent(password)}&select=id,username,full_name,role`);
      if (!users || users.length === 0) return res.status(200).json({ error: 'Utilizator sau parolă incorectă' });
      return res.status(200).json({ user: users[0] });
    }

    if (action === 'changePassword') {
      const { userId, oldPassword, newPassword } = body;
      const users = await supabase('GET', `users?id=eq.${userId}&password_hash=eq.${encodeURIComponent(oldPassword)}`);
      if (!users || users.length === 0) return res.status(200).json({ error: 'Parola veche incorectă' });
      await supabase('PATCH', `users?id=eq.${userId}`, { password_hash: newPassword });
      return res.status(200).json({ success: true });
    }

    // ── ADMIN: USER MANAGEMENT ─────────────────────────
    if (action === 'getUsers') {
      const users = await supabase('GET', 'users?select=id,username,full_name,role,created_at&order=created_at');
      return res.status(200).json({ users });
    }

    if (action === 'createUser') {
      const { username, password, full_name, role } = body;
      const existing = await supabase('GET', `users?username=eq.${encodeURIComponent(username)}`);
      if (existing && existing.length > 0) return res.status(200).json({ error: 'Username există deja' });
      const user = await supabase('POST', 'users', { username, password_hash: password, full_name, role: role || 'user' });
      return res.status(200).json({ user: user[0] });
    }

    if (action === 'updateUser') {
      const { userId, username, full_name, role, password } = body;
      const updates = { username, full_name, role };
      if (password) updates.password_hash = password;
      await supabase('PATCH', `users?id=eq.${userId}`, updates);
      return res.status(200).json({ success: true });
    }

    if (action === 'deleteUser') {
      const { userId } = body;
      await supabase('DELETE', `stock?user_id=eq.${userId}`);
      await supabase('DELETE', `users?id=eq.${userId}`);
      return res.status(200).json({ success: true });
    }

    // ── STOCK ─────────────────────────────────────────
    if (action === 'getStock') {
      const { userId, role } = body;
      let path = 'stock?select=*';
      if (role !== 'admin') path += `&user_id=eq.${userId}`;
      const stock = await supabase('GET', path);
      // Sort numerically: LOW first (1,2,3...) then HIGH (M1,M2...)
      const sorted = (stock||[]).sort((a,b) => {
        const aH = a.position.toString().startsWith('M');
        const bH = b.position.toString().startsWith('M');
        if (aH !== bH) return aH ? 1 : -1;
        return parseInt(a.position.toString().replace('M','')) - parseInt(b.position.toString().replace('M',''));
      });
      return res.status(200).json({ stock: sorted });
    }

    if (action === 'saveRecord') {
      const { record, userId, username } = body;
      // Check if position exists for this user
      const existing = await supabase('GET', `stock?position=eq.${encodeURIComponent(record.position)}&user_id=eq.${userId}`);
      const data = { ...record, user_id: userId, username, updated_at: new Date().toISOString() };
      if (existing && existing.length > 0) {
        await supabase('PATCH', `stock?position=eq.${encodeURIComponent(record.position)}&user_id=eq.${userId}`, data);
      } else {
        await supabase('POST', 'stock', data);
      }
      return res.status(200).json({ success: true });
    }

    if (action === 'deleteRecord') {
      const { position, userId } = body;
      await supabase('DELETE', `stock?position=eq.${encodeURIComponent(position)}&user_id=eq.${userId}`);
      return res.status(200).json({ success: true });
    }

    if (action === 'getNextPosition') {
      const { msLevel, userId } = body;
      const prefix = msLevel === 'high' ? 'M' : '';
      const stock = await supabase('GET', `stock?select=position&user_id=eq.${userId}`);
      const positions = (stock || [])
        .map(r => r.position)
        .filter(p => msLevel === 'high' ? p.startsWith('M') : !p.startsWith('M'))
        .map(p => parseInt(p.replace('M', '')))
        .filter(n => !isNaN(n))
        .sort((a, b) => a - b);
      let next = 1;
      for (const p of positions) { if (p === next) next++; else break; }
      return res.status(200).json({ position: prefix + next });
    }

    if (action === 'search') {
      const { query } = body;
      const q = encodeURIComponent(`%${query}%`);
      const stock = await supabase('GET', `stock?or=(part_number.ilike.${q},descriere.ilike.${q},mfpn.ilike.${q})&select=*&order=position`);
      return res.status(200).json({ results: stock });
    }

    if (action === 'getReport') {
      const stock = await supabase('GET', 'stock?ms_level=eq.high&select=*&order=position');
      return res.status(200).json({ stock });
    }

    if (action === 'saveConfig') {
      const { key, value } = body;
      const existing = await supabase('GET', `config?key=eq.${key}`);
      if (existing && existing.length > 0) {
        await supabase('PATCH', `config?key=eq.${key}`, { value });
      } else {
        await supabase('POST', 'config', { key, value });
      }
      return res.status(200).json({ success: true });
    }

    // ── CLAUDE AI ─────────────────────────────────────
    if (action === 'analyzeImage') {
      const { mime, base64 } = body;
      const apiKey = body.apiKey || await getClaudeKey();
      if (!apiKey) return res.status(200).json({ error: 'API key neconfigurat de admin' });
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } },
              { type: 'text', text: 'Analizează eticheta și extrage câmpurile. Răspunde DOAR JSON pur fără markdown:\n{"partNumber":"...","descriere":"...","lot":"...","ms":"...","data":"...","mfpn":"..."}\n- partNumber: numărul principal de parte (ex: FLU4022 102 00158-LF)\n- descriere: descrierea componentei\n- lot: numărul LOT\n- ms: valoarea COMPLETĂ M/S cu durata (ex: "MS3 - 168 Hours", "MS2A - Four Weeks", "MS1 - Unlimited", "MSY - M/S - exact time", "MS0 - no MSL")\n- data: data MARE/ștampilată de pe etichetă în DD.MM.YYYY (prioritate la data scrisă cu font mare sau ștampilată, nu data din TRNS)\n- mfpn: manufacturer part number (al 3-lea element de jos în sus pe stânga, ex: CRCW04020000Z0ED)\n- Câmpuri lipsă: ""' }
            ]
          }]
        })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      const parsed = JSON.parse(data.content[0].text.replace(/```json|```/g, '').trim());
      return res.status(200).json(parsed);
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
