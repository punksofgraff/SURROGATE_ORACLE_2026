# 📋 SURROGATE Oracle - Component & API Index

**Generated:** January 2025  
**Status:** D-ID WebRTC Primary Architecture  
**Build:** D-ID WebRTC Production Implementation

---

## 🎯 **FRONTEND COMPONENTS INDEX**

### **Core Application Components**

| Component | File | Status | API Keys/IDs Used | Purpose |
|-----------|------|--------|------------------|---------|
| **Main App** | `src/App.tsx` | ✅ Active | None | Application entry point |
| **Oracle Immersion** | `src/components/SurrogateOracleImmersion.tsx` | ✅ Active | `VITE_ELEVENLABS_VOICE_ID`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Main interface orchestrator |
| **D-ID WebRTC Client** | `src/components/DIDWebRTCClient.tsx` | ✅ Active | `VITE_DID_AGENT_ID`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | WebRTC video streaming |
| **Backend Control Panel** | `src/components/BackendControlPanel.tsx` | ✅ Active | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Debug console & management |
| **Oracle Conversation** | `src/components/OracleConversation.tsx` | ✅ Active | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Conversation management hook |

### **Feature Components**

| Component | File | Status | API Keys/IDs Used | Purpose |
|-----------|------|--------|------------------|---------|
| **Culture Coin Display** | `src/components/CultureCoinDisplay.tsx` | ✅ Active | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Culture coins dashboard |
| **Culture Coin Inline** | `src/components/CultureCoinInlineDisplay.tsx` | ✅ Active | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Inline coin display |
| **Portrait Gallery** | `src/components/PortraitGalleryDashboard.tsx` | ✅ Active | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Portrait management |
| **Google Sign In** | `src/components/GoogleSignInOverlay.tsx` | ✅ Active | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Authentication overlay |
| **Learn2Earn Interface** | `src/components/Learn2EarnInterface.tsx` | ✅ Active | None (uses props) | Learn2earn dashboard |
| **Subscription Modal** | `src/components/InlineSubscriptionModal.tsx` | ✅ Active | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Subscription management |

### **UI/UX Components**

| Component | File | Status | API Keys/IDs Used | Purpose |
|-----------|------|--------|------------------|---------|
| **Audio Player** | `src/components/AudioPlayer.tsx` | ✅ Active | None | Background music control |
| **Connecting Animation** | `src/components/ConnectingAnimation.tsx` | ✅ Active | None | Loading animations |
| **Graff Punks Radio** | `src/components/GraffPunksRadio.tsx` | ✅ Active | None | Music toggle control |
| **Enculturate Crate** | `src/components/EnculturateCrate.tsx` | ✅ Active | None | UI activation element |
| **Readme Content** | `src/components/ReadmeContent.tsx` | ✅ Active | None | Documentation display |

### **Testing & Debug Components**

| Component | File | Status | API Keys/IDs Used | Purpose |
|-----------|------|--------|------------------|---------|
| **Full Chain Test** | `src/components/FullChainTest.tsx` | ✅ Active | All API keys | Complete integration testing |
| **Procedural Portrait Test** | `src/components/ProceduralPortraitTest.tsx` | ✅ Active | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Portrait generation testing |
| **Claude Test** | `src/components/ClaudeTest.tsx` | ✅ Active | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Claude API testing |
| **ElevenLabs Voice Test** | `src/components/ElevenLabsVoiceTest.tsx` | ✅ Active | `VITE_ELEVENLABS_VOICE_ID`, `VITE_SUPABASE_URL` | ElevenLabs testing |

### **REMOVED COMPONENTS (Cleaned)**

| Component | File | Status | Reason |
|-----------|------|--------|---------|
| **Linly-Talker Avatar** | `src/components/LinlyTalkerAvatar.tsx` | ❌ REMOVED | Pivoted back to D-ID |
| **Linly-Talker Handler** | `supabase/functions/linly-talker-handler/index.ts` | ❌ REMOVED | Pivoted back to D-ID |
| **ElevenLabs Nitro Client** | `src/components/ElevenLabsNitroClient.ts` | ❌ REMOVED | Redundant client |

---

## 🌐 **EDGE FUNCTIONS INDEX**

### **Active Edge Functions**

