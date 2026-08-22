import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { checkDevUnlock } from '../lib/devAccess';

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

// Dev & Prod Solution for Redirects
const getRedirectUrl = () => {
  // Uses VITE_SITE_URL in prod, falls back to dynamic Replit/local URL in dev
  let url = import.meta.env.VITE_SITE_URL ?? window.location.origin;
  // Ensure trailing slash for consistent Supabase redirect matching
  url = url.endsWith('/') ? url : `${url}/`;
  return url;
};

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
          redirectTo: getRedirectUrl(),
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
    console.log('🔄 handleEmailSignIn invoked for:', email);
    setIsLoading(true);
    setError(null);
    try {
      const redirectUrl = getRedirectUrl();
      console.log('🔗 Computed redirect URL:', redirectUrl);
      
      console.log('📡 Calling supabase.auth.signInWithOtp...');
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          // Re-added with robust Dev/Prod URL handling in case Supabase forces a redirect flow
          emailRedirectTo: redirectUrl,
        },
      });
      
      if (error) {
        console.error('❌ Supabase signInWithOtp error:', error);
        throw error;
      }
      
      console.log('✅ OTP requested successfully');
      return true;
    } catch (err: unknown) {
      console.error('💥 Caught error in handleEmailSignIn:', err);
      setError((err as Error).message);
      return false;
    } finally {
      setIsLoading(false);
      console.log('🏁 handleEmailSignIn finished');
    }
  };

  const handleVerifyOtp = async (email: string, token: string) => {
    console.log('🔄 handleVerifyOtp invoked for:', email, 'with token:', token);
    setIsLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'email',
      });
      if (error) {
        console.error('❌ Supabase verifyOtp error:', error);
        throw error;
      }
      if (data.user) {
        console.log('✅ OTP Verified Successfully! Calling onSuccess callback...');
        onSuccess({
          id: data.user.id,
          email: data.user.email || '',
        });
      } else {
        console.warn('⚠️ OTP Verified, but no user object returned from Supabase data');
      }
    } catch (err: unknown) {
      console.error('💥 Caught error in handleVerifyOtp:', err);
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
      console.log('🏁 handleVerifyOtp finished');
    }
  };

  const handleDevBypass = (password: string): boolean => {
    if (checkDevUnlock(password)) {
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
