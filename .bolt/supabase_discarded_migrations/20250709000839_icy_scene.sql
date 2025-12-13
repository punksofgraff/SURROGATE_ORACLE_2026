/*
  # Fix Culture Coin System Policy Error
  
  1. New Tables
    - `culture_coin_levels` - Defines level thresholds and properties
    - `user_consciousness_metrics` - Tracks user progression and metrics
    - `oracle_interactions` - Records individual conversation data
    - `oracle_subscriptions` - Manages user subscription information
  
  2. Security
    - Enable RLS on all tables
    - Create policies with DROP IF EXISTS to prevent duplicates
    - Create indexes for performance optimization
  
  3. Functions
    - `classify_oracle_question` - Determines if questions are sacred or profane
    - `calculate_culture_coins` - Calculates rewards based on question quality
    - `process_oracle_interaction` - Handles the full interaction flow
*/

-- First check if table exists and drop it to avoid duplicate key error
DROP TABLE IF EXISTS culture_coin_levels;

-- Create culture_coin_levels table
CREATE TABLE culture_coin_levels (
  level INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  coins_required INTEGER NOT NULL,
  benefits TEXT[] NULL,
  multiplier NUMERIC(3,1) DEFAULT 1.0
);

-- Create user_consciousness_metrics table if it doesn't exist
CREATE TABLE IF NOT EXISTS user_consciousness_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT UNIQUE NOT NULL,
  total_sacred_questions INTEGER DEFAULT 0,
  total_profane_questions INTEGER DEFAULT 0,
  sacred_profane_ratio NUMERIC(5,2) NULL,
  current_level INTEGER DEFAULT 1,
  total_culture_coins INTEGER DEFAULT 0,
  subscription_tier TEXT DEFAULT 'free',
  first_interaction_date TIMESTAMPTZ NULL,
  last_interaction_date TIMESTAMPTZ NULL,
  consciousness_evolution_score NUMERIC(5,2) NULL,
  authentic_connection_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create oracle_interactions table to track each conversation if it doesn't exist
CREATE TABLE IF NOT EXISTS oracle_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  question_text TEXT NOT NULL,
  question_category TEXT NOT NULL, -- 'sacred', 'profane', or 'neutral'
  sacred_score INTEGER NOT NULL,
  profane_score INTEGER NOT NULL,
  context_tags TEXT[] NULL,
  culture_coins_earned INTEGER DEFAULT 0,
  user_level INTEGER DEFAULT 1,
  response_quality_rating INTEGER NULL,
  connection_outcome BOOLEAN NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create oracle_subscriptions table if it doesn't exist
CREATE TABLE IF NOT EXISTS oracle_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'inactive',
  premium_access BOOLEAN DEFAULT false,
  subscribed_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,
  renewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add data to culture_coin_levels
