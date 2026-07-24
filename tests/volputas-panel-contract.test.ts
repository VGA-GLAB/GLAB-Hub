import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Volputas choice placeholder represents an omitted answer', async () => {
  const source = await readFile(
    new URL('../plugins/volputas/panel.ts', import.meta.url),
    'utf8',
  );
  const placeholder = source.indexOf(
    "const placeholder = el('option', undefined, '選択してください')",
  );
  const emptyValue = source.indexOf("placeholder.value = ''");
  const append = source.indexOf('select.appendChild(placeholder)');

  assert.ok(placeholder >= 0);
  assert.ok(emptyValue > placeholder);
  assert.ok(append > emptyValue);
});
