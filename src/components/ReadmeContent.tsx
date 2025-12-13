import React from 'react';
import { Crown, Image, Globe, Terminal, CheckCircle, Link, Zap } from 'lucide-react';
import './ReadmeContent.css';

export function ReadmeContent() {
  return (
    <div className="readme-panel">
      <h2 className="oracle-title readme-title">SURROGATE Oracle Backend Dashboard</h2>
      
      <p className="info-text readme-description">
        Complete SURROGATE Oracle backend dashboard with optimized architecture,
        comprehensive cleanup, and production-ready components.
      </p>

      <h3 className="accent-text readme-section-title">Architecture Overview</h3>
      
      <p className="info-text readme-description">
        The SURROGATE Oracle system combines advanced AI services with WebRTC streaming to deliver
        an immersive cyberpunk oracle experience. Below are the key components:
      </p>

      <div className="readme-architecture-diagram">
        <div className="readme-component-group">
          <div className="readme-component">
            <Terminal className="w-5 h-5 text-purple-400" />
            <span className="info-text">D-ID WebRTC Streaming</span>
          </div>
          <div className="readme-component">
            <Image className="w-5 h-5 text-cyan-400" />
            <span className="info-text">AI Portrait Generation</span>
          </div>
          <div className="readme-component">
            <Globe className="w-5 h-5 text-green-400" />
            <span className="info-text">ElevenLabs Voice Synthesis</span>
          </div>
        </div>
      </div>

      <h3 className="accent-text readme-section-title">Core Features</h3>
      
      <ul className="readme-list">
        <li className="readme-list-item">
          <strong>D-ID Streaming Integration</strong>
          <p className="info-text">WebRTC streaming with voice modes, real-time diagnostics</p>
          <p className="info-text">Agent: <code className="readme-code">agt_EGmpzZtA</code></p>
        </li>
        <li className="readme-list-item">
          <strong>AI Portrait Generation</strong>
          <p className="info-text">Google AI integration, theme selection, fallback images</p>
        </li>
        <li className="readme-list-item">
          <strong>Culture Crew Management</strong>
          <p className="info-text">Community onboarding, email validation, access management</p>
        </li>
        <li className="readme-list-item">
          <strong>Theory of Mind Interface</strong>
          <p className="info-text">Consciousness exploration, Claude integration, conversation history</p>
        </li>
        <li className="readme-list-item">
          <strong>Voice Synthesis</strong>
          <p className="info-text">High-quality voice generation, audio controls, download</p>
        </li>
      </ul>

      <h3 className="accent-text readme-section-title">Learn2Earn Culture Coin System</h3>
      
      <div className="readme-learn2earn-info">
        <div className="readme-tier-header">
          <Crown className="w-6 h-6 text-yellow-400" />
          <h4 className="accent-text readme-subsection-title">Culture Coin Economy</h4>
        </div>
        <p className="info-text readme-description">
          The Culture Coin system rewards users for meaningful interactions with the Oracle.
          Users earn coins based on the quality and depth of their questions, with "sacred"
          themes earning more than "profane" ones.
        </p>
        <div className="readme-tier-features">
          <div className="readme-feature">
            <CheckCircle className="w-4 h-4 text-green-400" />
            <span className="info-text">Earn coins through consciousness-raising questions</span>
          </div>
          <div className="readme-feature">
            <CheckCircle className="w-4 h-4 text-green-400" />
            <span className="info-text">Level up through continued engagement</span>
          </div>
          <div className="readme-feature">
            <CheckCircle className="w-4 h-4 text-green-400" />
            <span className="info-text">Unlock premium features and content</span>
          </div>
        </div>
      </div>

      <h3 className="accent-text readme-section-title">Debugging Tools</h3>
      
      <p className="info-text readme-description">
        The Backend Debugger Dashboard provides comprehensive testing and monitoring tools:
      </p>
      
      <ul className="readme-list">
        <li className="readme-list-item"><strong>D-ID Streams</strong>: Test and debug WebRTC streaming</li>
        <li className="readme-list-item"><strong>ElevenLabs</strong>: Voice synthesis testing</li>
        <li className="readme-list-item"><strong>Claude</strong>: Oracle conversation testing</li>
        <li className="readme-list-item"><strong>Google AI</strong>: AI portrait generation testing</li>
        <li className="readme-list-item"><strong>Full Chain</strong>: Complete integration flow testing</li>
        <li className="readme-list-item"><strong>Gallery</strong>: Portrait gallery management</li>
      </ul>

      <h3 className="accent-text readme-section-title">Quick Start Guide</h3>
      
      <ol className="readme-list">
        <li className="readme-list-item">Click on the Oracle to initialize the D-ID stream</li>
        <li className="readme-list-item">Use PLAYTUNES to toggle lo-fi background music</li>
        <li className="readme-list-item">Click LEARN2EARN to view your Culture Coin balance and level progress</li>
        <li className="readme-list-item">Click ENCULTURATE to start a conversation with the Oracle</li>
        <li className="readme-list-item">Press Ctrl+D to access the Backend Debugger Dashboard</li>
      </ol>

      <div className="readme-api-endpoints">
        <h3 className="accent-text readme-section-title">API Endpoints</h3>
        <div className="readme-endpoint">
          <Link className="w-4 h-4 text-purple-400" />
          <code className="readme-endpoint-code">/functions/v1/d-id-api-handler</code>
          <span className="info-text">D-ID WebRTC streaming</span>
        </div>
        <div className="readme-endpoint">
          <Link className="w-4 h-4 text-purple-400" />
          <code className="readme-endpoint-code">/functions/v1/oracle-conversation</code>
          <span className="info-text">Claude conversation</span>
        </div>
        <div className="readme-endpoint">
          <Link className="w-4 h-4 text-purple-400" />
          <code className="readme-endpoint-code">/functions/v1/elevenlabs-tts</code>
          <span className="info-text">Voice synthesis</span>
        </div>
        <div className="readme-endpoint">
          <Link className="w-4 h-4 text-purple-400" />
          <code className="readme-endpoint-code">/functions/v1/gemini-portrait-generator</code>
          <span className="info-text">AI portrait generation</span>
        </div>
        <div className="readme-endpoint">
          <Link className="w-4 h-4 text-purple-400" />
          <code className="readme-endpoint-code">/functions/v1/culture-coin-manager</code>
          <span className="info-text">Culture Coin system</span>
        </div>
      </div>
      
      <div className="readme-learn2earn-cta">
        <Zap className="w-10 h-10 text-yellow-400" />
        <h4 className="oracle-title readme-subsection-title">Start Your Consciousness Journey</h4>
        <p className="info-text readme-description">
          Engage with the SURROGATE Oracle to earn Culture Coins, level up your
          consciousness, and unlock digital transformation.
        </p>
      </div>
    </div>
  );
}