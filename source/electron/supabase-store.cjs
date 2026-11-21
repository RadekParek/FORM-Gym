'use strict';
/** One service instance owns this row; the service-role key never reaches the app. */
function createSupabaseStore(url, key) {
  if (!url || !key) return undefined;
  const endpoint = new URL('/rest/v1/form_state', url);
  if (endpoint.protocol !== 'https:') throw new Error('Supabase requires HTTPS.');
  async function request(method, body) {
    const target = new URL(endpoint);
    if (method === 'GET') target.search = '?id=eq.primary&select=payload';
    const response = await fetch(target, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Persistent storage request failed (${response.status}).`);
    return method === 'GET' ? response.json() : null;
  }
  return {
    read: async () => (await request('GET'))[0]?.payload || null,
    write: (value) => request('POST', { id: 'primary', payload: value }),
  };
}
module.exports = { createSupabaseStore };
