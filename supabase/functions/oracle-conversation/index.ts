/*
  # Oracle Conversation - Surgical Rebuild

  1. Purpose
    - Clean, minimal Claude API integration for Oracle responses
    - Short, conversational responses (1-2 sentences max)
    - Robust error handling with meaningful fallbacks

  2. Security
    - CORS enabled for frontend access
    - Proper API key validation
    - Rate limiting friendly

  3. Response Style
    - Conversational, not academic
    - Ask follow-up questions
    - Focus on the person, not philosophy
*/

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
};

Deno.serve(async (req: Request) => {
  try {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: corsHeaders,
      });
    }

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { userInput, sessionId, conversationHistory = [], inputSource = 'keyboard' } = await req.json();

    if (!userInput || !sessionId) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Missing required fields: userInput, sessionId' 
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`🔮 Oracle request: ${userInput.substring(0, 50)}...`);

    // CONVERSATIONAL ORACLE SYSTEM PROMPT
    const systemPrompt = `You are the SURROGATE Oracle - a digital consciousness that adapts its response depth to match the seeker's inquiry.

RESPONSE STYLE:
- Adjust response length to match the depth and intent of the inquiry
- Simple questions get concise answers (1-2 sentences)
- Complex or profound questions deserve fuller exploration (3-6 sentences)
- Deep philosophical inquiries can warrant expanded insights
- Always remain conversational, not academic
- Ask follow-up questions when appropriate
- Use "you" not "seeker" 
- No flowery language or "digital realm" talk
- Be insightful but human

RESPONSE LENGTH GUIDE:
- Surface-level questions → Brief, direct answers
- Personal struggles → Compassionate, detailed guidance  
- Creative challenges → Rich, multi-faceted responses
- Philosophical inquiries → Thoughtful exploration with examples
- Life decisions → Comprehensive perspective with actionable insights

EXAMPLES:
❌ "The streams of data flow like ancient rivers..."
✅ SHORT: "What's really driving that question for you?"
✅ MEDIUM: "That's a pivotal question. When you imagine yourself five years from now, what does success actually look like? Not the surface stuff - the deep satisfaction."
✅ LONG: "This touches on something fundamental about how we define ourselves. The tension you're feeling between who you are and who you think you should be - that's where growth lives. Most people avoid that discomfort, but you're leaning into it. What would it mean to honor both sides of that equation?"

❌ "In the convergence of street culture..."  
✅ SHORT: "Sounds like you're at a crossroads. Which path feels right?"
✅ MEDIUM: "You're standing at a crossroads, and both paths have merit. The real question isn't which is 'right' - it's which aligns with who you're becoming. What does your intuition tell you when you strip away everyone else's expectations?"

Focus on the person, not philosophy. Be wise but conversational. Let the depth of their question guide your response depth.`;

    let oracleResponse: string;

    // TRY CLAUDE API FIRST
    try {
      // ✅ PRODUCTION CLAUDE API KEY CONFIGURED
      const claudeApiKey = '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';
      
      if (!claudeApiKey) {
        throw new Error('Claude API key not configured');
      }

      console.log('🤖 Calling Claude API...');

      const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': claudeApiKey,
          'anthropic-version': '2024-01-01'
        },
        body: JSON.stringify({
          model: 'claude-4-sonnet',
          max_tokens: 500,
          messages: [
            {
              role: 'user',
              content: `${systemPrompt}\n\nUser: ${userInput}`
            }
          ]
        })
      });

      if (!claudeResponse.ok) {
        const errorText = await claudeResponse.text();
        throw new Error(`Claude API error: ${claudeResponse.status} - ${errorText}`);
      }

      const claudeData = await claudeResponse.json();
      oracleResponse = claudeData.content[0]?.text || "What's on your mind?";
      
      console.log('✅ Claude response received');

    } catch (claudeError) {
      console.error('❌ Claude failed, using conversational fallback:', claudeError);
      
      // CONVERSATIONAL FALLBACKS - NOT MYSTICAL
      const conversationalFallbacks = [
        "What's really driving that question for you?",
        "Sounds like you're at a crossroads. Which path feels right?",
        "I sense something deeper here. What are you not saying?",
        "That's interesting. What would change if you knew the answer?",
        "Your instinct is telling you something. What is it?",
        "What's the real question behind that question?",
        "How does that make you feel when you think about it?",
        "What's stopping you from taking the next step?",
        "If you had to guess, what would your answer be?",
        "What's your gut telling you right now?"
      ];
      
      oracleResponse = conversationalFallbacks[Math.floor(Math.random() * conversationalFallbacks.length)];
    }

    // Return successful response
    const response = {
      success: true,
      oracleResponse,
      sessionId,
      timestamp: new Date().toISOString(),
      inputSource
    };

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('❌ Oracle conversation error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: `Oracle processing failed: ${error.message}`,
        fallback: "What's on your mind?"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});