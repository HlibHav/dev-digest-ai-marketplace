# Security checks by category

Contents: A01 to A10, file uploads, secrets, outgoing requests, LLM features, review checklist.

Written for any stack. Where a rule names a mechanism, use the equivalent in your framework.

## A01 Broken access control
- Deny by default: a route is protected unless it is listed as public. Prefer one barrier applied to a whole group of routes over per-route opt-in, which is easy to forget.
- Authenticated is not authorized. Every read, update and delete of an object checks that the caller owns it or holds a role that permits it. Look for lookups by id taken from the request with no owner filter (IDOR).
- Multi-tenant data: the tenant or workspace scope is part of every query, derived from the session, never from a request field.
- Client-side route guards are user interface only. The server enforces.
- Test both directions: user A reading user B's data, and an ordinary user calling an admin operation.

## A02 Security misconfiguration
- Security headers set (content security policy, frame, content-type, transport security).
- CORS: an explicit allow-list of origins. A wildcard or reflected origin together with credentials is a finding.
- Production error output is generic; stack traces and internals stay in logs.
- Variables exposed to the browser bundle are public. No secrets in them.
- Debug endpoints, sample credentials and verbose modes are off outside development.
- Databases and admin consoles are not reachable from the open internet and require authentication and TLS.

## A03 Software supply chain failures
- Lockfile committed; installs in CI use it exactly.
- Run the ecosystem's audit before release and triage by reachability, not by count.
- Before adding a dependency: maintenance activity, known advisories, scope of access (network, file system, environment), look-alike names (typosquatting).
- Build plugins and install scripts run with your privileges. Prefer well-known publishers.

## A04 Cryptographic failures
- Passwords: a slow, salted hash designed for passwords (Argon2id preferred, then bcrypt or scrypt). Never a fast general hash or plain text.
- Signing keys and secrets: at least 256 random bits, loaded from configuration, rotated after any exposure.
- Tokens: set the algorithm explicitly, reject "none", set an expiry, verify the signature (decoding is not verifying). Put nothing secret in the payload; it is only encoded.
- Encrypt in transit. Encrypt sensitive personal data at rest.

## A05 Injection
- Queries: parameterise. In document stores, cast input to the expected type so objects like `{"$gt": ""}` cannot become operators, and never feed input to server-side script clauses.
- Shell: avoid a shell. Call the program with an argument array. Never build a command string from input.
- Paths: resolve the final path and check that it stays inside the allowed directory; do not trust a name because it "looks" clean.
- HTML: encode on output for the context (text, attribute, URL, script). Use the framework's auto-escaping and avoid raw-HTML escape hatches unless the content passed a sanitizer with an allow-list. Allow only safe URL schemes (`http`, `https`) in user-supplied links.
- Regular expressions built from input must be escaped, and patterns with nested quantifiers on input are a denial-of-service risk.
- Templates, deserializers and `eval`-like functions never receive untrusted input.

## A06 Insecure design
- Rate-limit by cost: login, password reset, expensive or paid operations (including LLM calls), uploads, anything that sends email or messages.
- Bound sizes: request bodies, page sizes, upload size, query result counts, timeouts.
- Write a short threat model for features that touch money, identity, or other people's data: what is the asset, who is the attacker, what is the worst thing they can do.

## A07 Authentication failures
- Same generic error for unknown user and wrong password; no user enumeration through timing or messages.
- Middleware fails closed: the protected handler runs only after successful verification, and every error branch returns before it.
- Sessions and tokens have limited lifetime, can be revoked, and are rotated on privilege change.
- Throttle or lock out repeated failures; offer a second factor for sensitive operations.
- Password responses never include the hash.

## A08 Software and data integrity failures
- Mass assignment: copy an explicit list of fields from the request into a model. Never spread the request body into a create or update call (a caller could set `role`).
- Validate with a schema: types, enums, lengths, required fields.
- Uploads: allow-list content types and check the real file signature for sensitive cases.
- Do not load code, plugins, or serialized objects from sources you do not control. Verify signatures or checksums for downloaded artifacts and CI actions.

## A09 Logging and alerting failures
- Log: login success and failure, token rejection, permission denials, admin actions, upload events, rate-limit hits, server errors, with actor, time and source.
- Never log: passwords, tokens, API keys, card numbers, government identifiers. Redact known sensitive field names before writing.
- Structured logs, forwarded somewhere that survives the host.

## A10 Mishandling of exceptional conditions
- Errors deny, they do not grant. A `catch` must return the error response before any "continue to next handler" call.
- One global error handler returning a generic message; promise rejections reach it.
- Startup fails fast when required configuration or a database connection is missing.
- Unmatched routes return 404, not a default page that leaks structure.

## File uploads
Allow-list types; limit size; generate the stored name on the server; strip directory parts from any name used; keep uploads outside the code path and serve them with a safe content type; delete files with their records, after checking the path stays in the upload directory.

## Secrets
Patterns worth scanning for in code and configuration (report location and type only):

| Type | Shape |
|---|---|
| AWS access key | `AKIA` followed by 16 uppercase letters or digits |
| Google API key | `AIza` followed by 35 URL-safe characters |
| Private key block | `-----BEGIN ... PRIVATE KEY-----` |
| Source host token | prefixes such as `ghp_`, `ghs_` |
| Package registry token | prefix such as `npm_` |
| Chat token | prefix `xox` plus a letter |
| Connection string with password | `scheme://user:password@host` |
| Generic assignment | names like secret, key, token, password assigned a long literal |

Never commit environment files, logs or uploads. If one was committed, treat the secret as exposed and rotate it; deleting the commit is not enough.

## Outgoing requests (SSRF)
When the server fetches a URL influenced by a caller: allow-list schemes and hosts, resolve the address and refuse private, loopback and link-local ranges (including cloud metadata addresses), do not follow redirects blindly, set timeouts and size limits.

## LLM features
- Prompt injection: text from users, repositories, web pages, tickets or documents placed into a prompt can carry instructions. Keep it in a clearly delimited data section, never let it choose tools, files or hosts, and do not grant the model more authority than the user has.
- Scope tools tightly; confirm irreversible actions with a human.
- Treat model output as untrusted input: validate against a schema before use, encode before rendering as HTML, never execute generated code without review.
- Keep API keys on the server, cap prompt length and cost per caller, and log prompts for audit without secrets.

## Review checklist
1. Every new endpoint: authentication, authorization on the object, input schema, rate limit.
2. Every new query or command: parameterised, no string building from input.
3. Every new rendering of user text: encoded or sanitised.
4. Every new outgoing request: destination allow-list.
5. New dependencies: audited and necessary.
6. No secret in code, logs or client bundle.
7. Error paths fail closed and say little.