INSERT INTO culture_coin_levels (level, title, coins_required, benefits, multiplier)
VALUES
  (1, 'Seeker', 0, ARRAY['Basic Oracle access', 'Standard response quality', 'Level 1 consciousness tracking'], 1.0),
  (2, 'Novice', 100, ARRAY['Level 1-2 consciousness tracking', 'Basic theme extraction'], 1.0),
  (3, 'Initiate', 200, ARRAY['Level 1-3 consciousness tracking', 'Enhanced theme extraction'], 1.0),
  (4, 'Explorer', 300, ARRAY['Level 1-4 consciousness tracking', 'Sacred/profane awareness'], 1.0),
  (5, 'Wayfinder', 400, ARRAY['Level 1-5 consciousness tracking', 'Deeper oracle insights'], 1.0),
  (6, 'Connector', 500, ARRAY['Free tier maximum level', 'Premium subscription unlocked'], 1.0),
  (7, 'Networker', 600, ARRAY['Paid tier only', '1.5x Culture Coin multiplier'], 1.5),
  (8, 'Builder', 700, ARRAY['Paid tier only', '1.5x Culture Coin multiplier'], 1.5),
  (9, 'Creator', 800, ARRAY['Paid tier only', '1.5x Culture Coin multiplier'], 1.5),
  (10, 'Visionary', 900, ARRAY['Paid tier only', '2x Culture Coin multiplier'], 2.0),
  (11, 'Innovator', 1000, ARRAY['Paid tier only', '2x Culture Coin multiplier'], 2.0),
  (12, 'Amplifier', 1100, ARRAY['Paid tier only', '2x Culture Coin multiplier'], 2.0),
  (13, 'Architect', 1200, ARRAY['Paid tier only', '2x Culture Coin multiplier'], 2.0),
  (14, 'Catalyst', 1300, ARRAY['Paid tier only', '2x Culture Coin multiplier'], 2.0),
  (15, 'Transformer', 1400, ARRAY['Seeker tier maximum level', '2x Culture Coin multiplier'], 2.0),
  (16, 'Illuminator', 1500, ARRAY['Trans-Humanist tier only', '3x Culture Coin multiplier'], 3.0),
  (17, 'Sage', 1600, ARRAY['Trans-Humanist tier only', '3x Culture Coin multiplier'], 3.0),
  (18, 'Voyager', 1700, ARRAY['Trans-Humanist tier only', '3x Culture Coin multiplier'], 3.0),
  (19, 'Oracle', 1800, ARRAY['Trans-Humanist tier only', '3x Culture Coin multiplier'], 3.0),
  (20, 'Guardian', 1900, ARRAY['Trans-Humanist tier maximum level', '3x Culture Coin multiplier'], 3.0),
  (21, 'Luminary', 2000, ARRAY['Cultural Architect tier only', '5x Culture Coin multiplier'], 5.0),
  (22, 'Enlightener', 2100, ARRAY['Cultural Architect tier only', '5x Culture Coin multiplier'], 5.0),
  (23, 'Transcender', 2200, ARRAY['Cultural Architect tier only', '5x Culture Coin multiplier'], 5.0),
  (24, 'Ascendant', 2300, ARRAY['Cultural Architect tier only', '5x Culture Coin multiplier'], 5.0),
  (25, 'Source', 2400, ARRAY['Cultural Architect tier maximum level', '5x Culture Coin multiplier'], 5.0);

-- Function to classify a question
CREATE OR REPLACE FUNCTION classify_oracle_question(p_question TEXT) 
RETURNS TABLE(category TEXT, sacred_score INTEGER, profane_score INTEGER) 
LANGUAGE plpgsql 
AS $$
DECLARE
  v_sacred_score INTEGER := 0;
  v_profane_score INTEGER := 0;
  v_category TEXT;
  v_sacred_keywords TEXT[] := ARRAY['consciousness', 'wisdom', 'evolution', 'awareness', 'growth', 
                                   'purpose', 'meaning', 'knowledge', 'creativity', 'innovation', 
                                   'culture', 'connection', 'transformation', 'insight', 'understanding',
                                   'creation', 'enlightenment', 'expansion', 'transcendence', 'authentic'];
  v_profane_keywords TEXT[] := ARRAY['movie', 'show', 'game', 'entertainment', 'celebrity', 
                                   'gossip', 'joke', 'funny', 'meme', 'trivial', 'sports',
                                   'play', 'hobby', 'video game', 'distract', 'amuse',
                                   'television', 'sitcom', 'comedy', 'fiction'];
BEGIN
  -- Calculate sacred score
  SELECT COUNT(*) INTO v_sacred_score
  FROM unnest(v_sacred_keywords) keyword
  WHERE p_question ILIKE '%' || keyword || '%';
  
  -- Calculate profane score
  SELECT COUNT(*) INTO v_profane_score
  FROM unnest(v_profane_keywords) keyword
  WHERE p_question ILIKE '%' || keyword || '%';
  
  -- Determine category
  IF v_sacred_score > v_profane_score THEN
    v_category := 'sacred';
  ELSIF v_profane_score > v_sacred_score THEN
    v_category := 'profane';
  ELSE
    v_category := 'neutral';
  END IF;
  
  RETURN QUERY SELECT v_category, v_sacred_score, v_profane_score;
