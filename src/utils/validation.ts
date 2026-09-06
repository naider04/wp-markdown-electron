/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface SyntaxIssue {
  startIndex: number;
  endIndex: number;
  type: 'html' | 'latex' | 'markdown';
  message: string;
  severity: 'warning' | 'error';
  token?: string;
}

export interface ValidationError {
  type: 'html' | 'latex' | 'markdown';
  message: string;
  severity: 'warning' | 'error';
  startIndex?: number;
  endIndex?: number;
}

const voidElements = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

/**
 * Validates Markdown, HTML, and LaTeX code to pinpoint exact error ranges and tokens.
 */
export function findSyntaxIssues(code: string): SyntaxIssue[] {
  if (!code) return [];

  const issues: SyntaxIssue[] = [];

  // --- 1. HTML Tag Matching & Analysis ---
  const tagRegex = /<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)(?:\s+[^<>\n]*?)?(\/?)>/g;
  let match: RegExpExecArray | null;
  const tagStack: { name: string; startIndex: number; endIndex: number; raw: string }[] = [];

  while ((match = tagRegex.exec(code)) !== null) {
    const isClosing = match[1] === '/';
    const tagName = match[2].toLowerCase();
    const isSelfClosing = match[3] === '/' || voidElements.has(tagName);
    const start = match.index;
    const end = match.index + match[0].length;
    const raw = match[0];

    if (isSelfClosing) {
      continue;
    }

    if (isClosing) {
      if (tagStack.length === 0) {
        issues.push({
          startIndex: start,
          endIndex: end,
          type: 'html',
          message: `Etiqueta de cierre </${tagName}> sin etiqueta de apertura`,
          severity: 'error',
          token: raw
        });
      } else {
        const top = tagStack[tagStack.length - 1];
        if (top.name === tagName) {
          tagStack.pop();
        } else {
          // Check if tagName is in the stack
          const foundIdx = tagStack.map(t => t.name).lastIndexOf(tagName);
          if (foundIdx !== -1) {
            // Unclosed tags between foundIdx and top
            while (tagStack.length > foundIdx + 1) {
              const unclosed = tagStack.pop()!;
              issues.push({
                startIndex: unclosed.startIndex,
                endIndex: unclosed.endIndex,
                type: 'html',
                message: `Etiqueta <${unclosed.name}> no cerrada antes de </${tagName}>`,
                severity: 'error',
                token: unclosed.raw
              });
            }
            tagStack.pop(); // Pop matching opening tag
          } else {
            // Orphan closing tag
            issues.push({
              startIndex: start,
              endIndex: end,
              type: 'html',
              message: `Etiqueta de cierre </${tagName}> no coincide con <${top.name}>`,
              severity: 'error',
              token: raw
            });
          }
        }
      }
    } else {
      tagStack.push({ name: tagName, startIndex: start, endIndex: end, raw });
    }
  }

  // Any tags left in the stack are unclosed
  while (tagStack.length > 0) {
    const unclosed = tagStack.pop()!;
    issues.push({
      startIndex: unclosed.startIndex,
      endIndex: unclosed.endIndex,
      type: 'html',
      message: `Etiqueta <${unclosed.name}> sin cerrar`,
      severity: 'error',
      token: unclosed.raw
    });
  }

  // --- 2. LaTeX Block Math ($$) Validation ---
  const doubleDollarMatches: { index: number; text: string }[] = [];
  const ddRegex = /\$\$/g;
  while ((match = ddRegex.exec(code)) !== null) {
    doubleDollarMatches.push({ index: match.index, text: '$$' });
  }

  if (doubleDollarMatches.length % 2 !== 0) {
    const last = doubleDollarMatches[doubleDollarMatches.length - 1];
    issues.push({
      startIndex: last.index,
      endIndex: last.index + 2,
      type: 'latex',
      message: 'Delimitador de bloque matemático ($$) sin cerrar',
      severity: 'error',
      token: '$$'
    });
  }

  // --- 3. LaTeX Environments (\begin{env} / \end{env}) ---
  const envRegex = /\\(begin|end)\{([a-zA-Z0-9*]+)\}/g;
  const envStack: { name: string; startIndex: number; endIndex: number; raw: string }[] = [];

  while ((match = envRegex.exec(code)) !== null) {
    const isEnd = match[1] === 'end';
    const envName = match[2];
    const start = match.index;
    const end = match.index + match[0].length;
    const raw = match[0];

    if (!isEnd) {
      envStack.push({ name: envName, startIndex: start, endIndex: end, raw });
    } else {
      if (envStack.length === 0) {
        issues.push({
          startIndex: start,
          endIndex: end,
          type: 'latex',
          message: `Estructura \\end{${envName}} sin \\begin{${envName}} correspondiente`,
          severity: 'error',
          token: raw
        });
      } else {
        const topEnv = envStack.pop()!;
        if (topEnv.name !== envName) {
          issues.push({
            startIndex: start,
            endIndex: end,
            type: 'latex',
            message: `Estructura \\end{${envName}} no coincide con \\begin{${topEnv.name}}`,
            severity: 'error',
            token: raw
          });
        }
      }
    }
  }

  while (envStack.length > 0) {
    const unclosedEnv = envStack.pop()!;
    issues.push({
      startIndex: unclosedEnv.startIndex,
      endIndex: unclosedEnv.endIndex,
      type: 'latex',
      message: `Estructura \\begin{${unclosedEnv.name}} sin cerrar con \\end{${unclosedEnv.name}}`,
      severity: 'error',
      token: unclosedEnv.raw
    });
  }

  // --- 4. Inline LaTeX ($) Validation ---
  // Remove block math $$ first to scan for single $
  const codeWithoutBlockMath = code.replace(/\$\$[\s\S]*?\$\$/g, (m) => ' '.repeat(m.length));
  const singleDollarRegex = /(^|[^\\])\$/g;
  const singleDollars: number[] = [];
  while ((match = singleDollarRegex.exec(codeWithoutBlockMath)) !== null) {
    const dollarPos = match.index + (match[1] ? match[1].length : 0);
    singleDollars.push(dollarPos);
  }

  if (singleDollars.length % 2 !== 0) {
    const lastDollar = singleDollars[singleDollars.length - 1];
    issues.push({
      startIndex: lastDollar,
      endIndex: lastDollar + 1,
      type: 'latex',
      message: 'Delimitador de fórmula matemática ($) incompleto o sin cerrar',
      severity: 'warning',
      token: '$'
    });
  }

  return issues;
}

/**
 * Backward-compatible helper for general validation checks
 */
export function validateContent(code: string): ValidationError[] {
  const issues = findSyntaxIssues(code);
  return issues.map(issue => ({
    type: issue.type,
    message: issue.message,
    severity: issue.severity,
    startIndex: issue.startIndex,
    endIndex: issue.endIndex
  }));
}
