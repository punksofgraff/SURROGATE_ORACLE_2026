import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  },
  global: {
    headers: {
      'Content-Type': 'application/json'
    }
  },
  realtime: {
    params: {
      eventsPerSecond: 2
    }
  }
});

export type Database = {
  public: {
    Tables: {
      surrogate_sessions: {
        Row: {
          id: string;
          session_id: string;
          user_input: string | null;
          oracle_response: string | null;
          conversation_data: Record<string, any> & {
            did_session_cookie?: string; // D-ID session cookie for API requests
            did_stream_id?: string;
            did_session_id?: string;
            ice_servers?: any[];
            offer?: any;
            stream_created_at?: string;
            agent_id?: string;
            stream_type?: string;
            audio_enabled?: boolean;
            source_url?: string;
          };
          created_at: string;
        };
        Insert: {
          session_id: string;
          user_input?: string;
          oracle_response?: string;
          conversation_data?: Record<string, any>;
        };
        Update: {
          user_input?: string;
          oracle_response?: string;
          conversation_data?: Record<string, any>;
        };
      };
      surrogate_portraits: {
        Row: {
          id: string;
          session_id: string | null;
          email: string | null;
          portrait_url: string | null;
          conversation_themes: string[];
          created_at: string;
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