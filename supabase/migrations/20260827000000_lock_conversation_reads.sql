-- Raw conversation turns must never be readable with the public anon key.
-- Writes remain edge-function-compatible for the current incremental uploader;
-- all reads go through the session-scoped conversation-history function.
DROP POLICY IF EXISTS "anon_select" ON public.conversation_turns;
REVOKE SELECT ON TABLE public.conversation_turns FROM anon;
REVOKE SELECT ON TABLE public.conversation_turns FROM authenticated;