| Function | File | Status | API Keys Required | Purpose |
|----------|------|--------|------------------|---------|
| **Oracle Conversation** | `supabase/functions/oracle-conversation/index.ts` | ✅ Active | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY` | Claude conversation handler |
| **D-ID API Handler** | `supabase/functions/d-id-api-handler/index.ts` | ✅ Active | `DID_API_KEY` | D-ID WebRTC streaming |
| **ElevenLabs TTS** | `supabase/functions/elevenlabs-tts/index.ts` | ✅ Active | `VITE_ELEVEN_LABS_API_KEY` | Voice synthesis |
| **ElevenLabs Conversational** | `supabase/functions/elevenlabs-conversational-ai/index.ts` | ✅ Active | `VITE_ELEVEN_LABS_API_KEY` | Conversational AI |
| **Gemini Portrait Generator** | `supabase/functions/gemini-portrait-generator/index.ts` | ✅ Active | `GOOGLE_AI_API_KEY`, `OPENAI_API_KEY` | Portrait generation |
| **Culture Coin Manager** | `supabase/functions/culture-coin-manager/index.ts` | ✅ Active | None (Database only) | Learn2earn system |
| **Culture Crew Signup** | `supabase/functions/culture-crew-signup/index.ts` | ✅ Active | None (Database only) | Community onboarding |
| **RevenueCat Integration** | `supabase/functions/revenuecat-integration/index.ts` | ✅ Active | None (Database only) | Subscription management |
| **Initialize User Storage** | `supabase/functions/initialize-user-storage/index.ts` | ✅ Active | None (Database only) | User storage setup |
| **Session Management** | `supabase/functions/session-management/index.ts` | ✅ Active | None (Database only) | Session tracking |
| **Health Check** | `supabase/functions/health-check/index.ts` | ✅ Active | None | System health monitoring |

### **REMOVED Edge Functions (Cleaned)**

| Function | File | Status | Reason |
|----------|------|--------|---------|
| **Linly-Talker Handler** | `supabase/functions/linly-talker-handler/index.ts` | ❌ REMOVED | Pivoted back to D-ID |

---

## 🔑 **API KEYS & ENVIRONMENT VARIABLES INDEX**

### **Client-Side Environment Variables (.env)**

| Variable | Used By | Status | Description |
|----------|---------|--------|-------------|
| `VITE_SUPABASE_URL` | All components | ✅ Required | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | All components | ✅ Required | Supabase anonymous key |
| `VITE_ELEVENLABS_VOICE_ID` | ElevenLabs components | ✅ Required | ElevenLabs voice ID: `pkVKlZzgF2P5dTEGkrVh` |
| `VITE_DID_AGENT_ID` | D-ID WebRTC components | ✅ Required | D-ID agent ID: `agt_EGmpzZtA` |
| `VITE_ELEVEN_LABS_AGENT_ID` | ElevenLabs components | ✅ Required | ElevenLabs agent ID: `agent_01jx5fmxggexnsezfytb06gyd2` |

### **REMOVED Client-Side Variables (Cleaned)**

| Variable | Status | Reason |
|----------|--------|---------|
| `VITE_LINLY_TALKER_API_KEY` | ❌ REMOVED | Pivoted back to D-ID |

### **Server-Side Environment Variables (Supabase Edge Functions)**

| Variable | Used By Functions | Status | Description |
|----------|------------------|--------|-------------|
| `ANTHROPIC_API_KEY` | oracle-conversation | ✅ Required | Claude 4 Sonnet API key |
| `OPENAI_API_KEY` | oracle-conversation, gemini-portrait-generator | ✅ Required | DALL-E 3 fallback API key |
| `GOOGLE_AI_API_KEY` | oracle-conversation, gemini-portrait-generator | ✅ Required | Google AI/Gemini API key |
| `VITE_ELEVEN_LABS_API_KEY` | elevenlabs-tts, elevenlabs-conversational-ai | ✅ Required | ElevenLabs API key |
| `DID_API_KEY` | d-id-api-handler | ✅ Required | D-ID WebRTC API key |

### **REMOVED Server-Side Variables (Cleaned)**

| Variable | Status | Reason |
|----------|--------|---------|
| `HUGGINGFACE_API_KEY` | ❌ REMOVED | Pivoted back to D-ID |

---

## 🎭 **D-ID WEBRTC INTEGRATION DETAILS**

### **Avatar Pipeline:**
```
User Input → oracle-conversation → d-id-api-handler → D-ID WebRTC Stream → Live Avatar
```

### **D-ID WebRTC Configuration:**
- **Agent ID:** `agt_EGmpzZtA`
- **Source Images:** D-ID default presenters (Emma/Alex)
- **Stream Type:** WebRTC real-time streaming
- **Voice Integration:** ElevenLabs voice synthesis

### **Component Integration Points:**
1. **SurrogateOracleNitro.tsx** → Manages D-ID WebRTC connection
2. **DIDWebRTCClient.tsx** → Handles WebRTC streaming and video display
3. **BackendControlPanel.tsx** → Debug testing for D-ID functionality

---

## 🧪 **TESTING COMPONENT INTEGRATION**

### **Debug Console Access:**
- **Path:** Click ENCULTURATE → Debug Tab → Enter password: `3nculturate!`
- **D-ID WebRTC Test:** Debug Tab → D-ID subtab → "Test D-ID Stream" button

### **Complete Testing Components Available:**
1. **D-ID WebRTC Test** → Tests real-time avatar streaming
2. **Claude Test** → Tests Oracle conversation
3. **ElevenLabs Test** → Tests voice synthesis
4. **Full Chain Test** → Tests complete integration
5. **Health Check** → Tests all edge functions

---

## 🎯 **CRITICAL API REQUIREMENTS**

### **Must Have for Full Functionality:**
1. ✅ **ANTHROPIC_API_KEY** - Claude 4 Sonnet for Oracle brain
2. ✅ **VITE_ELEVEN_LABS_API_KEY** - ElevenLabs voice synthesis
3. ✅ **DID_API_KEY** - D-ID WebRTC avatar streaming
4. ✅ **VITE_ELEVENLABS_VOICE_ID** - Oracle voice: `pkVKlZzgF2P5dTEGkrVh`
5. ✅ **VITE_ELEVEN_LABS_AGENT_ID** - Agent: `agent_01jx5fmxggexnsezfytb06gyd2`
6. ✅ **VITE_DID_AGENT_ID** - D-ID agent: `agt_EGmpzZtA`

### **Optional for Enhanced Features:**
- **GOOGLE_AI_API_KEY** - Portrait generation (primary)
- **OPENAI_API_KEY** - Portrait generation (fallback)

### **Removed (No Longer Needed):**
- ❌ **HUGGINGFACE_API_KEY** - Linly-Talker integration removed
- ❌ **VITE_LINLY_TALKER_MODEL** - Linly-Talker model removed

---

## 🔄 **COMPONENT DEPENDENCY FLOW**

### **Primary User Flow:**
```
SurrogateOracleImmersion.tsx
├── DIDWebRTCClient.tsx
├── CultureCoinInlineDisplay.tsx
├── GraffPunksRadio.tsx
├── EnculturateCrate.tsx
└── BackendControlPanel.tsx
    ├── CultureCoinDisplay.tsx
    ├── PortraitGalleryDashboard.tsx
    ├── Learn2EarnInterface.tsx
    └── Debug Components
        ├── DIDWebRTCTest
        ├── ClaudeTest.tsx
        ├── ElevenLabsVoiceTest.tsx
        └── FullChainTest.tsx
