import fs from "node:fs";
import path from "node:path";

// Find <button>/<Button> elements with no onClick and not type=submit.
// Extract the FULL opening tag by tracking {} depth and ignoring `=>`.
const ROOTS = ["src/app", "src/components/admin"];
const files = [];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx$/.test(e.name)) files.push(p);
  }
}
ROOTS.forEach((r) => fs.existsSync(r) && walk(r));

function openingTag(src, start) {
  // start points at '<'. Walk until the '>' that closes the opening tag,
  // skipping anything inside {…} (JSX expressions) and `=>`.
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0 && src[i - 1] !== "=") return src.slice(start, i + 1);
  }
  return src.slice(start, start + 400);
}

const re = /<(button|Button)\b/g;
let total = 0;
const report = [];
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  let m;
  while ((m = re.exec(src))) {
    const tag = openingTag(src, m.index);
    total++;
    if (/onClick=/.test(tag) || /type=["']submit["']/.test(tag)) continue;
    const line = src.slice(0, m.index).split("\n").length;
    const after = src.slice(m.index + tag.length, m.index + tag.length + 70).replace(/\s+/g, " ").trim();
    report.push({ file: f.replace(/\\/g, "/"), line, hint: after.slice(0, 46) });
  }
}
report.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
console.log(`Scanned ${total} buttons. ${report.length} with NO onClick/submit:\n`);
let cur = "";
for (const r of report) {
  if (r.file !== cur) { console.log(`\n${r.file}`); cur = r.file; }
  console.log(`  :${r.line}  ${r.hint}`);
}
