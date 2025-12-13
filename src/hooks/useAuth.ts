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
  handleDevBypass: (password: string) => boolean;
  clearError: () => void;
}

/**
 * Custom hook for authentication management
 * Centralizes Google OAuth and dev bypass logic
 */
export function useAuth(onSuccess: (user: AuthUser) => void): UseAuthReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = () => setError(null);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        }
      });

      if (error) throw error;
      
      // Note: OAuth redirect will handle success, so we don't call onSuccess here
    } catch (error: any) {
      console.error('Google sign-in error:', error);
      setError(error.message || 'Sign-in failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDevBypass = (password: string): boolean => {
    // DEV ONLY: This bypass is strictly for development environments
    // In production, this should be disabled or removed entirely
    if (password === '3nculturate!') {
      // Create mock user session for development testing
      const mockUser: AuthUser = {
        id: 'dev-user-' + Date.now(),
        email: 'dev@sneakar.io',
        user_metadata: {
          full_name: 'Developer User',
          avatar_url: 'https://i.postimg.cc/26pvW2SN/orackle-only-static.png'
        }
      };
      
      // Store in localStorage for dev session persistence
      // WARNING: This is for development only and should not be used in production
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
    handleDevBypass,
    clearError
  };
}