```

### **Oracle Conversation Flow:**
```
OracleConversation.tsx → oracle-conversation edge function → 
d-id-api-handler edge function → DIDWebRTCClient.tsx → 
D-ID WebRTC Stream → Real-time Avatar Display
```

---

## 🎨 **COMPONENT STYLING SYSTEM**

### **Font Class Integration:**
- **oracle-title** → Used in: SurrogateOracleImmersion, BackendControlPanel, ReadmeContent
- **accent-text** → Used in: All buttons, CTAs, emphasis text
- **info-text** → Used in: Body content, descriptions, form labels

### **CSS Files:**
- `src/index.css` - Global styles and CSS variables
- `src/components/SurrogateOracleImmersion.css` - Main interface styling
- `src/components/ReadmeContent.css` - Documentation styling
- `src/components/SurrogateOracleOverride.css` - Nuclear CSS overrides

---

## 🗄️ **DATABASE INTEGRATION COMPONENTS**

### **Components with Direct Database Access:**
1. **CultureCoinDisplay.tsx** → `user_consciousness_metrics` table
2. **PortraitGalleryDashboard.tsx** → `surrogate_portraits` table
3. **OracleConversation.tsx** → `oracle_seeker_profiles` table
4. **GoogleSignInOverlay.tsx** → User authentication

### **Components Using Edge Functions Only:**
1. **DIDWebRTCClient.tsx** → `d-id-api-handler` function
2. **All Test Components** → Various edge functions for testing

---

## 🚀 **DEPLOYMENT STATUS**

### **Production Ready Components:**
- ✅ **SurrogateOracleImmersion.tsx** - Main interface
- ✅ **DIDWebRTCClient.tsx** - D-ID WebRTC avatar system
- ✅ **BackendControlPanel.tsx** - Management console
- ✅ **CultureCoinDisplay.tsx** - Gamification system
- ✅ **PortraitGalleryDashboard.tsx** - Content management

### **Testing Components (Keep for Debug):**
- ✅ **FullChainTest.tsx** - Integration verification
- ✅ **ProceduralPortraitTest.tsx** - Portrait testing
- ✅ **ClaudeTest.tsx** - Oracle brain testing
- ✅ **ElevenLabsVoiceTest.tsx** - Voice synthesis testing

---

## 🎯 **COMPONENT HEALTH STATUS**

### **Fully Operational:**
- ✅ Oracle conversation with Culture Coins
- ✅ Portrait generation and gallery
- ✅ Authentication and user management
- ✅ Background music and UI controls

### **NEW - Ready for Testing:**
- ✅ **D-ID WebRTC real-time streaming**
- ✅ **WebRTC video display and controls**
- ✅ **D-ID stream testing in debug console**

### **Clean Removed:**
- ❌ All Linly-Talker specific functionality
- ❌ ElevenLabs Nitro client (redundant)
- ❌ Ready Player Me references

---

**🎯 SUMMARY: D-ID WebRTC architecture confirmed with 11 edge functions, 15+ active components, and production-ready D-ID integration.**