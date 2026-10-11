import { Marked } from 'marked';
import Prism from 'prismjs';

// Import Prism language components
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-markup'; // HTML/XML/SVG
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-latex';

// Syntax highlighting is always enabled. The "light mode" toggle (which used
// to disable highlighting for very large documents) has been removed.
export function isLightModeEnabled(): boolean {
  return false;
}

const escapeCodeHtml = (code: string): string =>
  code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const highlightCode = (code: string, lang: string): string => {
  if (isLightModeEnabled()) {
    return escapeCodeHtml(code);
  }

  const cleanLang = (lang || '').trim().toLowerCase();
  
  // Map common aliases
  const langMap: Record<string, string> = {
    'js': 'javascript',
    'ts': 'typescript',
    'html': 'markup',
    'xml': 'markup',
    'svg': 'markup',
    'sh': 'bash',
    'shell': 'bash',
    'py': 'python',
    'md': 'markdown',
    'tex': 'latex'
  };

  const prismLang = langMap[cleanLang] || cleanLang;

  if (prismLang && Prism.languages[prismLang]) {
    try {
      return Prism.highlight(code, Prism.languages[prismLang], prismLang);
    } catch (e) {
      console.warn("Prism highlight error:", e);
    }
  }

  // Fallback to basic HTML escaping
  return escapeCodeHtml(code);
};

export function stripYamlFrontMatter(src: string): string {
  if (!src) return src;
  let text = src;
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const match = text.match(/^---[ \t]*\r?\n([\s\S]*?)^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/m);
  if (match) return text.slice(match[0].length);
  return src;
}

// Convert Quarto/pandoc fenced divs (`::: {.class}` ... `:::`) into real <div>
// wrappers so custom CSS selectors like `.timeline-section ...` keep working
// when the content is rendered with marked (which does not understand fenced
// divs natively). Supports nesting; bare `:::` closes the current div.
function convertQuartoFencedDivs(src: string): string {
  if (!src.includes(':::')) return src;
  const lines = src.split(/\r?\n/);
  const out: string[] = [];
  const openRe = /^\s*:+\s*\{\s*([^}]*)\}\s*$/;
  const closeRe = /^\s*:+\s*$/;
  for (const line of lines) {
    const open = line.match(openRe);
    if (open) {
      const classes = (open[1].match(/(?:^|\s)\.([\w-]+)/g) || [])
        .map((s: string) => s.trim().replace(/^\./, ''));
      const id = (open[1].match(/(?:^|\s)#([\w-]+)/) || [])[1];
      const attrs =
        (open[1].match(/(?:^|\s)([a-zA-Z][\w-]*:[\w\s.-]+)/g) || []).join(' ');
      let tag = '<div';
      if (classes.length) tag += ` class="${classes.join(' ')}"`;
      if (id) tag += ` id="${id}"`;
      if (attrs) tag += ` ${attrs}`;
      out.push(tag + '>');
      continue;
    }
    if (closeRe.test(line)) {
      out.push('</div>');
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

// Minimal YAML front-matter parser returning a nested object of scalars/arrays.
// Good enough to read `css:`, `format.html.css`, captions, etc. from .qmd files.
export function parseYamlFrontMatter(src: string): Record<string, any> {
  const out: Record<string, any> = {};
  if (!src) return out;
  let text = src;
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const match = text.match(/^---[ \t]*\r?\n([\s\S]*?)^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/m);
  if (!match) return out;

  const parseScalar = (raw: string): any => {
    const v = (raw || '').trim().replace(/\s+#.*$/, '').trim();
    if (!v) return '';
    if (v.startsWith('[') && v.endsWith(']')) {
      return v
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, '').trim())
        .filter(Boolean);
    }
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      return v.slice(1, -1);
    }
    return v;
  };

  const stack: { indent: number; obj: any }[] = [{ indent: -1, obj: out }];
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    const keyMatch = line.match(/^(\s*)([\w\-.]+):(?:\s*(.*))?$/);
    if (!keyMatch) continue;
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) stack.pop();
    const current = stack[stack.length - 1].obj;
    const key = keyMatch[2];
    // Only absorb the scalar when a sibling/child key is not implied (no deeper
    // keys follow). We store the scalar eagerly and promote to object if needed.
    const value = parseScalar(keyMatch[3]);
    if (value !== '') {
      current[key] = value;
    } else {
      const next = {};
      current[key] = next;
      stack.push({ indent, obj: next });
    }
  }
  return out;
}

// CSS files referenced from the YAML front matter (`css:` or `format.html.css:`),
// deduplicated and in document order.
export function getYamlCssSources(src: string): string[] {
  const y: any = parseYamlFrontMatter(src || '');
  const out: string[] = [];
  const push = (v: any) => {
    if (typeof v === 'string' && v) out.push(v);
    else if (Array.isArray(v)) v.forEach((x) => typeof x === 'string' && x && out.push(x));
  };
  push(y.css);
  push(y.format && y.format.html && y.format.html.css);
  return [...new Set(out)];
}

