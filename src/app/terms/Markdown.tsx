// A deliberately small Markdown renderer, scoped to the constructs the Guest
// Terms actually use: headings, paragraphs, bullet and numbered lists, tables,
// blockquotes, horizontal rules, and inline bold / italic / links / code.
//
// WHY NOT A LIBRARY: this renders exactly one repo-controlled file
// (TERMS_AND_CONDITIONS.md). The construct set is closed and verified — no
// images, no fenced code, no HTML — so a parser dependency would buy generality
// nobody needs. If the Terms ever grow a construct listed as unsupported below,
// add it here or reach for `marked`; do not point this at arbitrary input.
//
// NOT SAFE FOR UNTRUSTED INPUT: output is built as React elements (never
// dangerouslySetInnerHTML), so markup in the source is inert — but link hrefs
// are passed through unfiltered, which is fine for a file in the repo and not
// fine for user-supplied text.
//
// UNSUPPORTED, on purpose: fenced/indented code blocks, images, nested lists,
// reference links, footnotes, inline HTML, hard line breaks.

import type { ReactNode } from "react";

/**
 * GitHub's heading-anchor algorithm: lowercase, drop punctuation, spaces to
 * hyphens. The Terms link between their own sections ("→ §7.7"), so this must
 * keep matching the anchors written into the markdown by hand — e.g.
 * "7.7 Refund of the Down Payment" becomes "77-refund-of-the-down-payment".
 */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

// Inline spans. Alternation order matters: code wins over everything (its
// contents are literal), and bold is tried before italic so the `**` of a bold
// run is never mistaken for an italic delimiter.
const INLINE = /`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g;

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = new RegExp(INLINE.source, "g");
  let last = 0;
  let n = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}i${n++}`;
    if (m[1] !== undefined) out.push(<code key={k}>{m[1]}</code>);
    else if (m[2] !== undefined) out.push(<a key={k} href={m[3]}>{inline(m[2], k)}</a>);
    else if (m[4] !== undefined) out.push(<strong key={k}>{inline(m[4], k)}</strong>);
    else if (m[5] !== undefined) out.push(<em key={k}>{inline(m[5], k)}</em>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const isBlank = (l: string) => l.trim() === "";
const isRule = (l: string) => /^-{3,}\s*$/.test(l);
const isHeading = (l: string) => /^#{1,6}\s/.test(l);
const isTable = (l: string) => l.trimStart().startsWith("|");
const isQuote = (l: string) => l.trimStart().startsWith(">");
const isBullet = (l: string) => /^\s*-\s+/.test(l) && !isRule(l);
const isNumber = (l: string) => /^\s*\d+\.\s+/.test(l);
const startsBlock = (l: string) =>
  isBlank(l) || isRule(l) || isHeading(l) || isTable(l) || isQuote(l) || isBullet(l) || isNumber(l);

/** Split a table row into cells, dropping the empty edges from the outer pipes. */
function cells(row: string): string[] {
  const t = row.trim().replace(/^\|/, "").replace(/\|$/, "");
  return t.split("|").map((c) => c.trim());
}

/**
 * Collect a run of list items, joining each item's hard-wrapped continuation
 * lines. The markdown is wrapped at ~80 columns, so a single bullet routinely
 * spans three physical lines; without this they render as separate items.
 */
function takeItems(lines: string[], from: number, matches: (l: string) => boolean): [string[], number] {
  const items: string[] = [];
  let i = from;
  while (i < lines.length && (matches(lines[i]) || (items.length > 0 && !startsBlock(lines[i])))) {
    if (matches(lines[i])) {
      items.push(lines[i].replace(/^\s*(?:-|\d+\.)\s+/, "").trim());
    } else {
      items[items.length - 1] += ` ${lines[i].trim()}`;
    }
    i++;
  }
  return [items, i];
}

export default function Markdown({ source }: { source: string }) {
  const lines = source.split(/\r?\n/);
  const out: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const key = `b${i}`;

    if (isBlank(line)) { i++; continue; }

    if (isRule(line)) { out.push(<hr key={key} />); i++; continue; }

    if (isHeading(line)) {
      const m = /^(#{1,6})\s+(.*)$/.exec(line);
      if (m) {
        const level = m[1].length;
        // Anchor from the raw text so "§7.7" links keep resolving, but strip the
        // inline markers so a bolded heading does not slug its own asterisks.
        const plain = m[2].replace(/[*`]/g, "").trim();
        const Tag = `h${Math.min(level, 6)}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
        out.push(<Tag key={key} id={slug(plain)}>{inline(m[2], key)}</Tag>);
        i++;
        continue;
      }
    }

    if (isTable(line)) {
      const rows: string[] = [];
      while (i < lines.length && isTable(lines[i])) { rows.push(lines[i]); i++; }
      // Row 2 is the |---|---| separator; anything before it is the header.
      const sep = rows.findIndex((r) => /^\s*\|[\s:|-]+\|\s*$/.test(r));
      const head = sep > 0 ? rows.slice(0, sep).map(cells) : [];
      const body = (sep >= 0 ? rows.slice(sep + 1) : rows).map(cells);
      // The summary table at the top of the Terms is intentionally headerless
      // (`| | |`), so an all-empty header row is dropped rather than rendered as
      // a band of blank cells.
      const showHead = head.length > 0 && head[0].some((c) => c !== "");
      out.push(
        <div className="tc-tablewrap" key={key}>
          <table>
            {showHead && (
              <thead>
                {head.map((r, ri) => (
                  <tr key={`${key}h${ri}`}>{r.map((c, ci) => <th key={ci}>{inline(c, `${key}h${ri}c${ci}`)}</th>)}</tr>
                ))}
              </thead>
            )}
            <tbody>
              {body.map((r, ri) => (
                <tr key={`${key}r${ri}`}>{r.map((c, ci) => <td key={ci}>{inline(c, `${key}r${ri}c${ci}`)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (isQuote(line)) {
      const parts: string[] = [];
      while (i < lines.length && isQuote(lines[i])) {
        parts.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      // A blank quote line separates paragraphs inside the callout.
      const paras = parts.join("\n").split(/\n\s*\n/).map((p) => p.replace(/\n/g, " ").trim()).filter(Boolean);
      out.push(
        <blockquote key={key}>
          {paras.map((p, pi) => <p key={`${key}p${pi}`}>{inline(p, `${key}p${pi}`)}</p>)}
        </blockquote>,
      );
      continue;
    }

    if (isBullet(line)) {
      const [items, next] = takeItems(lines, i, isBullet);
      out.push(<ul key={key}>{items.map((t, ii) => <li key={`${key}l${ii}`}>{inline(t, `${key}l${ii}`)}</li>)}</ul>);
      i = next;
      continue;
    }

    if (isNumber(line)) {
      const [items, next] = takeItems(lines, i, isNumber);
      out.push(<ol key={key}>{items.map((t, ii) => <li key={`${key}l${ii}`}>{inline(t, `${key}l${ii}`)}</li>)}</ol>);
      i = next;
      continue;
    }

    // Paragraph: join the hard-wrapped lines until the next block starts.
    const para: string[] = [];
    while (i < lines.length && !startsBlock(lines[i])) { para.push(lines[i].trim()); i++; }
    out.push(<p key={key}>{inline(para.join(" "), key)}</p>);
  }

  return <>{out}</>;
}
