/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Prism from 'prismjs';
import { findSyntaxIssues, SyntaxIssue } from './validation';
import { isLightModeEnabled } from './markdownParser';

// Ensure Prism components are registered
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-latex';

export type EditorTheme = 'dark-modern' | 'neon-cyber' | 'warm-ember' | 'monokai' | 'forest';

export interface ColorPreset {
  name: string;
  color: string;
  bg?: string;
  label: string;
}

export const TEXT_COLOR_PRESETS: ColorPreset[] = [
  { name: 'Naranja UNEMI', color: '#FF6600', label: 'Naranja' },
  { name: 'Azul Académico', color: '#004080', label: 'Azul' },
  { name: 'Rojo Carmesí', color: '#DC2626', label: 'Rojo' },
  { name: 'Verde Esmeralda', color: '#16A34A', label: 'Verde' },
  { name: 'Púrpura / Violeta', color: '#9333EA', label: 'Púrpura' },
  { name: 'Ámbar Dorado', color: '#D97706', label: 'Ámbar' },
  { name: 'Cian Celeste', color: '#0284C7', label: 'Cian' },
  { name: 'Rosa Vivo', color: '#DB2777', label: 'Rosa' },
  { name: 'Gris Grafito', color: '#64748B', label: 'Gris' },
];