export function preprocessMarkdownColors(src: string): string {
  if (!src) return '';
  let result = src;

  // 1. [color:#FF6600](texto) or [color:red](texto)
  result = result.replace(/\[color:\s*([^\]]+)\]\(([\s\S]*?)\)/gi, (_match, color, text) => {
    return `<span style="color: ${color.trim()};">${text}</span>`;
  });

  // 2. [bg:#FEF08A](texto) or [bg:yellow](texto)
  result = result.replace(/\[bg:\s*([^\]]+)\]\(([\s\S]*?)\)/gi, (_match, bg, text) => {
    return `<mark style="background-color: ${bg.trim()}; color: #000000; padding: 2px 4px; border-radius: 3px; display: inline;">${text}</mark>`;
  });

  // 3. [#FF6600](texto) hex shorthand
  result = result.replace(/\[(#(?:[0-9a-fA-F]{3}){1,2})\]\(([\s\S]*?)\)/g, (_match, hex, text) => {
    return `<span style="color: ${hex};">${text}</span>`;
  });

  // 4. {#FF6600: texto} or {color:#FF6600 texto}
  result = result.replace(/\{(?:color:)?(#(?:[0-9a-fA-F]{3}){1,2}|[a-zA-Z]+)(?::|\s+)([\s\S]*?)\}/g, (_match, color, text) => {
    return `<span style="color: ${color.trim()};">${text}</span>`;
  });

  return result;
}

// `breaks` decides whether a single newline inside a paragraph is rendered as a
// <br> or reflowed as a space. Standard Markdown (CommonMark/GFM) says a
// newline inside a paragraph is a soft break and must be reflowed; only an
// explicit hard break (two trailing spaces or a backslash) emits a <br>.
// Document sources are hard-wrapped for readability, so turning this on
// shatters every paragraph at the wrap column.
function createParser(breaks: boolean): Marked {
  return new Marked({
    gfm: true,
    breaks,
    hooks: {
      preprocess(markdown: string) {
        return preprocessMarkdownColors(stripYamlFrontMatter(convertQuartoFencedDivs(markdown || '')));
      }
    }
  });
}

// Body content: paragraphs are hard-wrapped, so soft breaks must reflow.
export const markdownParser = createParser(false);

// Cover overlay: authored as one short line per field, so each line is a
// distinct entry and must stay on its own line.
export const coverParser = createParser(true);

// Configure custom renderer for code syntax highlighting and APA headings
const customRenderers = {
  renderer: {
    code(token: any): string {
      const lang = (token.lang || '').trim();
      const text = token.text || '';
      if (lang.toLowerCase() === 'mermaid') {
        return `<div class="mermaid">${text}</div>`;
      }
      const highlighted = highlightCode(text, lang);
      return `<pre class="language-${lang}"><code class="language-${lang}">${highlighted}</code></pre>`;
    },
    heading(token: any): string {
      const level = token.depth;
      let text = token.text || '';
      
      // Access current WP settings globally
      const settings = (typeof window !== 'undefined' && ((window as any).currentWpSettings || (window as any).currentUnemiSettings)) || {};
      const defaultLineBreak = level <= 3;
      const configKey = `h${level}LineBreak`;
      const lineBreak = settings[configKey] !== undefined ? !!settings[configKey] : defaultLineBreak;
      
      if (lineBreak) {
        return `<h${level} class="apa-heading apa-level${level}">${text}</h${level}>`;
      } else {
        // Run-in heading
        if (text && !/[.!?:]\s*$/.test(text)) {
          text += '.';
        }
        
        let innerHTML = text;
        if (level === 1) {
          innerHTML = `<strong>${text}</strong>`;
        } else if (level === 2) {
          innerHTML = `<strong>${text}</strong>`;
        } else if (level === 3) {
          innerHTML = `<strong><em>${text}</em></strong>`;
        } else if (level === 4) {
          innerHTML = `<strong>${text}</strong>`;
        } else if (level === 5) {
          innerHTML = `<strong><em>${text}</em></strong>`;
        } else {
          innerHTML = `<strong>${text}</strong>`;
        }
        
        return `<span class="apa-runin apa-level${level}">${innerHTML}</span>`;
      }
    }
  }
};

markdownParser.use(customRenderers as any);
coverParser.use(customRenderers as any);

export function extractCoverCss(tmpl: string): string {
  if (!tmpl) return '';
  if (tmpl.includes('<div class="cv-page">') || tmpl.includes('<style>')) {
    const styleMatch = tmpl.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    if (styleMatch) {
      return styleMatch[1].trim();
    }
  }
  return tmpl.trim();
}

export function compileCoverHtml(cssOrTemplate: string, markdown: string): string {
  const compiledMarkdown = String(coverParser.parse(markdown || ''));
  const raw = (cssOrTemplate || '').trim();

  if (raw.includes('{{content}}')) {
    return raw.replace('{{content}}', compiledMarkdown);
  }

  let cleanCss = raw.replace(/^<style[^>]*>/i, '').replace(/<\/style>$/i, '').trim();

  return `<style>\n${cleanCss}\n</style>\n<div class="cv-page">\n    <div class="cv-content">\n        ${compiledMarkdown}\n    </div>\n</div>`;
}

export function parseCoverSource(source: string): { css: string; markdown: string } {
  const cssMatch = source.match(/<!-- mdwp:cover-css -->([\s\S]*?)<!-- \/mdwp:cover-css -->/i);
  const markdownMatch = source.match(/<!-- mdwp:cover-markdown -->([\s\S]*?)(?:<!-- \/mdwp:cover-markdown -->|$)/i);
  return {
    css: cssMatch ? cssMatch[1].trim() : '',
    markdown: markdownMatch ? markdownMatch[1].trim() : source.trim(),
  };
}
