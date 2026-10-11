#!/usr/bin/env node
'use strict';
// Moodle + LLM bridge for `mdwp new <moodle-url>`.
//
// Fetches an assignment from UNEMI's Moodle webservice, downloads its
// attachment, extracts the PDF text, asks DeepSeek (driven through the user's
// Chrome session via CDP) to complete the assignment, and returns everything
// `wp.cjs` needs to scaffold a project: a language-aware cover, the generated
// markdown body and the attachment to store in the project folder.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { pathToFileURL } = require('url');

const MOODLE_ENV =
  process.env.WP_MOODLE_ENV ||
  '/home/wilmerpatino/Documents/Projects/Moodle/opencode unemi/.env';
const APIS_DIR =
  process.env.WP_APIS_DIR || '/home/wilmerpatino/Documents/Projects/APIS/Coding';
const CDP_URL = process.env.WP_CDP || 'http://127.0.0.1:9222';
const CHROME_PROFILE =
  process.env.WP_CHROME_PROFILE || path.join(os.homedir(), '.config', 'chrome-llms');
const TIMEOUT_MS = 45000;

const SITES = [
  { key: 'a', url: 'https://aulagradoa.unemi.edu.ec' },
  { key: 'b', url: 'https://aulagradob.unemi.edu.ec' },
];

// Default UNEMI identity used when the assignment does not imply otherwise.
// Overridable through environment variables so the CLI stays reusable.
const UNEMI = {
  institution: process.env.WP_INSTITUTION || 'UNIVERSIDAD ESTATAL DE MILAGRO',
  facultad: process.env.WP_FACULTAD || 'FACULTAD DE CIENCIAS DE INGENIERÍA',
  carrera:
    process.env.WP_CARRERA ||
    'CARRERA DE TECNOLOGÍAS DE LA INFORMACIÓN Y COMUNICACIÓN EN LINEA.',
  city: process.env.WP_CITY || 'MILAGRO-ECUADOR',
};

const SGA_LOGIN = 'https://sgaestudiante.unemi.edu.ec/api/auth/login.json';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Environment / HTTP helpers -------------------------------------------

