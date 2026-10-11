// External styles-sheet storage: instead of keeping the CSS blocks only inside
// configuracion_metadatos.json, the app also serializes them into a single
// .css file with marker sections. The file is referenced from the qmd YAML
// (`css: documento-estilos.css`) so Quarto applies the same styles, and it is
// reimported when the project opens (the file is the source of truth).

export const STYLES_FILE_NAME = 'documento-estilos.css';

export interface StylesSectionDef {
  // Marker id used in the file.
  key: string;
  // settings field that holds this CSS block.
  field: string;
  // Human-readable label for the section.
  label: string;
}

export const STYLES_SECTIONS: StylesSectionDef[] = [
  { key: 'titulos', field: 'blockStyleTitles', label: 'Títulos' },
  { key: 'encabezado', field: 'blockStyleHeader', label: 'Encabezado' },
  { key: 'pie', field: 'blockStyleFooter', label: 'Pie de página' },
  { key: 'numeracion', field: 'blockStylePageNum', label: 'Numeración de página' },
  { key: 'toc', field: 'blockStyleTOC', label: 'Tabla de contenidos' },
  { key: 'listas', field: 'blockStyleLists', label: 'Listas' },
  { key: 'tablas', field: 'tableCustomCss', label: 'Tablas' },
  { key: 'css-adicional', field: 'customAddedCss', label: 'CSS adicional' },
];

const MARKER_RE = /\/\*\s*={2,}\s*WP-SECCION:([\w-]+)/g;

function markerFor(key: string): string {
  return `/* ==== WP-SECCION:${key} ==== */`;
}

// Parse a styles file into { [settingsField]: cssBody }. The marker id is the
// stable on-disk name (for example `css-adicional`), while the renderer reads
// settings fields (for example `customAddedCss`), so translate between them.
export function parseStylesFile(text: string): Partial<Record<string, string>> {
  const out: Partial<Record<string, string>> = {};
  if (!text) return out;
  MARKER_RE.lastIndex = 0;
  const matches: { key: string; start: number; commentEnd: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = MARKER_RE.exec(text)) !== null) {
    const close = text.indexOf('*/', m.index + m[0].length);
    const commentEnd = close === -1 ? text.length : close + 2;
    matches.push({ key: m[1], start: m.index, commentEnd });
  }
  for (let i = 0; i < matches.length; i++) {
    const { key, commentEnd } = matches[i];
    const nextStart = i + 1 < matches.length ? matches[i + 1].start : text.length;
    const body = text.slice(commentEnd, nextStart).trim();
    const section = STYLES_SECTIONS.find((candidate) => candidate.key === key);
    if (body && section) out[section.field] = body;
  }
  return out;
}

// Build the full css file text from a settings-like record of CSS fields.
// Empty fields get no marker so the file stays clean, matching the app fields.
export function buildStylesFile(values: Record<string, string | undefined>): string {
  const header = [
    '/* ============================================================',
    `   ${STYLES_FILE_NAME} - estilos del documento gestionados por WP.`,
    '   Cada sección se abre con un marcador WP-SECCION (ver más abajo).',
    '   Puedes editar el contenido libremente: se re-importa al abrir',
    '   el proyecto y solo se reescribe cuando guardas desde la app.',
    '   ============================================================ */',
    '',
  ].join('\n');

  const parts: string[] = [];
  for (const sec of STYLES_SECTIONS) {
    const value = values[sec.field];
    if (!value || value.trim().length === 0) continue;
    parts.push(`${markerFor(sec.key)}\n${value.trim()}\n`);
  }
  return header + (parts.length ? '\n' + parts.join('\n\n') + '\n' : '');
}
