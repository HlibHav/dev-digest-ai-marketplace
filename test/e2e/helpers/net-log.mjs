// Records every request a Playwright page makes, so a test can prove none left the page origin (AC-8).
const NON_NETWORK = new Set(['data:', 'blob:', 'about:']);

export function netLog(page, { origin } = {}) {
  const requests = [];
  page.on('request', (req) => requests.push(req.url()));
  return {
    requests,
    offOrigin() {
      const own = origin ?? new URL(page.url()).origin;
      return requests.filter((u) => {
        const url = new URL(u);
        return !NON_NETWORK.has(url.protocol) && url.origin !== own;
      });
    },
  };
}
