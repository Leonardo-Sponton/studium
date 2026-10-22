#!/usr/bin/env node
// Sample data, to see every screen filled in. Dates are relative to today, so the review card
// and today's classes always have something. Each file carries `sample: true` (the app keeps
// that line when it saves), and `remove` deletes every file that has it, in the trash too.
// Delete the line from a file to keep that file.
// .studium/sample-files.json records that samples were added and which files are theirs.
//
//   node tools/sample-data.mjs add <folder>       add to a data folder on this PC
//   node tools/sample-data.mjs remove <folder>
//   node tools/sample-data.mjs add --phone        add to the phone's data folder over adb
//   node tools/sample-data.mjs remove --phone
//
// Options for `add`: `--lang pt` writes the samples in Portuguese (default English); `--demo`
// also sets the app language (used for the README screenshots, in an empty folder).
// `add` again brings only areas that have no samples yet.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import LZString from "lz-string";

const ADB = process.env.ADB || path.join(os.homedir(), "Android/Sdk/platform-tools/adb");
// STUDIUM_PHONE_DIR: another folder on the phone (the screenshot demo uses its own).
const PHONE_DIR = process.env.STUDIUM_PHONE_DIR || "/storage/emulated/0/Documents/Studium";
const MANIFEST = ".studium/sample-files.json";

const pad = n => String(n).padStart(2, "0");
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoMinute = d => `${isoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const stamp = d =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
const slug = t =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
    .replace(/-$/, "");

const NOW = new Date();
const TODAY = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());
const day = n => isoDate(new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + n));
/** A moment `n` days from today at hh:mm, with `s` seconds (keeps file names apart). */
const at = (n, hh, mm, s = 0) => new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + n, hh, mm, s);

function nextWeekday(wd) {
  const d = (wd - TODAY.getDay() + 7) % 7 || 7;
  return day(d);
}

function nextMonthDay(md) {
  const d = new Date(TODAY.getFullYear(), TODAY.getMonth() + (TODAY.getDate() >= md ? 1 : 0), md);
  return isoDate(d);
}

const yamlValue = v =>
  typeof v === "string" && (/^\d{1,2}:\d{2}$/.test(v) || /[;=:#]/.test(v) && !/^\d{4}-\d{2}-\d{2}T/.test(v))
    ? JSON.stringify(v)
    : String(v);

/** A value written as is (a YAML flow list of quoted strings, for example). */
class Raw {
  constructor(text) {
    this.text = text;
  }
}
const flowList = items => new Raw(`[${items.map(x => JSON.stringify(x)).join(", ")}]`);

/** A one-page PDF with a title and lines of text (Helvetica, no images): a sample attachment. */
function tinyPdf(title, lines) {
  const esc = t => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\\()]/g, m => `\\${m}`);
  const text = [`BT /F1 18 Tf 60 770 Td (${esc(title)}) Tj ET`, ...lines.map((l, i) => `BT /F1 11 Tf 60 ${735 - i * 18} Td (${esc(l)}) Tj ET`)].join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const at = [];
  objs.forEach((o, i) => {
    at.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map(n => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/** Objects and lists of objects (checklist, assumptions) as indented YAML blocks. */
const yamlEntry = (k, v, ind = "") => {
  if (v instanceof Raw) return `${ind}${k}: ${v.text}`;
  if (Array.isArray(v)) {
    const items = v.map(o =>
      Object.entries(o)
        .map(([kk, vv], i) => `${ind}${i ? "  " : "- "}${kk}: ${yamlValue(vv)}`)
        .join("\n"),
    );
    return `${ind}${k}:\n${items.join("\n")}`;
  }
  if (v && typeof v === "object") {
    return `${ind}${k}:\n${Object.entries(v).map(([kk, vv]) => yamlEntry(kk, vv, `${ind}  `)).join("\n")}`;
  }
  return `${ind}${k}: ${yamlValue(v)}`;
};

/** A small drawing for the Markdown tour (a picture in attachments/). */
/** A small Excalidraw drawing in the Obsidian plugin's file format (data/drawings.ts). */
function sampleDrawing(labels) {
  let seed = 7;
  const base = (id, type, x, y, w, h, extra = {}) => ({
    id, type, x, y, width: w, height: h, angle: 0, strokeColor: "#1e1e1e", backgroundColor: "transparent",
    fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid", roughness: 1, opacity: 100, groupIds: [],
    frameId: null, roundness: type === "rectangle" ? { type: 3 } : null, seed: seed++, version: 1, versionNonce: seed++,
    isDeleted: false, boundElements: [], updated: 1, link: null, locked: false, ...extra,
  });
  const colors = ["#a5d8ff", "#ffec99", "#b2f2bb"];
  const els = [];
  labels.forEach((label, i) => {
    const x = 20 + i * 220;
    els.push(base(`box${i}0000000`, "rectangle", x, 40, 160, 80, { backgroundColor: colors[i] }));
    els.push(base(`txt${i}0000`, "text", x + 20, 66, 120, 25, {
      text: label, originalText: label, fontSize: 20, fontFamily: 5, textAlign: "center", verticalAlign: "middle",
      containerId: null, autoResize: true, lineHeight: 1.25,
    }));
    if (i < labels.length - 1)
      els.push(base(`arr${i}000000`, "arrow", x + 165, 80, 50, 0, {
        points: [[0, 0], [50, 0]], startBinding: null, endBinding: null, startArrowhead: null, endArrowhead: "arrow",
        lastCommittedPoint: null, elbowed: false,
      }));
  });
  const json = JSON.stringify({ type: "excalidraw", version: 2, source: "studium", elements: els, appState: { viewBackgroundColor: "#ffffff", gridSize: null }, files: {} }, null, "\t");
  const z = LZString.compressToBase64(json).replace(/(.{256})/g, "$1\n\n").replace(/\n+$/, "");
  const texts = labels.map((l, i) => `${l} ^txt${i}0000\n`).join("\n");
  return `---\n\nexcalidraw-plugin: parsed\ntags: [excalidraw]\n\n---\n==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠== You can decompress Drawing data with the command palette: 'Decompress current Excalidraw file'. For more info check in plugin settings under 'Saving'\n\n\n# Excalidraw Data\n\n## Text Elements\n${texts}\n%%\n## Drawing\n\`\`\`compressed-json\n${z}\n\`\`\`\n%%\n`;
}

