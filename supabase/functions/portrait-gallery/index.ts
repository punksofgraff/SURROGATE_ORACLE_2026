import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
};

// portrait-gallery — server-side proxy for surrogate_portraits table access.
// All client reads/deletes to surrogate_portraits must go through this function so
// that RLS can be fully locked down on that table (service_role bypasses RLS).
//
// POST { action: 'list', userId?, email?, sessionId?, limit? }
//   → { data: Portrait[] }
//   ENFORCE: at least one of userId/email/sessionId must be provided.
//   Precedence: userId first, else email, else sessionId.
//
// POST { action: 'delete', id: string, userId?, email?, sessionId? }
//   → { deleted: boolean }
//   REQUIRE: id AND at least one owner identifier.
//   Ownership-scoped: WHERE id = $id AND (user_id=.. OR email=.. OR session_id=..)
//   so a caller can never delete a row they don't own.
//
// Portrait CREATION is unaffected — gemini-portrait-generator writes with the
// service_role key (bypasses RLS) so no change is needed on the write path.

interface PortraitGalleryBody {
  action: 'list' | 'delete';
  userId?: string;
  email?: string;
  sessionId?: string;
  limit?: number;
  id?: string;
}

/** Build a Supabase `.or()` filter string from the provided owner identifiers. */
function buildOwnerFilter(userId?: string, email?: string, sessionId?: string): string {
  const clauses: string[] = [];
  if (userId)    clauses.push(`user_id.eq.${userId}`);
  if (email)     clauses.push(`email.eq.${email}`);
  if (sessionId) clauses.push(`session_id.eq.${sessionId}`);
  return clauses.join(',');
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ success: false, error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: PortraitGalleryBody = await req.json().catch(() => null);

    if (!body || !body.action) {
      return new Response(
        JSON.stringify({ success: false, error: 'action is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, userId, email, sessionId } = body;
    const hasOwner = !!(userId || email || sessionId);

    // ---- LIST: fetch portraits scoped to the caller's identity ----
    if (action === 'list') {
      // Hard gate: never run an unfiltered SELECT on the whole table
      if (!hasOwner) {
        return new Response(
          JSON.stringify({ data: [] }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const limit = body.limit ?? 20;

      // Build the query with identifier precedence: userId > email > sessionId
      let query = supabase
        .from('surrogate_portraits')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (userId)        query = query.eq('user_id', userId);
      else if (email)    query = query.eq('email', email);
      else if (sessionId) query = query.eq('session_id', sessionId);

      const { data, error } = await query;

      if (error) {
        console.error('portrait-gallery list failed:', error);
        return new Response(
          JSON.stringify({ success: false, error: `Failed to list portraits: ${error.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ data: data ?? [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ---- DELETE: ownership-scoped delete by id ----
    if (action === 'delete') {
      if (!body.id) {
        return new Response(
          JSON.stringify({ success: false, error: 'id is required for delete' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (!hasOwner) {
        return new Response(
          JSON.stringify({ success: false, error: 'At least one owner identifier (userId, email, or sessionId) is required for delete' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Count how many owner identifiers were provided
      const ownerCount = [userId, email, sessionId].filter(Boolean).length;

      // Build ownership-scoped delete:
      //   WHERE id = $id AND (user_id=.. OR email=.. OR session_id=..)
      // If only ONE identifier is present, use a plain .eq() to avoid filter-string
      // parsing issues (emails contain dots and @ which can trip up .or() parsing).
      let deleteQuery = supabase
        .from('surrogate_portraits')
        .delete()
        .eq('id', body.id);

      if (ownerCount === 1) {
        // Single identifier — use plain .eq() for safety
        if (userId)         deleteQuery = deleteQuery.eq('user_id', userId);
        else if (email)     deleteQuery = deleteQuery.eq('email', email);
        else if (sessionId) deleteQuery = deleteQuery.eq('session_id', sessionId);
      } else {
        // Multiple identifiers — use .or() so any matching identity claim succeeds
        deleteQuery = deleteQuery.or(buildOwnerFilter(userId, email, sessionId));
      }

      const { data, error } = await deleteQuery.select();

      if (error) {
        console.error('portrait-gallery delete failed:', error);
        return new Response(
          JSON.stringify({ success: false, error: `Failed to delete portrait: ${error.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // If data is empty, the row either didn't exist or wasn't owned by the caller.
      // Report deleted:false rather than erroring hard — the UI can handle this gracefully.
      const deleted = Array.isArray(data) && data.length > 0;

      return new Response(
        JSON.stringify({ deleted }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('portrait-gallery error:', error);
    return new Response(
      JSON.stringify({ success: false, error: `Internal server error: ${(error as Error).message}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
