// Install builder panel (AC-27 to AC-32). The checkbox list is built once and updated in place,
// so keyboard focus survives every change. Output is rebuilt from resolveSelection().
import { h } from './safe-dom.js';
import { RANGE_NOTE, resolveSelection, settingsSnippet, cliCommands } from './builder.js';
import { copyAndAnnounce } from './status.js';

export const GUIDANCE = 'Select one or more plugins to get the settings.json snippet and the install commands.';
export const AUTO_LABEL = 'added automatically';

/** Row note: "added automatically, required by beta, suite". Empty when the plugin is not in the set. */
export function rowNote(entry) {
  if (!entry) return '';
  const parts = [];
  if (entry.auto) parts.push(AUTO_LABEL);
  if (entry.requiredBy.length) parts.push(`required by ${entry.requiredBy.join(', ')}`);
  return parts.join(', ');
}

/** A plugin that another plugin in the set needs cannot be unticked (AC-28). */
export const isLocked = (entry) => Boolean(entry && entry.requiredBy.length > 0);

/**
 * opts: {doc, win, host, plugins[], selected[], status, onChange(selected[])}.
 * Returns {update(), selected()}. `host` is the #builder section; it is un-hidden here.
 */
export function createBuilderView({ doc, win, host, plugins, selected: initial = [], status, onChange }) {
  const known = new Set(plugins.map((p) => p.name));
  const selected = new Set(initial.filter((n) => known.has(n)));
  const rows = new Map();

  const list = h(doc, 'ul', { class: 'builder-list' });
  plugins.forEach((plugin, i) => {
    const noteId = `builder-note-${i}`;
    const input = h(doc, 'input', { type: 'checkbox', name: 'plugin', value: plugin.name, 'aria-describedby': noteId });
    const note = h(doc, 'span', { class: 'row-note', id: noteId });
    input.addEventListener('change', () => {
      if (input.checked) selected.add(plugin.name);
      else selected.delete(plugin.name);
      update();
      onChange?.([...selected]);
    });
    rows.set(plugin.name, { input, note });
    list.append(
      h(doc, 'li', { class: 'builder-row' }, h(doc, 'label', {}, input, ' ', h(doc, 'span', { class: 'plugin-name' }, plugin.name), ' ', h(doc, 'span', { class: 'version' }, `v${plugin.version}`)), ' ', note),
    );
  });

  const output = h(doc, 'div', { class: 'builder-output' });
  host.append(
    h(doc, 'p', { class: 'builder-intro' }, 'Tick the plugins you want. Their dependencies are added for you.'),
    list,
    output,
  );

  function copyBlock(label, copyName, text) {
    const pre = h(doc, 'pre', { class: 'install' }, text);
    const button = h(doc, 'button', { type: 'button', class: 'copy-btn', 'data-copy': copyName }, label);
    button.addEventListener('click', () => copyAndAnnounce({ text, win, status, onManual: () => pre }));
    return [pre, button];
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
        e.auto ? ` (${AUTO_LABEL})` : null,
        e.ranges.length ? `: ${e.ranges.map((r) => `${r.range} (declared by ${r.from})`).join(', ')}` : null,
      ),
    );
    output.replaceChildren(
      h(doc, 'h3', {}, 'Your set'),
      h(doc, 'ul', { class: 'builder-set' }, ...items),
      h(doc, 'p', { class: 'range-note' }, RANGE_NOTE),
      h(doc, 'h3', {}, 'Install commands'),
      ...copyBlock('Copy commands', 'commands', cliCommands(entries)),
      h(doc, 'h3', {}, '.claude/settings.json'),
      ...copyBlock('Copy settings.json snippet', 'snippet', settingsSnippet(entries)),
    );
  }

  function update() {
    const { entries } = resolveSelection(plugins, [...selected]);
    const byName = new Map(entries.map((e) => [e.name, e]));
    for (const [name, row] of rows) {
      const entry = byName.get(name);
      row.input.checked = Boolean(entry);
      row.input.disabled = isLocked(entry);
      row.note.textContent = rowNote(entry);
    }
    renderOutput(entries);
  }

  host.hidden = false;
  update();
  return { update, selected: () => [...selected] };
}
