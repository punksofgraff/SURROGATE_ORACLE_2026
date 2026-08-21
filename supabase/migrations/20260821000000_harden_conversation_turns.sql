-- Harden conversation_turns table - block all direct unauthenticated REST access.
-- The application now relies purely on server-mediated edge functions.
ALTER TABLE IF EXISTS conversation_turns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert" ON conversation_turns;
DROP POLICY IF EXISTS "anon_select" ON conversation_turns;

REVOKE ALL ON TABLE conversation_turns FROM anon;
REVOKE ALL ON TABLE conversation_turns FROM authenticated;
