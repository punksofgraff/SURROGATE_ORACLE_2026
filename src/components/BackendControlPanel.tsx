import React, { useState, useEffect } from 'react';

import { X } from 'lucide-react';
import { CultureCoinDisplay } from './CultureCoinDisplay';
import { InlineSubscriptionModal } from './InlineSubscriptionModal';
import { BackendCabinetPortraitTab } from './PortraitGalleryDashboard';
import { Learn2EarnInterface } from './Learn2EarnInterface';

interface BackendControlPanelProps {
  userId?: string;
  sessionId?: string;
  isVisible?: boolean;
  initialTab?: 'coins' | 'squad' | 'portraits' | 'debug';
  onClose?: () => void;
}

export const BackendControlPanel: React.FC<BackendControlPanelProps & { 
  isAuthenticated?: boolean;
}> = ({ 
  userId, 
  sessionId,
  isVisible = true,
  initialTab = 'coins',
  onClose,
  isAuthenticated = false
}) => {
  const [activeTab, setActiveTab] = useState<'coins' | 'squad' | 'portraits' | 'debug'>(initialTab);
  const [debugPasswordEntered, setDebugPasswordEntered] = useState(false);
  const [debugPassword, setDebugPassword] = useState('');
  const [testResults, setTestResults] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [testPayloads, setTestPayloads] = useState({
    oracleQuestion: 'Test question',
    cultureCrewEmail: 'test@example.com'
  });

  // Update active tab when initialTab prop changes
  useEffect(() => {
    setActiveTab(initialTab);
    // Reset debug password when switching away from debug tab
    if (initialTab !== 'debug') {
      setDebugPasswordEntered(false);
      setDebugPassword('');
    }
  }, [initialTab]);

  const handleDebugPasswordSubmit = () => {
    if (debugPassword === '3nculturate!') {
      setDebugPasswordEntered(true);
      setDebugPassword('');
    }
  };

  const testEdgeFunction = async (functionName: string, payload: any = {}) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      const error = response.ok ? null : data.error || `HTTP ${response.status}`;
      
      setTestResults(prev => ({
        ...prev,
        [functionName]: { 
          success: response.ok && !error, 
          data, 
          error: null,
          status: response.status,
          timestamp: new Date().toISOString()
        }
      }));
    } catch (error) {
      setTestResults(prev => ({
        ...prev,
        [functionName]: { 
          success: false, 
          data: null, 
          error: error.message,
          timestamp: new Date().toISOString()
        }
      }));
    }
    setIsLoading(false);
  };

  const formatTestResult = (functionName: string, result: any) => {
    if (result.success) {
      return (
        <div className="test-result-success">
          <div className="result-header">
            <span className="result-function">{functionName}</span>
            <span className="result-status success">✅ SUCCESS</span>
            <span className="result-timestamp">{new Date(result.timestamp).toLocaleTimeString()}</span>
          </div>
          {result.data && (
            <div className="result-data">
              <strong>Response:</strong>
              <pre className="result-json">{JSON.stringify(result.data, null, 2)}</pre>
            </div>
          )}
        </div>
      );
    } else {
      return (
        <div className="test-result-error">
          <div className="result-header">
            <span className="result-function">{functionName}</span>
            <span className="result-status error">❌ FAILED</span>
            <span className="result-timestamp">{new Date(result.timestamp).toLocaleTimeString()}</span>
          </div>
          <div className="result-error">
            <strong>Error:</strong> {result.error}
          </div>
          {result.status && (
            <div className="result-status-code">
              <strong>HTTP Status:</strong> {result.status}
            </div>
          )}
        </div>
      );
    }
  };

  if (!isVisible) return null;

  return (
    <div className="backend-control-panel bg-gray-900 text-white rounded-lg relative">
      {/* Header with Close Button */}
      <div className="flex items-center justify-between p-6 border-b border-gray-700">
        <h2 className="oracle-title text-2xl font-bold text-cyan-400">SURROGATE Backend Cabinet</h2>
        {onClose && (
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-full transition-colors"
            aria-label="Close backend panel"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-700">
        {[
          { key: 'coins', label: 'Culture Coins', icon: '🪙' },
          { key: 'squad', label: 'Squad Up', icon: '👥' },
          { key: 'portraits', label: 'Portraits', icon: '🎨' },
          { key: 'debug', label: 'Debug', icon: '🔧' }
        ].map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key as any)}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === key 
                ? 'border-b-2 border-cyan-400 text-cyan-400 bg-gray-800' 
                : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800'
            }`}
          >
            <span>{icon}</span>
            <span className="info-text">{label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === 'coins' && (
          <div className="space-y-6">
            <h3 className="oracle-title text-xl text-cyan-400 mb-4">Culture Coins Dashboard</h3>
            {userId && isAuthenticated ? (
              <CultureCoinDisplay userId={userId} />
            ) : (
              <div className="text-center py-8 space-y-4">
                <div className="text-gray-400 mb-4">
                  {!userId ? 'User ID required' : 'Sign in to track your Culture Coins and start earning'}
                </div>
                {!isAuthenticated && (
                  <button
                    onClick={() => {
                      console.log('🔐 Opening authentication from Culture Coins tab');
                      onClose?.(); // Close backend panel
                      // Trigger auth overlay (handled by parent component)
                    }}
                    className="accent-text bg-cyan-600/20 hover:bg-cyan-600/30 px-6 py-3 rounded-lg border border-cyan-500/30 transition-all"
                  >
                    🚀 Sign In to Start Earning
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'squad' && (
          <div className="space-y-6">
            <h3 className="oracle-title text-xl text-cyan-400 mb-4">Squad Up</h3>
            {userId && isAuthenticated ? (
              <Learn2EarnInterface userId={userId} />
            ) : (
              <div className="text-center py-8 space-y-4">
                <div className="text-gray-400 mb-4">Sign in to access premium subscription tiers</div>
                {!isAuthenticated && (
                  <button
                    onClick={() => {
                      console.log('🔐 Opening authentication from Squad Up tab');
                      onClose?.(); // Close backend panel
                      // Trigger auth overlay (handled by parent component)
                    }}
                    className="accent-text bg-purple-600/20 hover:bg-purple-600/30 px-6 py-3 rounded-lg border border-purple-500/30 transition-all"
                  >
                    👥 Join Culture Crew
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'portraits' && (
          <div className="space-y-6">
            <h3 className="oracle-title text-xl text-cyan-400 mb-4">Portrait Gallery</h3>
            <BackendCabinetPortraitTab userId={userId} />
          </div>
        )}

        {activeTab === 'debug' && (
          <>
            {!debugPasswordEntered ? (
              <div className="text-center py-8">
                <h3 className="oracle-title text-xl text-yellow-400 mb-4">🔒 Debug Access Required</h3>
                <p className="info-text text-gray-300 mb-4">Enter password to access debugging tools</p>
                <div className="max-w-xs mx-auto">
                  <input
                    type="password"
                    value={debugPassword}
                    onChange={(e) => setDebugPassword(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleDebugPasswordSubmit()}
                    placeholder="Enter debug password..."
                    className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white mb-4"
                    autoFocus
                  />
                  <button
                    onClick={handleDebugPasswordSubmit}
                    disabled={!debugPassword}
                    className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 px-4 py-2 rounded text-white"
                  >
                    Access Debug Tools
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="oracle-title text-xl text-yellow-400">🔧 Debug Console</h3>
                  <button
                    onClick={() => {
                      setDebugPasswordEntered(false);
                      setDebugPassword('');
                    }}
                    className="text-sm text-gray-400 hover:text-gray-300"
                  >
                    Lock Debug
                  </button>
                </div>
      
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium mb-2">User ID:</label>
                    <div className="user-id-display">
                      <span className="info-text">{userId || 'Not provided'}</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Session ID:</label>
                    <div className="session-id-display">
                      <span className="info-text">{sessionId || 'Not provided'}</span>
                    </div>
                  </div>
                </div>

                {/* Configurable Test Payloads */}
                <div className="test-payloads mb-6">
                  <h3 className="text-lg font-semibold mb-3">Test Payloads</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Oracle Question:</label>
                      <textarea
                        value={testPayloads.oracleQuestion}
                        onChange={(e) => setTestPayloads(prev => ({ ...prev, oracleQuestion: e.target.value }))}
                        className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white"
                        rows={2}
                        placeholder="Enter test question for Oracle..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Culture Crew Email:</label>
                      <input
                        type="email"
                        value={testPayloads.cultureCrewEmail}
                        onChange={(e) => setTestPayloads(prev => ({ ...prev, cultureCrewEmail: e.target.value }))}
                        className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white"
                        placeholder="test@example.com"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Edge Function Tests</h3>
        
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => testEdgeFunction('health-check')}
                      disabled={isLoading}
                      className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded disabled:opacity-50"
                    >
                      Test Health Check
                    </button>
          
                    <button
                      onClick={() => testEdgeFunction('d-id-api-handler', { action: 'test' })}
                      disabled={isLoading}
                      className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded disabled:opacity-50"
                    >
                      Test D-ID Handler
                    </button>
          
                    <button
                      onClick={() => testEdgeFunction('oracle-conversation', {
                        userInput: testPayloads.oracleQuestion,
                        sessionId: sessionId 
                      })}
                      disabled={isLoading}
                      className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded disabled:opacity-50"
                    >
                      Test Oracle Conversation
                    </button>
          
                    <button
                      onClick={() => testEdgeFunction('culture-crew-signup', {
                        email: testPayloads.cultureCrewEmail
                      })}
                      disabled={isLoading}
                      className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded disabled:opacity-50"
                    >
                      Test Culture Crew Signup
                    </button>
                  </div>
                </div>

                {Object.keys(testResults).length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-lg font-semibold mb-3">Test Results</h3>
                    <div className="space-y-2">
                      {Object.entries(testResults).map(([functionName, result]) => (
                        <div key={functionName} className="test-result-container">
                          {formatTestResult(functionName, result)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default BackendControlPanel;