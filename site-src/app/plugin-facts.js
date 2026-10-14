// Plain-text facts about a plugin that come from the catalog index: the Claude Code range it needs and its latest changelog entry.
// Both fields are optional in the index; absent or empty gives null. Callers render the text as a text node, never as HTML.
import { t } from '../i18n/t.js';

/** "Requires Claude Code >=2.0.0", or null when the plugin declares no compatibility. */
export function compatibilityText(plugin) {
  const range = plugin?.compatibility?.claudeCode;
  return typeof range === 'string' && range ? t('card.requiresClaudeCode', { range }) : null;
}

/** {title: "What's new in 1.2.0", note: "first note line"} from the newest changelog entry, or null. */
export function whatsNew(plugin) {
  const entry = Array.isArray(plugin?.changelog) ? plugin.changelog[0] : null;
  if (!entry || typeof entry.version !== 'string' || !entry.version) return null;
  const note = String(entry.notes ?? '').split('\n').map((line) => line.trim()).find(Boolean) ?? '';
  return { title: t('card.whatsNew', { version: entry.version }), note };
}
