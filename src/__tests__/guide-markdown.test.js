import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as guide from '../guide-markdown.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = async () => guide;

test('slugify toglie accenti e punteggiatura', async () => {
  const { slugify } = await load();
  assert.equal(slugify("Stato dell'area"), 'stato-dell-area');
  assert.equal(slugify('Capacità'), 'capacita');
});

test('parseGuide riconosce titoli, paragrafi, elenchi annidati e righe di continuazione', async () => {
  const { parseGuide } = await load();
  const blocks = parseGuide([
    '# Titolo', '', 'Riga uno', 'riga due.', '', '## Sezione', '',
    '- primo', '  continua', '  - figlio', '- secondo', '', 'Dopo.',
  ].join('\n'));
  assert.deepEqual(blocks, [
    { type: 'h1', text: 'Titolo', id: 'titolo' },
    { type: 'p', text: 'Riga uno riga due.' },
    { type: 'h2', text: 'Sezione', id: 'sezione' },
    { type: 'ul', items: [{ text: 'primo continua', children: ['figlio'] }, { text: 'secondo', children: [] }] },
    { type: 'p', text: 'Dopo.' },
  ]);
});

test('a capo Windows (CRLF): stessi blocchi, senza \\r nei titoli', async () => {
  const { parseGuide } = await load();
  const md = ['# Titolo', '', 'Testo.', '', '- voce', '  - figlio'].join('\n');
  assert.deepEqual(parseGuide(md.replace(/\n/g, '\r\n')), parseGuide(md));
});

test('un paragrafo seguito da un elenco senza riga vuota chiude il paragrafo', async () => {
  const { parseGuide } = await load();
  const blocks = parseGuide('Intro\n- a');
  assert.deepEqual(blocks.map(b => b.type), ['p', 'ul']);
});

test('la guida ha le sezioni attese, una per schermata, e il glossario', async () => {
  const { parseGuide } = await load();
  const blocks = parseGuide(fs.readFileSync(path.join(root, 'docs', 'guida.md'), 'utf8'));
  const headings = blocks.filter(b => b.type === 'h2' || b.type === 'h3').map(b => b.text);
  for (const h of ['Concetti', 'Schermate', 'Glossario', 'Giorno', 'Settimana', 'Andamento', 'Ricorrenza',
    'Aree', 'Registro', 'Rendiconto', 'Import Todoist', 'Impostazioni', 'Pagina iPhone']) {
    assert.ok(headings.includes(h), `manca la sezione "${h}"`);
  }
});

test('ogni "Guida → X" nei testi dell\'interfaccia punta a un titolo che esiste', async () => {
  const { parseGuide } = await load();
  const headings = new Set(parseGuide(fs.readFileSync(path.join(root, 'docs', 'guida.md'), 'utf8'))
    .filter(b => /^h[23]$/.test(b.type)).map(b => b.text));
  const files = [];
  const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '__tests__') walk(p); }
    else if (/\.jsx$/.test(e.name) && !/\.test\./.test(e.name)) files.push(p);
  });
  walk(path.join(root, 'src'));
  let found = 0;
  for (const f of files) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/Guida → ([^.\\\n)`'"]+)/g)) {
      found++;
      assert.ok(headings.has(m[1].trim()), `${path.basename(f)}: "Guida → ${m[1]}" non è un titolo della guida`);
    }
  }
  assert.ok(found >= 8, 'i rimandi alla guida sono spariti');
});
