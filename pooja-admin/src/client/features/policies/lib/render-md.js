/**
 * Preview renderer for the dashboard.
 *
 * Escapes first, then marks up — the input is trusted (an operator typed it)
 * but escaping costs nothing and stops a stray `<script>` in the rules from
 * running inside the admin panel.
 *
 * This mirrors the subset the app supports. Keep the two in step: anything
 * added here must be added in the app's renderer, or the preview lies.
 */
export function renderMd(md = '') {
  const esc = String(md)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const inline = (s) =>
    s
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
      .replace(/_([^_]+)_/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');

  const out = [];
  let list = null;

  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };

  for (const raw of esc.split('\n')) {
    const line = raw.trimEnd();

    if (!line.trim()) { closeList(); continue; }

    // Lazy continuation: a wrapped line inside a list belongs to the item
    // above it, not to a new paragraph. Without this, every soft-wrapped
    // bullet split into a bullet plus an orphan paragraph.
    if (
      list &&
      !/^\s*([-*]|\d+\.)\s/.test(line) &&
      !/^(#{1,4}\s|&gt;|---|\*\*\*)/.test(line.trim())
    ) {
      const prev = out.pop();
      out.push(prev.replace(/<\/li>$/, ` ${inline(line.trim())}</li>`));
      continue;
    }
    if (/^(---|\*\*\*)$/.test(line.trim())) { closeList(); out.push('<hr>'); continue; }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { closeList(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }

    if (/^&gt;\s?/.test(line)) {
      closeList();
      out.push(`<blockquote>${inline(line.replace(/^&gt;\s?/, ''))}</blockquote>`);
      continue;
    }

    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ol) {
      if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; }
      out.push(`<li>${inline(ol[1])}</li>`);
      continue;
    }

    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ul) {
      if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
      out.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }

    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return out.join('\n');
}
