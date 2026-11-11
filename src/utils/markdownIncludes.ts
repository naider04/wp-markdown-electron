/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { stripYamlFrontMatter } from './markdownParser';

/**
 * Reads a project-relative file (posix separators) and returns its text, or
 * null/undefined when the file is missing or unreadable.
 */
export type IncludeReader = (relPath: string) => Promise<string | null | undefined>;

export interface ExpandIncludesOptions {
  /** Directory (posix, project-root relative) of the file that owns `source`. */
  baseDir?: string;
  /** Internal recursion guard; callers should not pass this. */
  _stack?: string[];
}

// `@include("sections/introduction.md")`, `@include('sections/x.md')` or
// `@include(sections/x.md)` — the LaTeX `\input{}` equivalent.
const INCLUDE_RE = /@include\s*\(\s*(?:"([^"]+)"|'([^']+)'|([^)\s]+))\s*\)/g;

function toPosix(value: string): string {
  return String(value || '').replace(/\\/g, '/');
}

/** Collapse `.`/`..` segments so a path can never escape the project root. */
function normalizeRel(value: string): string {
  const parts = toPosix(value).split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join('/');
}

function dirOf(rel: string): string {
  const idx = rel.lastIndexOf('/');
  return idx < 0 ? '' : rel.slice(0, idx);
}

function joinRel(dir: string, rel: string): string {
  return normalizeRel(dir ? `${dir}/${rel}` : rel);
}

/** True when `rel`, resolved from `dir`, would climb above the project root. */
function escapesRoot(dir: string, rel: string): boolean {
  const combined = `${dir ? `${dir}/` : ''}${toPosix(rel)}`;
  let depth = 0;
  for (const part of combined.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (depth === 0) return true;
      depth -= 1;
    } else {
      depth += 1;
    }
  }
  return false;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function includeWarning(message: string): string {
  return (
    '\n\n<div class="wp-include-warning" style="margin:12px 0;padding:8px 12px;' +
    'border:1px solid #d97706;border-left:4px solid #d97706;background:#fffbeb;' +
    'color:#92400e;font-size:0.85em;border-radius:4px;">' +
    `&#9888; ${escapeHtml(message)}</div>\n\n`
  );
}

/**
 * Prefix project-root-relative image/link paths inside an included file body so
 * the existing image resolution keeps working from the project root.
 */
function rewriteRelativePaths(body: string, childDir: string): string {
  if (!childDir) return body;
  const isExternal = (path: string) =>
    /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\/)/i.test(path) || path.startsWith('data:');
  const fix = (raw: string): string => {
    const path = raw.trim();
    if (!path || isExternal(path)) return raw;
    return joinRel(childDir, path);
  };
  let out = body.replace(
    /(!\[[^\]]*\]\(\s*)(<?)([^)\s>]+)(>?)(\s*(?:"[^"]*"|'[^']*'|\([^)]*\))?\s*\))/g,
    (_match, pre: string, lt: string, path: string, gt: string, post: string) =>
      `${pre}${lt}${fix(path)}${gt}${post}`,
  );
  out = out.replace(
    /(\bsrc\s*=\s*["'])([^"']+)(["'])/gi,
    (_match, pre: string, path: string, post: string) => `${pre}${fix(path)}${post}`,
  );
  return out;
}

/**
 * Recursively expand `@include("...")` directives found in `source`.
 *
 * - Paths resolve relative to the file that contains the directive (top-level
 *   against the project root).
 * - Directives inside fenced code blocks (``` / ~~~) are left untouched.
 * - Included files have their YAML front matter stripped.
 * - Circular includes, out-of-project paths and missing files render a visible
 *   warning block instead of throwing.
 */
export async function expandMarkdownIncludes(
  source: string,
  readFile: IncludeReader,
  options: ExpandIncludesOptions = {},
): Promise<string> {
  const baseDir = normalizeRel(options.baseDir || '');
  const stack = options._stack ? [...options._stack] : [];

  async function expand(text: string, currentDir: string, visited: string[]): Promise<string> {
    if (!text || text.indexOf('@include') === -1) return text;
    const lines = text.split(/\r?\n/);
    const out: string[] = [];
    let fence: string | null = null;
    for (const line of lines) {
      const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
      if (fenceMatch) {
        const marker = fenceMatch[1][0];
        if (fence === null) fence = marker;
        else if (fence === marker) fence = null;
        out.push(line);
        continue;
      }
      if (fence !== null || line.indexOf('@include') === -1) {
        out.push(line);
        continue;
      }
      out.push(await replaceLine(line, currentDir, visited));
    }
    return out.join('\n');
  }

  async function replaceLine(line: string, currentDir: string, visited: string[]): Promise<string> {
    INCLUDE_RE.lastIndex = 0;
    const matches = [...line.matchAll(INCLUDE_RE)];
    if (matches.length === 0) return line;
    let result = '';
    let last = 0;
    for (const match of matches) {
      const idx = match.index ?? 0;
      result += line.slice(last, idx);
      result += await resolveInclude(match[1] || match[2] || match[3] || '', currentDir, visited);
      last = idx + match[0].length;
    }
    result += line.slice(last);
    return result;
  }

  async function resolveInclude(rawPath: string, currentDir: string, visited: string[]): Promise<string> {
    const clean = rawPath.trim();
    if (!clean) return includeWarning('Include sin ruta');
    if (escapesRoot(currentDir, clean)) {
      return includeWarning(`Include fuera del proyecto: ${clean}`);
    }
    const rel = joinRel(currentDir, clean);
    if (!rel) return includeWarning(`Include fuera del proyecto: ${clean}`);
    if (visited.includes(rel)) {
      return includeWarning(`Include circular detectado: ${clean}`);
    }
    let text: string | null | undefined;
    try {
      text = await readFile(rel);
    } catch {
      text = null;
    }
    if (text === null || text === undefined || text === '') {
      return includeWarning(`No se encontró el archivo incluido: ${clean}`);
    }
    const body = stripYamlFrontMatter(text);
    const childDir = dirOf(rel);
    const prepared = rewriteRelativePaths(body, childDir);
    const nested = await expand(prepared, childDir, [...visited, rel]);
    return `\n\n<!-- wp:include:${rel} -->\n${nested}\n<!-- /wp:include:${rel} -->\n\n`;
  }

  return expand(source, baseDir, stack);
}
