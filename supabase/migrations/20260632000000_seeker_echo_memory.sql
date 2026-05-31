-- Seeker Echo memory expansion: narrative session summary + accumulated themes
ALTER TABLE seeker_echo ADD COLUMN IF NOT EXISTS session_summary TEXT;
ALTER TABLE seeker_echo ADD COLUMN IF NOT EXISTS last_session_themes TEXT[];
ALTER TABLE seeker_echo ADD COLUMN IF NOT EXISTS session_count INT DEFAULT 0;