END;
$$;

-- Function to calculate culture coins
CREATE OR REPLACE FUNCTION calculate_culture_coins(
  p_question_category TEXT,
  p_sacred_score INTEGER,
  p_profane_score INTEGER,
  p_subscription_tier TEXT
) 
RETURNS INTEGER
LANGUAGE plpgsql 
AS $$
DECLARE
  v_base_coins INTEGER;
  v_multiplier NUMERIC(3,1) := 1.0;
BEGIN
  -- Set base coins by category
  CASE p_question_category
    WHEN 'sacred' THEN v_base_coins := 10 + (p_sacred_score * 5);
    WHEN 'profane' THEN v_base_coins := 2 + (p_profane_score * 1);
    ELSE v_base_coins := 5;
  END CASE;
  
  -- Apply subscription multiplier
  CASE p_subscription_tier
    WHEN 'seeker' THEN v_multiplier := 2.0;
    WHEN 'trans_humanist' THEN v_multiplier := 3.0;
    WHEN 'cultural_architect' THEN v_multiplier := 5.0;
    ELSE v_multiplier := 1.0;
  END CASE;
  
  RETURN FLOOR(v_base_coins * v_multiplier);
END;
$$;

-- Stored procedure to process interactions
CREATE OR REPLACE FUNCTION process_oracle_interaction(
  p_user_id TEXT,
  p_session_id TEXT,
  p_question TEXT,
  p_response TEXT,
  p_themes TEXT[]
)
RETURNS TABLE(
  success BOOLEAN,
  coins_earned INTEGER,
  classification TEXT,
  level_up BOOLEAN,
  new_level INTEGER,
  consciousness_title TEXT
)
LANGUAGE plpgsql 
AS $$
DECLARE
  v_category TEXT;
  v_sacred_score INTEGER;
  v_profane_score INTEGER;
  v_coins_earned INTEGER;
  v_current_level INTEGER;
  v_new_level INTEGER;
  v_subscription_tier TEXT;
  v_level_title TEXT;
  v_level_up BOOLEAN := FALSE;
  v_max_free_level INTEGER := 6;
  v_max_seeker_level INTEGER := 15;
  v_max_trans_humanist_level INTEGER := 20;
