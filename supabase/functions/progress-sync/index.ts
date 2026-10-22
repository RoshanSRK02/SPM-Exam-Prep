const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function hashSyncCode(syncCode: string) {
  const bytes = new TextEncoder().encode(syncCode);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Sync service is not configured.' }, 503);
  }

  let payload: { action?: string; syncCode?: string; progress?: unknown; expectedVersion?: number };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON request.' }, 400);
  }

  if (typeof payload.syncCode !== 'string' || !/^[a-f0-9]{48}$/.test(payload.syncCode)) {
    return jsonResponse({ error: 'Invalid sync code.' }, 400);
  }
  if (!['read', 'write'].includes(payload.action || '')) {
    return jsonResponse({ error: 'Invalid sync action.' }, 400);
  }

  const syncId = await hashSyncCode(payload.syncCode);
  const endpoint = `${supabaseUrl}/rest/v1/revision_progress`;
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };

  if (payload.action === 'read') {
    const response = await fetch(`${endpoint}?sync_id=eq.${syncId}&select=progress,version`, { headers });
    if (!response.ok) {
      return jsonResponse({ error: 'Unable to read synced progress.' }, 502);
    }
    const rows = await response.json();
    return jsonResponse({ progress: rows[0]?.progress ?? null, version: rows[0]?.version ?? 0 });
  }

  const progressJson = JSON.stringify(payload.progress);
  if (
    !payload.progress
    || typeof payload.progress !== 'object'
    || progressJson.length > 900_000
    || !Number.isInteger(payload.expectedVersion)
    || (payload.expectedVersion as number) < 0
  ) {
    return jsonResponse({ error: 'Invalid or oversized progress data.' }, 400);
  }

  const expectedVersion = payload.expectedVersion as number;
  const isCreate = expectedVersion === 0;
  const response = await fetch(
    isCreate
      ? `${endpoint}?on_conflict=sync_id&select=version`
      : `${endpoint}?sync_id=eq.${syncId}&version=eq.${expectedVersion}&select=version`,
    {
      method: isCreate ? 'POST' : 'PATCH',
      headers: {
        ...headers,
        Prefer: isCreate ? 'resolution=ignore-duplicates,return=representation' : 'return=representation',
      },
      body: JSON.stringify(isCreate
        ? { sync_id: syncId, version: 1, progress: payload.progress }
        : { version: expectedVersion + 1, progress: payload.progress, updated_at: new Date().toISOString() }),
    }
  );
  if (!response.ok) {
    return jsonResponse({ error: 'Unable to save synced progress.' }, 502);
  }
  const rows = await response.json();
  if (!rows.length) return jsonResponse({ error: 'Progress changed on another device. Retry sync.' }, 409);
  return jsonResponse({ saved: true, version: rows[0].version });
});
