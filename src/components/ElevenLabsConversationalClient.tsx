export class ElevenLabsConversationalClient {
  private websocket: WebSocket | null = null;
  private conversationId: string | null = null;
  private isConnected = false;
  private isListening = false;
  private audioContext: AudioContext | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private maxRetries = 3;

  constructor(
    private sessionId: string,
    private userId: string,
    private onConnected: () => void,
    private onDisconnected: () => void,
    private onListeningStateChange: (isListening: boolean) => void,
    private onAudioReceived: (audioData: ArrayBuffer) => void,
    private onTranscriptReceived: (text: string, isUser: boolean, isFinal: boolean) => void,
    private onAgentResponse: (response: string) => void,
    private onError: (error: string) => void
  ) {}

  // Validate environment variables
  public static validateEnvironment(): { valid: boolean; missing: string[] } {
    const required = [
      'VITE_SUPABASE_URL',
      'VITE_SUPABASE_ANON_KEY',
      'VITE_ELEVENLABS_VOICE_ID'
    ];

    const missing = required.filter(key => !import.meta.env[key]);

    return {
      valid: missing.length === 0,
      missing
    };
  }

  // Audio playback method
  private async playAudioData(audioData: ArrayBuffer): Promise<void> {
    if (!this.audioContext) {
      console.warn('⚠️ No audio context for playback');
      return;
    }

    try {
      // Decode and play the audio
      const audioBuffer = await this.audioContext.decodeAudioData(audioData.slice(0));
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      source.start(0);
      
      console.log('🔊 Playing ElevenLabs audio response');
    } catch (error) {
      console.error('❌ Audio playback failed:', error);
    }
  }

  // D-ID integration bridge method
  public async sendMessageWithDIDSync(
    message: string, 
    didClient?: any
  ): Promise<boolean> {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      console.warn('⚠️ Cannot send message: WebSocket not connected');
      return false;
    }

    try {
      console.log('💬 Sending message with D-ID sync:', message);
      
      // Send to ElevenLabs for conversational response
      this.websocket.send(JSON.stringify({
        type: 'user_message',
        message: message
      }));

      // Set up one-time listener for agent response
      if (didClient) {
        const originalHandler = this.onAgentResponse;
        this.onAgentResponse = (response: string) => {
          // Send same text to D-ID for lip sync (muted)
          if (didClient.sendSilentScript) {
            didClient.sendSilentScript(response);
          }
          // Call original handler
          originalHandler(response);
        };
      }

      return true;
    } catch (error: any) {
      console.error('❌ Failed to send message with D-ID sync:', error);
      this.onError(`Failed to send message: ${error.message}`);
      return false;
    }
  }

  // Connection retry logic
  private async connectWithRetry(websocketUrl: string): Promise<void> {
    let attempt = 0;
    
    while (attempt < this.maxRetries) {
      try {
        await this.connectWebSocket(websocketUrl);
        return; // Success
      } catch (error) {
        attempt++;
        console.warn(`⚠️ WebSocket connection attempt ${attempt} failed:`, error);
        
        if (attempt >= this.maxRetries) {
          throw new Error(`Failed to connect after ${this.maxRetries} attempts`);
        }
        
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  async initialize(): Promise<boolean> {
    try {
      // Validate environment
      const envCheck = ElevenLabsConversationalClient.validateEnvironment();
      if (!envCheck.valid) {
        console.error('❌ Missing environment variables:', envCheck.missing);
        this.onError(`Missing environment variables: ${envCheck.missing.join(', ')}`);
        return false;
      }

      console.log('🚀 Initializing ElevenLabs Conversational AI...');
      
      // Create conversation session
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-conversational-ai`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'create_conversation',
          sessionId: this.sessionId,
          userId: this.userId,
          voiceId: import.meta.env.VITE_ELEVENLABS_VOICE_ID || 'pkVKlZzgF2P5dTEGkrVh',
          agentId: import.meta.env.VITE_ELEVEN_LABS_AGENT_ID || 'agent_01jx5fmxggexnsezfytb06gyd2'
        })
      });

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error);
      }

      this.conversationId = data.conversationId;
      console.log('✅ ElevenLabs conversation created:', this.conversationId);

      // Initialize WebSocket connection
      await this.connectWithRetry(data.websocketUrl);
      
      // Initialize audio context for microphone
      await this.initializeAudio();

      return true;
    } catch (error: any) {
      console.error('❌ ElevenLabs initialization failed:', error);
      this.onError(`Initialization failed: ${error.message}`);
      return false;
    }
  }

  private async connectWebSocket(websocketUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log('🔌 Connecting to ElevenLabs WebSocket...');
        this.websocket = new WebSocket(websocketUrl);
        
        this.websocket.onopen = () => {
          console.log('🎤 ElevenLabs WebSocket connected');
          this.isConnected = true;
          this.onConnected();
          resolve();
        };

        this.websocket.onclose = () => {
          console.log('🔌 ElevenLabs WebSocket disconnected');
          this.isConnected = false;
          this.onDisconnected();
        };

        this.websocket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleWebSocketMessage(data);
          } catch (error) {
            console.error('❌ WebSocket message parse error:', error);
          }
        };

        this.websocket.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
          this.onError('WebSocket connection failed');
          reject(error);
        };

        // Timeout after 10 seconds
        setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error('WebSocket connection timeout'));
          }
        }, 10000);

      } catch (error) {
        reject(error);
      }
    });
  }

  private handleWebSocketMessage(data: any) {
    console.log('📨 ElevenLabs message:', data);

    switch (data.type) {
      case 'conversation_initiation_metadata':
        console.log('🎯 Conversation initiated');
        break;
      case 'audio':
        if (data.audio_base64) {
          const audioData = this.base64ToArrayBuffer(data.audio_base64);
          this.onAudioReceived(audioData);
          // Play the audio immediately
          this.playAudioData(audioData);
        }
        break;
      case 'user_transcript':
        this.onTranscriptReceived(data.message, true, data.is_final || false);
        break;
      case 'agent_response':
        this.onAgentResponse(data.message);
        this.onTranscriptReceived(data.message, false, true);
        break;
      case 'interruption':
        console.log('🛑 Conversation interrupted');
        break;
      case 'ping':
        // Send pong back
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
          this.websocket.send(JSON.stringify({ type: 'pong' }));
        }
        break;
      case 'error':
        console.error('❌ ElevenLabs conversation error:', data);
        this.onError(data.message || 'Conversation error');
        break;
    }
  }

  private async initializeAudio(): Promise<void> {
    try {
      console.log('🎤 Initializing audio context...');
      
      // Initialize audio context
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Resume audio context (required by browsers)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
        console.log('🔊 Audio context resumed');
      }
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
          channelCount: 1 // Mono for better performance
        } 
      });

      // Check for supported MIME types
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

      console.log('🎤 Using MIME type:', mimeType);

      // Initialize media recorder for streaming audio to ElevenLabs
      this.mediaRecorder = new MediaRecorder(stream, { mimeType });

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0 && this.isListening) {
          this.audioChunks.push(event.data);
          this.sendAudioChunk(event.data);
        }
      };

      this.mediaRecorder.onerror = (event) => {
        console.error('❌ MediaRecorder error:', event);
        this.onError('Microphone recording failed');
      };

      console.log('✅ Audio initialized successfully');
    } catch (error: any) {
      console.error('❌ Audio initialization failed:', error);
      this.onError(`Audio setup failed: ${error.message}`);
    }
  }

  private async sendAudioChunk(audioBlob: Blob): Promise<void> {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) return;

    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Audio = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      
      this.websocket.send(JSON.stringify({
        type: 'audio',
        audio_base64: base64Audio
      }));
    } catch (error) {
      console.error('❌ Failed to send audio chunk:', error);
    }
  }

  public startListening(): boolean {
    if (!this.isConnected || !this.mediaRecorder || this.isListening) {
      console.warn('⚠️ Cannot start listening: not ready');
      return false;
    }

    try {
      console.log('🎤 Starting ElevenLabs listening...');
      this.audioChunks = [];
      this.mediaRecorder.start(100); // Send audio chunks every 100ms
      this.isListening = true;
      this.onListeningStateChange(true);
      return true;
    } catch (error: any) {
      console.error('❌ Failed to start listening:', error);
      this.onError(`Failed to start listening: ${error.message}`);
      return false;
    }
  }

  public stopListening(): void {
    if (!this.isListening || !this.mediaRecorder) return;

    try {
      console.log('🛑 Stopping ElevenLabs listening...');
      this.mediaRecorder.stop();
      this.isListening = false;
      this.onListeningStateChange(false);
    } catch (error: any) {
      console.error('❌ Failed to stop listening:', error);
    }
  }

  public sendTextMessage(message: string): boolean {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      console.warn('⚠️ Cannot send message: WebSocket not connected');
      return false;
    }

    try {
      console.log('💬 Sending text message:', message);
      this.websocket.send(JSON.stringify({
        type: 'user_message',
        message: message
      }));
      return true;
    } catch (error: any) {
      console.error('❌ Failed to send text message:', error);
      this.onError(`Failed to send message: ${error.message}`);
      return false;
    }
  }

  public disconnect(): void {
    console.log('🔌 Disconnecting ElevenLabs Conversational AI...');

    this.stopListening();

    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.conversationId = null;
    this.isConnected = false;
    this.isListening = false;
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  public isReady(): boolean {
    return this.isConnected;
  }

  public getListeningState(): boolean {
    return this.isListening;
  }

  public getConversationId(): string | null {
    return this.conversationId;
  }
}