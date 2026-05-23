# Should I Ship Local Report

**Score:** 89/100
**Launch verdict:** Beta only
**Why:** 5 findings should be reviewed before a public launch. A small private beta may be reasonable if you understand the tradeoff.
**Impact:** 0 blockers / 36 fix before traffic / 1 can wait
**Files analyzed:** 191
**Local privacy:** scanned git-visible files, including uncommitted non-ignored files. Source code was not uploaded.
**Engines:** custom rules enabled / Semgrep available / OSV available
**Duration:** 11.8s

## Full Report Unlock

The free scan shows the top findings in detail. The $10 full report unlocks every finding with exact locations, fixes, and AI-ready repair prompts.

- Create a checkout link by running `should-i-ship scan --unlock-link`.
- All locked findings unlocked with exact issue details.
- Prioritized fixes for the highest-impact issues.
- Shareable report for cofounders, contractors, customers, or your own launch notes.
- Source code is not uploaded by this local report.
- CLI unlock links upload findings and scan metadata only, never source code.

## Category Scores

- Security: 77/100
- Launch: 98/100
- Architecture: 97/100
- Cost: 98/100

## Finding Counts

- Critical: 0
- High: 5
- Medium: 29
- Low: 1
- Info: 2

## Fix-first Plan

### HIGH SECURITY: Possible Hardcoded credential

**Launch impact:** Beta only until reviewed

This looks like a hardcoded credential. If it's a real secret, it needs to be in an environment variable.


**Location:** `supabase/config.toml:95`


**Suggested fix:** If this is a real credential, move it to .env and reference via process.env. If it's a placeholder or default, consider making that clearer in the code.

Source: CUSTOM / Confidence: MEDIUM

<details>
<summary>Copy/paste fix prompt</summary>

```text
Fix this launch-readiness issue in my app.
Issue: Possible Hardcoded credential
Launch impact: Beta only until reviewed
Severity: HIGH
Category: SECURITY
Confidence: MEDIUM
File: supabase/config.toml:95
Rule: generic-secret
CWE: CWE-798
Why it matters:
This looks like a hardcoded credential. If it's a real secret, it needs to be in an environment variable.

Suggested fix:
If this is a real credential, move it to .env and reference via process.env. If it's a placeholder or default, consider making that clearer in the code.

Relevant code:
abase AI in the Supabase Studio. openai_api_••••••EY)"  # Email testing server. Emails sent wi
Please make the smallest safe code change that addresses this issue. Preserve existing behavior, avoid unrelated refactors, and tell me how to verify the fix.
```

</details>

### HIGH SECURITY: Possible Hardcoded credential

**Launch impact:** Beta only until reviewed

This looks like a hardcoded credential. If it's a real secret, it needs to be in an environment variable.


**Location:** `supabase/config.toml:321`


**Suggested fix:** If this is a real credential, move it to .env and reference via process.env. If it's a placeholder or default, consider making that clearer in the code.

Source: CUSTOM / Confidence: MEDIUM

<details>
<summary>Copy/paste fix prompt</summary>

```text
Fix this launch-readiness issue in my app.
Issue: Possible Hardcoded credential
Launch impact: Beta only until reviewed
Severity: HIGH
Category: SECURITY
Confidence: MEDIUM
File: supabase/config.toml:321
Rule: generic-secret
CWE: CWE-798
Why it matters:
This looks like a hardcoded credential. If it's a real secret, it needs to be in an environment variable.

Suggested fix:
If this is a real credential, move it to .env and reference via process.env. If it's a placeholder or default, consider making that clearer in the code.

Relevant code:
ironment variable substitution instead: secr••••••ET)" # Overrides the default auth callback U
Please make the smallest safe code change that addresses this issue. Preserve existing behavior, avoid unrelated refactors, and tell me how to verify the fix.
```

</details>

### HIGH SECURITY: Vulnerable dependency: lodash@4.17.23

**Launch impact:** Beta only until reviewed

GHSA-r5fr-rjxr-66jc: lodash vulnerable to Code Injection via `_.template` imports key names Also known as CVE-2026-4800. Ecosystem: npm.


**Location:** `pnpm-lock.yaml`


**Suggested fix:** Upgrade lodash to 4.18.0 or later. Review https://osv.dev/vulnerability/GHSA-r5fr-rjxr-66jc.

Source: NPM_AUDIT / Confidence: HIGH

<details>
<summary>Copy/paste fix prompt</summary>

```text
Fix this launch-readiness issue in my app.
Issue: Vulnerable dependency: lodash@4.17.23
Launch impact: Beta only until reviewed
Severity: HIGH
Category: SECURITY
Confidence: HIGH
File: pnpm-lock.yaml
Rule: osv:GHSA-r5fr-rjxr-66jc
Why it matters:
GHSA-r5fr-rjxr-66jc: lodash vulnerable to Code Injection via `_.template` imports key names Also known as CVE-2026-4800. Ecosystem: npm.

Suggested fix:
Upgrade lodash to 4.18.0 or later. Review https://osv.dev/vulnerability/GHSA-r5fr-rjxr-66jc.
Please make the smallest safe code change that addresses this issue. Preserve existing behavior, avoid unrelated refactors, and tell me how to verify the fix.
```

</details>

## Locked Findings

The local scan found 34 more findings. Create an unlock link to get exact issues, files, fixes, and copy/paste repair prompts.

1. **HIGH SECURITY** finding locked in the full report.
2. **HIGH SECURITY** finding locked in the full report.
3. **MEDIUM ARCHITECTURE** finding locked in the full report.
4. **MEDIUM ARCHITECTURE** finding locked in the full report.
5. **MEDIUM COST** finding locked in the full report.
6. **MEDIUM LAUNCH** finding locked in the full report.
7. **MEDIUM SECURITY** finding locked in the full report.
8. **MEDIUM SECURITY** finding locked in the full report.
9. **MEDIUM SECURITY** finding locked in the full report.
10. **MEDIUM SECURITY** finding locked in the full report.
11. **MEDIUM SECURITY** finding locked in the full report.
12. **MEDIUM SECURITY** finding locked in the full report.
13. **MEDIUM SECURITY** finding locked in the full report.
14. **MEDIUM SECURITY** finding locked in the full report.
15. **MEDIUM SECURITY** finding locked in the full report.
16. **MEDIUM SECURITY** finding locked in the full report.
17. **MEDIUM SECURITY** finding locked in the full report.
18. **MEDIUM SECURITY** finding locked in the full report.
19. **MEDIUM SECURITY** finding locked in the full report.
20. **MEDIUM SECURITY** finding locked in the full report.
21. **MEDIUM SECURITY** finding locked in the full report.
22. **MEDIUM SECURITY** finding locked in the full report.
23. **MEDIUM SECURITY** finding locked in the full report.
24. **MEDIUM SECURITY** finding locked in the full report.
25. **MEDIUM SECURITY** finding locked in the full report.
26. **MEDIUM SECURITY** finding locked in the full report.
27. **MEDIUM SECURITY** finding locked in the full report.
28. **MEDIUM SECURITY** finding locked in the full report.
29. **MEDIUM SECURITY** finding locked in the full report.
30. **MEDIUM SECURITY** finding locked in the full report.
31. **MEDIUM SECURITY** finding locked in the full report.
32. **LOW COST** finding locked in the full report.
33. **INFO ARCHITECTURE** finding locked in the full report.
34. **INFO COST** finding locked in the full report.

Run `should-i-ship scan --unlock-link` to create a $10 unlock link.

## Note

This is an automated launch-readiness scan, not a professional security audit.