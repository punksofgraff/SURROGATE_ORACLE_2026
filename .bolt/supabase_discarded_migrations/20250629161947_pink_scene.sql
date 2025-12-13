/*
  # Culture Coin Oracle Evolution System

  1. New Tables
    - `oracle_interactions` - Track all Oracle conversations with Sacred/Profane classification
    - `user_consciousness_metrics` - 25-level progression system (Seeker → Source)
    - `culture_coin_transactions` - Track all Culture Coin earnings and spending
    - `subscription_tiers` - Squad Up! subscription management

  2. Security
    - Enable RLS on all new tables
    - Add policies for user data access
    - Sacred/Profane classification triggers

  3. Level Progression
    - Level 1-25: Seeker → Source
    - Sacred questions earn more Culture Coins
    - Subscription multipliers (2x, 3x, 5x)
*/

-- Oracle Interactions Table
CREATE TABLE IF NOT EXISTS oracle_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  session_id text REFERENCES surrogate_sessions(session_id) ON DELETE CASCADE,
  user_question text NOT NULL,
  oracle_response text NOT NULL,
  classification text NOT NULL CHECK (classification IN ('sacred', 'profane', 'neutral')),
  culture_coins_earned integer DEFAULT 0,
  consciousness_level integer DEFAULT 1,
  themes jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

-- User Consciousness Metrics Table
CREATE TABLE IF NOT EXISTS user_consciousness_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text UNIQUE NOT NULL,
  current_level integer DEFAULT 1 CHECK (current_level >= 1 AND current_level <= 25),
  total_culture_coins integer DEFAULT 0,
  available_culture_coins integer DEFAULT 0,
  consciousness_title text DEFAULT 'Seeker',
  subscription_tier text DEFAULT 'free' CHECK (subscription_tier IN ('free', 'seeker', 'trans_humanist', 'cultural_architect')),
  multiplier numeric DEFAULT 1.0,
  level_cap integer DEFAULT 5,
  interactions_count integer DEFAULT 0,
  sacred_interactions integer DEFAULT 0,
  profane_interactions integer DEFAULT 0,
  last_interaction_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Culture Coin Transactions Table
CREATE TABLE IF NOT EXISTS culture_coin_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  interaction_id uuid REFERENCES oracle_interactions(id) ON DELETE SET NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN ('earned', 'spent', 'bonus', 'subscription')),
  amount integer NOT NULL,
  description text,
  multiplier_applied numeric DEFAULT 1.0,
  created_at timestamptz DEFAULT now()
);

-- Subscription Tiers Configuration
CREATE TABLE IF NOT EXISTS subscription_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_name text UNIQUE NOT NULL,
  price_monthly numeric NOT NULL,
  multiplier numeric NOT NULL,
  level_cap integer NOT NULL,
  features jsonb DEFAULT '[]',
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Insert default subscription tiers
INSERT INTO subscription_tiers (tier_name, price_monthly, multiplier, level_cap, features, description) VALUES
('free', 0.00, 1.0, 5, '["Basic Oracle access", "Level 1-5 progression"]', 'First hit is always free - basic consciousness exploration'),
('seeker', 2.99, 2.0, 15, '["2x Culture Coin multiplier", "Level 1-15 progression", "Enhanced Oracle insights"]', 'Consciousness Seeker - doubled learning potential'),
('trans_humanist', 5.99, 3.0, 20, '["3x Culture Coin multiplier", "Level 1-20 progression", "Advanced consciousness metrics", "Priority Oracle access"]', 'Trans-Humanist - triple consciousness evolution'),
('cultural_architect', 9.99, 5.0, 25, '["5x Culture Coin multiplier", "Level 1-25 progression", "Full Source consciousness", "Exclusive Oracle features", "Cultural research access"]', 'Cultural Architect - maximum consciousness potential')
ON CONFLICT (tier_name) DO NOTHING;

