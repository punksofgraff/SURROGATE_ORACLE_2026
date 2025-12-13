import { useState, useCallback, useRef, useEffect } from 'react';

interface UseAzureSTTProps {
  onTranscript: (text: string, isFinal: boolean) => void;
  onError: (error: string) => void;
  continuous?: boolean;
}

interface UseAzureSTTReturn {
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  isConnected: boolean;
  error: string | null;
  startListening: () => Promise<boolean>;
  stopListening: () => void;
  clearTranscript: () => void;
}

export function useAzureSTT({
  onTranscript,
  onError,
  continuous = true
}: UseAzureSTTProps): UseAzureSTTReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Check for browser support
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      setIsConnected(true);
    } else {
      setError('Speech recognition not supported in this browser');
      setIsConnected(false);
    }
  }, []);

  const startListening = useCallback(async (): Promise<boolean> => {
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      const errorMsg = 'Speech recognition not supported';
      setError(errorMsg);
      onError(errorMsg);
      return false;
    }

    try {
      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (permissionError) {
      const errorMsg = 'Microphone permission denied';
      setError(errorMsg);
      onError(errorMsg);
      return false;
    }

    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;

    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log('🎤 Speech recognition started');
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript) {
        setTranscript(finalTranscript);
        onTranscript(finalTranscript, true);
      }
      
      setInterimTranscript(interimTranscript);
      if (interimTranscript) {
        onTranscript(interimTranscript, false);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      const errorMsg = `Speech recognition error: ${event.error}`;
      setError(errorMsg);
      onError(errorMsg);
      setIsListening(false);
    };

    recognition.onend = () => {
      console.log('🎤 Speech recognition ended');
      setIsListening(false);
      
      // Auto-restart if continuous and no error
      if (continuous && !error) {
        setTimeout(() => {
          if (recognitionRef.current && !isListening) {
            recognition.start();
          }
        }, 100);
      }
    };

    try {
      recognition.start();
      return true;
    } catch (startError) {
      console.error('Failed to start recognition:', startError);
      const errorMsg = 'Failed to start speech recognition';
      setError(errorMsg);
      onError(errorMsg);
      return false;
    }
  }, [continuous, onTranscript, onError, error, isListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  return {
    isListening,
    transcript,
    interimTranscript,
    isConnected,
    error,
    startListening,
    stopListening,
    clearTranscript
  };
}