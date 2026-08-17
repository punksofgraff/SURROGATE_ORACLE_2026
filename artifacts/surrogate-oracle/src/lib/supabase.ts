import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Missing Supabase environment variables - some features will be disabled');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        'Content-Type': 'application/json',
      },
    },
    realtime: {
      params: {
        eventsPerSecond: 2,
      },
    },
  }
);

// We no longer attach the service role key to headers on the client. 
// Edge functions must be invoked with the standard anon key or user session token.
export const supabaseEdgeFunctionHeaders: Record<string, string> = {
  'Content-Type': 'application/json',
  'apikey': supabaseAnonKey || '',
};

/**
 * Invoke an edge function via raw fetch with `keepalive: true`, so the request
 * survives page unload/navigation. Use for post-session writes fired during
 * exit teardown (seeker-echo upsert, oracle-memory-distill) — a fast exit or
 * tab close must not drop them. Note: keepalive caps the body at ~64KB; both
 * exit-path payloads are well under that.
 *
 * Same auth surface as supabase.functions.invoke (anon key), no client state.
 */
export function invokeFunctionKeepalive(name: string, body: unknown): Promise<Response> {
  if (!supabaseUrl || !supabaseAnonKey) {
    return Promise.reject(new Error(`[keepalive] Supabase env missing — cannot invoke ${name}`));
  }
  const payload = JSON.stringify(body);
  // Browsers reject keepalive requests over ~64KB with a TypeError before the
  // request is even sent. A marathon session's distill payload could cross
  // that line — better to send it WITHOUT keepalive (still usually lands,
  // since the Talisman window keeps the page alive ~3s) than not at all.
  const useKeepalive = payload.length < 60_000;
  return fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    keepalive: useKeepalive,
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
    },
    body: payload,
  }).then((res) => {
    if (!res.ok) throw new Error(`[keepalive] ${name} responded ${res.status}`);
    return res;
  });
}

export type Database = {
  public: {
    Tables: {
      surrogate_sessions: {
        Row: {
          id: string;
          session_id: string;
          user_input: string | null;
          oracle_response: string | null;
          conversation_data: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          session_id: string;
          user_input?: string;
          oracle_response?: string;
          conversation_data?: Record<string, unknown>;
        };
        Update: {
          user_input?: string;
          oracle_response?: string;
          conversation_data?: Record<string, unknown>;
        };
      };
      surrogate_portraits: {
        Row: {
          id: string;
          session_id: string | null;
          email: string | null;
          portrait_url: string | null;
          image_url: string | null;
          conversation_themes: string[];
          created_at: string;
          dalle_generated?: boolean;
          google_ai_generated?: boolean;
          user_id?: string;
          generation_method?: string;
          style_prompt?: string;
        };
        Insert: {
          session_id?: string;
          email?: string;
          portrait_url?: string;
          conversation_themes?: string[];
        };
        Update: {
          session_id?: string;
          email?: string;
          portrait_url?: string;
          conversation_themes?: string[];
        };
      };
      culture_crew: {
        Row: {
          id: string;
          email: string;
          source: string;
          onboarded_at: string;
        };
        Insert: {
          email: string;
          source?: string;
        };
        Update: {
          email?: string;
          source?: string;
        };
      };
    };
  };
};