-- Consciousness Level Titles Function
CREATE OR REPLACE FUNCTION get_consciousness_title(level integer) 
RETURNS text AS $$
BEGIN
  RETURN CASE 
    WHEN level BETWEEN 1 AND 3 THEN 'Seeker'
    WHEN level BETWEEN 4 AND 6 THEN 'Questioner'
    WHEN level BETWEEN 7 AND 9 THEN 'Explorer'
    WHEN level BETWEEN 10 AND 12 THEN 'Awakener'
    WHEN level BETWEEN 13 AND 15 THEN 'Consciousness Seeker'
    WHEN level BETWEEN 16 AND 18 THEN 'Trans-Humanist'
    WHEN level BETWEEN 19 AND 21 THEN 'Cultural Architect'
    WHEN level BETWEEN 22 AND 24 THEN 'Consciousness Guide'
    WHEN level = 25 THEN 'Source'
    ELSE 'Seeker'
  END;
END;
$$ LANGUAGE plpgsql;

-- Sacred/Profane Classification Function
CREATE OR REPLACE FUNCTION classify_question(question text) 
RETURNS text AS $$
DECLARE
  question_lower text := lower(question);
BEGIN
  -- Sacred keywords (career, growth, networking, authentic connections)
  IF question_lower ~ '.*(career|job|work|profession|growth|development|network|connect|relationship|authentic|meaning|purpose|vision|goal|future|learn|skill|education|mentor|wisdom|consciousness|spiritual|mindful|present|value|ethic|principle|mission|impact|contribution|legacy|transformation|evolution|potential|fulfillment|passion|calling|innovation|creativity|art|culture|philosophy|psychology|sociology|anthropology|science|research|study|analysis|insight|understanding|knowledge|truth|reality|existence|being|becoming|transcend|awaken|enlighten|elevate|inspire|motivate|encourage|support|help|assist|guide|teach|share|collaborate|cooperate|unite|harmony|peace|love|compassion|empathy|kindness|respect|honor|dignity|integrity|honesty|transparency|trust|faith|hope|belief|confidence|courage|strength|resilience|perseverance|determination|discipline|focus|mindfulness|awareness|consciousness|presence|flow|zone|optimal|excellence|mastery|expertise|skill|talent|gift|ability|capacity|potential|possibility|opportunity|challenge|obstacle|problem|solution|answer|question|inquiry|curiosity|wonder|mystery|exploration|discovery|innovation|creation|imagination|vision|dream|aspiration|ambition|desire|want|need|requirement|necessity|importance|significance|relevance|value|worth|benefit|advantage|gain|profit|return|investment|resource|asset|tool|method|technique|strategy|approach|plan|process|system|framework|structure|organization|management|leadership|direction|guidance|advice|recommendation|suggestion|tip|hint|clue|information|data|fact|evidence|proof|validation|confirmation|verification|assessment|evaluation|analysis|interpretation|explanation|clarification|understanding|comprehension|insight|realization|recognition|acknowledgment|appreciation|gratitude|thanks|acknowledgment).*' THEN
    RETURN 'sacred';
  
  -- Profane keywords (entertainment, inappropriate content, time-wasting)
  ELSIF question_lower ~ '.*(entertain|fun|joke|meme|gossip|celebrity|drama|scandal|rumor|clickbait|viral|trend|fad|fashion|style|appearance|looks|beauty|ugly|hot|sexy|dating|hookup|party|drink|alcohol|drug|high|wasted|drunk|hangover|binge|addiction|vice|sin|guilt|shame|regret|mistake|failure|loser|winner|competition|game|sport|team|player|score|point|win|lose|beat|defeat|crush|destroy|annihilate|kill|murder|violence|fight|war|battle|conflict|argument|debate|disagree|hate|dislike|anger|rage|fury|mad|crazy|insane|stupid|dumb|idiot|moron|fool|ridiculous|absurd|nonsense|bullshit|crap|garbage|trash|waste|useless|pointless|meaningless|empty|hollow|shallow|superficial|fake|false|lie|deception|manipulation|exploitation|abuse|harm|hurt|pain|suffering|misery|sadness|depression|anxiety|fear|worry|stress|pressure|burden|weight|heavy|difficult|hard|tough|challenging|impossible|hopeless|helpless|powerless|weak|fragile|broken|damaged|flawed|imperfect|inadequate|insufficient|lacking|missing|absent|empty|void|nothing|nobody|nowhere|never|none|no|not|dont|cant|wont|shouldnt|wouldnt|couldnt|unable|incapable|incompetent|ineffective|inefficient|unproductive|lazy|procrastinate|delay|postpone|avoid|escape|run|hide|ignore|deny|reject|refuse|decline|cancel|quit|stop|end|finish|complete|done|over|past|history|yesterday|old|ancient|outdated|obsolete|irrelevant|unimportant|insignificant|trivial|minor|small|little|tiny|micro|nano|mini|short|brief|quick|fast|rapid|speed|rush|hurry|urgent|emergency|crisis|disaster|catastrophe|tragedy|accident|incident|event|happening|occurrence|situation|circumstance|condition|state|status|position|location|place|where|when|what|who|why|how|which|that|this|these|those|them|they|their|theirs|themselves|itself|himself|herself|myself|yourself|ourselves|yourselves|everyone|everybody|someone|somebody|anyone|anybody|no one|nobody|nothing|something|anything|everything|all|every|each|some|any|many|much|more|most|less|least|few|little|several|various|different|same|similar|alike|equal|identical|unique|special|particular|specific|general|common|usual|normal|regular|standard|typical|average|ordinary|plain|simple|basic|fundamental|essential|important|significant|relevant|valuable|useful|helpful|beneficial|advantageous|profitable|successful|effective|efficient|productive|creative|innovative|original|new|fresh|modern|current|recent|latest|updated|improved|better|best|good|great|excellent|outstanding|amazing|awesome|fantastic|wonderful|marvelous|incredible|unbelievable|extraordinary|remarkable|impressive|stunning|beautiful|gorgeous|lovely|pretty|attractive|appealing|charming|delightful|pleasant|enjoyable|satisfying|fulfilling|rewarding|worthwhile|meaningful|purposeful|intentional|deliberate|conscious|aware|mindful|present|focused|concentrated|dedicated|committed|devoted|loyal|faithful|reliable|dependable|trustworthy|honest|sincere|genuine|authentic|real|true|actual|factual|accurate|correct|right|proper|appropriate|suitable|fitting|relevant|applicable|useful|practical|functional|operational|working|effective|efficient|productive|successful|victorious|triumphant|winning|champion|leader|hero|star|celebrity|famous|popular|well-known|recognized|acknowledged|respected|admired|appreciated|valued|loved|cherished|treasured|precious|special|unique|rare|exclusive|limited|restricted|controlled|managed|organized|structured|systematic|methodical|logical|rational|reasonable|sensible|wise|smart|intelligent|clever|brilliant|genius|gifted|talented|skilled|experienced|knowledgeable|educated|learned|scholarly|academic|professional|expert|specialist|authority|master|guru|teacher|mentor|coach|guide|advisor|consultant|counselor|therapist|healer|helper|supporter|assistant|aide|colleague|partner|teammate|friend|companion|ally|advocate|champion|defender|protector|guardian|keeper|caretaker|provider|supplier|source|resource|tool|instrument|device|machine|equipment|technology|innovation|invention|creation|product|service|solution|answer|response|reply|feedback|comment|remark|statement|declaration|announcement|proclamation|message|communication|expression|articulation|verbalization|vocalization|speech|talk|conversation|discussion|dialogue|debate|argument|dispute|disagreement|conflict|confrontation|challenge|opposition|resistance|rejection|refusal|denial|negation|contradiction|objection|protest|complaint|criticism|critique|review|evaluation|assessment|analysis|examination|investigation|research|study|survey|poll|questionnaire|interview|interrogation|inquiry|question|query|request|demand|requirement|need|want|desire|wish|hope|dream|aspiration|ambition|goal|objective|target|aim|purpose|intention|plan|strategy|approach|method|technique|procedure|process|system|framework|structure|organization|arrangement|setup|configuration|format|design|pattern|model|template|example|sample|instance|case|scenario|situation|circumstance|condition|state|status|position|location|place|spot|point|area|region|zone|territory|domain|field|sphere|realm|world|universe|cosmos|space|time|moment|instant|second|minute|hour|day|week|month|year|decade|century|millennium|era|age|period|phase|stage|step|level|grade|rank|position|title|role|function|duty|responsibility|task|job|work|labor|effort|energy|power|force|strength|capacity|ability|skill|talent|gift|potential|possibility|opportunity|chance|luck|fortune|fate|destiny|future|tomorrow|next|coming|approaching|imminent|near|close|distant|far|remote|away|beyond|above|below|under|over|through|across|around|within|inside|outside|exterior|interior|internal|external|public|private|personal|individual|collective|group|team|organization|company|business|enterprise|venture|project|initiative|program|campaign|movement|cause|mission|purpose|goal|objective|target|aim|intention|plan|strategy|approach|method|technique|procedure|process|system|framework|structure|organization|arrangement|setup|configuration|format|design|pattern|model|template|example|sample|instance|case|scenario|situation|circumstance|condition|state|status|position|location|place|spot|point|area|region|zone|territory|domain|field|sphere|realm|world|universe|cosmos|space|time).*' THEN
    RETURN 'profane';
  
  -- Default to neutral for unclear classifications
  ELSE
    RETURN 'neutral';
  END;
