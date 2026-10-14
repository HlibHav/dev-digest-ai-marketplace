---
name: security
description: Application security rules organised by the OWASP Top 10:2025, for reviewing code or writing security-sensitive code in any stack. Use when implementing or reviewing authentication, authorization, input handling, queries, file uploads, secrets, logging, error handling, dependencies, API endpoints, or any place where untrusted input meets a sensitive operation (queries, shell, file paths, HTML, outgoing requests, LLM prompts). Gives a confidence-based review method (trace the data flow, report only what an attacker can reach), severity grades and per-category checks. Triggers on "security review", "is this safe", "vulnerability", "injection", "XSS", "SSRF", "IDOR", "auth bug", "secrets in code", "OWASP", "threat model", "untrusted input", "prompt injection".
---

# security

Security review is a data-flow question: can an attacker control this value, and does it reach something dangerous? Pattern matching alone produces noise that teaches people to ignore findings, so the method below makes you prove reachability before you report.

## Method

1. **Detect the context.** Endpoint, auth logic, query, file handling, rendering, outgoing request, configuration, dependency, or an LLM call.
2. **Pick only the categories that apply** (table below) and read their checks in [references/checks.md](references/checks.md).
3. **Trace the data flow.** Where does the value come from (request, file, webhook, database written by users, model output, third-party API)? Is it validated or encoded on the way?
4. **Check upstream controls.** Middleware, framework defaults, schema validation and permission checks already in front of the code may neutralise the pattern.
5. **Verify exploitability.** Describe the concrete request or input that triggers it.
6. **Report with evidence:** file, line, the quoted line, the exploit in one sentence, the fix.

| Confidence | Meaning | Action |
|---|---|---|
| High | Dangerous sink plus confirmed attacker-controlled input | Report with exploit and fix |
| Medium | Dangerous sink, input source unclear | Note for manual verification |
| Low | Theoretical or best-practice deviation | Leave out unless asked |

Do not flag: test fixtures, dead code, values the server controls (config constants, deploy-time environment), or patterns the framework already neutralises. The golden question stays the same: an outgoing request to a URL from configuration is fine, to a URL taken from the request is not.

## Severity

| Level | Criteria |
|---|---|
| Critical | Exploitable without authentication or with trivial access: auth bypass, injection reaching data or commands, secrets committed, missing auth on an admin operation, remote code execution |
| High | Exploitable under conditions: stored XSS, access to another user's object (IDOR), weak token signing, credentials in logs |
| Medium | Limited impact or specific preconditions: missing rate limit, permissive CORS, verbose errors in production, missing input validation |
| Low | Defence in depth: weak hashing cost, missing audit event |

If the project defines its own severity scale, use that one.

## OWASP Top 10:2025 at a glance

| # | Category | The question to ask |
|---|---|---|
| A01 | Broken access control | Is every object access checked against the caller, on the server? |
| A02 | Security misconfiguration | Are defaults, headers, CORS, debug modes and error output safe for production? |
| A03 | Software supply chain failures | Is every dependency pinned, audited and necessary? |
| A04 | Cryptographic failures | Are secrets strong, passwords hashed properly, transport encrypted? |
| A05 | Injection | Does user input reach a query, command, template, path or HTML unescaped? |
| A06 | Insecure design | Is there a limit on abuse (rate, size, cost) and a threat model for the feature? |
| A07 | Authentication failures | Are tokens verified, sessions bounded, login hardened? |
| A08 | Software or data integrity failures | Can a caller set fields they should not (mass assignment), or load unsigned code or data? |
| A09 | Logging and alerting failures | Are security events logged and secrets kept out of logs? |
| A10 | Mishandling of exceptional conditions | Does an error path fail closed? |

## Untrusted input rule

Treat as untrusted everything that is not code you ship: request data, uploaded files, webhook payloads, database fields users can write, text fetched from third-party systems, and model output. Validate at the boundary against a schema, encode for the sink it reaches, and never let such text decide which tools, files or hosts get used. For features that put untrusted text into an LLM prompt, see the prompt-injection section of the checks.

## Handling secrets while reviewing

Never print a secret you find. Report its location and type, not its value, and recommend rotation if it was committed.

[references/checks.md](references/checks.md) has the per-category checks, the secret-pattern list and the LLM section. [references/sources.md](references/sources.md) lists where the ideas come from.