export const HIGHLIGHT_BG_PRESETS: ColorPreset[] = [
  { name: 'Amarillo', color: '#000000', bg: '#FEF08A', label: 'Amarillo' },
  { name: 'Verde Menta', color: '#000000', bg: '#BBF7D0', label: 'Verde' },
  { name: 'Azul Claro', color: '#000000', bg: '#BAE6FD', label: 'Azul' },
  { name: 'Naranja Pastel', color: '#000000', bg: '#FED7AA', label: 'Naranja' },
  { name: 'Rosa Pastel', color: '#000000', bg: '#FBCFE8', label: 'Rosa' },
  { name: 'Púrpura Claro', color: '#000000', bg: '#E9D5FF', label: 'Púrpura' },
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Custom Markdown + LaTeX + Color syntax engine with integrated inline error squiggles.
 */
export function highlightMarkdownCode(code: string, theme: EditorTheme = 'dark-modern'): string {
  if (!code) return '';

  // Light mode: return the raw (HTML-escaped) text without any token coloring.
  if (isLightModeEnabled()) {
    return code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Skip the expensive issue scan for very large snippets (squiggles are a
  // convenience indicator, not worth freezing the preview).
  const issues = code.length > 150000 ? [] : findSyntaxIssues(code);
  
  // Calculate line offset intervals to map global syntax issues to individual lines
  const lines = code.split('\n');
  let currentOffset = 0;
  let inCodeBlock = false;
  let codeBlockLang = '';
  let inDisplayMathBlock = false;

  const highlightedLines = lines.map((line) => {
    const lineStart = currentOffset;
    const lineEnd = currentOffset + line.length;
    currentOffset = lineEnd + 1; // +1 for newline character

    // Filter issues on this specific line
    const lineIssues = issues.filter(
      (issue) => issue.startIndex >= lineStart && issue.startIndex <= lineEnd
    );

    // Code block fence check
    const fenceMatch = line.match(/^(\s*)(```|~~~)(.*)$/);
    if (fenceMatch) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = (fenceMatch[3] || '').trim().toLowerCase();
        const leading = escapeHtml(fenceMatch[1]);
        const fence = escapeHtml(fenceMatch[2]);
        const lang = escapeHtml(fenceMatch[3]);
        return `${leading}<span class="md-token-fence font-bold text-sky-400">${fence}</span><span class="md-token-lang text-amber-400 font-semibold">${lang}</span>`;
      } else {
        inCodeBlock = false;
        codeBlockLang = '';
        return `<span class="md-token-fence font-bold text-sky-400">${escapeHtml(line)}</span>`;
      }
    }

    if (inCodeBlock) {
      let highlightedCode = escapeHtml(line);
      const targetLang = codeBlockLang || 'javascript';
      if (Prism.languages[targetLang]) {
        try {
          highlightedCode = Prism.highlight(line, Prism.languages[targetLang], targetLang);
        } catch {
          // fallback
        }
      }
      return `<span class="md-token-code-block text-emerald-300/90">${highlightedCode}</span>`;
    }

    // Multi-line Display Math ($$...$$ across multiple lines)
    const trimmed = line.trim();
    if (trimmed === '$$') {
      if (!inDisplayMathBlock) {
        inDisplayMathBlock = true;
        return `<span class="md-token-math-display bg-purple-950/60 text-purple-400 font-bold">$$</span>`;
      } else {
        inDisplayMathBlock = false;
        return `<span class="md-token-math-display bg-purple-950/60 text-purple-400 font-bold">$$</span>`;
      }
    }

    if (inDisplayMathBlock) {
      return `<span class="md-token-math-display-body bg-purple-950/40 text-purple-200">${escapeHtml(line)}</span>`;
    }

    // Process line as Markdown with line-specific issues highlighted in red
    return highlightMarkdownLine(line, lineStart, lineIssues);
  });

  return highlightedLines.join('\n');
}

/**
 * Highlights a single line of Markdown including headings, lists, quotes, math, colors, bold, italic,
 * and wraps detected syntax errors in red squiggly underline tokens.
 */
function highlightMarkdownLine(line: string, lineStart: number, lineIssues: SyntaxIssue[]): string {
  if (!line) return '';

  // 1. Headings (# H1, ## H2, ### H3, etc.)
  const headingMatch = line.match(/^(\s{0,3})(#{1,6})(\s+)(.*)$/);
  if (headingMatch) {
    const space = headingMatch[1];
    const hashes = headingMatch[2];
    const sep = headingMatch[3];
    const content = headingMatch[4];
    const level = hashes.length;

    let hashColor = 'text-amber-500 font-black';
    let textColor = 'text-amber-300 font-bold';

    if (level === 1) {
      hashColor = 'text-orange-500 font-black';
      textColor = 'text-orange-200 font-bold';
    } else if (level === 2) {
      hashColor = 'text-sky-500 font-black';
      textColor = 'text-sky-200 font-bold';
    } else if (level === 3) {
      hashColor = 'text-emerald-500 font-black';
      textColor = 'text-emerald-200 font-semibold';
    } else if (level === 4) {
      hashColor = 'text-purple-400 font-black';
      textColor = 'text-purple-200 font-medium';
    } else {
      hashColor = 'text-rose-400 font-black';
      textColor = 'text-rose-200 font-medium';
    }

    const contentStartOffset = lineStart + space.length + hashes.length + sep.length;
    const processedContent = highlightInlineMarkdown(content, contentStartOffset, lineIssues);
    return `${space}<span class="md-token-h-hash ${hashColor}">${hashes}</span>${sep}<span class="md-token-h-text ${textColor}">${processedContent}</span>`;
  }

  // 2. Blockquotes (> quote)
  const quoteMatch = line.match(/^(\s{0,3})(>+)(\s*)(.*)$/);
  if (quoteMatch) {
    const space = quoteMatch[1];
    const marker = quoteMatch[2];
    const sep = quoteMatch[3];
    const content = quoteMatch[4];
    const contentStartOffset = lineStart + space.length + marker.length + sep.length;
    const processed = highlightInlineMarkdown(content, contentStartOffset, lineIssues);
    return `${space}<span class="md-token-quote-marker text-slate-500 font-black">${escapeHtml(marker)}</span>${sep}<span class="md-token-quote text-slate-300/90 italic">${processed}</span>`;
  }

  // 3. Lists (- item, * item, + item, 1. item)
  const listMatch = line.match(/^(\s*)([-*+]|\d+\.)(\s+)(.*)$/);
  if (listMatch) {
    const indent = listMatch[1];
    const bullet = listMatch[2];
    const sep = listMatch[3];
    const content = listMatch[4];
    const isOrdered = /^\d+\./.test(bullet);
    const bulletColor = isOrdered ? 'text-amber-400 font-bold' : 'text-orange-400 font-black';
    const contentStartOffset = lineStart + indent.length + bullet.length + sep.length;
    const processed = highlightInlineMarkdown(content, contentStartOffset, lineIssues);
    return `${indent}<span class="md-token-list-bullet ${bulletColor}">${escapeHtml(bullet)}</span>${sep}${processed}`;
  }

  // 4. Horizontal rule (---, ***, ___)
  if (/^(\s*)([-*_]){3,}\s*$/.test(line)) {
    return `<span class="md-token-hr text-orange-500/70 font-bold">${escapeHtml(line)}</span>`;
  }

  // 5. Table rows (| a | b |)
  if (/^\s*\|.*\|\s*$/.test(line)) {
    if (/^\s*\|[\s-:|]+\|\s*$/.test(line)) {
      return `<span class="md-token-table-sep text-slate-600 font-mono">${escapeHtml(line)}</span>`;
    }
    const parts = line.split('|');
    let partOffset = lineStart;
    const highlightedParts = parts.map((part, idx) => {
      const partHtml = highlightInlineMarkdown(part, partOffset, lineIssues);
      partOffset += part.length + 1; // +1 for '|'
      if (idx === 0 && part === '') return '';
      if (idx === parts.length - 1 && part === '') return '';
      return partHtml;
    });
    return highlightedParts.join('<span class="md-token-table-pipe text-orange-500/60 font-bold">|</span>');
  }

  // Regular line with inline markup & syntax error markings
  return highlightInlineMarkdown(line, lineStart, lineIssues);
}

/**
 * Highlights inline Markdown tokens and injects red squiggly error classes on syntax issues
 */
function highlightInlineMarkdown(text: string, baseOffset: number, lineIssues: SyntaxIssue[]): string {
  if (!text) return '';

  const placeholders: { id: string; html: string }[] = [];
  let tokenIdx = 0;

  const createPlaceholder = (html: string): string => {
    // Use pure Unicode Private Use Area codepoints without any underscores, asterisks, or letters
    // to strictly prevent regex collisions with Markdown italic (_..._), bold, tags, or words
    const id = `\uE000${tokenIdx++}\uE001`;
    placeholders.push({ id, html });
    return id;
  };

  let working = text;

  // Helper to wrap text with error squiggles if it overlaps any syntax issue
  const wrapErrorIfMatch = (rawToken: string, matchIndex: number, formattedHtml: string): string => {
    const tokenStart = baseOffset + matchIndex;
    const tokenEnd = tokenStart + rawToken.length;

    // Check if any issue falls within or matches this token
    const matchingIssue = lineIssues.find(
      (iss) => (iss.startIndex >= tokenStart && iss.startIndex < tokenEnd) ||
               (iss.endIndex > tokenStart && iss.endIndex <= tokenEnd) ||
               (iss.startIndex <= tokenStart && iss.endIndex >= tokenEnd)
    );

    if (matchingIssue) {
      const isErr = matchingIssue.severity === 'error';
      const cssClass = isErr ? 'syntax-error-token' : 'syntax-warning-token';
      const titleAttr = `[${matchingIssue.severity.toUpperCase()}] ${escapeHtml(matchingIssue.message)}`;
      return `<span class="${cssClass}" title="${titleAttr}">${formattedHtml}</span>`;
    }

    return formattedHtml;
  };

  // 1. Math expressions $$...$$ (display) and $...$ (inline)
  working = working.replace(/\$\$([\s\S]+?)\$\$/g, (match, math, offset) => {
    const inner = escapeHtml(math);
    const html = `<span class="md-token-math-display bg-purple-950/60 text-purple-300"><span class="text-purple-400 font-bold">$$</span>${inner}<span class="text-purple-400 font-bold">$$</span></span>`;
    const wrapped = wrapErrorIfMatch(match, offset, html);
    return createPlaceholder(wrapped);
  });

  working = working.replace(/(^|[^\\])\$([^\$\n]+?)\$/g, (match, prefix, math, offset) => {
    const inner = escapeHtml(math);
    const html = `<span class="md-token-math-inline bg-emerald-950/60 text-emerald-300"><span class="text-emerald-500 font-bold">$</span>${inner}<span class="text-emerald-500 font-bold">$</span></span>`;
    const tokenStr = match.substring(prefix.length);
    const matchOffset = offset + prefix.length;
    const wrapped = wrapErrorIfMatch(tokenStr, matchOffset, html);
    return `${prefix}${createPlaceholder(wrapped)}`;
  });

  // 2. HTML span with inline color style: <span style="...">...</span>
  working = working.replace(
    /<span\s+style=(["'])([^"']*?color\s*:\s*([^;"'>]+)[^"']*?)\1\s*>([\s\S]*?)<\/span>/gi,
    (match, quote, styleStr, colorVal, content, offset) => {
      const colorClean = colorVal.trim();
      const escapedContent = highlightInlineMarkdownInner(content);
      const escapedStyle = escapeHtml(styleStr);
      const html = `<span class="md-token-html-tag text-slate-500">&lt;span style="${escapedStyle}"&gt;</span><span class="md-token-colored-text font-medium" style="color: ${colorClean}; text-shadow: 0 0 1px rgba(0,0,0,0.5);">${escapedContent}</span><span class="md-token-html-tag text-slate-500">&lt;/span&gt;</span>`;
      const wrapped = wrapErrorIfMatch(match, offset, html);
      return createPlaceholder(wrapped);
    }
  );

  // HTML font color: <font color="...">...</font>
  working = working.replace(
    /<font\s+color=(["'])([^"']+)\1\s*>([\s\S]*?)<\/font>/gi,
    (match, quote, colorVal, content, offset) => {
      const colorClean = colorVal.trim();
      const escapedContent = highlightInlineMarkdownInner(content);
      const html = `<span class="md-token-html-tag text-slate-500">&lt;font color="${escapeHtml(colorClean)}"&gt;</span><span class="md-token-colored-text font-medium" style="color: ${colorClean};">${escapedContent}</span><span class="md-token-html-tag text-slate-500">&lt;/font&gt;</span>`;
      const wrapped = wrapErrorIfMatch(match, offset, html);
      return createPlaceholder(wrapped);
    }
  );

  // 3. Markdown custom color shorthand: [color:#FF6600](texto)
  working = working.replace(/\[color:\s*([^\]]+)\]\(([\s\S]*?)\)/gi, (match, colorVal, content, offset) => {
    const colorClean = colorVal.trim();
    const escapedContent = highlightInlineMarkdownInner(content);
    const html = `<span class="md-token-color-bracket text-slate-500">[color:<span class="font-bold" style="color: ${colorClean};">${escapeHtml(colorClean)}</span>](</span><span class="font-semibold" style="color: ${colorClean};">${escapedContent}</span><span class="md-token-color-bracket text-slate-500">)</span>`;
    const wrapped = wrapErrorIfMatch(match, offset, html);
    return createPlaceholder(wrapped);
  });

  // Markdown custom background shorthand: [bg:#FEF08A](texto)
  working = working.replace(/\[bg:\s*([^\]]+)\]\(([\s\S]*?)\)/gi, (match, bgVal, content, offset) => {
    const bgClean = bgVal.trim();
    const escapedContent = highlightInlineMarkdownInner(content);
    const html = `<span class="md-token-color-bracket text-slate-500">[bg:<span class="font-bold text-amber-300">${escapeHtml(bgClean)}</span>](</span><span class="font-semibold text-slate-900" style="background-color: ${bgClean};">${escapedContent}</span><span class="md-token-color-bracket text-slate-500">)</span>`;
    const wrapped = wrapErrorIfMatch(match, offset, html);
    return createPlaceholder(wrapped);
  });

  // Markdown hex shorthand: [#FF6600](texto)
  working = working.replace(/\[(#(?:[0-9a-fA-F]{3}){1,2})\]\(([\s\S]*?)\)/g, (match, hexVal, content, offset) => {
    const escapedContent = highlightInlineMarkdownInner(content);
    const html = `<span class="md-token-color-bracket text-slate-500">[<span class="font-bold" style="color: ${hexVal};">${hexVal}</span>](</span><span class="font-semibold" style="color: ${hexVal};">${escapedContent}</span><span class="md-token-color-bracket text-slate-500">)</span>`;
    const wrapped = wrapErrorIfMatch(match, offset, html);
    return createPlaceholder(wrapped);
  });

  // 4. Inline code `code`
  working = working.replace(/`([^`\n]+)`/g, (match, codeText, offset) => {
    const html = `<span class="md-token-inline-code bg-slate-800 text-cyan-300"><span class="text-cyan-500 font-bold">\`</span>${escapeHtml(codeText)}<span class="text-cyan-500 font-bold">\`</span></span>`;
    const wrapped = wrapErrorIfMatch(match, offset, html);
    return createPlaceholder(wrapped);
  });

  // 5. Images ![alt](url)
  working = working.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, url, offset) => {
    const html = `<span class="md-token-image text-pink-400 font-medium">![<span class="text-pink-200">${escapeHtml(alt)}</span>](<span class="text-slate-400 underline">${escapeHtml(url)}</span>)</span>`;
    const wrapped = wrapErrorIfMatch(match, offset, html);
    return createPlaceholder(wrapped);
  });

  // 6. Links [text](url)
  working = working.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, url, offset) => {
    const html = `<span class="md-token-link text-sky-400 font-medium">[<span class="text-sky-200">${escapeHtml(linkText)}</span>](<span class="text-slate-400 underline">${escapeHtml(url)}</span>)</span>`;
    const wrapped = wrapErrorIfMatch(match, offset, html);
    return createPlaceholder(wrapped);
  });

  // 7. Bold **text** or __text__
  working = working.replace(/(\*\*|__)(.*?)\1/g, (match, delim, inner, offset) => {
    const html = `<span class="md-token-bold text-amber-200 font-bold"><span class="text-amber-500 font-bold">${escapeHtml(delim)}</span>${escapeHtml(inner)}<span class="text-amber-500 font-bold">${escapeHtml(delim)}</span></span>`;
    const wrapped = wrapErrorIfMatch(match, offset, html);
    return createPlaceholder(wrapped);
  });

  // 8. Italic *text* or _text_
  working = working.replace(/(^|[^\*\_])(\*|_)([^\*_\n]+?)\2([^\*\_]|$)/g, (match, p1, delim, inner, p2, offset) => {
    const html = `<span class="md-token-italic text-purple-200 italic"><span class="text-purple-400 not-italic font-bold">${escapeHtml(delim)}</span>${escapeHtml(inner)}<span class="text-purple-400 not-italic font-bold">${escapeHtml(delim)}</span></span>`;
    const tokenStr = match.substring(p1.length, match.length - p2.length);
    const matchOffset = offset + p1.length;
    const wrapped = wrapErrorIfMatch(tokenStr, matchOffset, html);
    return `${p1}${createPlaceholder(wrapped)}${p2}`;
  });

  // 9. Strikethrough ~~text~~
  working = working.replace(/~~(.*?)~~/g, (match, inner, offset) => {
    const html = `<span class="md-token-strike line-through text-slate-500"><span class="text-slate-600 no-underline font-bold">~~</span>${escapeHtml(inner)}<span class="text-slate-600 no-underline font-bold">~~</span></span>`;
    const wrapped = wrapErrorIfMatch(match, offset, html);
    return createPlaceholder(wrapped);
  });

  // 10. General HTML tags (including orphaned/unclosed ones) <...>, </...>
  working = working.replace(/<\/?[a-zA-Z][a-zA-Z0-9:-]*(?:\s+[^<>\n]*?)?\/?>/g, (match, offset) => {
    const html = `<span class="md-token-generic-tag text-indigo-400 font-mono font-medium">${escapeHtml(match)}</span>`;
    const wrapped = wrapErrorIfMatch(match, offset, html);
    return createPlaceholder(wrapped);
  });

  // 11. Individual orphaned/unclosed characters that have issues (e.g. standalone unmatched $, $$, or unclosed tags)
  for (const issue of lineIssues) {
    const relStart = issue.startIndex - baseOffset;
    const relEnd = issue.endIndex - baseOffset;
    if (relStart >= 0 && relEnd <= working.length && issue.token) {
      const substr = working.substring(relStart, relEnd);
      // If it hasn't been tokenized into a placeholder yet
      if (substr === issue.token) {
        const isErr = issue.severity === 'error';
        const cssClass = isErr ? 'syntax-error-token' : 'syntax-warning-token';
        const titleAttr = `[${issue.severity.toUpperCase()}] ${escapeHtml(issue.message)}`;
        const errHtml = `<span class="${cssClass}" title="${titleAttr}">${escapeHtml(substr)}</span>`;
        const ph = createPlaceholder(errHtml);
        working = working.substring(0, relStart) + ph + working.substring(relEnd);
      }
    }
  }

  // Escape any remaining plain text
  let result = escapeHtml(working);

  // Restore placeholders safely in reverse order using a function callback to prevent $ replacement quirks
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 5) {
    changed = false;
    iterations++;
    for (let i = placeholders.length - 1; i >= 0; i--) {
      const placeholder = placeholders[i];
      if (result.includes(placeholder.id)) {
        result = result.replaceAll(placeholder.id, () => placeholder.html);
        changed = true;
      }
    }
  }

  return result;
}

function highlightInlineMarkdownInner(text: string): string {
  return escapeHtml(text)
    .replace(/(\*\*|__)(.*?)\1/g, '<strong class="font-bold text-amber-200">$2</strong>')
    .replace(/(\*|_)(.*?)\1/g, '<em class="italic text-purple-200">$2</em>');
}
