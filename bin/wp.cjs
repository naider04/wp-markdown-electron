#!/usr/bin/env node
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, exec } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT_NAME = 'documento_formateado.html';
const PDF_NAME = 'documento.pdf';

// Content file written by `mdwp new`. We use Quarto (.qmd) so the file ships
// with YAML front matter that the renderer strips when previewing and that
// Quarto consumes when exporting to .docx.
const CONTENT_NAME = 'contenido_fuente.qmd';
// Reference .docx (styles) copied into every new project and referenced from
// the YAML `format.docx.reference-doc` so Quarto uses it when exporting. It
// ships with the repo under public/ so `mdwp new` is fully self-contained.
const DOCX_REFERENCE_SRC =
  process.env.WP_DOCX_REFERENCE || path.join(ROOT, 'public', 'unemi-tmp.docx');
const DOCX_REFERENCE_NAME = 'unemi-tmp.docx';

function usage() {
  console.log(
    [
      'mdwp — generador de documentos académicos de escritorio',
      '',
      'Uso:',
      '  mdwp new [nombre]      Crea un nuevo proyecto (portada, qmd con YAML, docx de referencia, sin contenido)',
      '  mdwp open [carpeta]    Abre la interfaz de edición (Electron)',
      '  mdwp build [carpeta]   Compila y abre el resultado en el navegador',
      '  mdwp pdf [carpeta]     Compila y genera un PDF en la carpeta',
      '  mdwp help              Muestra esta ayuda',
      '',
      'Si no se indica carpeta, se usa el directorio actual.',
    ].join('\n')
  );
}

function projectFolder(tail) {
  if (!tail) return process.cwd();
  return path.resolve(tail);
}

function detectChrome() {
  const candidates = [
    process.env.WP_CHROME,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

// ---- Static + project server ----------------------------------------------
// The built app is served under /app/ and the project folder is served at the
// root (so the renderer can fetch configuracion_metadatos.json, the content
// file and any images). Output is received via POST /__output.
function startServer(project) {
  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];

    if (req.method === 'POST' && url === '/__output') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          const html = String(data.html || '');
          const mode = data.mode || 'build';
          const outFile = mode === 'pdf' ? OUT_NAME : OUT_NAME;
          fs.writeFileSync(path.join(project, outFile), html, 'utf8');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, file: outFile, count: html.length }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: String(e) }));
        }
      });
      return;
    }

    if (url === '/' ) {
      const idx = path.join(DIST, 'index.html');
      if (fs.existsSync(idx)) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        fs.createReadStream(idx).pipe(res);
      } else {
        res.writeHead(404); res.end('dist no compilado');
      }
      return;
    }

    if (url === '/app' || url.startsWith('/app/')) {
      const rel = url.replace(/^\/app\/?/, '');
      const file = path.join(DIST, rel || 'index.html');
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        res.writeHead(200, { 'Content-Type': mime(file) });
        fs.createReadStream(file).pipe(res);
      } else {
        res.writeHead(404); res.end('not found');
      }
      return;
    }

    // Built app assets are referenced with absolute paths (/assets/*)
    if (url.startsWith('/assets/')) {
      const file = path.join(DIST, url.slice(1));
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        res.writeHead(200, { 'Content-Type': mime(file) });
        fs.createReadStream(file).pipe(res);
      } else {
        res.writeHead(404); res.end('not found');
      }
      return;
    }

    // Project folder file
    const rel2 = url === '/' ? '' : url.slice(1);
    const file2 = path.join(project, rel2);
    if (fs.existsSync(file2) && fs.statSync(file2).isFile()) {
      res.writeHead(200, { 'Content-Type': mime(file2) });
      fs.createReadStream(file2).pipe(res);
    } else {
      res.writeHead(404); res.end('not found');
    }
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, port, base: `http://127.0.0.1:${port}` });
    });
  });
}