const SKETCH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="400" height="240">
  <rect width="400" height="240" rx="16" fill="#1a1650"/>
  <circle cx="310" cy="70" r="34" fill="#e0c07a"/>
  <path d="M0 200 L90 110 L150 160 L230 80 L330 190 L400 150 L400 240 L0 240 Z" fill="#a67cff"/>
  <path d="M0 220 L120 170 L210 210 L300 175 L400 205 L400 240 L0 240 Z" fill="#7fd1d8" opacity="0.8"/>
</svg>
`;

function file(data, body) {
  const head = Object.entries(data)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => yamlEntry(k, v))
    .join("\n");
  return `---\n${head}\nsample: true\n---\n${body}`;
}

/**
 * The sample files, in English or Portuguese (`--lang pt`). Section headings use the words the
 * app writes in that language.
 */
function samples(lang = "en") {
  const T = (en, pt) => (lang === "pt" ? pt : en);
  const out = []; // [relative path, text]
  const binaries = []; // [relative path, Buffer]: files that cannot carry `sample: true`
  const fixed = new Set(); // files with a fixed name, added when missing even if their area has samples
  binaries.push([T("templates/Study note.md", "templates/Nota de estudo.md"), Buffer.from(T(
    "---\nsubject:\nsource:\nreview_date:\n---\n## {{title}}\n\n> [!summary] In my own words\n> \n\n## Questions\n\n- What::\n",
    "---\nmateria:\nfonte:\nrevisar_em:\n---\n## {{title}}\n\n> [!summary] Com as minhas palavras\n> \n\n## Perguntas\n\n- O quê::\n"))]);
  fixed.add(binaries.at(-1)[0]);

  // Drawings, PDF export and appearance (Obsidian rounds 2 and 3; fixed names too).
  const drawName = T("Sample drawing", "Exemplo de desenho");
  binaries.push([`drawings/${drawName}.excalidraw.md`, Buffer.from(sampleDrawing(T(["Idea", "Draft", "Done"], ["Ideia", "Rascunho", "Pronto"])))]);
  binaries.push([T(".studium/snippets/sample-wide-headings.css", ".studium/snippets/exemplo-titulos-espacados.css"), Buffer.from(T(
    "/* Sample CSS snippet: turn it on in Settings → Appearance → CSS snippets. */\n.cm-hm-h1,\n.cm-hm-h2 {\n  letter-spacing: 0.06em;\n}\n",
    "/* Snippet CSS de exemplo: ligue em Configurações → Aparência → Snippets CSS. */\n.cm-hm-h1,\n.cm-hm-h2 {\n  letter-spacing: 0.06em;\n}\n"))]);
  for (const [rel] of binaries.slice(-2)) fixed.add(rel);
  const drawNote = T("study/sample-git/notes/sample-drawings-and-pdf.md", "study/sample-git/notes/exemplo-desenhos-e-pdf.md");
  fixed.add(drawNote);
  out.push([drawNote, file({ type: "study-note", created: isoMinute(at(0, 7, 35)), modified: isoMinute(at(0, 7, 35)) }, T(
    `# Drawings, PDF and appearance\n\n## Drawings (Excalidraw)\n\nA drawing shown in a note; tap it to draw. New ones: type /drawing in a note. They are the same files as Obsidian's Excalidraw plugin (drawings/*.excalidraw.md).\n\n![[${drawName}.excalidraw]]\n\n## PDF\n\nThe ⋯ menu of a note → Export to PDF: page size, margins, orientation, size, justified text. Pictures, drawings, formulas and diagrams go too.\n\n## Appearance\n\nSettings → Appearance: light/dark, color schemes (Catppuccin, Nord, Gruvbox, Atom One…), accent color, fonts, text size, interface size (Ctrl + = / Ctrl + −), line width. "Customize" changes single colors and headings; CSS snippets add your own rules.\n`,
    `# Desenhos, PDF e aparência\n\n## Desenhos (Excalidraw)\n\nUm desenho mostrado numa nota; toque nele para desenhar. Novos: digite /desenho numa nota. São os mesmos arquivos do plugin Excalidraw do Obsidian (drawings/*.excalidraw.md).\n\n![[${drawName}.excalidraw]]\n\n## PDF\n\nMenu ⋯ de uma nota → Exportar para PDF: tamanho da página, margens, orientação, tamanho, texto justificado. Imagens, desenhos, fórmulas e diagramas vão junto.\n\n## Aparência\n\nConfigurações → Aparência: claro/escuro, esquemas de cores (Catppuccin, Nord, Gruvbox, Atom One…), cor de destaque, fontes, tamanho do texto, tamanho da interface (Ctrl + = / Ctrl + −), largura da linha. "Personalizar" muda cores uma a uma e os títulos; snippets CSS acrescentam suas próprias regras.\n`))]);


  // ---- Study ----
  // Personal: a tree (Programming → Java → JDBC, Databases → SQL basics, Tools → Git) with
  // [[links]] between notes. School: a simulated ADS course, 5 semesters, the 3rd being taken.
  const studyFile = (rel, created, modified, data, body) =>
    out.push([`study/${rel}`, file({ ...data, created: isoMinute(created), modified: isoMinute(modified) }, body)]);
  studyFile("sql-basics/subject.md", at(-21, 20, 0), at(-1, 21, 0),
    { type: "subject", title: T("SQL basics", "Fundamentos de SQL"), group: T("Databases", "Banco de dados") },
    T("A database keeps data in tables: rows are records, columns are fields. SELECT reads, WHERE filters the rows, JOIN puts two tables side by side using a column they share. I still mix up LEFT JOIN and INNER JOIN: study that again.\n",
      "Um banco guarda dados em tabelas: linhas são registros, colunas são campos. SELECT lê, WHERE filtra as linhas, JOIN coloca duas tabelas lado a lado usando uma coluna em comum. Ainda confundo LEFT JOIN com INNER JOIN: estudar de novo.\n"));
  studyFile("sql-basics/materials/sql-handout.md", at(-21, 20, 5), at(-1, 21, 0),
    { type: "material", title: T("SQL handout", "Apostila de SQL"), kind: "handout", source: T("Written with an AI assistant", "Escrita com um assistente de IA"), done: "[1, 2]", at: 3 },
    T("# SQL handout\n\nHow to use it: read one chapter a day and try every query.\n\n## 1. Tables, rows and columns\n\nA **table** holds one kind of thing: `customers`, `orders`. Each **row** is one record; each **column** is one field with a type.\n\n```sql\nCREATE TABLE customers (\n  id   INTEGER PRIMARY KEY,\n  name TEXT NOT NULL,\n  city TEXT\n);\n```\n\n## 2. SELECT and WHERE\n\n```sql\nSELECT name, city FROM customers WHERE city = 'Recife';\n```\n\n> **Watch out:** text values go in single quotes.\n\n## 3. JOIN\n\nA JOIN matches rows of two tables by a shared column.\n\n```sql\nSELECT c.name, o.total\nFROM customers c\nJOIN orders o ON o.customer_id = c.id;\n```\n\n- **INNER JOIN** keeps only rows with a match on both sides.\n- **LEFT JOIN** keeps every row of the left table; missing matches come as NULL.\n\n## 4. GROUP BY\n\n```sql\nSELECT city, COUNT(*) FROM customers GROUP BY city;\n```\n\nEvery column in SELECT must be in GROUP BY or inside a function like COUNT or SUM.\n\n## Exercises\n\n1. List the customers with no orders (hint: LEFT JOIN and IS NULL).\n2. Count the orders per city.\n",
      "# Apostila de SQL\n\nComo usar: leia um capítulo por dia e teste cada consulta.\n\n## 1. Tabelas, linhas e colunas\n\nUma **tabela** guarda um tipo de coisa: `clientes`, `pedidos`. Cada **linha** é um registro; cada **coluna** é um campo com um tipo.\n\n```sql\nCREATE TABLE clientes (\n  id     INTEGER PRIMARY KEY,\n  nome   TEXT NOT NULL,\n  cidade TEXT\n);\n```\n\n## 2. SELECT e WHERE\n\n```sql\nSELECT nome, cidade FROM clientes WHERE cidade = 'Recife';\n```\n\n> **Atenção:** texto vai entre aspas simples.\n\n## 3. JOIN\n\nUm JOIN junta linhas de duas tabelas por uma coluna em comum.\n\n```sql\nSELECT c.nome, p.total\nFROM clientes c\nJOIN pedidos p ON p.cliente_id = c.id;\n```\n\n- **INNER JOIN** fica só com as linhas que têm par dos dois lados.\n- **LEFT JOIN** mantém todas as linhas da tabela da esquerda; o que não tem par vem como NULL.\n\n## 4. GROUP BY\n\n```sql\nSELECT cidade, COUNT(*) FROM clientes GROUP BY cidade;\n```\n\nToda coluna do SELECT precisa estar no GROUP BY ou dentro de uma função como COUNT ou SUM.\n\n## Exercícios\n\n1. Liste os clientes sem pedidos (dica: LEFT JOIN e IS NULL).\n2. Conte os pedidos por cidade.\n"));
  studyFile(`sql-basics/notes/${stamp(at(-6, 21, 10))}.md`, at(-6, 21, 10), at(-6, 21, 40),
    { type: "study-note", material: "sql-handout", chapter: 2 },
    T("# SELECT and WHERE\n\nWHERE runs before the columns are picked, so it cannot use a name given with AS.\n\nWhich clause filters rows? :: WHERE\nHow are text values written in SQL? :: Between single quotes: 'Recife'\n",
      "# SELECT e WHERE\n\nO WHERE roda antes de as colunas serem escolhidas, por isso não enxerga um nome dado com AS.\n\nQual cláusula filtra as linhas? :: WHERE\nComo se escreve um texto em SQL? :: Entre aspas simples: 'Recife'\n"));
  studyFile(`sql-basics/notes/${stamp(at(-1, 21, 5))}.md`, at(-1, 21, 5), at(-1, 21, 30),
    { type: "study-note", material: "sql-handout", chapter: 3 },
    T("# JOIN\n\nSee also [[SELECT and WHERE]]. In Java the same query runs through [[JDBC queries]].\n\nINNER JOIN ::: only rows with a match on both sides\n\nWhat does a LEFT JOIN return for a customer with no orders?\n?\nThe customer's row, with NULL in the order columns\n",
      "# JOIN\n\nVeja também [[SELECT e WHERE]]. Em Java a mesma consulta roda pelo [[Consultas com JDBC]].\n\nINNER JOIN ::: só as linhas com par dos dois lados\n\nO que um LEFT JOIN devolve para um cliente sem pedidos?\n?\nA linha do cliente, com NULL nas colunas do pedido\n"));
  const links = (dir, created, list) =>
    studyFile(`${dir}/links.md`, created, created, { type: "links" }, list.map(([title, url, note, kind]) => `- [${title}](${url})${kind ? ` #${kind}` : ""}${note ? ` — ${note}` : ""}`).join("\n") + "\n");
  links("sql-basics", at(-20, 20, 0), [
    [T("SQLite tutorial", "Tutorial de SQLite"), "https://www.sqlitetutorial.net/", T("short pages, one topic each", "páginas curtas, um assunto cada"), "tutorial"],
    ["SQL Fiddle", "https://sqlfiddle.com/", T("try queries in the browser", "testar consultas no navegador"), "other"],
    [T("PostgreSQL docs: SELECT", "Documentação do PostgreSQL: SELECT"), "https://www.postgresql.org/docs/current/sql-select.html", "", "docs"],
    [T("SQL JOIN videos", "Vídeos sobre SQL JOIN"), "https://www.youtube.com/results?search_query=sql+join", T("a YouTube search", "uma busca no YouTube"), "video"],
    [T("Database normalization", "Normalização de banco de dados"), "https://en.wikipedia.org/wiki/Database_normalization", "", "article"],
  ]);
  studyFile("sample-git/subject.md", at(-30, 19, 0), at(-30, 19, 0),
    { type: "subject", title: "Git", group: T("Tools", "Ferramentas") }, "");
  studyFile("sample-java/subject.md", at(-40, 20, 0), at(-3, 21, 0),
    { type: "subject", title: "Java", group: T("Programming", "Programação") },
    T("Java compiles to bytecode that runs on the JVM. Classes describe objects; interfaces describe what an object can do.\n",
      "Java compila para bytecode, que roda na JVM. Classes descrevem objetos; interfaces descrevem o que um objeto sabe fazer.\n"));
  studyFile("sample-jdbc/subject.md", at(-10, 20, 0), at(-3, 21, 20),
    { type: "subject", title: "JDBC", parent: "sample-java" }, "");
  studyFile(`sample-jdbc/notes/${stamp(at(-3, 21, 0))}.md`, at(-3, 21, 0), at(-3, 21, 20),
    { type: "study-note" },
    T("# JDBC queries\n\nOpen a `Connection`, prepare the SQL, run it, read the `ResultSet`. The SQL itself is in [[JOIN]] and [[SELECT and WHERE]].\n\n```java\ntry (var ps = conn.prepareStatement(\"SELECT name FROM customers WHERE city = ?\")) {\n  ps.setString(1, \"Recife\");\n  var rs = ps.executeQuery();\n}\n```\n\nWhy use PreparedStatement instead of joining strings? :: It stops SQL injection and lets the database reuse the plan\nWhat does try-with-resources do with the statement? :: Closes it at the end, even after an error\n",
      "# Consultas com JDBC\n\nAbra uma `Connection`, prepare o SQL, execute, leia o `ResultSet`. O SQL em si está em [[JOIN]] e [[SELECT e WHERE]].\n\n```java\ntry (var ps = conn.prepareStatement(\"SELECT nome FROM clientes WHERE cidade = ?\")) {\n  ps.setString(1, \"Recife\");\n  var rs = ps.executeQuery();\n}\n```\n\nPor que usar PreparedStatement em vez de juntar strings? :: Evita SQL injection e deixa o banco reaproveitar o plano\nO que o try-with-resources faz com o statement? :: Fecha no final, mesmo depois de um erro\n"));
  links("sample-jdbc", at(-9, 20, 0), [
    [T("JDBC basics (Oracle)", "JDBC básico (Oracle)"), "https://docs.oracle.com/javase/tutorial/jdbc/basics/", T("the official tutorial", "o tutorial oficial"), "tutorial"],
    [T("PreparedStatement API", "API do PreparedStatement"), "https://docs.oracle.com/en/java/javase/21/docs/api/java.sql/java/sql/PreparedStatement.html", "", "docs"],
  ]);
  studyFile("sample-jdbc/notes/flashcards.md", at(-3, 21, 25), at(-3, 21, 25),
    { type: "study-note", kind: "cards" },
    T("# Flashcards\n\nWhich interface runs SQL with parameters? :: PreparedStatement\n\nDriverManager ::: gives a Connection from a JDBC URL\n",
      "# Flashcards\n\nQual interface executa SQL com parâmetros? :: PreparedStatement\n\nDriverManager ::: entrega uma Connection a partir de uma URL JDBC\n"));

  // PDFs, a standalone note and workbench projects (fixed names: added even when Study already
  // has samples).
  const fixedStudy = (rel, ...rest) => (studyFile(rel, ...rest), fixed.add(`study/${rel}`));
  const sqlPdf = T("SQL cheat sheet.pdf", "Guia rápido de SQL.pdf");
  binaries.push([`study/sql-basics/pdfs/${sqlPdf}`, tinyPdf(T("SQL cheat sheet", "Guia rapido de SQL"), T(
    ["SELECT columns FROM table WHERE condition", "INNER JOIN: rows with a match on both sides", "LEFT JOIN: every row of the left table", "GROUP BY + COUNT, SUM, AVG"],
    ["SELECT colunas FROM tabela WHERE condicao", "INNER JOIN: linhas com par dos dois lados", "LEFT JOIN: todas as linhas da tabela da esquerda", "GROUP BY + COUNT, SUM, AVG"]))]);
  fixed.add(binaries.at(-1)[0]);
  fixedStudy("sql-basics/notes/sample-pdf-note.md", at(-2, 20, 0), at(-2, 20, 15),
    { type: "study-note", pdf: sqlPdf },
    T("# SQL cheat sheet\n\nThe order SQL runs a query: FROM → WHERE → GROUP BY → SELECT → ORDER BY.\n\nIn what order does SQL run FROM, WHERE and SELECT? :: FROM, then WHERE, then SELECT\n",
      "# Guia rápido de SQL\n\nA ordem em que o SQL roda uma consulta: FROM → WHERE → GROUP BY → SELECT → ORDER BY.\n\nEm que ordem o SQL roda FROM, WHERE e SELECT? :: FROM, depois WHERE, depois SELECT\n"));
  fixedStudy("sql-basics/notes/sample-free-note.md", at(-4, 21, 0), at(-4, 21, 10),
    { type: "study-note" },
    T("# Questions to ask\n\n- When is an index worth it?\n- What is the difference between DELETE and TRUNCATE?\n",
      "# Dúvidas para tirar\n\n- Quando vale a pena criar um índice?\n- Qual a diferença entre DELETE e TRUNCATE?\n"));
  // Exercises: a list written in the app, a PDF and exercise sites.
  fixedStudy(`sql-basics/exercises/${T("list-1-select-and-join", "lista-1-select-e-join")}.md`, at(-3, 20, 0), at(-3, 20, 30),
    { type: "exercise" },
    T("# List 1 — SELECT and JOIN\n\n1. List the name and city of every customer from Recife.\n   - [x] Done\n2. Show each order with the customer's name.\n   - [ ] Done\n3. Which customers have no orders? (LEFT JOIN + IS NULL)\n   - [ ] Done\n\n## My answers\n\n```sql\nSELECT name, city FROM customers WHERE city = 'Recife';\n```\n",
      "# Lista 1 — SELECT e JOIN\n\n1. Liste nome e cidade de todos os clientes de Recife.\n   - [x] Feito\n2. Mostre cada pedido com o nome do cliente.\n   - [ ] Feito\n3. Quais clientes não têm pedidos? (LEFT JOIN + IS NULL)\n   - [ ] Feito\n\n## Minhas respostas\n\n```sql\nSELECT nome, cidade FROM clientes WHERE cidade = 'Recife';\n```\n"));
  binaries.push([`study/sql-basics/exercises/${T("Practice test.pdf", "Simulado.pdf")}`, tinyPdf(T("SQL practice test", "Simulado de SQL"), T(
    ["1. Count the customers per city.", "2. List the movies never rented.", "3. Total paid by each customer in 2026."],
    ["1. Conte os clientes por cidade.", "2. Liste os filmes nunca alugados.", "3. Total pago por cliente em 2026."]))]);
  fixed.add(binaries.at(-1)[0]);
  fixedStudy("sql-basics/exercises/links.md", at(-3, 20, 40), at(-3, 20, 40), { type: "links" },
    `- [SQLZoo](https://sqlzoo.net/) #tutorial — ${T("interactive exercises, step by step", "exercícios interativos, passo a passo")}\n- [HackerRank SQL](https://www.hackerrank.com/domains/sql) #other — ${T("problems by level", "problemas por nível")}\n`);

  const wb = T("video-rental-database", "banco-da-locadora");
  fixedStudy(`sql-basics/workbench/${wb}/project.md`, at(-9, 20, 0), at(-1, 22, 0),
    { type: "workbench", title: T("Video rental database", "Banco de dados de uma locadora"),
      description: T("Model and build the database of a small video rental shop: customers, movies, copies and rentals. The point is to practise JOIN, GROUP BY and normal forms on something real, from the ER model to the queries the shop needs.",
        "Modelar e criar o banco de uma pequena locadora: clientes, filmes, cópias e locações. A ideia é praticar JOIN, GROUP BY e formas normais em algo real, do modelo ER até as consultas que a locadora precisa."),
      status: "active", started: day(-9), drawio: "https://app.diagrams.net/", github: "https://github.com/" },
    T("## Goal\n\nUse JOIN and GROUP BY without looking at the handout.\n\n## Requirements\n\n- [x] Customers, movies, copies, rentals\n- [ ] Late fee per day\n- [ ] Report: most rented movies of the month\n\n## Steps\n\n- [x] ER model on draw.io\n- [x] CREATE TABLE script\n- [ ] Sample data\n- [ ] The report queries\n\n## Decisions\n\nA movie has many copies; a rental points to a copy, not to the movie.\n\n## Problems and solutions\n\nLEFT JOIN with a WHERE on the right table dropped the customers with no rentals: the condition had to go in the ON.\n\n## What I learned\n\n",
      "## Objetivo\n\nUsar JOIN e GROUP BY sem olhar a apostila.\n\n## Requisitos\n\n- [x] Clientes, filmes, cópias, locações\n- [ ] Multa por dia de atraso\n- [ ] Relatório: filmes mais alugados do mês\n\n## Passos\n\n- [x] Modelo ER no draw.io\n- [x] Script CREATE TABLE\n- [ ] Dados de exemplo\n- [ ] As consultas do relatório\n\n## Decisões\n\nUm filme tem várias cópias; a locação aponta para a cópia, não para o filme.\n\n## Problemas e soluções\n\nLEFT JOIN com WHERE na tabela da direita sumia com os clientes sem locação: a condição tinha que ir no ON.\n\n## O que aprendi\n\n"));
  fixedStudy(`sql-basics/workbench/${wb}/links.md`, at(-9, 20, 5), at(-9, 20, 5), { type: "links" },
    `- [${T("Normal forms, explained", "Formas normais, explicadas")}](https://en.wikipedia.org/wiki/Database_normalization) — ${T("1NF to 3NF", "1FN a 3FN")}\n`);
  binaries.push([`study/sql-basics/workbench/${wb}/files/${T("create-tables.sql", "criar-tabelas.sql")}`, Buffer.from(T(
    "CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL);\nCREATE TABLE movies (id INTEGER PRIMARY KEY, title TEXT NOT NULL);\nCREATE TABLE copies (id INTEGER PRIMARY KEY, movie_id INTEGER REFERENCES movies(id));\nCREATE TABLE rentals (id INTEGER PRIMARY KEY, copy_id INTEGER REFERENCES copies(id), customer_id INTEGER REFERENCES customers(id), rented DATE, returned DATE);\n",
    "CREATE TABLE clientes (id INTEGER PRIMARY KEY, nome TEXT NOT NULL);\nCREATE TABLE filmes (id INTEGER PRIMARY KEY, titulo TEXT NOT NULL);\nCREATE TABLE copias (id INTEGER PRIMARY KEY, filme_id INTEGER REFERENCES filmes(id));\nCREATE TABLE locacoes (id INTEGER PRIMARY KEY, copia_id INTEGER REFERENCES copias(id), cliente_id INTEGER REFERENCES clientes(id), retirada DATE, devolucao DATE);\n"))]);
  fixed.add(binaries.at(-1)[0]);
  fixedStudy(`sql-basics/workbench/${T("library-queries", "consultas-da-biblioteca")}/project.md`, at(-2, 21, 0), at(-2, 21, 0),
    { type: "workbench", title: T("Library queries", "Consultas da biblioteca"),
      description: T("Ten report queries for a library database, each one harder than the last.", "Dez consultas de relatório para o banco de uma biblioteca, cada uma mais difícil que a anterior."),
      status: "planning", started: day(-2) }, "");

  // School: a course, 5 semesters, the 3rd now. One retake class falls on today's weekday, so
  // "Classes today" shows something whatever day the samples are added.
  const WD = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const todayWd = WD[TODAY.getDay()];
  studyFile("_courses/ads.md", at(-400, 10, 0), at(-60, 10, 0),
    { type: "course", title: T("Systems Analysis and Development", "Análise e Desenvolvimento de Sistemas"), institution: T("Sample College", "Faculdade Exemplo"), semesters: 5, current: 3, pass: 6, attendance: 75 }, "");
  const subject = (slugName, data, body = "") =>
    studyFile(`${slugName}/subject.md`, at(-60, 10, 0), at(-2, 21, 0), { type: "subject", course: "ads", ...data }, body);
  const exam = (dir, n, title, date, extra, body = "") =>
    studyFile(`${dir}/exams/${stamp(at(-50, 10, n))}.md`, at(-50, 10, n), at(-2, 10, n), { type: "exam", title, date, ...extra }, body);
  const assignment = (dir, name, data, body = "") =>
    studyFile(`${dir}/assignments/${name}/assignment.md`, at(-30, 10, 0), at(-2, 10, 0), { type: "assignment", ...data }, body);

  // Semester 1 and 2: finished.
  subject("algoritmos", { title: T("Algorithms and Logic", "Algoritmos e Lógica de Programação"), semester: 1, result: "passed", teacher: "Prof. Helena Costa", hours_week: 4, absences: 2 });
  exam("algoritmos", 1, "P1", day(-330), { grade: 8.5 });
  exam("algoritmos", 2, "P2", day(-290), { grade: 9 });
  subject("matematica-discreta", { title: T("Discrete Mathematics", "Matemática Discreta"), semester: 1, result: "failed", teacher: "Prof. Paulo Nunes", hours_week: 4, absences: 6 });
  exam("matematica-discreta", 1, "P1", day(-330), { grade: 4 });
  exam("matematica-discreta", 2, "P2", day(-290), { grade: 5 });
  subject("estrutura-de-dados-ads", { title: T("Data Structures", "Estrutura de Dados"), semester: 2, result: "passed", teacher: "Prof. Marina Alves", hours_week: 4 });
  exam("estrutura-de-dados-ads", 1, "P1", day(-150), { grade: 7 });
  exam("estrutura-de-dados-ads", 2, "P2", day(-110), { grade: 8 });

  // Semester 3: being taken.
  const poo = "programacao-orientada-a-objetos";
  subject(poo, {
    title: T("Object-Oriented Programming", "Programação Orientada a Objetos"), semester: 3, result: "taking",
    teacher: "Prof. Marina Alves", room: T("Lab 3", "Lab 3"), hours_week: 4, hours_total: 80, absences: 4,
    schedule: flowList(["mon 19:00-20:40", "wed 19:00-20:40"]),
  }, T("## Syllabus\n\nClasses and objects, encapsulation, inheritance, polymorphism, interfaces, exceptions, collections.\n\n## Grades\n\nP1 and P2 (weight 2 each) + the group project (weight 1).\n",
    "## Ementa\n\nClasses e objetos, encapsulamento, herança, polimorfismo, interfaces, exceções, coleções.\n\n## Avaliação\n\nP1 e P2 (peso 2 cada) + projeto em grupo (peso 1).\n"));
  studyFile(`${poo}/notes/${stamp(at(-12, 20, 40))}.md`, at(-12, 20, 40), at(-12, 20, 55),
    { type: "study-note", kind: "class", date: day(-12) },
    T("# Encapsulation\n\nFields private, access through methods. The class decides what is valid.\n\nWhy make fields private? :: So only the class can change them and keep them valid\n",
      "# Encapsulamento\n\nAtributos privados, acesso por métodos. A classe decide o que é válido.\n\nPor que deixar os atributos privados? :: Para só a própria classe mudá-los e mantê-los válidos\n"));
  studyFile(`${poo}/notes/${stamp(at(-5, 20, 40))}.md`, at(-5, 20, 40), at(-5, 20, 58),
    { type: "study-note", kind: "class", date: day(-5) },
    T("# Polymorphism\n\nThe same call, different behaviour: `animal.sound()` runs the method of the real class.\n\nWhat decides which overridden method runs? :: The real class of the object, at run time\nOverloading ::: same name, different parameters (chosen when compiling)\n",
      "# Polimorfismo\n\nA mesma chamada, comportamentos diferentes: `animal.som()` roda o método da classe real.\n\nO que decide qual método sobrescrito roda? :: A classe real do objeto, em tempo de execução\nSobrecarga ::: mesmo nome, parâmetros diferentes (escolhida na compilação)\n"));
  studyFile(`${poo}/materials/apostila-poo.md`, at(-40, 20, 0), at(-5, 21, 0),
    { type: "material", title: T("OOP handout", "Apostila de POO"), kind: "handout", source: T("The teacher", "A professora"), done: "[1]", at: 2 },
    T("# OOP handout\n\n## 1. Classes and objects\n\nA class is a model; an object is one thing made from it with `new`.\n\n## 2. Encapsulation\n\nKeep fields `private` and expose methods that keep the object valid.\n\n## 3. Inheritance and polymorphism\n\n`extends` reuses a class; an overridden method runs according to the real object.\n",
      "# Apostila de POO\n\n## 1. Classes e objetos\n\nUma classe é um modelo; um objeto é uma coisa feita a partir dele com `new`.\n\n## 2. Encapsulamento\n\nMantenha os atributos `private` e exponha métodos que mantêm o objeto válido.\n\n## 3. Herança e polimorfismo\n\n`extends` reaproveita uma classe; um método sobrescrito roda de acordo com o objeto real.\n"));
  links(poo, at(-40, 20, 5), [
    [T("Dev.java: learn Java", "Dev.java: aprenda Java"), "https://dev.java/learn/", T("the teacher's suggestion", "sugestão da professora")],
    [T("Class video: inheritance", "Vídeo da aula: herança"), "https://www.youtube.com/results?search_query=heran%C3%A7a+java", ""],
  ]);
  exam(poo, 3, "P1", day(-14), { time: "19:00", room: "Lab 3", grade: 7.5, weight: 2 });
  exam(poo, 4, "P2", day(20), { time: "19:00", room: "Lab 3", weight: 2 },
    T("- Inheritance and polymorphism\n- Interfaces vs abstract classes\n- Exceptions (checked x unchecked)\n", "- Herança e polimorfismo\n- Interfaces x classes abstratas\n- Exceções (checked x unchecked)\n"));
  const lib = T("library-system", "sistema-de-biblioteca");
  assignment(poo, lib, { title: T("Library system in Java", "Sistema de biblioteca em Java"), due: day(9), status: "doing", group: true, members: "Ana, Bruno, Carla" },
    T("Classes Book, Member and Loan; a loan lasts 14 days. Delivery: the code on GitHub + a short report.\n\n- [x] Class diagram\n- [ ] Loan rules\n- [ ] Report\n",
      "Classes Livro, Membro e Emprestimo; um empréstimo dura 14 dias. Entrega: o código no GitHub + um relatório curto.\n\n- [x] Diagrama de classes\n- [ ] Regras de empréstimo\n- [ ] Relatório\n"));
  binaries.push([`study/${poo}/assignments/${lib}/${T("brief.pdf", "enunciado.pdf")}`,
    tinyPdf(T("Assignment: library system", "Trabalho: sistema de biblioteca"), T(
      ["Groups of up to 3.", "Classes: Book, Member, Loan.", "A loan lasts 14 days; a late return blocks new loans.", `Due: ${day(9)}`],
      ["Grupos de ate 3 pessoas.", "Classes: Livro, Membro, Emprestimo.", "Um emprestimo dura 14 dias; atraso bloqueia novos emprestimos.", `Entrega: ${day(9)}`]))]);
  binaries.push([`study/${poo}/assignments/${lib}/${T("meeting-notes.txt", "reuniao-do-grupo.txt")}`,
    Buffer.from(T("Ana: Book and Member classes\nBruno: Loan rules\nCarla: report\n", "Ana: classes Livro e Membro\nBruno: regras de empréstimo\nCarla: relatório\n"))]);

  const bd = "banco-de-dados-ads";
  subject(bd, {
    title: T("Databases", "Banco de Dados"), semester: 3, result: "taking",
    teacher: "Prof. Ricardo Lima", room: T("Room 12", "Sala 12"), hours_week: 4, absences: 0,
    schedule: flowList(["tue 19:00-22:30"]),
  });
  assignment(bd, T("clinic-er-model", "modelo-er-da-clinica"), { title: T("ER model of a clinic", "Modelo ER de uma clínica"), due: day(-8), status: "graded", grade: 9 }, "");
  exam(bd, 5, "P1", day(6), { time: "19:00", room: T("Room 12", "Sala 12"), weight: 2 },
    T("Normal forms (1NF to 3NF), JOINs, GROUP BY. Study from [[JOIN]].\n", "Formas normais (1FN a 3FN), JOINs, GROUP BY. Estudar por [[JOIN]].\n"));
  subject("engenharia-de-software-ii", {
    title: T("Software Engineering II", "Engenharia de Software II"), semester: 3, result: "taking",
    teacher: "Prof. Sofia Rocha", room: T("Room 7", "Sala 7"), hours_week: 2, absences: 1,
    schedule: flowList(["thu 21:00-22:40"]),
  });
  subject("matematica-discreta-dp", {
    title: T("Discrete Mathematics (retake)", "Matemática Discreta (DP)"), semester: 3, result: "taking",
    teacher: "Prof. Paulo Nunes", room: T("Room 4", "Sala 4"), hours_week: 2, absences: 0,
    schedule: flowList([`${todayWd} 19:00-20:40`]),
  });

  // ---- Trash ----
  const old = at(-12, 9, 0);
  const trashed = `.trash/study/sql-basics/notes/${stamp(old)}.md`;
  out.push([trashed, file({ type: "study-note", created: isoMinute(old), modified: isoMinute(old) },
    T("# Old draft about indexes\n\nAn index makes WHERE faster and INSERT slower.\n", "# Rascunho antigo sobre índices\n\nUm índice deixa o WHERE mais rápido e o INSERT mais lento.\n"))]);
  return { files: out, binaries, fixed, trashIndex: { [trashed]: { from: trashed.slice(7), at: isoMinute(at(-1, 19, 0)) } } };
}

// ---- Folder access: this PC, or the phone over adb ----

function local(dir) {
  const abs = rel => path.join(dir, rel);
  return {
    read: rel => (fs.existsSync(abs(rel)) ? fs.readFileSync(abs(rel), "utf8") : null),
    write: (rel, text) => {
      fs.mkdirSync(path.dirname(abs(rel)), { recursive: true });
      fs.writeFileSync(abs(rel), text);
    },
    remove: rel => fs.rmSync(abs(rel), { force: true }),
    /** Removes a folder only if it is empty (a sample study folder after its files went). */
    removeDirIfEmpty: rel => {
      try {
        fs.rmdirSync(abs(rel));
      } catch {
        /* not empty or not there: keep it */
      }
    },
    /** Every .md file under the folder with a `sample: true` line. */
    findSamples: () => {
      const found = [];
      const walk = rel => {
        for (const e of fs.readdirSync(abs(rel), { withFileTypes: true })) {
          const r = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory()) walk(r);
          else if (e.name.endsWith(".md") && /^sample: true$/m.test(fs.readFileSync(abs(r), "utf8"))) found.push(r);
        }
      };
      walk("");
      return found;
    },
  };
}

