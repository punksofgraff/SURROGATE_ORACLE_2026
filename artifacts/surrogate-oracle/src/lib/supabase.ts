import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Missing Supabase environment variables - some features will be disabled');
}

if (!supabaseServiceRoleKey) {
  console.warn('Missing Supabase service role key - Edge Function calls may be limited');
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

export const supabaseEdgeFunctionHeaders: Record<string, string> = {
  'Content-Type': 'application/json',
};

if (supabaseServiceRoleKey) {
  supabaseEdgeFunctionHeaders.Authorization = `Bearer ${supabaseServiceRoleKey}`;
  supabaseEdgeFunctionHeaders.apikey = supabaseServiceRoleKey;
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
