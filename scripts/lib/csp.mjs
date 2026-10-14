// The Content-Security-Policy of the built page (NFR security). The site is same-origin only: no inline code,
// no eval, no third-party origin. The effects spike (ADR 2026-10-14-own-webgpu-effects) needed nothing looser.
export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');
