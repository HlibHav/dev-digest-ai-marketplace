// The single translation lookup. Every user-visible string lives in messages.en.json, never in a component.
// t('card.copyInstall'); t('tray.summary', { count: 2, names: 'a, b' }).
// Placeholders are {name}. A message that is an object { one, other } is a plural chosen by params.count.
// A missing key or a missing placeholder throws: test/unit/i18n.test.mjs proves every key used in the code exists,
// so a throw means a bug caught in dev and CI, not a blank label for a visitor.
import messages from './messages.en.json' with { type: 'json' };

const rules = new Intl.PluralRules(messages.meta.lang);

function lookup(key) {
  let node = messages;
  for (const part of key.split('.')) {
    if (node === null || typeof node !== 'object' || !Object.hasOwn(node, part)) throw new Error(`i18n: missing key "${key}"`);
    node = node[part];
  }
  return node;
}

export function t(key, params = {}) {
  let message = lookup(key);
  if (message !== null && typeof message === 'object') {
    if (typeof params.count !== 'number') throw new Error(`i18n: key "${key}" is a plural and needs params.count`);
    const form = rules.select(params.count);
    message = message[form] ?? message.other;
  }
  if (typeof message !== 'string') throw new Error(`i18n: key "${key}" is not a message`);
  return message.replace(/\{(\w+)\}/g, (_, name) => {
    if (!Object.hasOwn(params, name)) throw new Error(`i18n: key "${key}" needs {${name}}`);
    return String(params[name]);
  });
}
