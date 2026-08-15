-- Add ghost_phrase column to seeker_echo.
-- Populated by oracle-memory-distill after each session: a short (8-14 word)
-- Oracle-voiced poetic fragment generated with NO seeker-derived context.
-- This column — not session_summary or last_session_themes — is the only field
-- the public op:'fragments' endpoint reads, keeping raw session content server-side.
ALTER TABLE seeker_echo
  ADD COLUMN IF NOT EXISTS ghost_phrase text;