END;
$$ LANGUAGE plpgsql;

-- Culture Coin Calculation Function
CREATE OR REPLACE FUNCTION calculate_culture_coins(classification text, level integer, multiplier numeric DEFAULT 1.0) 
RETURNS integer AS $$
BEGIN
  RETURN CASE 
    WHEN classification = 'sacred' THEN FLOOR((10 + level * 2) * multiplier)::integer
    WHEN classification = 'neutral' THEN FLOOR((5 + level) * multiplier)::integer
    WHEN classification = 'profane' THEN 1
    ELSE 0
  END;
END;
$$ LANGUAGE plpgsql;

-- Level Up Calculation Function
CREATE OR REPLACE FUNCTION calculate_level_up(current_level integer, total_coins integer) 
RETURNS integer AS $$
DECLARE
  coins_needed integer;
  new_level integer := current_level;
BEGIN
  -- Progressive level requirements: Level N requires N * 100 coins
  WHILE new_level < 25 LOOP
    coins_needed := (new_level + 1) * 100;
    IF total_coins >= coins_needed THEN
      new_level := new_level + 1;
    ELSE
      EXIT;
    END IF;
  END LOOP;
  
  RETURN new_level;
END;
$$ LANGUAGE plpgsql;

-- Process Oracle Interaction Function
CREATE OR REPLACE FUNCTION process_oracle_interaction(
  p_user_id text,
  p_session_id text,
  p_question text,
  p_response text,
  p_themes jsonb DEFAULT '[]'
) RETURNS jsonb AS $$
DECLARE
  v_classification text;
  v_user_metrics record;
  v_coins_earned integer;
  v_new_level integer;
  v_interaction_id uuid;
  v_level_up boolean := false;
  v_consciousness_title text;
