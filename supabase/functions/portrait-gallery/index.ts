import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://thesurrogate.me',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey, x-oracle-request-id, x-oracle-session-id',
};

// portrait-gallery — server-side proxy for surrogate_portraits table access.
// All client reads/deletes to surrogate_portraits must go through this function so
// that RLS can be fully locked down on that table (service_role bypasses RLS).
//
// SECURITY MODEL: the app has no login system, so ownership is proven by
// possession of the session UUID — a 128-bit random value generated client-side
// (crypto.randomUUID) and held only in that device's localStorage. It functions
// as an unguessable capability token, like an unlisted link.
//
// Guessable identifiers (email, user_id) are NOT accepted as ownership proof:
// anyone who knows a seeker's email could otherwise list/delete their portraits.
//
// POST { action: 'list', sessionId: <uuid>, limit? }   → { data: Portrait[] }
// POST { action: 'delete', id: <uuid>, sessionId: <uuid> } → { deleted: boolean }
//   Delete is scoped WHERE id = $id AND session_id = $sessionId — a caller can
//   never delete a row belonging to another session.
//
// Portrait CREATION is unaffected — gemini-portrait-generator writes with the
// service_role key (bypasses RLS) so no change is needed on the write path.

interface PortraitGalleryBody {
  action: 'list' | 'delete';
  sessionId?: string;
  limit?: number;
  id?: string;
  // Legacy fields — no longer accepted as ownership proof.
  userId?: string;
  email?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  // Dev-trace correlation: echo client-supplied ids into function logs (no-op for real seekers).
  { const _rid = req.headers.get('x-oracle-request-id'); if (_rid) console.log('[trace] rid=' + _rid + ' sid=' + (req.headers.get('x-oracle-session-id') ?? '')); }
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return json(405, { success: false, error: 'Method not allowed' });
    }

    const body: PortraitGalleryBody | null = await req.json().catch(() => null);
    if (!body || !body.action) {
      return json(400, { success: false, error: 'action is required' });
    }

    const { action, sessionId } = body;

    // Ownership requires the session capability token — a well-formed UUID.
    if (!sessionId || !UUID_RE.test(sessionId)) {
      return json(400, {
        success: false,
        error: 'A valid sessionId is required. Portraits are scoped to the session that created them.',
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // ---- LIST: fetch portraits belonging to this session only ----
    if (action === 'list') {
      const limit = Math.min(Math.max(Number(body.limit) || 20, 1), 100);

      const { data, error } = await supabase
        .from('surrogate_portraits')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('portrait-gallery list failed:', error);
        return json(500, { success: false, error: `Failed to list portraits: ${error.message}` });
      }

      return json(200, { data: data ?? [] });
    }

    // ---- DELETE: session-scoped delete by id ----
    if (action === 'delete') {
      if (!body.id || !UUID_RE.test(body.id)) {
        return json(400, { success: false, error: 'A valid portrait id is required for delete' });
      }

      const { data, error } = await supabase
        .from('surrogate_portraits')
        .delete()
        .eq('id', body.id)
        .eq('session_id', sessionId)
        .select();

      if (error) {
        console.error('portrait-gallery delete failed:', error);
        return json(500, { success: false, error: `Failed to delete portrait: ${error.message}` });
      }

      // Empty data = row didn't exist or isn't owned by this session.
      const deleted = Array.isArray(data) && data.length > 0;
      return json(200, { deleted });
    }

    return json(400, { success: false, error: `Unknown action: ${action}` });
  } catch (error) {
    console.error('portrait-gallery error:', error);
    return json(500, { success: false, error: `Internal server error: ${(error as Error).message}` });
  }
});