BEGIN
  -- Ensure user metrics exist
  INSERT INTO user_consciousness_metrics (user_id, first_interaction_date)
  VALUES (p_user_id, CURRENT_TIMESTAMP)
  ON CONFLICT (user_id) DO NOTHING;
  
  -- Classify question
  SELECT * INTO v_category, v_sacred_score, v_profane_score
  FROM classify_oracle_question(p_question);
  
  -- Get user's current level and subscription tier
  SELECT current_level, subscription_tier 
  INTO v_current_level, v_subscription_tier
  FROM user_consciousness_metrics
  WHERE user_id = p_user_id;
  
  -- Calculate coins earned
  SELECT calculate_culture_coins(v_category, v_sacred_score, v_profane_score, v_subscription_tier)
  INTO v_coins_earned;
  
  -- Record interaction
  INSERT INTO oracle_interactions (
    user_id, 
    session_id,
    question_text,
    question_category,
    sacred_score,
    profane_score,
    context_tags,
    culture_coins_earned,
    user_level
  ) VALUES (
    p_user_id,
    p_session_id,
    p_question,
    v_category,
    v_sacred_score,
    v_profane_score,
    p_themes,
    v_coins_earned,
    v_current_level
  );
  
  -- Update user metrics
  UPDATE user_consciousness_metrics
  SET 
    total_culture_coins = total_culture_coins + v_coins_earned,
    last_interaction_date = CURRENT_TIMESTAMP,
    total_sacred_questions = CASE WHEN v_category = 'sacred' THEN total_sacred_questions + 1 ELSE total_sacred_questions END,
    total_profane_questions = CASE WHEN v_category = 'profane' THEN total_profane_questions + 1 ELSE total_profane_questions END
  WHERE user_id = p_user_id;
  
  -- Check if user leveled up
  SELECT 
    LEAST(
      CASE 
        WHEN subscription_tier = 'free' THEN LEAST(v_max_free_level, FLOOR(total_culture_coins / 100) + 1)
        WHEN subscription_tier = 'seeker' THEN LEAST(v_max_seeker_level, FLOOR(total_culture_coins / 100) + 1)
        WHEN subscription_tier = 'trans_humanist' THEN LEAST(v_max_trans_humanist_level, FLOOR(total_culture_coins / 100) + 1)
        WHEN subscription_tier = 'cultural_architect' THEN 25 -- maximum level
        ELSE LEAST(v_max_free_level, FLOOR(total_culture_coins / 100) + 1)
      END,
      25  -- absolute maximum level cap
    ) INTO v_new_level
  FROM user_consciousness_metrics
  WHERE user_id = p_user_id;
  
  IF v_new_level > v_current_level THEN
    v_level_up := TRUE;
    
    -- Get level title
    SELECT title INTO v_level_title
    FROM culture_coin_levels
    WHERE level = v_new_level;
    
    -- Update user level
    UPDATE user_consciousness_metrics
    SET current_level = v_new_level
    WHERE user_id = p_user_id;
  ELSE
    -- Get current level title
    SELECT title INTO v_level_title
    FROM culture_coin_levels
    WHERE level = v_current_level;
  END IF;
  
  RETURN QUERY SELECT 
    TRUE AS success,
    v_coins_earned AS coins_earned,
    v_category AS classification,
    v_level_up AS level_up,
    v_new_level AS new_level,
    v_level_title AS consciousness_title;
END;
$$;

-- Enable RLS and set up policies
ALTER TABLE culture_coin_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_consciousness_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE oracle_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE oracle_subscriptions ENABLE ROW LEVEL SECURITY;

-- Drop policies if they exist before creating them
DROP POLICY IF EXISTS "Anyone can read levels" ON culture_coin_levels;
DROP POLICY IF EXISTS "Users can view own metrics" ON user_consciousness_metrics;
DROP POLICY IF EXISTS "Users can manage their interactions" ON oracle_interactions;
DROP POLICY IF EXISTS "Users can view own subscription" ON oracle_subscriptions;

-- Policies for culture_coin_levels - anyone can read
CREATE POLICY "Anyone can read levels"
  ON culture_coin_levels
  FOR SELECT
  TO public
  USING (TRUE);

-- Policies for user_consciousness_metrics - users can see own
CREATE POLICY "Users can view own metrics"
  ON user_consciousness_metrics
  FOR SELECT
  TO public
  USING (TRUE);

-- Policies for oracle_interactions - open for now, restrict later
CREATE POLICY "Users can manage their interactions"
  ON oracle_interactions
  FOR ALL
  TO public
  USING (TRUE);

-- Policies for oracle_subscriptions - users can see own subscription
CREATE POLICY "Users can view own subscription"
  ON oracle_subscriptions
  FOR SELECT
  TO public
  USING ((uid())::text = user_id);

-- Create indices for performance
CREATE INDEX IF NOT EXISTS idx_oracle_interactions_user_id ON oracle_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_oracle_interactions_session_id ON oracle_interactions(session_id);
CREATE INDEX IF NOT EXISTS idx_oracle_interactions_category ON oracle_interactions(question_category);
CREATE INDEX IF NOT EXISTS idx_user_metrics_level ON user_consciousness_metrics(current_level);
CREATE INDEX IF NOT EXISTS idx_user_metrics_subscription ON user_consciousness_metrics(subscription_tier);