function phone() {
  const adb = (...args) => execFileSync(ADB, args, { encoding: "utf8" });
  const q = rel => `'${PHONE_DIR}/${rel.replace(/'/g, "")}'`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "studium-sample-"));
  return {
    read: rel => {
      try {
        return adb("shell", `cat ${q(rel)} 2>/dev/null || true`) || null;
      } catch {
        return null;
      }
    },
    write: (rel, text) => {
      const f = path.join(tmp, "f");
      fs.writeFileSync(f, text);
      adb("shell", `mkdir -p ${q(path.dirname(rel))}`);
      adb("push", f, `${PHONE_DIR}/${rel}`);
    },
    remove: rel => adb("shell", `rm -f ${q(rel)}`),
    removeDirIfEmpty: rel => adb("shell", `rmdir ${q(rel)} 2>/dev/null || true`),
    findSamples: () =>
      adb("shell", `cd '${PHONE_DIR}' && grep -rlx --include='*.md' 'sample: true' . || true`)
        .split("\n")
        .map(l => l.trim().replace(/^\.\//, ""))
        .filter(Boolean),
  };
}

function readJson(io, rel, fallback) {
  try {
    const t = io.read(rel);
    return t ? JSON.parse(t) : fallback;
  } catch {
    return fallback;
  }
}

const areaOf = rel => rel.split("/")[0];

/**
 * Adds the samples of every area that has none yet, so running `add` again after a new stage
 * only brings that stage's samples (older manifests have no `areas`: taken from their files).
 */
async function add(io, { lang, demo }) {
  const m = readJson(io, MANIFEST, null);
  const had = new Set(m ? (m.areas ?? m.files.map(areaOf)) : []);
  const { files: all, binaries, fixed, trashIndex } = samples(lang);
  const known = new Set([...(m?.files ?? []), ...(m?.binaries ?? [])]);
  const isNew = rel => !had.has(areaOf(rel)) || (fixed.has(rel) && !known.has(rel) && io.read(rel) === null);
  const files = all.filter(([rel]) => isNew(rel));
  if (!files.length && !binaries.some(([rel]) => isNew(rel) && io.read(rel) === null)) {
    console.log("Sample data is already there. Run `remove` first to make it again with today's dates.");
    return;
  }
  // Never over a file of the user's (a subject folder with the same name, say).
  const taken = files.filter(([rel]) => io.read(rel) !== null).map(([rel]) => rel);
  for (const rel of taken) console.log(`Kept the existing ${rel} (no sample written there).`);
  for (const [rel, text] of files) if (!taken.includes(rel)) io.write(rel, text);
  const bins = binaries.filter(([rel]) => isNew(rel) && io.read(rel) === null);
  for (const [rel, data] of bins) io.write(rel, data);
  if (files.some(([rel]) => areaOf(rel) === ".trash")) {
    const index = readJson(io, ".trash/.deleted.json", {});
    io.write(".trash/.deleted.json", JSON.stringify({ ...index, ...trashIndex }, null, 2) + "\n");
  }
  if (demo) {
    const settings = readJson(io, ".studium/settings.json", { theme: "dark" });
    io.write(".studium/settings.json", JSON.stringify({ ...settings, language: lang === "pt" ? "pt-BR" : "en" }, null, 2) + "\n");
  }
  const manifest = {
    files: [...(m?.files ?? []), ...files.map(f => f[0]).filter(rel => !taken.includes(rel))],
    binaries: [...(m?.binaries ?? []), ...bins.map(f => f[0])],
    areas: [...new Set([...had, ...files.map(([rel]) => areaOf(rel))])],
  };
  io.write(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Added ${files.length} sample files (${[...new Set(files.map(([r]) => areaOf(r)))].join(", ")})).`);
}

function remove(io) {
  const m = readJson(io, MANIFEST, null);
  const files = io.findSamples();
  for (const rel of files) io.remove(rel);
  // Sample attachments (no header to mark them), then the study folders left empty.
  for (const rel of m?.binaries ?? []) io.remove(rel);
  const studyDirs = new Set();
  for (const rel of [...files, ...(m?.binaries ?? [])])
    if (rel.startsWith("study/"))
      for (let d = path.posix.dirname(rel); d.split("/").length > 1; d = path.posix.dirname(d)) studyDirs.add(d);
  for (const d of [...studyDirs].sort((a, b) => b.split("/").length - a.split("/").length)) io.removeDirIfEmpty(d);
  const index = readJson(io, ".trash/.deleted.json", {});
  for (const k of files) delete index[k];
  if (Object.keys(index).length) io.write(".trash/.deleted.json", JSON.stringify(index, null, 2) + "\n");
  else io.remove(".trash/.deleted.json");
  io.remove(MANIFEST);
  console.log(`Removed ${files.length} sample files.`);
}

const args = process.argv.slice(2);
const [cmd, target] = args.filter((a, i) => args[i - 1] !== "--lang" && (a === "--phone" || !a.startsWith("--")));
const langAt = args.indexOf("--lang");
const lang = langAt >= 0 ? args[langAt + 1] : "en";
if (!["add", "remove"].includes(cmd) || !target || !["en", "pt"].includes(lang)) {
  console.log("usage: node tools/sample-data.mjs add|remove <folder>|--phone [--lang en|pt] [--demo]");
  process.exit(1);
}
const io = target === "--phone" ? phone() : local(path.resolve(target));
if (cmd === "add") await add(io, { lang, demo: args.includes("--demo") });
else remove(io);
