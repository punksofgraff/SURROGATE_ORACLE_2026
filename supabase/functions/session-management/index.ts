import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://thesurrogate.me',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
};

interface SessionRequest {
  action: 'create' | 'get' | 'update' | 'delete';
  sessionId?: string;
  data?: Record<string, any>;
}

interface SessionResponse {
  success: boolean;
  sessionId?: string;
  sessionData?: any;
  error?: string;
}

function generateSecureSessionId(): string {
  return crypto.randomUUID();
}

Deno.serve(async (req: Request) => {
  try {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: corsHeaders,
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    if (req.method === 'POST') {
      const { action, sessionId, data }: SessionRequest = await req.json();

      switch (action) {
        case 'create': {
          const newSessionId = generateSecureSessionId();
          
          const { error: insertError } = await supabase
            .from('surrogate_sessions')
            .insert({
              session_id: newSessionId,
              conversation_data: data || {},
            });

          if (insertError) {
            console.error('Session creation error:', insertError);
            return new Response(
              JSON.stringify({ 
                success: false,
                error: 'Failed to create session',
              }),
              {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              }
            );
          }

          return new Response(
            JSON.stringify({ 
              success: true,
              sessionId: newSessionId,
            }),
            {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        case 'update': {
          if (!sessionId) {
            return new Response(
              JSON.stringify({ 
                success: false,
                error: 'Session ID required for update',
              }),
              {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              }
            );
          }

          const { error: updateError } = await supabase
            .from('surrogate_sessions')
            .update({ conversation_data: data })
            .eq('session_id', sessionId);

          if (updateError) {
            console.error('Session update error:', updateError);
            return new Response(
              JSON.stringify({ 
                success: false,
                error: 'Failed to update session',
              }),
              {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              }
            );
          }

          return new Response(
            JSON.stringify({ success: true }),
            {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        case 'delete': {
          if (!sessionId) {
            return new Response(
              JSON.stringify({ 
                success: false,
                error: 'Session ID required for deletion',
              }),
              {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              }
            );
          }

          const { error: deleteError } = await supabase
            .from('surrogate_sessions')
            .delete()
            .eq('session_id', sessionId);

          if (deleteError) {
            console.error('Session deletion error:', deleteError);
            return new Response(
              JSON.stringify({ 
                success: false,
                error: 'Failed to delete session',
              }),
              {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              }
            );
          }

          return new Response(
            JSON.stringify({ success: true }),
            {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        default:
          return new Response(
            JSON.stringify({ 
              success: false,
              error: 'Invalid action',
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
      }
    }

    if (req.method === 'GET') {
      const url = new URL(req.url);
      const sessionId = url.searchParams.get('sessionId');

      if (!sessionId) {
        return new Response(
          JSON.stringify({ 
            success: false,
            error: 'Session ID required',
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const { data: sessionData, error: getError } = await supabase
        .from('surrogate_sessions')
        .select('*')
        .eq('session_id', sessionId)
        .single();

      if (getError) {
        console.error('Session retrieval error:', getError);
        return new Response(
          JSON.stringify({ 
            success: false,
            error: 'Session not found',
          }),
          {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true,
          sessionData,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Session management error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Internal server error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});