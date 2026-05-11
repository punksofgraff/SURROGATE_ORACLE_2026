import { useState } from 'react';
import { supabase } from '../lib/supabase';

interface AuthUser {
  id: string;
  email: string;
  user_metadata?: {
    full_name?: string;
    avatar_url?: string;
  };
}

interface UseAuthReturn {
  isLoading: boolean;
  error: string | null;
  handleGoogleSignIn: () => Promise<void>;
  handleEmailSignIn: (email: string) => Promise<boolean>;
  handleVerifyOtp: (email: string, token: string) => Promise<void>;
  handleDevBypass: (password: string) => boolean;
  clearError: () => void;
}

export function useAuth(onSuccess: (user: AuthUser) => void): UseAuthReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = () => setError(null);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) throw error;
    } catch (err: unknown) {
      console.error('Google sign-in error:', err);
      setError((err as Error).message || 'Sign-in failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSignIn = async (email: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      return true;
    } catch (err: unknown) {
      setError((err as Error).message);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (email: string, token: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'email',
      });
      if (error) throw error;
      if (data.user) {
        onSuccess({
          id: data.user.id,
          email: data.user.email || '',
        });
      }
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDevBypass = (password: string): boolean => {
    if (password === '3nculturate!') {
      const mockUser: AuthUser = {
        id: 'dev-user-' + Date.now(),
        email: 'dev@sneakar.io',
        user_metadata: {
          full_name: 'Developer User',
          avatar_url: 'https://i.postimg.cc/26pvW2SN/orackle-only-static.png',
        },
      };

      localStorage.setItem('dev_user_session', JSON.stringify(mockUser));
      console.log('🛠️ DEV BYPASS ACTIVATED - Mock user session created');
      onSuccess(mockUser);
      return true;
    }

    setError('Invalid developer password');
    return false;
  };

  return {
    isLoading,
    error,
    handleGoogleSignIn,
    handleEmailSignIn,
    handleVerifyOtp,
    handleDevBypass,
    clearError,
  };
}
