import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey',
};

interface CultureCrewRequest {
  email: string;
  source?: string;
}

interface CultureCrewResponse {
  success: boolean;
  message?: string;
  error?: string;
}

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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { email, source = 'surrogate-oracle' }: CultureCrewRequest = await req.json();

    if (!email || !email.includes('@')) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Valid email address is required' 
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`📧 Culture Crew signup request for: ${email} from source: ${source}`);

    // Check if email already exists
    const { data: existingUser, error: checkError } = await supabase
      .from('culture_crew')
      .select('email')
      .eq('email', email)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking existing user:', checkError);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Database error while checking email' 
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (existingUser) {
      console.log(`✅ Email already exists in Culture Crew: ${email}`);
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'Welcome back to the SNEAKAR Culture Crew! You are already a member.' 
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Add new member to Culture Crew
    const { error: insertError } = await supabase
      .from('culture_crew')
      .insert({
        email: email,
        source: source,
      });

    if (insertError) {
      console.error('Error inserting new Culture Crew member:', insertError);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Failed to join Culture Crew. Please try again.' 
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`🎉 Successfully added to Culture Crew: ${email}`);

    // Send FreakDali welcome email
    try {
      await sendFreakDaliWelcomeEmail(email, source);
    } catch (emailError) {
      console.error('FreakDali welcome email failed:', emailError);
      // Don't fail the whole request if email fails
    }

    const response: CultureCrewResponse = {
      success: true,
      message: '🔥 Welcome to the SNEAKAR Culture Crew! You now have access to exclusive FreakDali oracle insights, SNEAKAR-branded digital art downloads, and Culture Coin experiences.',
    };

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Culture Crew signup error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal server error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// 🔥 FREAKDALI ENHANCED WELCOME EMAIL
async function sendFreakDaliWelcomeEmail(email: string, source: string): Promise<void> {
  const emailData = {
    to: email,
    subject: '🔥 Welcome to SNEAKAR Culture Crew - FreakDali Access Unlocked!',
    html: `
      <div style="font-family: 'Space Mono', monospace; background: linear-gradient(135deg, #1a0033, #4c1d95, #7c2d12); color: #e0e7ff; padding: 40px; text-align: center;">
        <h1 style="color: #00ffff; text-shadow: 0 0 15px #00ffff; font-size: 32px;">🔥 SNEAKAR Culture Crew</h1>
        <p style="color: #a855f7; font-size: 20px; margin: 20px 0;">FreakDali Graff Punks Access Unlocked!</p>
        
        <div style="background: rgba(124, 58, 237, 0.4); padding: 25px; border-radius: 15px; margin: 25px 0; border: 3px solid #00ffff;">
          <h2 style="color: #00ffff; margin-top: 0;">🎨 Your FreakDali Access Details</h2>
          <p><strong style="color: #a855f7;">Email:</strong> ${email}</p>
          <p><strong style="color: #a855f7;">Password:</strong> <span style="color: #00ffff; font-weight: bold; font-size: 18px;">Enculturate</span></p>
          <p><strong style="color: #a855f7;">Source:</strong> ${source}</p>
          <p><strong style="color: #a855f7;">Status:</strong> <span style="color: #00ff88;">🔥 SNEAKAR Culture Crew Member</span></p>
        </div>
        
        <div style="background: rgba(0, 0, 0, 0.4); padding: 25px; border-radius: 15px; margin: 25px 0; text-align: left; border: 2px solid #7c2d12;">
          <h3 style="color: #00ffff; margin-top: 0;">🚀 What You Get with FreakDali Access:</h3>
          <ul style="color: #e0e7ff; line-height: 1.8;">
            <li>🎨 <strong>Exclusive FreakDali DALL-E portrait downloads</strong> - AI-generated cyberpunk graffiti art</li>
            <li>📄 <strong>jsPDF Oracle transmissions</strong> - Personalized digital consciousness reports</li>
            <li>🔮 <strong>SNEAKAR-branded oracle insights</strong> - Mystical wisdom with streetwear aesthetic</li>
            <li>⚡ <strong>Culture Coin experiences</strong> - Golden cryptocurrency energy integration</li>
            <li>🎭 <strong>Cyberpunk graffiti themes</strong> - Underground trainyard to alien abduction aesthetics</li>
            <li>🌟 <strong>Early access to new FreakDali features</strong> - Be first to experience cutting-edge art</li>
            <li>🔥 <strong>SNEAKAR community updates</strong> - Exclusive drops and creative inspiration</li>
          </ul>
        </div>
        
        <div style="background: linear-gradient(45deg, #7c2d12, #a855f7, #00ffff); padding: 3px; border-radius: 15px; margin: 25px 0;">
          <div style="background: #1a0033; padding: 20px; border-radius: 12px;">
            <h3 style="color: #00ffff; margin-top: 0;">🎭 FreakDali Aesthetic Guide</h3>
            <p style="color: #e0e7ff; margin: 15px 0;">Your portraits will feature:</p>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; text-align: left;">
              <div>
                <p style="color: #a855f7; margin: 5px 0;"><strong>🎨 Cyberpunk Graffiti</strong></p>
                <p style="color: #00ffff; margin: 5px 0;"><strong>👟 SNEAKAR Branding</strong></p>
                <p style="color: #00ff88; margin: 5px 0;"><strong>🪙 Culture Coin Elements</strong></p>
              </div>
              <div>
                <p style="color: #ff0088; margin: 5px 0;"><strong>🌈 Neon Geometric Patterns</strong></p>
                <p style="color: #ffff00; margin: 5px 0;"><strong>👽 Alien Abduction Vibes</strong></p>
                <p style="color: #ff8800; margin: 5px 0;"><strong>🚂 Underground Trainyard</strong></p>
              </div>
            </div>
          </div>
        </div>
        
        <p style="font-size: 16px; color: #00ffff; margin: 25px 0;">
          <strong>Access Portal:</strong> 
          <a href="https://tinyurl.com/sneakarculturecrew" style="color: #00ffff; text-decoration: none; border-bottom: 2px solid #00ffff;">
            tinyurl.com/sneakarculturecrew
          </a>
        </p>
        
        <div style="margin-top: 30px; padding: 20px; background: rgba(0, 255, 136, 0.2); border-radius: 10px; border: 2px solid #00ff88;">
          <h3 style="color: #00ff88; margin-top: 0;">🔥 Ready to Create?</h3>
          <p style="color: #e0e7ff;">Start generating your FreakDali cyberpunk graffiti portraits with SNEAKAR branding and Culture Coin energy!</p>
          <p style="color: #a855f7; font-style: italic;">"Where street art meets digital consciousness, SNEAKAR style."</p>
        </div>
        
        <p style="font-size: 14px; opacity: 0.8; margin-top: 30px;">Generated by FreakDali Graff Punks Oracle • SNEAKAR.io • thesurrogate.me</p>
      </div>
    `,
  };

  console.log('🔥 FreakDali Culture Crew welcome email would be sent:', emailData);
  // TODO: Implement actual email sending with FreakDali SNEAKAR template
}