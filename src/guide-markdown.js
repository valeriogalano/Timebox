// Parser a blocchi per docs/guida.md. Dipendenza zero: riconosce solo ciò che la guida usa
// (titoli # ## ###, paragrafi, elenchi puntati con un livello di annidamento); il testo
// dentro i blocchi resta Markdown inline, reso da MarkdownText.
// shortcut: niente tabelle, citazioni, elenchi numerati o blocchi di codice; se la guida
// ne ha bisogno, si aggiunge qui il tipo di blocco e il test.

export function slugify(text) {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function parseGuide(md) {
  const blocks = [];
  let para = [];
  let list = null;
  const flush = () => {
    if (para.length) blocks.push({ type: 'p', text: para.join(' ') });
    para = [];
    list = null;
  };
  for (const line of md.split(/\r?\n/)) {
    const h = /^(#{1,3}) (.+)$/.exec(line);
    const li = /^( *)- (.+)$/.exec(line);
    if (h) {
      flush();
      blocks.push({ type: `h${h[1].length}`, text: h[2], id: slugify(h[2]) });
    } else if (li) {
      if (para.length) flush();
      if (!list) { list = { type: 'ul', items: [] }; blocks.push(list); }
      if (li[1].length >= 2 && list.items.length) list.items[list.items.length - 1].children.push(li[2]);
      else list.items.push({ text: li[2], children: [] });
    } else if (!line.trim()) {
      flush();
    } else if (list && /^ +\S/.test(line)) {
      const last = list.items[list.items.length - 1];
      last.text += ' ' + line.trim();
    } else {
      para.push(line.trim());
    }
  }
  flush();
  return blocks;
}
