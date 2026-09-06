import katex from 'katex';
import { mathmlToOmml } from './ommlConverter';
import { markdownParser } from '../utils/markdownParser';
import { HTMLBlock } from '../types';

/**
 * Converts a LaTeX math expression to an OMML XML string wrapped in Word conditional comment.
 */
export function latexToOmml(latex: string, isDisplay: boolean): string | null {
  if (!latex || !latex.trim()) return null;
  try {
    const katexHtml = katex.renderToString(latex.trim(), {
      displayMode: isDisplay,
      throwOnError: false,
      output: 'htmlAndMathml',
    });
    const parser = new DOMParser();
    const doc = parser.parseFromString(katexHtml, 'text/html');
    const mathEl = doc.querySelector('.katex-mathml math') || doc.querySelector('math');
    if (mathEl) {
      return mathmlToOmml(mathEl.outerHTML, isDisplay);
    }
  } catch (e) {
    console.error('Error converting LaTeX to OMML:', e);
  }
  return null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Replaces all math expressions ($$...$$, \[...\], $...$, \(...\)) with unique alphanumeric placeholders,
 * converts each math expression to native Word OMML XML, and returns the modified text along with the math mapping.
 */
export function extractMathAndReplaceWithPlaceholders(text: string): {
  processedText: string;
  mathMap: Map<string, string>;
} {
  const mathMap = new Map<string, string>();
  let counter = 0;
  let result = '';
  let index = 0;

  while (index < text.length) {
    const doubleDollarIdx = text.indexOf('$$', index);
    const bracketIdx = text.indexOf('\\[', index);
    const parenIdx = text.indexOf('\\(', index);
    const singleDollarIdx = text.indexOf('$', index);

    const candidates = [
      { idx: doubleDollarIdx, type: 'double_dollar' as const },
      { idx: bracketIdx, type: 'bracket' as const },
      { idx: parenIdx, type: 'paren' as const },
      { idx: singleDollarIdx, type: 'single_dollar' as const },
    ]
      .filter((c) => c.idx !== -1)
      .sort((a, b) => a.idx - b.idx);

    if (candidates.length === 0) {
      result += text.slice(index);
      break;
    }

    const first = candidates[0];

    // Check if single dollar is escaped: \$
    if (first.type === 'single_dollar' && first.idx > 0 && text[first.idx - 1] === '\\') {
      result += text.slice(index, first.idx + 1);
      index = first.idx + 1;
      continue;
    }

    result += text.slice(index, first.idx);

    let startDelimLen = 1;
    let endDelim = '$';
    let isDisplay = false;

    if (first.type === 'double_dollar') {
      startDelimLen = 2;
      endDelim = '$$';
      isDisplay = true;
    } else if (first.type === 'bracket') {
      startDelimLen = 2;
      endDelim = '\\]';
      isDisplay = true;
    } else if (first.type === 'paren') {
      startDelimLen = 2;
      endDelim = '\\)';
      isDisplay = false;
    } else if (first.type === 'single_dollar') {
      startDelimLen = 1;
      endDelim = '$';
      isDisplay = false;
    }

    const contentStart = first.idx + startDelimLen;
    const nextIndex = text.indexOf(endDelim, contentStart);

    if (nextIndex === -1) {
      result += text.slice(first.idx, first.idx + startDelimLen);
      index = first.idx + startDelimLen;
      continue;
    }

    const latex = text.slice(contentStart, nextIndex).trim();

    if (!latex) {
      result += text.slice(first.idx, nextIndex + endDelim.length);
      index = nextIndex + endDelim.length;
      continue;
    }

    const placeholder = `WORDMATHPLACEHOLDER${counter++}`;
    const ommlXml = latexToOmml(latex, isDisplay);

    let ommlHtml = '';
    if (ommlXml) {
      ommlHtml = `<!--[if gte msEquation 12]>${ommlXml}<![endif]-->`;
    } else {
      ommlHtml = `<code>${escapeHtml(latex)}</code>`;
    }

    mathMap.set(placeholder, ommlHtml);
    result += placeholder;
    index = nextIndex + endDelim.length;
  }

  return { processedText: result, mathMap };
}

/**
 * Converts a markdown block (or HTML block) into Word-compatible HTML
 * with native OMML equations, tables, headings, code, and lists preserved.
 */
export function convertBlockToWordHtml(blockCode: string, isMarkdown = true): string {
  if (!blockCode || !blockCode.trim()) return '';

  const { processedText, mathMap } = extractMathAndReplaceWithPlaceholders(blockCode);

  let compiledHtml = '';
  if (isMarkdown) {
    compiledHtml = String(markdownParser.parse(processedText));
  } else {
    compiledHtml = processedText;
  }

  mathMap.forEach((ommlHtml, placeholder) => {
    compiledHtml = compiledHtml.replaceAll(placeholder, ommlHtml);
  });

  return compiledHtml;
}

/**
 * Converts all blocks into a full HTML document styled for Word export.
 */
export function buildWordDocumentHtmlFromBlocks(blocks: HTMLBlock[]): string {
  const blocksHtml = blocks
    .map((b) => convertBlockToWordHtml(b.code, b.isMarkdown !== false))
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    font-family: 'Calibri', 'Times New Roman', serif;
    font-size: 11pt;
    line-height: 1.15;
    color: #000000;
  }
  h1 { font-size: 18pt; font-weight: bold; margin-top: 12pt; margin-bottom: 6pt; color: #1f4e78; }
  h2 { font-size: 14pt; font-weight: bold; margin-top: 12pt; margin-bottom: 4pt; color: #2e75b6; }
  h3 { font-size: 12pt; font-weight: bold; margin-top: 6pt; margin-bottom: 2pt; color: #1f4e78; }
  h4 { font-size: 11pt; font-weight: bold; margin-top: 6pt; margin-bottom: 2pt; color: #2e75b6; }
  p, p.MsoNormal { margin-top: 0; margin-bottom: 6pt; }
  table {
    border-collapse: collapse;
    width: 100%;
    margin-top: 6pt;
    margin-bottom: 12pt;
  }
  table, th, td {
    border: 1px solid #bfbfbf;
  }
  th {
    background-color: #f2f2f2;
    font-weight: bold;
    padding: 6pt 8pt;
    text-align: left;
  }
  td {
    padding: 6pt 8pt;
    text-align: left;
    vertical-align: top;
  }
  ul, ol {
    margin-top: 0;
    margin-bottom: 6pt;
    padding-left: 20pt;
  }
  li {
    margin-bottom: 3pt;
  }
  blockquote {
    border-left: 3.5pt solid #2e75b6;
    background-color: #f8f9fa;
    margin: 6pt 0 12pt 0;
    padding: 6pt 10pt;
    color: #4a4a4a;
    font-style: italic;
  }
  code {
    font-family: 'Consolas', 'Courier New', monospace;
    background-color: #f2f2f2;
    padding: 1pt 3pt;
    font-size: 10pt;
    border-radius: 2px;
  }
  pre {
    font-family: 'Consolas', 'Courier New', monospace;
    background-color: #f2f2f2;
    padding: 8pt;
    font-size: 10pt;
    border: 1px solid #e0e0e0;
    margin-bottom: 12pt;
    white-space: pre-wrap;
  }
  img {
    max-width: 100%;
    height: auto;
    margin: 6pt 0;
  }
  .page-break {
    page-break-before: always;
  }
</style>
</head>
<body>
<!--StartFragment-->
${blocksHtml}
<!--EndFragment-->
</body>
</html>`;
}

/**
 * Copies all blocks in Word-compatible HTML format to the clipboard.
 */
export async function copyToWordClipboard(blocks: HTMLBlock[]): Promise<boolean> {
  const allMarkdown = blocks.map((b) => b.code).join('\n\n');
  const fullDocument = buildWordDocumentHtmlFromBlocks(blocks);

  try {
    if (navigator.clipboard && window.ClipboardItem) {
      const htmlBlob = new Blob([fullDocument], { type: 'text/html' });
      const textBlob = new Blob([allMarkdown], { type: 'text/plain' });
      const item = new ClipboardItem({
        'text/html': htmlBlob,
        'text/plain': textBlob,
      });
      await navigator.clipboard.write([item]);
      return true;
    }
  } catch (err) {
    console.warn('ClipboardItem write failed, fallback to copy event:', err);
  }

  return new Promise((resolve) => {
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      if (e.clipboardData) {
        e.clipboardData.setData('text/html', fullDocument);
        e.clipboardData.setData('text/plain', allMarkdown);
      }
      document.removeEventListener('copy', handleCopy);
      resolve(true);
    };

    document.addEventListener('copy', handleCopy);
    try {
      const successful = document.execCommand('copy');
      if (!successful) {
        document.removeEventListener('copy', handleCopy);
        resolve(false);
      }
    } catch (err) {
      document.removeEventListener('copy', handleCopy);
      resolve(false);
    }
  });
}