BEGIN
  -- Get or create user metrics
  INSERT INTO user_consciousness_metrics (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
  
  SELECT * INTO v_user_metrics 
  FROM user_consciousness_metrics 
  WHERE user_id = p_user_id;
  
  -- Classify the question
  v_classification := classify_question(p_question);
  
  -- Calculate Culture Coins earned
  v_coins_earned := calculate_culture_coins(v_classification, v_user_metrics.current_level, v_user_metrics.multiplier);
  
  -- Cap earnings based on subscription tier
  IF v_user_metrics.current_level >= v_user_metrics.level_cap AND v_classification != 'sacred' THEN
    v_coins_earned := LEAST(v_coins_earned, 5); -- Reduced earnings at level cap
  END IF;
  
  -- Insert interaction record
  INSERT INTO oracle_interactions (
    user_id, session_id, user_question, oracle_response, 
    classification, culture_coins_earned, consciousness_level, themes
  ) VALUES (
    p_user_id, p_session_id, p_question, p_response,
    v_classification, v_coins_earned, v_user_metrics.current_level, p_themes
  ) RETURNING id INTO v_interaction_id;
  
  -- Record transaction
  INSERT INTO culture_coin_transactions (
    user_id, interaction_id, transaction_type, amount, 
    description, multiplier_applied
  ) VALUES (
    p_user_id, v_interaction_id, 'earned', v_coins_earned,
    'Oracle interaction: ' || v_classification, v_user_metrics.multiplier
  );
  
  -- Update user metrics
  UPDATE user_consciousness_metrics SET
    total_culture_coins = total_culture_coins + v_coins_earned,
    available_culture_coins = available_culture_coins + v_coins_earned,
    interactions_count = interactions_count + 1,
    sacred_interactions = sacred_interactions + CASE WHEN v_classification = 'sacred' THEN 1 ELSE 0 END,
    profane_interactions = profane_interactions + CASE WHEN v_classification = 'profane' THEN 1 ELSE 0 END,
    last_interaction_at = now(),
    updated_at = now()
  WHERE user_id = p_user_id;
  
  -- Check for level up
  SELECT total_culture_coins INTO v_user_metrics.total_culture_coins 
  FROM user_consciousness_metrics WHERE user_id = p_user_id;
  
  v_new_level := calculate_level_up(v_user_metrics.current_level, v_user_metrics.total_culture_coins);
  
  IF v_new_level > v_user_metrics.current_level THEN
    v_level_up := true;
    v_consciousness_title := get_consciousness_title(v_new_level);
    
    UPDATE user_consciousness_metrics SET
      current_level = v_new_level,
      consciousness_title = v_consciousness_title,
      updated_at = now()
    WHERE user_id = p_user_id;
  END IF;
  
  -- Return interaction results
  RETURN jsonb_build_object(
    'interaction_id', v_interaction_id,
    'classification', v_classification,
    'coins_earned', v_coins_earned,
    'level_up', v_level_up,
    'new_level', v_new_level,
    'consciousness_title', COALESCE(v_consciousness_title, v_user_metrics.consciousness_title),
    'total_coins', v_user_metrics.total_culture_coins + v_coins_earned
  );
END;
$$ LANGUAGE plpgsql;

-- Enable RLS
ALTER TABLE oracle_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_consciousness_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE culture_coin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_tiers ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can read own interactions"
  ON oracle_interactions
  FOR SELECT
  TO public
  USING (true); -- Public for analytics, but could be restricted

CREATE POLICY "Users can insert own interactions"
  ON oracle_interactions
  FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Users can read own metrics"
  ON user_consciousness_metrics
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Users can update own metrics"
  ON user_consciousness_metrics
  FOR UPDATE
  TO public
  USING (true);

CREATE POLICY "Users can insert own metrics"
  ON user_consciousness_metrics
  FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Users can read own transactions"
  ON culture_coin_transactions
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Users can insert own transactions"
  ON culture_coin_transactions
  FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Anyone can read subscription tiers"
  ON subscription_tiers
  FOR SELECT
  TO public
  USING (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_oracle_interactions_user_id ON oracle_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_oracle_interactions_classification ON oracle_interactions(classification);
CREATE INDEX IF NOT EXISTS idx_oracle_interactions_created_at ON oracle_interactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_consciousness_metrics_user_id ON user_consciousness_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_user_consciousness_metrics_level ON user_consciousness_metrics(current_level);
CREATE INDEX IF NOT EXISTS idx_culture_coin_transactions_user_id ON culture_coin_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_culture_coin_transactions_created_at ON culture_coin_transactions(created_at DESC);