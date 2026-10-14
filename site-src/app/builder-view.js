// Install builder panel (AC-27 to AC-32). The checkbox list is built once and updated in place,
// so keyboard focus survives every change. Output is rebuilt from resolveSelection().
import { h } from './safe-dom.js';
import { RANGE_NOTE, resolveSelection, settingsSnippet, cliCommands } from './builder.js';
import { copyAndAnnounce } from './status.js';
import { t } from '../i18n/t.js';

export const GUIDANCE = t('builder.guidance');
export const AUTO_LABEL = t('builder.auto');

/** Row note: "added automatically, required by beta, suite". Empty when the plugin is not in the set. */
export function rowNote(entry) {
  if (!entry) return '';
  const parts = [];
  if (entry.auto) parts.push(AUTO_LABEL);
  if (entry.requiredBy.length) parts.push(t('builder.requiredBy', { names: entry.requiredBy.join(', ') }));
  return parts.join(', ');
}

/** A plugin that another plugin in the set needs cannot be unticked (AC-28). */
export const isLocked = (entry) => Boolean(entry && entry.requiredBy.length > 0);

/**
 * opts: {doc, win, host, plugins[], selected[], status, onChange(selected[]), onUpdate(entries[])}.
 * Returns {update(), selected(), toggle(name, on), state(name)}. `host` is the #builder panel; it is un-hidden here.
 * onUpdate runs after every change with the resolved set, so the tray and the cards' install-set boxes can follow.
 */
export function createBuilderView({ doc, win, host, plugins, selected: initial = [], status, onChange, onUpdate }) {
  const known = new Set(plugins.map((p) => p.name));
  const selected = new Set(initial.filter((n) => known.has(n)));
  const rows = new Map();
  let current = new Map();

  const list = h(doc, 'ul', { class: 'builder-list' });
  plugins.forEach((plugin, i) => {
    const noteId = `builder-note-${i}`;
    const input = h(doc, 'input', { type: 'checkbox', class: 'check', name: 'plugin', value: plugin.name, 'aria-describedby': noteId });
    const note = h(doc, 'span', { class: 'row-note', id: noteId });
    input.addEventListener('change', () => toggle(plugin.name, input.checked));
    const li = h(doc, 'li', { class: 'builder-row' }, h(doc, 'label', {}, input, ' ', h(doc, 'span', { class: 'plugin-name' }, plugin.name), ' ', h(doc, 'span', { class: 'version' }, t('card.version', { version: plugin.version }))), ' ', note);
    rows.set(plugin.name, { input, note, li });
    list.append(li);
  });

  const output = h(doc, 'div', { class: 'builder-result' });
  host.append(
    h(doc, 'p', { class: 'builder-intro' }, t('builder.intro')),
    list,
    output,
  );

  function copyBlock(title, label, copyName, text) {
    const pre = h(doc, 'pre', { class: 'install' }, text);
    const button = h(doc, 'button', { type: 'button', class: 'copy-btn', 'data-copy': copyName }, label);
    button.addEventListener('click', () => copyAndAnnounce({ text, win, status, onManual: () => pre }));
    return h(
      doc,
      'div',
      { class: 'builder-output' },
      h(doc, 'div', { class: 'output-head' }, h(doc, 'div', { class: 'output-title' }, h(doc, 'b', {}, title)), button),
      pre,
    );
  }

  function renderOutput(entries) {
    if (!entries.length) {
      output.replaceChildren(h(doc, 'p', { class: 'builder-guidance' }, GUIDANCE));
      return;
    }
    const items = entries.map((e) =>
      h(
        doc,
        'li',
        { 'data-entry': e.name },
        h(doc, 'code', {}, e.name),
        e.auto ? ` ${t('builder.autoNote', { label: AUTO_LABEL })}` : null,
        e.ranges.length ? `: ${e.ranges.map((r) => t('builder.declaredBy', { range: r.range, from: r.from })).join(', ')}` : null,
      ),
    );
    output.replaceChildren(
      h(doc, 'h3', { class: 'section-title' }, t('builder.yourSet')),
      h(doc, 'ul', { class: 'builder-set' }, ...items),
      h(doc, 'p', { class: 'range-note' }, RANGE_NOTE),
      copyBlock(t('builder.installCommands'), t('builder.copyCommands'), 'commands', cliCommands(entries)),
      copyBlock(t('builder.settingsFile'), t('builder.copySnippet'), 'snippet', settingsSnippet(entries)),
    );
  }

  function toggle(name, on) {
    if (!known.has(name)) return;
    if (on) selected.add(name);
    else selected.delete(name);
    update();
    onChange?.([...selected]);
  }

  /** What a plugin card's install-set box shows: ticked when in the set, locked when another plugin needs it. */
  const state = (name) => ({ checked: current.has(name), locked: isLocked(current.get(name)) });

  function update() {
    const { entries } = resolveSelection(plugins, [...selected]);
    const byName = new Map(entries.map((e) => [e.name, e]));
    current = byName;
    for (const [name, row] of rows) {
      const entry = byName.get(name);
      row.input.checked = Boolean(entry);
      row.input.disabled = isLocked(entry);
      row.note.textContent = rowNote(entry);
      row.li.setAttribute('class', `builder-row${entry ? ' is-picked' : ''}${isLocked(entry) ? ' is-locked' : ''}`);
    }
    renderOutput(entries);
    onUpdate?.(entries);
  }

  host.hidden = false;
  update();
  return { update, selected: () => [...selected], toggle, state };
}