function loadMoodleEnv() {
  const env = {};
  try {
    for (const line of fs.readFileSync(MOODLE_ENV, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)=(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  } catch (e) {
    /* .env is optional; env vars may be used instead */
  }
  return env;
}

function flattenParams(obj, prefix = '', out = {}) {
  if (obj === null || obj === undefined) {
    if (prefix) out[prefix] = '';
    return out;
  }
  if (typeof obj !== 'object') {
    out[prefix] = obj;
    return out;
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => flattenParams(v, `${prefix}[${i}]`, out));
    return out;
  }
  for (const [k, v] of Object.entries(obj)) flattenParams(v, prefix ? `${prefix}[${k}]` : k, out);
  return out;
}

async function moodleLogin(siteUrl, username, password) {
  const r = await fetch(`${siteUrl}/login/token.php?lang=en`, {
    method: 'POST',
    body: new URLSearchParams({ username, password, service: 'moodle_mobile_app' }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.token) throw new Error(j.error || `Login falló en ${siteUrl}`);
  return j.token;
}

async function mdCall(siteUrl, token, fn, params = {}, attemptsLeft = 3) {
  const body = new URLSearchParams(
    flattenParams({ wsfunction: fn, wstoken: token, moodlewsrestformat: 'json', ...params })
  );
  let j = null;
  try {
    const r = await fetch(`${siteUrl}/webservice/rest/server.php`, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    j = await r.json().catch(() => null);
  } catch (e) {
    /* retried below */
  }
  if (j && (j.errorcode || j.exception)) return { _error: j.message || j.errorcode };
  if ((j === null || j === undefined || j._error) && attemptsLeft > 1) {
    await sleep(800);
    return mdCall(siteUrl, token, fn, params, attemptsLeft - 1);
  }
  return j || null;
}

// ---- Text / language helpers ----------------------------------------------

function decodeEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function htmlToText(html) {
  return decodeEntities(
    String(html || '')
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\s*\/\s*(p|div|h[1-6]|li|tr)\s*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .trim();
}

function detectLanguage(text) {
  const t = ' ' + String(text || '').toLowerCase() + ' ';
  const es =
    (t.match(
      /\b(el|la|los|las|de|que|y|en|para|con|una|un|es|se|del|al|por|como|más|sobre|entre|esta|este|actividad|tarea|educación|estudiantes|objetivo)\b/g
    ) || []).length +
    (t.match(/[áéíóúñ¿¡]/g) || []).length * 2;
  const en = (
    t.match(
      /\b(the|and|of|to|in|for|with|is|are|on|that|this|as|by|an|be|or|from|assignment|students|education|objective)\b/g
    ) || []
  ).length;
  return es >= en ? 'es' : 'en';
}

const ES_MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const EN_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDate(date, lang) {
  const d = date instanceof Date ? date : new Date(date);
  if (lang === 'en') return `${EN_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  return `${d.getDate()} de ${ES_MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
}

function titleCase(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/(^|[\s-])([a-záéíóúñ])/g, (_, a, b) => a + b.toUpperCase());
}

function periodFromDates(startTs, endTs, lang) {
  if (!startTs || !endTs) return '';
  const s = new Date(startTs * 1000);
  const e = new Date(endTs * 1000);
  if (lang === 'en') {
    return `${EN_MONTHS[s.getMonth()]} ${s.getFullYear()} - ${EN_MONTHS[e.getMonth()]} ${e.getFullYear()}`;
  }
  return `${ES_MONTHS[s.getMonth()]} ${s.getFullYear()} - ${ES_MONTHS[e.getMonth()]} ${e.getFullYear()}`;
}

// ---- SGA académic period (best effort) ------------------------------------

async function sgaPeriodo(username, password) {
  if (!username || !password) return null;
  try {
    const r = await fetch(SGA_LOGIN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password,
        clientNavegador: 'mdwp',
        clientOS: 'Server',
        clientScreensize: '0x0',
        otp_verified_token: null,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    if (!j || !j.access) return null;
    const payload = JSON.parse(Buffer.from(j.access.split('.')[1], 'base64url').toString());
    const p = payload.periodo;
    return (p && (p.nombre_completo || p.nombre)) || null;
  } catch (e) {
    return null;
  }
}

// ---- Moodle queries --------------------------------------------------------

function detectSite(url) {
  const u = String(url || '');
  for (const s of SITES) if (u.startsWith(s.url)) return s;
  if (/aulagradoa/i.test(u)) return SITES[0];
  if (/aulagradob/i.test(u)) return SITES[1];
  throw new Error(`No se reconoce el sitio en la URL: ${url}`);
}

function parseCmid(url) {
  const m = String(url || '').match(/[?&]id=(\d+)/);
  if (!m) throw new Error('La URL no contiene un "id" de actividad (?id=…).');
  return Number(m[1]);
}

async function allCourses(siteUrl, token) {
  const info = await mdCall(siteUrl, token, 'core_webservice_get_site_info');
  if (!info || info._error) throw new Error('No se pudo obtener el usuario de Moodle.');
  const courses = await mdCall(siteUrl, token, 'core_enrol_get_users_courses', {
    userid: info.userid,
  });
  return Array.isArray(courses) ? courses : [];
}

async function findAssignment(siteUrl, token, cmid) {
  const courses = await allCourses(siteUrl, token);
  for (const c of courses) {
    const res = await mdCall(siteUrl, token, 'mod_assign_get_assignments', {
      courseids: [c.id],
    });
    for (const cc of (res && res.courses) || []) {
      for (const a of cc.assignments || []) {
        if (a.cmid === cmid) {
          const module = await findCourseModule(siteUrl, token, c.id, cmid);
          return { course: c, assign: a, module };
        }
      }
    }
  }
  throw new Error(`No se encontró la tarea con cmid ${cmid} en tus cursos.`);
}

async function findCourseModule(siteUrl, token, courseid, cmid) {
  try {
    const contents = await mdCall(siteUrl, token, 'core_course_get_contents', { courseid });
    for (const section of contents || []) {
      for (const m of section.modules || []) {
        if (m.id === cmid) return m;
      }
    }
  } catch (e) {
    /* non-fatal */
  }
  return null;
}

async function courseRoster(siteUrl, token, courseid) {
  const users = await mdCall(siteUrl, token, 'core_enrol_get_enrolled_users', { courseid });
  const teachers = [];
  const students = [];
  for (const u of Array.isArray(users) ? users : []) {
    const role = (u.roles && u.roles[0] && u.roles[0].shortname) || 'other';
    const rec = { id: u.id, fullname: (u.fullname || '').trim() };
    if (role === 'editingteacher' || role === 'teacher' || role === 'manager') teachers.push(rec);
    else students.push(rec);
  }
  return { teachers, students };
}

async function myGroup(siteUrl, token, courseid) {
  const res = await mdCall(siteUrl, token, 'core_group_get_course_user_groups', { courseid });
  const groups = (res && Array.isArray(res.groups) && res.groups) || [];
  if (!groups.length) return null;
  const group = { id: groups[0].id, name: groups[0].name };
  const r = await mdCall(siteUrl, token, 'core_grades_get_gradable_users', {
    courseid,
    groupid: group.id,
  });
  const memberIds = new Set(
    ((r && Array.isArray(r.users) && r.users) || []).map((u) => u.id)
  );
  return { group, memberIds };
}

// ---- Attachment download ---------------------------------------------------

function withToken(url, token) {
  let u = String(url);
  // Webservice tokens are only honoured by /webservice/pluginfile.php.
  u = u.replace(/\/(?<!webservice\/)pluginfile\.php\//, '/webservice/pluginfile.php/');
  if (u.includes('pluginfile.php') && !/[?&]token=/.test(u)) {
    u += (u.includes('?') ? '&' : '?') + `token=${token}`;
  }
  if (u.includes('pluginfile.php') && !/forcedownload=/.test(u)) {
    u += '&forcedownload=1';
  }
  return u;
}

function attachmentCandidates(siteUrl, token, assign, module, introHtml, explicit) {
  const out = [];
  const push = (url, name) => {
    if (!url || out.find((x) => x.url === url)) return;
    out.push({ url, name: name || null });
  };
  if (explicit) {
    if (/^https?:\/\//i.test(explicit)) push(withToken(explicit, token), path.basename(explicit.split('?')[0]));
    else return [{ local: path.resolve(explicit), name: path.basename(explicit) }];
  }
  for (const f of (assign.introfiles || []).concat(assign.introattachments || [])) {
    if (f && f.fileurl) push(withToken(f.fileurl, token), f.filename);
  }
  const re = /(?:href|src)="([^"]*(?:pluginfile\.php|file\.php)[^"]*)"/gi;
  let m;
  while ((m = re.exec(String(introHtml || ''))) !== null) {
    push(withToken(decodeEntities(m[1]), token), null);
  }
  // Best-effort construction of the intro attachment URL. The filename is not
  // always exposed by the webservice, so try a few plausible names.
  if (module && module.contextid) {
    const base = `${siteUrl}/webservice/pluginfile.php/${module.contextid}/mod_assign/introattachment/0/`;
    const names = [];
    const an = (assign.name || '').trim();
    if (an) {
      names.push(`${an}.pdf`);
      names.push(`${an.replace(/_/g, ' ')}.pdf`);
    }
    for (const n of names) push(base + encodeURIComponent(n) + `?forcedownload=1&token=${token}`, n);
  }
  return out;
}

async function downloadAttachment(siteUrl, token, assign, module, introHtml, explicit) {
  const candidates = attachmentCandidates(siteUrl, token, assign, module, introHtml, explicit);
  for (const c of candidates) {
    if (c.local) {
      if (fs.existsSync(c.local)) return { path: c.local, name: c.name };
      continue;
    }
    try {
      const r = await fetch(c.url, { signal: AbortSignal.timeout(60000) });
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      if (!r.ok || ct.includes('text/html')) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 64) continue;
      const name = c.name || decodeURIComponent(c.url.split('?')[0].split('/').pop());
      const dest = path.join(os.tmpdir(), `mdwp-attach-${Date.now()}-${name}`);
      fs.writeFileSync(dest, buf);
      return { path: dest, name };
    } catch (e) {
      /* try next candidate */
    }
  }
  return null;
}

function extractPdfText(pdfPath) {
  const outTxt = path.join(os.tmpdir(), `mdwp-pdf-${Date.now()}.txt`);
  try {
    execFileSync('pdftotext', ['-layout', pdfPath, outTxt], { stdio: 'ignore' });
    const text = fs.readFileSync(outTxt, 'utf8');
    fs.unlinkSync(outTxt);
    return text;
  } catch (e) {
    /* fall through to python */
  }
  try {
    const py = [
      'import sys',
      'from pypdf import PdfReader',
      'r=PdfReader(sys.argv[1])',
      "print('\\n'.join((p.extract_text() or '') for p in r.pages))",
    ].join('\n');
    const script = path.join(os.tmpdir(), `mdwp-pdf-${Date.now()}.py`);
    fs.writeFileSync(script, py, 'utf8');
    const text = execFileSync('python3', [script, pdfPath], { encoding: 'utf8' });
    fs.unlinkSync(script);
    return text;
  } catch (e) {
    return '';
  }
}

// ---- DeepSeek via Chrome CDP ----------------------------------------------

function detectChrome() {
  const candidates = [
    process.env.WP_CHROME,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

async function cdpUp() {
  try {
    const r = await fetch(`${CDP_URL}/json/version`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch (e) {
    return false;
  }
}

async function ensureChrome() {
  if (await cdpUp()) return;
  const chrome = detectChrome();
  if (!chrome) {
    throw new Error(
      'No se encontró Chrome/Chromium. Instálalo, define WP_CHROME o ejecuta Chrome con --remote-debugging-port=9222.'
    );
  }
  console.log('  → Iniciando Chrome con depuración remota (puerto 9222)…');
  const child = spawn(
    chrome,
    [
      '--remote-debugging-port=9222',
      `--user-data-dir=${CHROME_PROFILE}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
    { detached: true, stdio: 'ignore' }
  );
  child.unref();
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await cdpUp()) {
      await sleep(1200);
      return;
    }
    await sleep(700);
  }
  throw new Error(
    'Chrome no respondió en el puerto 9222. Ábrelo manualmente con --remote-debugging-port=9222 y verifica tu sesión en chat.deepseek.com.'
  );
}

async function deepseekGenerateOnce(prompt, cdp, deepseek) {
  const conn = await deepseek.openOrFindConn();
  try {
    // Wait until the DeepSeek tab has finished loading and exposes its token;
    // connecting mid-navigation makes CDP evaluate throw "target navigated".
    const deadline = Date.now() + 30000;
    let ready = false;
    while (Date.now() < deadline) {
      try {
        const t = await cdp.pageEval(conn.rpc, "localStorage.getItem('userToken')||''");
        if (t) {
          ready = true;
          break;
        }
      } catch (e) {
        /* page still navigating */
      }
      await sleep(800);
    }
    if (!ready) {
      throw new Error(
        'No se encontró la sesión de DeepSeek en Chrome. Inicia sesión en chat.deepseek.com y reintenta.'
      );
    }
    const { answer } = await deepseek.ask(conn.rpc, prompt, { thinking: false });
    return answer;
  } finally {
    conn.close();
  }
}

async function deepseekGenerate(prompt) {
  await ensureChrome();
  const cdp = await import(pathToFileURL(path.join(APIS_DIR, 'lib', 'cdp.mjs')).href);
  const deepseek = await import(
    pathToFileURL(path.join(APIS_DIR, 'providers', 'deepseek.mjs')).href
  );
  const chrome = await cdp.checkChromeUp();
  if (!chrome) throw new Error('Chrome no responde en el puerto 9222.');
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await deepseekGenerateOnce(prompt, cdp, deepseek);
    } catch (e) {
      lastErr = e;
      if (/userToken|sesión de DeepSeek/i.test(e.message)) throw e;
      console.log(`    … reintentando DeepSeek (${attempt}/3): ${e.message}`);
      await sleep(2500);
    }
  }
  throw lastErr;
}

// ---- Prompt / cover / document builders ------------------------------------

function buildPrompt({ lang, assignment, course, teacher, members, fecha, periodo, description, pdfText }) {
  if (lang === 'en') {
    return [
      'You are a university student at UNEMI. Fully complete the following academic assignment.',
      'Write the final document in English, APA 7 style, academic tone, without copying the prompt verbatim.',
      '',
      `COURSE: ${course}`,
      `ASSIGNMENT: ${assignment}`,
      `TEACHER: ${teacher}`,
      `GROUP MEMBERS: ${members}`,
      `DATE: ${fecha}`,
      `ACADEMIC PERIOD: ${periodo}`,
      '',
      'ASSIGNMENT INSTRUCTIONS:',
      description,
      '',
      'ATTACHED DOCUMENT (extracted text):',
      pdfText || '(no attachment text available)',
      '',
      'OUTPUT INSTRUCTIONS:',
      '- Return ONLY markdown. No code fences, no cover page, no YAML front matter.',
      '- Structure: introduction, objective, body sections matching the instructions, conclusions, and APA 7 references.',
      '- Include at least 4 credible APA 7 references and cite them in the text.',
      '- Do not include the cover page (it is generated separately).',
    ].join('\n');
  }
  return [
    'Eres un estudiante universitario de la UNEMI. Desarrolla COMPLETAMENTE la siguiente tarea académica.',
    'Redacta el documento final en español, con estilo APA 7 y tono académico, sin copiar literalmente el enunciado.',
    '',
    `ASIGNATURA: ${course}`,
    `TAREA: ${assignment}`,
    `DOCENTE: ${teacher}`,
    `INTEGRANTES DEL GRUPO: ${members}`,
    `FECHA: ${fecha}`,
    `PERIODO ACADÉMICO: ${periodo}`,
    '',
    'ENUNCIADO / INSTRUCCIONES:',
    description,
    '',
    'DOCUMENTO ADJUNTO (texto extraído):',
    pdfText || '(no hay texto del adjunto disponible)',
    '',
    'INSTRUCCIONES DE SALIDA:',
    '- Devuelve ÚNICAMENTE markdown. Sin bloques de código, sin portada y sin YAML.',
    '- Estructura: introducción, objetivo, desarrollo por secciones (Parte 1, Parte 2, … según el enunciado), conclusiones y referencias en APA 7.',
    '- Incluye al menos 4 referencias académicas verosímiles en formato APA 7 y cítalas en el texto.',
    '- No incluyas la carátula (se genera aparte).',
  ].join('\n');
}

function buildOverlayMarkdown({ lang, tema, grupo, curso, profesor, fecha, periodo }) {
  if (lang === 'en') {
    return `<img src="icon.png" style="max-width:40%; margin-bottom:40px; display:block; margin-left:auto; margin-right:auto;">

# ${UNEMI.facultad}
# ${UNEMI.carrera}

## TOPIC:
${tema}

## GROUP:
${grupo}

## COURSE:
${curso}

## PROFESSOR:
${profesor}

## DATE:
${fecha}

## PERIOD:
${periodo}

<br>
<br>

# MILAGRO - ECUADOR`;
  }
  return `<img src="icon.png" style="max-width:40%; margin-bottom:40px; display:block; margin-left:auto; margin-right:auto;">

# ${UNEMI.facultad}
# ${UNEMI.carrera}

## TEMA:
${tema}

## GRUPO:
${grupo}

## CURSO:
${curso}

## PROFESOR:
${profesor}

## FECHA:
${fecha}

## PERIODO:
${periodo}

<br>
<br>

# ${UNEMI.city}`;
}

function buildCover({ lang, tema, grupo, curso, profesor, fecha, periodo }) {
  const overlayMarkdown = buildOverlayMarkdown({
    lang,
    tema,
    grupo,
    curso,
    profesor,
    fecha,
    periodo,
  });
  return {
    institution: UNEMI.institution,
    facultad: UNEMI.facultad,
    carrera: UNEMI.carrera,
    title: tema,
    subtitle: curso,
    authors: grupo,
    tutor: profesor,
    city: 'Milagro, Ecuador',
    date: fecha,
    logoType: 'standard',
    overlayMarkdown,
    overlayHtml: '',
  };
}

function cleanMarkdown(text) {
  let t = String(text || '').trim();
  t = t.replace(/^```(?:markdown|md)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
  return t.trim();
}

// ---- Main entry ------------------------------------------------------------

function isMoodleUrl(s) {
  return /^https?:\/\/[^\s]*mod\/assign\/view\.php\?[^\s]*\bid=\d+/i.test(String(s || '')) ||
    /^https?:\/\/(aulagradoa|aulagradob)\.unemi\.edu\.ec\//i.test(String(s || ''));
}

// Returns everything wp.cjs needs to scaffold the project. The LLM step is
// skipped when opts.noLlm is set (scaffold-only, useful for tests).
async function prepareAssignment(url, opts = {}) {
  const env = loadMoodleEnv();
  const username = process.env.MOODLE_USERNAME || env.MOODLE_USERNAME || env.DEFAULT_USERNAME;
  const password = process.env.MOODLE_PASSWORD || env.MOODLE_PASSWORD;
  if (!username || !password) {
    throw new Error(`Faltan credenciales de Moodle. Agrégalas a ${MOODLE_ENV} o al entorno.`);
  }

  const site = detectSite(url);
  const cmid = parseCmid(url);
  console.log(`  → Conectando a ${site.url} …`);
  const token = await moodleLogin(site.url, username, password);

  console.log(`  → Buscando la tarea (cmid ${cmid}) …`);
  const { course, assign, module } = await findAssignment(site.url, token, cmid);

  const courseName = (course.fullname || course.shortname || '').trim();
  const tema = (assign.name || '').trim();
  const description = htmlToText(assign.intro);
  const lang = detectLanguage(`${tema} ${description}`);
  console.log(`  → Tarea: ${tema}  ·  Curso: ${courseName}  ·  Idioma: ${lang}`);

  console.log('  → Obteniendo docente e integrantes del grupo …');
  const { teachers, students } = await courseRoster(site.url, token, course.id);
  const group = await myGroup(site.url, token, course.id);
  const teacher = teachers.length ? teachers[0].fullname : 'Docente';
  const info = await mdCall(site.url, token, 'core_webservice_get_site_info');
  const myName = (info && info.fullname) || username;
  let members = [];
  if (group) {
    members = students.filter((s) => group.memberIds.has(s.id)).map((s) => s.fullname);
  }
  if (!members.length) members = [myName];
  const grupos = members.join('\n');

  console.log('  → Descargando el documento adjunto …');
  const attachment = await downloadAttachment(
    site.url,
    token,
    assign,
    module,
    assign.intro,
    opts.attach || null
  );
  let pdfText = '';
  let attachmentInfo = null;
  if (attachment) {
    attachmentInfo = { path: attachment.path, name: attachment.name };
    pdfText = extractPdfText(attachment.path).trim();
    console.log(`    • ${attachment.name} (${pdfText.length} caracteres de texto)`);
  } else {
    console.log('    ⚠ No se encontró adjunto (usa --attach <ruta|url> para indicarlo).');
  }

  const fecha = formatDate(new Date(), lang);
  let periodo = await sgaPeriodo(username, password);
  if (periodo) periodo = titleCase(periodo);
  else periodo = periodFromDates(course.startdate, course.enddate, lang);
  if (lang === 'en' && periodo) periodo = periodo.replace(/ de /g, ' ');

  let body;
  if (opts.noLlm) {
    body = [
      `# ${tema}`,
      '',
      '> Contenido pendiente de generar. Documento base creado por `mdwp new`.',
      '',
      '## Introducción',
      '',
      description || 'Escribe aquí el desarrollo de la tarea.',
      '',
    ].join('\n');
  } else {
    console.log('  → Generando el contenido con DeepSeek (Chrome/CDP)…');
    const prompt = buildPrompt({
      lang,
      assignment: tema,
      course: courseName,
      teacher,
      members: members.join(', '),
      fecha,
      periodo,
      description,
      pdfText,
    });
    const answer = await deepseekGenerate(prompt);
    body = cleanMarkdown(answer);
    if (!body) throw new Error('DeepSeek devolvió una respuesta vacía.');
  }

  const cover = buildCover({
    lang,
    tema,
    grupo: grupos,
    curso: courseName,
    profesor: teacher,
    fecha,
    periodo,
  });

  const base = safeFolderName(tema || course.shortname || 'tarea');
  return {
    site: site.key,
    cmid,
    courseid: course.id,
    course: courseName,
    activityName: tema,
    language: lang,
    teacher,
    members,
    period: periodo,
    date: fecha,
    base,
    cover,
    body,
    attachment: attachmentInfo,
  };
}

function safeFolderName(s) {
  return String(s || 'tarea')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'tarea';
}

module.exports = {
  isMoodleUrl,
  prepareAssignment,
  safeFolderName,
  htmlToText,
  detectLanguage,
  formatDate,
  buildOverlayMarkdown,
};