function mime(file) {
  const ext = path.extname(file).toLowerCase();
  const map = {
    '.html': 'text/html', '.htm': 'text/html', '.js': 'text/javascript',
    '.css': 'text/css', '.json': 'application/json', '.md': 'text/markdown',
    '.qmd': 'text/markdown', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff',
    '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp4': 'video/mp4',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return map[ext] || 'application/octet-stream';
}

// ---- YAML helpers ---------------------------------------------------------
// Read the `title` from a .qmd/.md YAML front matter block, so the compiled
// document is named by the content's title instead of the project folder name.
function readYamlTitle(project) {
  for (const name of [CONTENT_NAME, 'contenido_fuente.md']) {
    const file = path.join(project, name);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    const match = text.match(/^---[ \t]*\r?\n([\s\S]*?)^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/m);
    if (!match) continue;
    const line = match[1].split('\n').find((l) => /^title\s*:/.test(l));
    if (!line) continue;
    return line
      .replace(/^title\s*:\s*/, '')
      .trim()
      .replace(/^["']/, '')
      .replace(/["']$/, '');
  }
  return null;
}

async function renderCompile(basename, project, mode) {
  const chrome = detectChrome();
  if (!chrome) {
    console.error('No se encontró Chrome/Chromium. Instálalo o define WP_CHROME.');
    process.exit(1);
  }

  const puppeteer = require('puppeteer-core');
  const { server, base } = await startServer(project);

  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  const page = await browser.newPage();
  page.on('console', (msg) => {
    const t = msg.type();
    if (t === 'error' || t === 'warning' || t === 'log') {
      console.log(`  [renderer ${t}]`, msg.text());
    }
  });
  page.on('pageerror', (err) => console.log('  [renderer pageerror]', err.message));
  page.on('requestfailed', (req) => console.log('  [renderer reqfail]', req.url(), req.failure() && req.failure().errorText));
  page.on('response', (res) => {
    if (res.status() >= 400) {
      console.log('  [renderer http ' + res.status() + ']', res.url());
    }
  });
  await page.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 1 });

  let done = false;
  await page.exposeFunction('__wpCompileDone', async () => {
    done = true;
  });
  // Mirror the renderer's compile flag in a window global so we can poll
  // its state from puppeteer without depending on the exposed function.
  page.on('console', () => { /* ensure console errors are surfaced */ });

  const folderName = (project ? path.basename(project) : '').trim();
  // Prefer the YAML `title` inside the content file; fall back to the folder
  // name so existing .md projects keep their previous behaviour.
  const docTitle = (readYamlTitle(project) || folderName || '').trim();
  const appUrl = `${base}/app/?mode=${mode}&server=${base}${docTitle ? `&title=${encodeURIComponent(docTitle)}` : ''}`;
  console.log(`  → Cargando motor de compilación (${mode})…`);
  await page.goto(appUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait for the renderer to compile and POST its output. We cannot use
  // fs.existsSync(outPath) as the completion signal, because a file left over
  // from a previous build would make us return immediately with stale output.
  // Instead we wait for the renderer's __wpCompileDone signal (fired after it
  // POSTs), or for the output file to be freshly rewritten by THIS build.
  const outPath = path.join(project, OUT_NAME);
  const deadline = Date.now() + 120000;
  let lastLog = 0;
  let baseStat = 0;
  try { baseStat = fs.statSync(outPath).mtimeMs; } catch (e) { baseStat = 0; }
  while (!done && Date.now() < deadline) {
    // Fresh output = the file exists AND was written after this build started.
    let fresh = false;
    try { fresh = fs.statSync(outPath).mtimeMs > baseStat; } catch (e) { fresh = false; }
    if (fresh) { done = true; break; }
    if (Date.now() - lastLog > 10000) {
      lastLog = Date.now();
      const pc = await page.evaluate(() => window.__wpPageCount || '?').catch(() => '?');
      console.log(`  → esperando compilación… (páginas: ${pc})`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  await new Promise((r) => setTimeout(r, 800));

  if (!fs.existsSync(outPath)) {
    console.error('Tiempo de espera agotado: no se generó el documento.');
    await browser.close();
    server.close();
    process.exit(1);
  }

  const html = fs.readFileSync(outPath, 'utf8');
  output = html;

  if (mode === 'pdf') {
    console.log('  → Generando PDF…');
    const pdfPath = path.join(project, PDF_NAME);
    // Use a brand-new page (not the compile page) so its frame isn't detached.
    const pdfPage = await browser.newPage();
    await pdfPage.setViewport({ width: 1400, height: 1000 });
    // Listen for image/resource load failures so they surface in the logs.
    pdfPage.on('requestfailed', (req) => {
      const url = req.url();
      if (url && !url.startsWith('data:')) {
        console.log('  [pdf reqfail]', url, req.failure() && req.failure().errorText);
      }
    });
    pdfPage.on('response', (res) => {
      if (res.status() >= 400) {
        console.log('  [pdf http ' + res.status() + ']', res.url());
      }
    });
    try {
      // Load the standalone HTML from the running server instead of
      // page.setContent(). setContent() uses an about:blank base URL, so
      // relative image paths (e.g. src="icon.png") can never resolve and the
      // PDF would come out without images. The server serves the project
      // folder at its root, so relative paths resolve correctly here.
      await pdfPage.goto(`${base}/${OUT_NAME}`, { waitUntil: 'load', timeout: 60000 });
      await new Promise((r) => setTimeout(r, 1200));
      await pdfPage.emulateMediaType('print');
      await pdfPage.pdf({
        path: pdfPath,
        printBackground: true,
        preferCSSPageSize: true,
        timeout: 60000,
      });
      await new Promise((r) => setTimeout(r, 500));
    } catch (e) {
      console.error('Error al generar el PDF:', e.message);
    } finally {
      await pdfPage.close();
    }
  }

  await browser.close();
  server.close();
  return { outPath, output, base };
}

function openInBrowser(file) {
  const cmd =
    process.platform === 'darwin' ? 'open' :
    process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} "${file}"`);
}

// ---- Project scaffold (mdwp new) -----------------------------------------
// Mirrors the website's default cover + page elements, with NO content and NO
// template pages (showTemplatePages: false so sample templates never leak in).

const DEFAULT_BLOCK_TITLES = `/* Estilo de Títulos APA 7 (Level 1, 2, 3, etc.) */
.wp-document-content h1 {
  font-family: "Times New Roman", Times, Georgia, serif;
  font-size: 16px;
  font-weight: bold;
  color: #000000;
  text-transform: none;
  text-align: center; /* APA 7 Level 1: Centered */
  text-indent: 0px !important;
  margin-top: 24px;
  margin-bottom: 12px;
  border-bottom: 0px none transparent !important;
  border-width: 0px !important;
  border-style: none !important;
}
.wp-document-content h1::after {
  display: none !important;
  content: none !important;
}
.wp-document-content h2 {
  font-family: "Times New Roman", Times, Georgia, serif;
  font-size: 16px;
  font-weight: bold;
  color: #000000;
  text-align: left; /* APA 7 Level 2: Flush left */
  text-indent: 0px !important;
  margin-top: 18px;
  margin-bottom: 8px;
}
.wp-document-content h3 {
  font-family: "Times New Roman", Times, Georgia, serif;
  font-size: 16px;
  font-weight: bold;
  font-style: italic; /* APA 7 Level 3: Flush left, bold italic */
  color: #000000;
  text-align: left;
  text-indent: 0px !important;
  margin-top: 14px;
  margin-bottom: 6px;
}
.wp-document-content h4 {
  font-family: "Times New Roman", Times, Georgia, serif;
  font-size: 16px;
  font-weight: bold;
  color: #000000;
  text-align: left;
  text-indent: 0.5in; /* APA 7 Level 4: Indented, bold, run-in */
  margin-top: 10px;
  margin-bottom: 4px;
}
.wp-document-content h5 {
  font-family: "Times New Roman", Times, Georgia, serif;
  font-size: 16px;
  font-weight: bold;
  font-style: italic; /* APA 7 Level 5: Indented, bold italic, run-in */
  color: #000000;
  text-align: left;
  text-indent: 0.5in;
  margin-top: 10px;
  margin-bottom: 4px;
}

/* Estilo de Párrafos y Contenido General */
.wp-document-content p {
  font-family: "Times New Roman", Times, Georgia, serif;
  font-size: 16px;
  line-height: 200%;
  color: #000000;
  text-align: left;
  text-indent: 0.5in; /* Indentación APA 7 */
  margin-top: 0;
  margin-bottom: 0px;
}`;

const DEFAULT_BLOCK_HEADER = `/* Estilo del Encabezado Académico APA 7 */
.wp-academic-header {
  font-size: 10px;
  color: #555555;
  text-transform: none;
  letter-spacing: 0.02em;
  border-bottom: none !important;
}
.wp-academic-header .header-bar-orange,
.wp-academic-header .header-bar-blue {
  display: none !important; /* Remove colored header bars */
}`;

const DEFAULT_BLOCK_FOOTER = `/* Estilo del Pie de Página Académico APA 7 */
.wp-academic-footer {
  font-size: 10px;
  color: #555555;
}
.wp-academic-footer .footer-line {
  display: none !important; /* Remove colored footer lines */
}
.wp-academic-footer .footer-dot {
  display: none !important;
}`;

const DEFAULT_BLOCK_PAGENUM = `/* Estilo de la Numeración de Página APA 7 */
.wp-page-num-indicator {
  font-family: "Times New Roman", Times, serif;
  font-weight: normal;
  color: #000000 !important;
  font-size: 11px;
}`;

const DEFAULT_BLOCK_TOC = `.toc-header {
  font-family: "Times New Roman", Times, serif;
  font-size: 16px;
  font-weight: bold;
  text-align: center;
  margin-bottom: 24px;
}
.toc-item {
  font-family: "Times New Roman", Times, serif;
  font-size: 16px;
  line-height: 2;
  margin-bottom: 12px;
}
.toc-level-1 {
  padding-left: 0px;
  font-weight: bold;
}
.toc-level-2 {
  padding-left: 24px;
}
.toc-level-3 {
  padding-left: 48px;
  font-style: italic;
}
.toc-dots {
  border-bottom: 1px dotted black;
  margin: 0 8px;
}
.toc-page {
  font-weight: bold;
  font-size: 16px;
}`;

const DEFAULT_BLOCK_TABLE = `.wp-document-content table,
.wp-document-content table th,
.wp-document-content table td {
  border: 1px solid #000000 !important;
}`;

const DEFAULT_BLOCK_LISTS = `/* Estilo de Listas Académicas */
.wp-document-content ul:not(.toc-list),
.wp-document-content ol {
  padding-left: 24px !important;
  margin-top: 0px !important;
  margin-bottom: 12px !important;
  text-indent: 0px !important;
}

.wp-document-content ul:not(.toc-list) {
  list-style-type: disc !important;
}

.wp-document-content ol {
  list-style-type: decimal !important;
}

.wp-document-content ul:not(.toc-list) li,
.wp-document-content ol li {
  text-indent: 0px !important;
  margin-bottom: 6px !important;
  padding-left: 0px !important;
  position: relative !important;
}

/* Evitar que párrafos y elementos directos de listas hereden indentación de texto (Compatible con Ecuaciones) */
.wp-document-content ul:not(.toc-list) li p,
.wp-document-content ol li p,
.wp-document-content ul:not(.toc-list) li > span:not(.math-expr):not([class*="mjx"]):not([class*="katex"]),
.wp-document-content ul:not(.toc-list) li > div:not(.math-expr):not([class*="mjx"]):not([class*="katex"]),
.wp-document-content ol li > span:not(.math-expr):not([class*="mjx"]):not([class*="katex"]),
.wp-document-content ol li > div:not(.math-expr):not([class*="mjx"]):not([class*="katex"]) {
  text-indent: 0px !important;
  margin: 0 !important;
  display: inline !important;
}`;

const STYLES_NAME = 'documento-estilos.css';
const STYLES_SECTIONS = [
  { key: 'titulos', field: 'blockStyleTitles' },
  { key: 'encabezado', field: 'blockStyleHeader' },
  { key: 'pie', field: 'blockStyleFooter' },
  { key: 'numeracion', field: 'blockStylePageNum' },
  { key: 'toc', field: 'blockStyleTOC' },
  { key: 'listas', field: 'blockStyleLists' },
  { key: 'tablas', field: 'tableCustomCss' },
  { key: 'css-adicional', field: 'customAddedCss' },
];

// Mirror of src/lib/stylesSheet.ts: section markers shared with the app.
function buildStylesFile(settings) {
  const header = [
    '/* ============================================================',
    `   ${STYLES_NAME} - estilos del documento gestionados por WP.`,
    '   Cada sección se abre con un marcador WP-SECCION (ver más abajo).',
    '   Puedes editar el contenido libremente: se re-importa al abrir',
    '   el proyecto y solo se reescribe cuando guardas desde la app.',
    '   ============================================================ */',
    '',
  ].join('\n');
  const parts = [];
  for (const sec of STYLES_SECTIONS) {
    const v = settings && settings[sec.field];
    if (!v || !String(v).trim()) continue;
    parts.push(`/* ==== WP-SECCION:${sec.key} ==== */\n${String(v).trim()}\n`);
  }
  return header + (parts.length ? '\n' + parts.join('\n\n') + '\n' : '');
}

const DEFAULT_MARGIN_ELEMENTS = [
  {
    id: 'wp-logo-margin',
    name: 'Logo WP',
    code: '<img src="icon.png">',
    top: '37',
    right: '42',
    pagesPattern: '!first',
    width: '120',
  },
  {
    id: 'wp-page-number-margin',
    name: 'Número de página',
    code: `<span style="font-family: 'Times New Roman'; font-size: 16px;">
    {page}
</span>`,
    top: '48',
    left: '96',
    pagesPattern: '!first',
  },
  {
    id: 'wp-line-margin',
    name: 'Linea',
    code: `<div
  class="w-full"
  style="height: 1px; background: #C0C0C0; print-color-adjust: exact; -webkit-print-color-adjust: exact;"
></div>`,
    top: '95',
    left: '0',
    width: '100%',
    pagesPattern: '!first',
  },
  {
    id: 'wp-cover-margin',
    name: 'Cover page',
    code: '<img src="cover.png">',
    top: '0',
    right: '0',
    width: '100%',
    height: '100%',
    pagesPattern: '1',
  },
  {
    id: 'wp-footer-margin',
    name: 'Final footer',
    code: '<img src="footer-wp.png">',
    bottom: '0',
    left: '0',
    width: '100%',
    height: 'auto',
    pagesPattern: 'n',
  },
];

const DEFAULT_OVERLAY_TEMPLATE = `body{
    margin:0;
    background:transparent;
    font-family: Arial, sans-serif;
    color:#002E45;
}

/* hoja */
.cv-page{
    height:100%;
    display:flex;
    justify-content:center;
    align-items:center;
    padding-left:96px;
    padding-right:96px;
}

/* bloque real centrado */
.cv-content{
    display:flex;
    flex-direction:column;
    align-items:center;
    text-align:center;
    width: 100%;
}

/* Estilos de compatibilidad para Markdown compilado */
.cv-content h1 {
    font-size:24px;
    font-weight:bold;
    line-height:1.4;
    text-transform:uppercase;
    margin-top:0;
    margin-bottom:18px;
    color:#002E45;
}

.cv-content h2 {
    font-size:20px;
    font-weight:bold;
    margin-top:10px;
    margin-bottom:2px;
    color:#002E45;
    text-transform:uppercase;
}

.cv-content p {
    margin:1px 0 10px 0;
    font-size:18px;
    line-height:1.5;
    color:#002E45;
}

.cv-content ul {
    list-style: none;
    padding: 0;
    margin: 1px 0 10px 0;
}

.cv-content li {
    font-size: 18px;
    line-height: 1.5;
    color: #002E45;
}`;

const DEFAULT_OVERLAY_MARKDOWN = `<img src="icon.png" style="max-width:40%; margin-bottom:40px; display:block; margin-left:auto; margin-right:auto;">

# FACULTAD DE CIENCIAS DE INGENIERÍA  
# CARRERA DE TECNOLOGÍAS DE LA INFORMACIÓN Y COMUNICACIÓN EN LINEA.

## TEMA:
APE 2

## GRUPO:
Wilmer Patiño
Maria Fernandez
Stefanía Rodriguez

## CURSO:
Arquitectura de Computador

## PROFESOR:
Ing. Bermeo Paucar Javier, Mgti

## FECHA:
Junio 18, 2026

## PERIODO:
Abril 2026 - Julio 2026

<br>
<br>

# MILAGRO-ECUADOR`;

function defaultCover() {
  return {
    institution: 'Nombre de la Institución',
    facultad: 'Nombre de la Facultad',
    carrera: 'Carrera Académica / Especialidad',
    title:
      'DISEÑO E IMPLEMENTACIÓN DE UN MOTOR WEB DE AUTOPAGINACIÓN DINÁMICA DE ALTA FIDELIDAD CON BORDES REGLAMENTARIOS',
    subtitle: 'Proyecto Integrador o Informe de Investigación',
    authors: 'Nombre del Autor',
    tutor: 'Nombre del Docente / Tutor',
    city: 'Ciudad, País',
    date: 'Junio, 2026',
    logoType: 'standard',
    overlayTemplate: DEFAULT_OVERLAY_TEMPLATE,
    overlayMarkdown: DEFAULT_OVERLAY_MARKDOWN,
    overlayHtml: '',
  };
}

function defaultSettings() {
  return {
    pageSize: 'letter',
    orientation: 'portrait',
    showGuides: false,
    headerText: '',
    footerText: '',
    autoRefreshFile: true,
    showTOC: false,
    tocTitle: 'Tabla de Contenidos',
    blockStyleTitles: DEFAULT_BLOCK_TITLES,
    blockStyleHeader: DEFAULT_BLOCK_HEADER,
    blockStyleFooter: DEFAULT_BLOCK_FOOTER,
    blockStylePageNum: DEFAULT_BLOCK_PAGENUM,
    blockStyleTOC: DEFAULT_BLOCK_TOC,
    blockStyleLists: DEFAULT_BLOCK_LISTS,
    tableCustomCss: DEFAULT_BLOCK_TABLE,
    pageNumTemplate: 'Página {page} de {total}',
    autoNumberHeadings: true,
    marginTop: 96,
    marginBottom: 96,
    marginLeft: 96,
    marginRight: 96,
    customAddedCss: '',
    customAddedJs: '',
    codeSize: '13px',
    codeTheme: 'academic',
    inlineCodeSize: '12px',
    inlineCodeTheme: 'academic',
    blockCodeSize: '13px',
    blockCodeTheme: 'academic',
    splitBlockCodeBorders: false,
    showBibliography: false,
    showOnlyCitedBibliography: false,
    bibliographyTitle: 'Referencias Bibliográficas',
    marginElements: DEFAULT_MARGIN_ELEMENTS,
    h1LineBreak: true,
    h2LineBreak: true,
    h3LineBreak: true,
    h4LineBreak: false,
    h5LineBreak: false,
    // Templates intentionally OFF: a new project has no template pages.
    showTemplatePages: false,
    templateHtml: '',
    templateJson: '',
    templateStartPage: 2,
  };
}

function cmdNew(name) {
  const target = name ? path.resolve(name) : process.cwd();
  const base = name ? path.basename(target) : path.basename(process.cwd());

  if (fs.existsSync(path.join(target, 'configuracion_metadatos.json'))) {
    console.error(`  → Ya existe un proyecto en: ${target}`);
    process.exit(1);
  }
  fs.mkdirSync(target, { recursive: true });

  // Copy the three images referenced by the default cover/template so the
  // generated document actually shows them (icon.png, cover.png, footer-wp.png).
  const TEMPLATE_IMAGES = ['icon.png', 'cover.png', 'footer-wp.png'];
  const uploadedFiles = [];
  for (const img of TEMPLATE_IMAGES) {
    const src = path.join(ROOT, 'public', img);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(target, img));
      const buf = fs.readFileSync(src);
      const mime = img.endsWith('.png') ? 'image/png' : 'image/' + path.extname(img).slice(1);
      uploadedFiles.push({
        id: 'tpl-' + img,
        name: img,
        type: mime,
        size: buf.length,
        dataUrl: `data:${mime};base64,${buf.toString('base64')}`,
        uploadedAt: new Date().toISOString(),
        description: 'Imagen de plantilla',
      });
    }
  }

  const bibPath = path.join(target, 'bibliografia.bib');
  fs.writeFileSync(
    bibPath,
    `# Bibliografía del proyecto. Añade tus entradas BibTeX aquí.\n\n@book{referencia_ejemplo,\n  author    = {Apellido, Nombre},\n  title     = {Título de la obra},\n  year      = {2026},\n  publisher = {Editorial}\n}\n`,
    'utf8'
  );

  // Copy the reference .docx used by Quarto as style template for .docx export.
  const docxName = DOCX_REFERENCE_NAME;
  const docxCopied = fs.existsSync(DOCX_REFERENCE_SRC);
  if (docxCopied) {
    fs.copyFileSync(DOCX_REFERENCE_SRC, path.join(target, docxName));
  }

  const contentPath = path.join(target, CONTENT_NAME);
  const escapedBase = String(base).replace(/"/g, '\\"');
  fs.writeFileSync(
    contentPath,
    [
      '---',
      `title: "${escapedBase}"`,
      'format:',
      '  docx:',
      `    reference-doc: ${DOCX_REFERENCE_NAME}`,
      '  html:',
      `    css: ${STYLES_NAME}`,
      '---',
      '',
      `# ${base}`,
      '',
      'Escribe aquí el contenido de tu documento.',
      '',
    ].join('\n'),
    'utf8'
  );

  const settings = defaultSettings();
  const stylesText = buildStylesFile(settings);
  fs.writeFileSync(path.join(target, STYLES_NAME), stylesText, 'utf8');

  const manifest = {
    cover: defaultCover(),
    settings,
    bibliography: [],
    bibFile: bibPath,
    contentFile: contentPath,
    uploadedFiles,
    stylesFile: STYLES_NAME,
  };
  const copiedImages = uploadedFiles.map((f) => f.name);

  fs.writeFileSync(
    path.join(target, 'configuracion_metadatos.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  );

  console.log(`  → Proyecto creado: ${target}`);
  console.log(`    • configuracion_metadatos.json (portada + elementos de página)`);
  console.log(`    • ${CONTENT_NAME} (YAML: title = "${base}", reference-doc = ${DOCX_REFERENCE_NAME}, css = ${STYLES_NAME})`);
  console.log(`    • ${STYLES_NAME} (estilos externos, referenciado en el YAML)`);
  if (copiedImages.length) {
    console.log(`    • ${copiedImages.join(', ')} (imágenes de plantilla copiadas)`);
  }
  console.log(`    • bibliografia.bib (vacío)`);
  if (docxCopied) {
    console.log(`    • ${docxName} (docx de referencia copiado)`);
  } else {
    console.log(`  ⚠ No se copió ${docxName}: no existe en ${DOCX_REFERENCE_SRC}`);
  }
  console.log(`\n  Abre con: mdwp open ${target}`);
}

function cmdOpen(folder) {
  const electronBin = path.join(ROOT, 'node_modules', '.bin', 'electron');
  console.log(`  → Abriendo editor: ${folder}`);
  const child = spawn(electronBin, [path.join(ROOT, 'electron', 'main.cjs'), '--folder', folder], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  child.on('error', (err) => {
    console.error('No se pudo iniciar Electron:', err.message);
    process.exit(1);
  });
}

async function main() {
  const [cmd, tail] = process.argv.slice(2);

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    usage();
    return;
  }

  const folder = projectFolder(tail);

  switch (cmd) {
    case 'new':
      cmdNew(tail);
      break;

    case 'open':
      cmdOpen(folder);
      break;

    case 'build':
    case 'pdf':
      if (!fs.existsSync(DIST)) {
        console.log('  → Compilando la interfaz…');
        await new Promise((resolve) => {
          const child = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], { cwd: ROOT, stdio: 'inherit' });
          child.on('exit', resolve);
        });
      }
      const { outPath, output } = await renderCompile(cmd, folder, cmd);
      if (cmd === 'build') {
        console.log(`  → Documento: ${outPath}`);
      } else {
        console.log(`  → PDF: ${path.join(folder, PDF_NAME)}`);
      }
      break;

    default:
      console.error(`Comando desconocido: ${cmd}`);
      usage();
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
