# SURROGATE — Replit Integration

## Development Environment
- **Host:** 0.0.0.0
- **Port:** 5173
- **Commands:** `npm run dev` (Vite)

## Secrets Configuration
The following secrets MUST be present in Replit and pushed to Supabase:

- `GEMINI_API_KEY`: Google AI Studio free-tier key.
- `DECART_API_KEY`: Decart AI key for realtime video avatars.
- `REPLICATE_API_TOKEN`: Key for portrait generation (Flux).
- `SUPABASE_URL` / `SUPABASE_ANON_KEY`: Connection to the `velmmplevfrtrtrypoch` project.

## Handshake Verification
To verify the Oracle handshake in Replit:
1. Open the preview window.
2. Add `?devui=1` to the URL or run `localStorage.setItem('oracle_step_log','1')` in the console.
3. Reload the page.
4. Watch the `OracleStepLogger` overlay for green checkmarks across all phases.

## Automated Testing
Run the pressure test to confirm system integrity:
```bash
node scripts/oracle-pressure.mjs
```
The test captures screenshots of each phase in `/screenshots`.
