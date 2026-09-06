/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useEffect } from 'react';
import { markdownParser } from '../utils/markdownParser';
import katex from 'katex';
import { mathmlToOmml } from '../lib/ommlConverter';
import { CoverConfig, PageSettings, UploadedFile, HTMLBlock, BibliographyItem } from '../types';
import CoverPage from './CoverPage';
import PageTemplate from './PageTemplate';
import { getAPACitationLabel, formatAPABibliographyItem, extractAPAYear, assignYearSuffixes, formatLocator } from '../utils/apaFormatter';
import { formatFontSize } from '../utils/fontUtils';
import { useLanguage } from '../i18n/LanguageContext';
import { FileText, Layers, RefreshCw, ZoomIn, ZoomOut, FolderArchive, Maximize2, Minimize2, Copy, Check, ExternalLink, Eye, EyeOff, AlertCircle, Monitor, Play, RotateCcw } from 'lucide-react';

interface DocumentPreviewProps {
  cover: CoverConfig;
  settings: PageSettings;
  htmlContent: string;
  setPageCount: (cnt: number) => void;
  onExportZIP: () => void;
  isFullscreen: boolean;
  setIsFullscreen: (v: boolean) => void;
  onCoverChange?: (field: keyof CoverConfig, val: any) => void;
  uploadedFiles?: UploadedFile[];
  htmlBlocks?: HTMLBlock[];
  bibliography?: BibliographyItem[];
  isCompiling?: boolean;
  compiledCover?: CoverConfig;
  compiledSettings?: PageSettings;
  compiledHtmlContent?: string;
  compiledUploadedFiles?: UploadedFile[];
  compiledHtmlBlocks?: HTMLBlock[];
  compiledBibliography?: BibliographyItem[];
  exportFileName?: string;
  projectFolder?: string | null;
  bridge?: any;
  externalCss?: string;
}

// How many expensive measurement/layout passes are allowed to run on the main
// thread before yielding control back to the browser event loop.
const PAGINATION_MEASURE_BATCH = 24;

// Above this raw HTML size the greedy overflow-detection scan (which forces a
// layout read on every element of every page) is skipped to avoid freezing a
// freshly pasted large document.
const OVERFLOW_SCAN_SKIP_THRESHOLD = 120000;

class PaginationCancelled extends Error {
  constructor() {
    super('Pagination cancelled because the content changed again.');
    this.name = 'PaginationCancelled';
  }
}

// Cooperative scheduler so heavy work is chopped into small chunks and the UI
// keeps repainting / accepting input between chunks.
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    const scheduler = (window as any)?.scheduler;
    if (scheduler && typeof scheduler.yield === 'function') {
      scheduler.yield().then(resolve).catch(() => setTimeout(resolve, 0));
    } else {
      setTimeout(resolve, 0);
    }
  });
}

interface HeadingItem {
  text: string;
  page: number;
  level: number;
  pageRelative?: number;
}

const BASE_TOC_CSS = `
/* Table of Contents base layout styles */
.toc-container {
  margin: 0;
  padding: 0;
}
.toc-header {
  margin-top: 0;
  margin-bottom: 24px;
  font-size: 16px;
  font-weight: bold;
  text-align: center;
}
.toc-list {
  list-style-type: none;
  padding-left: 0;
  margin: 0;
}
.toc-item {
  display: flex;
  align-items: flex-end;
  margin-bottom: 12px;
}
.toc-item::before {
  content: none;
}
.toc-title {
  white-space: nowrap;
  flex-shrink: 0;
}
.toc-container .toc-dots,
.toc-item .toc-dots {
  flex-grow: 1;
  border-bottom: 1px dotted black !important;
  margin: 0 8px;
}
.toc-page {
  font-weight: bold;
  flex-shrink: 0;
}
`;

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const mathRenderCache = new Map<string, string>();

function renderKaTeXWithOMML(mathContent: string, isDisplay: boolean, isContinuous = false): string {
  const cacheKey = `${isDisplay ? 'D' : 'I'}:${isContinuous ? 'C' : 'P'}:${mathContent}`;
  if (mathRenderCache.has(cacheKey)) {
    return mathRenderCache.get(cacheKey)!;
  }

  let rendered = "";
  try {
    rendered = katex.renderToString(mathContent, {
      displayMode: isDisplay,
      throwOnError: false
    });
  } catch (err) {
    const errHtml = `<span class="text-red-500 font-mono text-[10px]" title="${escapeHtml(String(err))}">[Math Error: ${escapeHtml(mathContent)}]</span>`;
    return errHtml;
  }

  if (isContinuous) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(rendered, 'text/html');
      const mathEl = doc.querySelector('math');
      if (mathEl) {
        const ommlXml = mathmlToOmml(mathEl.outerHTML, isDisplay);
        if (ommlXml) {
          const katexSpan = doc.querySelector('.katex');
          if (katexSpan) {
            const commentStr = `<!--[if gte msEquation 12]>${ommlXml}<![endif]-->`;
            katexSpan.insertAdjacentHTML('afterbegin', commentStr);
            rendered = doc.body.innerHTML;
          }
        }
      }
    } catch (e) {
      // Fallback
    }
  }

  if (mathRenderCache.size > 2000) {
    mathRenderCache.clear();
  }
  mathRenderCache.set(cacheKey, rendered);

  return rendered;
}

function parseTextAndRenderMath(text: string, isContinuous = false): string {
  let result = "";
  let index = 0;
  
  while (index < text.length) {
    let nearestIdx = -1;
    let delimType: 'double_dollar' | 'bracket' | 'single_dollar' | 'paren' | null = null;
    
    const doubleDollarIdx = text.indexOf('$$', index);
    const bracketIdx = text.indexOf('\\[', index);
    const parenIdx = text.indexOf('\\(', index);
    const singleDollarIdx = text.indexOf('$', index);
    
    let minIdx = Infinity;
    
    if (doubleDollarIdx !== -1 && doubleDollarIdx < minIdx) {
      minIdx = doubleDollarIdx;
      delimType = 'double_dollar';
    }
    if (bracketIdx !== -1 && bracketIdx < minIdx) {
      minIdx = bracketIdx;
      delimType = 'bracket';
    }
    if (parenIdx !== -1 && parenIdx < minIdx) {
      minIdx = parenIdx;
      delimType = 'paren';
    }
    if (singleDollarIdx !== -1 && singleDollarIdx < minIdx) {
      if (singleDollarIdx === doubleDollarIdx) {
        // Handled by double_dollar
      } else {
        const isEscaped = singleDollarIdx > 0 && text[singleDollarIdx - 1] === '\\';
        if (!isEscaped) {
          minIdx = singleDollarIdx;
          delimType = 'single_dollar';
        }
      }
    }
    
    if (delimType === null || minIdx === Infinity) {
      result += escapeHtml(text.slice(index));
      break;
    }
    
    result += escapeHtml(text.slice(index, minIdx));
    
    let closeIdx = -1;
    let mathContent = "";
    let isDisplay = false;
    let nextIndex = minIdx;
    
    if (delimType === 'double_dollar') {
      closeIdx = text.indexOf('$$', minIdx + 2);
      if (closeIdx !== -1) {
        mathContent = text.slice(minIdx + 2, closeIdx);
        isDisplay = true;
        nextIndex = closeIdx + 2;
      }
    } else if (delimType === 'bracket') {
      closeIdx = text.indexOf('\\]', minIdx + 2);
      if (closeIdx !== -1) {
        mathContent = text.slice(minIdx + 2, closeIdx);
        isDisplay = true;
        nextIndex = closeIdx + 2;
      }
    } else if (delimType === 'paren') {
      closeIdx = text.indexOf('\\)', minIdx + 2);
      if (closeIdx !== -1) {
        mathContent = text.slice(minIdx + 2, closeIdx);
        isDisplay = false;
        nextIndex = closeIdx + 2;
      }
    } else if (delimType === 'single_dollar') {
      closeIdx = text.indexOf('$', minIdx + 1);
      if (closeIdx !== -1) {
        mathContent = text.slice(minIdx + 1, closeIdx);
        isDisplay = false;
        nextIndex = closeIdx + 1;
      }
    }
    
    if (closeIdx === -1) {
      const step = (delimType === 'double_dollar' || delimType === 'bracket' || delimType === 'paren') ? 2 : 1;
      result += escapeHtml(text.slice(minIdx, minIdx + step));
      index = minIdx + step;
    } else {
      result += renderKaTeXWithOMML(mathContent, isDisplay, isContinuous);
      index = nextIndex;
    }
  }
  
  return result;
}

function renderMathInHtml(html: string, isContinuous = false): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const parent = node.parentElement;
      if (parent) {
        const tagName = parent.tagName.toUpperCase();
        if (['CODE', 'PRE', 'SCRIPT', 'STYLE', 'TEXTAREA'].includes(tagName)) {
          return;
        }
        
        const text = node.nodeValue || '';
        if (text.includes('$') || text.includes('\\(') || text.includes('\\[') || text.includes('\\\\(') || text.includes('\\\\[')) {
          const renderedHtml = parseTextAndRenderMath(text, isContinuous);
          if (renderedHtml !== escapeHtml(text)) {
            const template = document.createElement('template');
            template.innerHTML = renderedHtml;
            const fragment = template.content;
            parent.replaceChild(fragment, node);
          }
        }
      }
      return;
    }
    
    const children = Array.from(node.childNodes);
    for (const child of children) {
      walk(child);
    }
  };
  
  walk(doc.body);

  // Wrap any bare root-level inline elements or text nodes in a paragraph (<p>)
  const body = doc.body;
  const nodes = Array.from(body.childNodes);
  const blockTags = new Set([
    'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 
    'UL', 'OL', 'LI', 'TABLE', 'PRE', 'BLOCKQUOTE', 
    'HR', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 
    'FIGURE', 'FORM'
  ]);
  
  let currentGroup: Node[] = [];
  const flushGroup = () => {
    if (currentGroup.length === 0) return;
    
    const hasContentOrElement = currentGroup.some(node => {
      if (node.nodeType === Node.ELEMENT_NODE) return true;
      if (node.nodeType === Node.TEXT_NODE && (node.nodeValue || '').trim() !== '') return true;
      return false;
    });
    
    if (hasContentOrElement) {
      const p = doc.createElement('p');
      const firstNode = currentGroup[0];
      body.insertBefore(p, firstNode);
      currentGroup.forEach(node => {
        p.appendChild(node);
      });
    }
    
    currentGroup = [];
  };
  
  for (const node of nodes) {
    const isBlock = node.nodeType === Node.ELEMENT_NODE && blockTags.has((node as HTMLElement).tagName.toUpperCase());
    if (isBlock) {
      flushGroup();
    } else {
      currentGroup.push(node);
    }
  }
  flushGroup();

  return doc.body.innerHTML;
}

function extractAndRenderMathPlaceholders(text: string, isContinuous = false): { cleanText: string; placeholders: Map<string, string> } {
  const placeholders = new Map<string, string>();
  let result = "";
  let index = 0;
  let placeholderCounter = 0;
  
  while (index < text.length) {
    let delimType: 'double_dollar' | 'bracket' | 'single_dollar' | 'paren' | null = null;
    
    const doubleDollarIdx = text.indexOf('$$', index);
    const bracketIdx = text.indexOf('\\[', index);
    const parenIdx = text.indexOf('\\(', index);
    const singleDollarIdx = text.indexOf('$', index);
    
    let minIdx = Infinity;
    
    if (doubleDollarIdx !== -1 && doubleDollarIdx < minIdx) {
      minIdx = doubleDollarIdx;
      delimType = 'double_dollar';
    }
    if (bracketIdx !== -1 && bracketIdx < minIdx) {
      minIdx = bracketIdx;
      delimType = 'bracket';
    }
    if (parenIdx !== -1 && parenIdx < minIdx) {
      minIdx = parenIdx;
      delimType = 'paren';
    }
    if (singleDollarIdx !== -1 && singleDollarIdx < minIdx) {
      if (singleDollarIdx === doubleDollarIdx) {
        // Handled by double_dollar
      } else {
        const isEscaped = singleDollarIdx > 0 && text[singleDollarIdx - 1] === '\\';
        if (!isEscaped) {
          minIdx = singleDollarIdx;
          delimType = 'single_dollar';
        }
      }
    }
    
    if (delimType === null || minIdx === Infinity) {
      result += text.slice(index);
      break;
    }
    
    result += text.slice(index, minIdx);
    
    let closeIdx = -1;
    let mathContent = "";
    let isDisplay = false;
    let nextIndex = minIdx;
    
    if (delimType === 'double_dollar') {
      closeIdx = text.indexOf('$$', minIdx + 2);
      if (closeIdx !== -1) {
        mathContent = text.slice(minIdx + 2, closeIdx);
        isDisplay = true;
        nextIndex = closeIdx + 2;
      }
    } else if (delimType === 'bracket') {
      closeIdx = text.indexOf('\\]', minIdx + 2);
      if (closeIdx !== -1) {
        mathContent = text.slice(minIdx + 2, closeIdx);
        isDisplay = true;
        nextIndex = closeIdx + 2;
      }
    } else if (delimType === 'paren') {
      closeIdx = text.indexOf('\\)', minIdx + 2);
      if (closeIdx !== -1) {
        mathContent = text.slice(minIdx + 2, closeIdx);
        isDisplay = false;
        nextIndex = closeIdx + 2;
      }
    } else if (delimType === 'single_dollar') {
      closeIdx = text.indexOf('$', minIdx + 1);
      if (closeIdx !== -1) {
        mathContent = text.slice(minIdx + 1, closeIdx);
        isDisplay = false;
        nextIndex = closeIdx + 1;
      }
    }
    
    if (closeIdx === -1) {
      const step = (delimType === 'double_dollar' || delimType === 'bracket' || delimType === 'paren') ? 2 : 1;
      result += text.slice(minIdx, minIdx + step);
      index = minIdx + step;
    } else {
      const placeholderKey = `MATHPLACEHOLDER_${placeholderCounter++}_` + Math.random().toString(36).substring(2, 8);
      const rendered = renderKaTeXWithOMML(mathContent, isDisplay, isContinuous);
      placeholders.set(placeholderKey, rendered);
      result += placeholderKey;
      index = nextIndex;
    }
  }
  
  return { cleanText: result, placeholders };
}

function compileAndProcessMarkdown(
  text: string,
  isMarkdown: boolean,
  figureMap: Map<string, number>,
  tableMap: Map<string, number>,
  figureCounterRef: { val: number },
  tableCounterRef: { val: number },
  isContinuous = false
): string {
  if (!isMarkdown) return text;

  // Pre-extract and render all math expressions to shield them from markdown parser
  const { cleanText, placeholders } = extractAndRenderMathPlaceholders(text, isContinuous);
  let code = cleanText;
  const generatedFigures = new Map<string, string>();
  const generatedTables = new Map<string, string>();

  // 1. Figures: ![Alt](img.png){...} (supports both simple {#fig-id} and multiline key-value pairs)
  const figRegex = /!\[([^\]]*)\]\(([^)]*)\)\s*\{([^}]+)\}/g;
  code = code.replace(figRegex, (match, altText, imgSrc, attrsText) => {
    let idVal = '';
    let widthVal = '';
    let alignVal = 'center';
    let wrapVal = 'none';
    let captionVal = altText || '';
    let noteVal = '';

    const trimmedAttrs = attrsText.trim();
    if (trimmedAttrs.startsWith('#')) {
      idVal = trimmedAttrs.substring(1);
    } else {
      // Parse key-value attributes
      const lines = trimmedAttrs.split('\n');
      lines.forEach(line => {
        const parts = line.split('=');
        if (parts.length >= 2) {
          const key = parts[0].trim().toLowerCase();
          let val = parts.slice(1).join('=').trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.substring(1, val.length - 1);
          }
          if (key === 'id') idVal = val;
          else if (key === 'width') widthVal = val;
          else if (key === 'align') alignVal = val;
          else if (key === 'wrap') wrapVal = val;
          else if (key === 'caption') captionVal = val;
          else if (key === 'note') noteVal = val;
        }
      });
    }

    if (!idVal) {
      idVal = 'fig-' + Math.random().toString(36).substring(2, 8);
    }

    const figNumber = figureCounterRef.val++;
    figureMap.set(idVal, figNumber);

    // Styling according to wrap and alignment values (APA 7 Compliant)
    let containerStyle = "font-family: 'Times New Roman', Times, serif; margin: 24px 0; clear: both; width: 100%; display: block;";
    let imgStyle = "height: auto; border-radius: 4px; display: block;";

    if (widthVal) {
      imgStyle += ` width: ${widthVal};`;
    } else {
      imgStyle += " max-width: 100%;";
    }

    if (wrapVal === 'left') {
      containerStyle = "font-family: 'Times New Roman', Times, serif; float: left; margin: 8px 24px 20px 0; width: auto; max-width: 50%; display: block;";
      imgStyle += " margin: 0;";
    } else if (wrapVal === 'right') {
      containerStyle = "font-family: 'Times New Roman', Times, serif; float: right; margin: 8px 0 20px 24px; width: auto; max-width: 50%; display: block;";
      imgStyle += " margin: 0;";
    } else if (wrapVal === 'square') {
      containerStyle = "font-family: 'Times New Roman', Times, serif; float: left; margin: 8px 24px 20px 0; width: auto; max-width: 45%; display: block;";
      imgStyle += " margin: 0;";
    } else {
      // 'none' or 'top-bottom'
      containerStyle = "font-family: 'Times New Roman', Times, serif; clear: both; display: block; width: 100%;";
    }

    // Set horizontal alignment inside image parent container
    let imgContainerStyle = "width: 100%; display: block; margin: 12px 0;";
    if (wrapVal === 'none' || !wrapVal) {
      if (alignVal === 'center') {
        imgContainerStyle += " text-align: center;";
        imgStyle += " margin: 0 auto;";
      } else if (alignVal === 'right') {
        imgContainerStyle += " text-align: right;";
        imgStyle += " margin: 0 0 0 auto;";
      } else {
        imgContainerStyle += " text-align: left;";
        imgStyle += " margin: 0;";
      }
    } else {
      imgStyle += " margin: 0;";
    }

    // APA 7 structure:
    // Line 1: Figura X in Bold (flush left of page/container, no indent)
    // Line 2: Title in Italics (flush left of page/container, no indent)
    // Line 3: Image
    // Line 4: Note underneath (flush left, no indent, with Nota. in italics)
    const figHtml = `
<div id="${idVal}" class="wp-rendered-figure" style="${containerStyle}">
  <div style="text-align: left !important; margin-bottom: 8px; font-family: 'Times New Roman', Times, serif; width: 100% !important; display: block !important; text-indent: 0 !important; margin-left: 0 !important; padding-left: 0 !important;">
    <strong style="display: block !important; font-weight: bold !important; font-size: 16px !important; margin-bottom: 2px !important; color: #000 !important; text-align: left !important; text-indent: 0 !important; margin-left: 0 !important;">Figura ${figNumber}</strong>
    <em style="display: block !important; font-style: italic !important; font-size: 16px !important; margin-bottom: 8px !important; color: #000 !important; text-align: left !important; text-indent: 0 !important; margin-left: 0 !important;">${captionVal}</em>
  </div>
  <div style="${imgContainerStyle}">
    <img src="${imgSrc}" alt="${captionVal}" style="${imgStyle}" />
  </div>
  ${noteVal ? `<div style="font-size: 16px !important; color: #000 !important; text-align: left !important; margin-top: 6px !important; font-family: 'Times New Roman', Times, serif !important; line-height: 1.4 !important; width: 100% !important; display: block !important; text-indent: 0 !important; margin-left: 0 !important; padding-left: 0 !important;"><em style="font-style: italic !important;">Nota.</em> ${noteVal}</div>` : ''}
</div>
    `;
    generatedFigures.set(idVal, figHtml);
    return `FIGPLACEHOLDER-${idVal}`;
  });

  // 2. Tables with captions: table followed by : Caption {#tbl-id}
  const tableCaptionRegex = /((?:^|\n)(?:[ \t]*\|[^\n]*(?:\n|$))+)\s*:\s*([^\n]+?)\s*\{#(tbl-[a-zA-Z0-9_-]+)\}/g;
  code = code.replace(tableCaptionRegex, (match, tableMarkdown, captionText, tblId) => {
    const tblNumber = tableCounterRef.val++;
    tableMap.set(tblId, tblNumber);
    
    const tableHtml = String(markdownParser.parse(tableMarkdown)).trim();
    
    const captionHtml = `
  <caption style="caption-side: top; text-align: left; font-family: 'Times New Roman', Times, serif; font-size: 14px; color: #333; margin-bottom: 8px;">
    <strong style="display: block; font-weight: bold;">Tabla ${tblNumber}</strong>
    <span class="caption-text" style="display: block; font-style: italic; font-weight: normal; margin-top: 4px;">${captionText}</span>
  </caption>
    `;
    
    const modifiedTableHtml = tableHtml.replace(/<table([^>]*)>/i, `<table$1>${captionHtml}`);
    generatedTables.set(tblId, modifiedTableHtml);
    return `\nTBLPLACEHOLDER-${tblId}\n`;
  });

  // 3. Parse Markdown
  let resultHtml = String(markdownParser.parse(code));

  // 4. Restore placeholders
  generatedFigures.forEach((figHtml, figId) => {
    const wrappedRegex = new RegExp(`<p>\\s*FIGPLACEHOLDER-${figId}\\s*</p>`, 'g');
    if (wrappedRegex.test(resultHtml)) {
      resultHtml = resultHtml.replace(wrappedRegex, figHtml);
    } else {
      resultHtml = resultHtml.replace(`FIGPLACEHOLDER-${figId}`, figHtml);
    }
  });

  generatedTables.forEach((tableHtml, tblId) => {
    const wrappedRegex = new RegExp(`<p>\\s*TBLPLACEHOLDER-${tblId}\\s*</p>`, 'g');
    if (wrappedRegex.test(resultHtml)) {
      resultHtml = resultHtml.replace(wrappedRegex, tableHtml);
    } else {
      resultHtml = resultHtml.replace(`TBLPLACEHOLDER-${tblId}`, tableHtml);
    }
  });

  // 5. Restore math placeholders
  placeholders.forEach((renderedHtml, placeholderKey) => {
    const wrappedRegex = new RegExp(`<p>\\s*${placeholderKey}\\s*</p>`, 'g');
    if (wrappedRegex.test(resultHtml)) {
      resultHtml = resultHtml.replace(wrappedRegex, renderedHtml);
    } else {
      resultHtml = resultHtml.replace(new RegExp(placeholderKey, 'g'), renderedHtml);
    }
  });

  return resultHtml;
}

const toolbarHTML_Preview = `<!-- Floating Academic Toolbar (Omitted when printing) -->
  <div id="wp-academic-toolbar" class="fixed top-4 right-4 z-50 print:hidden flex items-center gap-2 bg-slate-900/95 text-slate-300 px-2.5 py-1.5 border border-slate-800 rounded-lg shadow-xl backdrop-blur-sm select-none">
    <!-- Zoom Out -->
    <button id="wp-zoom-out" title="Reducir" class="hover:bg-slate-800 hover:text-white p-1.5 rounded transition-all active:scale-95 cursor-pointer flex items-center justify-center">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    </button>
    <!-- Zoom indicator/reset -->
    <span id="wp-zoom-indicator" title="Restablecer zoom" class="text-[11px] font-mono font-medium min-w-[36px] text-center cursor-pointer hover:text-white">100%</span>
    <!-- Zoom In -->
    <button id="wp-zoom-in" title="Aumentar" class="hover:bg-slate-800 hover:text-white p-1.5 rounded transition-all active:scale-95 cursor-pointer flex items-center justify-center">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    </button>
    <div class="h-3 w-[1px] bg-slate-800"></div>
    <!-- Print -->
    <button onclick="window.print()" title="Imprimir" class="hover:bg-slate-800 hover:text-white p-1.5 rounded transition-all active:scale-95 cursor-pointer flex items-center justify-center">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2m-2-5H8v8h8v-8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
    </button>
  </div>`;

export default function DocumentPreview({
  cover: liveCover,
  settings: liveSettings,
  htmlContent,
  setPageCount,
  onExportZIP,
  isFullscreen,
  setIsFullscreen,
  onCoverChange,
  uploadedFiles = [],
  htmlBlocks = [],
  bibliography = [],
  isCompiling = false,
  compiledCover,
  compiledSettings,
  compiledHtmlContent,
  compiledUploadedFiles = [],
  compiledHtmlBlocks = [],
  compiledBibliography = [],
  exportFileName,
  projectFolder,
  bridge,
  externalCss = '',
}: DocumentPreviewProps) {
  const cover = compiledCover || liveCover;
  const settings = compiledSettings || liveSettings;
  const { language, t } = useLanguage();
  const activeHtmlBlocks = (compiledHtmlBlocks && compiledHtmlBlocks.length > 0) ? compiledHtmlBlocks : htmlBlocks;
  const activeHtmlContent = compiledHtmlContent !== undefined ? compiledHtmlContent : htmlContent;
  const activeUploadedFiles = (compiledUploadedFiles && compiledUploadedFiles.length > 0) ? compiledUploadedFiles : uploadedFiles;
  const activeBibliography = (compiledBibliography && compiledBibliography.length > 0) ? compiledBibliography : bibliography;

  const hiddenMeasureRef = useRef<HTMLDivElement>(null);
  const paginationTokenRef = useRef(0);
  const lastWidthRef = useRef<number>(0);
  const lastHeightRef = useRef<number>(0);

  const [paginatedPages, setPaginatedPages] = useState<string[][]>([]);
  const [paginatedTOCPages, setPaginatedTOCPages] = useState<HeadingItem[][]>([]);
  const [zoom, setZoom] = useState<number>(100);
  const [recalculating, setRecalculating] = useState<boolean>(false);
  const [dynamicHeadings, setDynamicHeadings] = useState<HeadingItem[]>([]);

  const renderPageHTML = (html: string) => {
    if (!html.includes('data-heading-ref=')) return html;
    
    return html.replace(/<span[^>]*class="toc-page"[^>]*data-heading-ref="(\d+)"[^>]*>999<\/span>/g, (match, refStr) => {
      const idx = parseInt(refStr, 10);
      const heading = dynamicHeadings[idx];
      if (heading) {
        return `<span class="toc-page" data-heading-ref="${idx}">${heading.page}</span>`;
      }
      return `<span class="toc-page" data-heading-ref="${idx}">...</span>`;
    });
  };
  const [detectedOverflows, setDetectedOverflows] = useState<{
    id: string;
    type: 'ancho' | 'alto';
    tagName: string;
    pageNumber: number;
    measured: number;
    allowed: number;
    outerHTML?: string;
  }[]>([]);
  const [showOverflowPopover, setShowOverflowPopover] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [exportingPDF, setExportingPDF] = useState<boolean>(false);
  const [isSandboxMode, setIsSandboxMode] = useState<boolean>(false);
  const [sandboxReloadKey, setSandboxReloadKey] = useState<number>(0);
  const [builtHtml, setBuiltHtml] = useState<string>('');
  const [builtHtmlExists, setBuiltHtmlExists] = useState<boolean>(false);
  const [loadingBuiltHtml, setLoadingBuiltHtml] = useState<boolean>(false);

  const handleOpenPreview = async () => {
    if (!bridge || !projectFolder) {
      alert(language === 'es'
        ? 'Esta acción solo está disponible en el editor de escritorio.'
        : 'This action is only available in the desktop editor.');
      return;
    }
    try {
      const res = await bridge.openBuiltHtml(projectFolder);
      if (!res || !res.ok) {
        alert(language === 'es'
          ? "No hay documento compilado aún. Ejecuta 'mdwp build' para generar documento_formateado.html antes de abrirlo en el navegador."
          : "No compiled document yet. Run 'mdwp build' to generate documento_formateado.html before opening it in the browser.");
      }
    } catch (err) {
      console.error(err);
      alert(language === 'es'
        ? 'No se pudo abrir el documento en el navegador.'
        : 'Could not open the document in the browser.');
    }
  };


  const handleDownloadPDF = async () => {
    setExportingPDF(true);
    try {
      // 1. Cargar la librería html2pdf.js desde una CDN segura de forma asíncrona
      const html2pdf = await new Promise<any>((resolve, reject) => {
        if ((window as any).html2pdf) {
          resolve((window as any).html2pdf);
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
        script.integrity = 'sha512-GsLlZN/3F2ErC5IfS5QtgpiJtWd63O9aKPz6DGIq5vVvgh93cegnzZ6cnZ3ZSXYaluaFTo6ffW6F9pOOALy66w==';
        script.crossOrigin = 'anonymous';
        script.onload = () => resolve((window as any).html2pdf);
        script.onerror = (e) => reject(new Error('No se pudo cargar la librería de compilación PDF'));
        document.head.appendChild(script);
      });

      // 2. Obtener los elementos de portada y páginas del DOM actual
      const coverPage = document.getElementById('wp-cover-page');
      const docPages = document.querySelectorAll('[name^="document-page-"]');

      const hasCover = settings.pageSize !== 'continuous' && resolvedCover.enabled !== false;
      if (hasCover && !coverPage) {
        alert('Por favor, espere a que el documento se compile en el visor.');
        return;
      }
      if (docPages.length === 0) {
        alert('Por favor, espere a que el documento se compile en el visor.');
        return;
      }

      // Creación del contenedor temporal para el renderizado del PDF fuera de la vista general
      const tempWrapper = document.createElement('div');
      tempWrapper.style.position = 'absolute';
      tempWrapper.style.left = '-9999px';
      tempWrapper.style.top = '-9999px';
      tempWrapper.style.width = 'auto';
      tempWrapper.style.height = 'auto';
      tempWrapper.style.display = 'flex';
      tempWrapper.style.flexDirection = 'column';
      tempWrapper.style.gap = '0px';

      if (settings.pageSize !== 'continuous' && coverPage) {
        // Clonamos y saneamos la portada para el PDF
        const coverClone = coverPage.cloneNode(true) as HTMLElement;
        coverClone.style.boxShadow = 'none';
        coverClone.style.border = 'none';
        coverClone.style.margin = '0 auto';
        coverClone.style.setProperty('page-break-after', 'always', 'important');
        coverClone.style.setProperty('break-after', 'page', 'important');
        tempWrapper.appendChild(coverClone);
      }

      // Clonamos y saneamos cada una de las páginas individuales
      docPages.forEach((page, idx) => {
        const pageClone = page.cloneNode(true) as HTMLElement;
        pageClone.style.boxShadow = 'none';
        pageClone.style.border = 'none';
        pageClone.style.margin = '0 auto';

        // Si existen guías dashed de márgenes activas en el clon, las removemos
        const guideOverlay = pageClone.querySelector('.absolute.inset-0.pointer-events-none');
        if (guideOverlay && guideOverlay.innerHTML.includes('Márgenes T:')) {
          guideOverlay.remove();
        }

        if (settings.pageSize !== 'continuous' && idx < docPages.length - 1) {
          pageClone.style.setProperty('page-break-after', 'always', 'important');
          pageClone.style.setProperty('break-after', 'page', 'important');
        }
        tempWrapper.appendChild(pageClone);
      });

      document.body.appendChild(tempWrapper);

      // 3. Configuración de dimensiones y formato según el tipo de papel
      let formatSize: any = 'letter';
      if (settings.pageSize === 'a4') {
        formatSize = 'a4';
      } else if (settings.pageSize === '16:9') {
        // En una escala de milímetros con relación de aspecto 16:9 estándar (Landscape 16:9)
        formatSize = isPortrait ? [167.06, 297] : [297, 167.06];
      } else if (settings.pageSize === 'continuous') {
        // Medir el alto real en píxeles del único contenedor de página
        const singlePage = docPages[0] as HTMLElement;
        const heightInPx = (singlePage ? singlePage.offsetHeight : 1200) + 5;
        const widthInPx = singlePage ? singlePage.offsetWidth : 794;
        
        // Convertir píxeles a mm para jsPDF (a 96 DPI: 1px = 25.4 / 96 mm)
        const widthInMm = (widthInPx * 25.4) / 96;
        const heightInMm = (heightInPx * 25.4) / 96;
        
        formatSize = [widthInMm, heightInMm];
      }

      const cleanTitle = (cover.title || 'documento_wp')
        .slice(0, 30)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_');

      let pdfFilename = `${cleanTitle}_perfecto.pdf`;
      if (exportFileName && exportFileName.trim()) {
        pdfFilename = `${exportFileName.trim()}.pdf`;
      }

      const options = {
        margin: 0,
        filename: pdfFilename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2, // Escala de rendering en alta densidad (2x) para nitidez excepcional
          useCORS: true,
          logging: false
        },
        jsPDF: {
          unit: 'mm',
          format: formatSize,
          orientation: isPortrait ? 'portrait' : 'landscape'
        }
      };

      // 4. Compilar a PDF y ejecutar descarga nativa
      await html2pdf().from(tempWrapper).set(options).save();

      // Limpieza del DOM
      document.body.removeChild(tempWrapper);

    } catch (err) {
      console.error('Error durante la exportación directa a PDF:', err);
      alert('Hubo un error al compilar el PDF de forma directa. Pruebe descargando el archivo ZIP.');
    } finally {
      setExportingPDF(false);
    }
  };

  const resolvedHtmlContent = React.useMemo(() => {
    // Set settings globally so the markdownParser can read it
    if (typeof window !== 'undefined') {
      (window as any).currentWpSettings = settings;
    }

    const figureMap = new Map<string, number>();
    const tableMap = new Map<string, number>();
    const figureCounterRef = { val: 1 };
    const tableCounterRef = { val: 1 };

    const isContinuousMode = settings.pageSize === 'continuous';

    // 1. Compile blocks (HTML vs Markdown)
    let selectHtml = "";
    if (activeHtmlBlocks && activeHtmlBlocks.length > 0) {
      selectHtml = activeHtmlBlocks.map(b => {
        return compileAndProcessMarkdown(
          b.code,
          !!b.isMarkdown,
          figureMap,
          tableMap,
          figureCounterRef,
          tableCounterRef,
          isContinuousMode
        );
      }).join('\n\n');
    } else {
      const isMarkdown = !activeHtmlContent.trim().startsWith('<html');
      selectHtml = compileAndProcessMarkdown(
        activeHtmlContent,
        isMarkdown,
        figureMap,
        tableMap,
        figureCounterRef,
        tableCounterRef,
        isContinuousMode
      );
    }

    // Merge run-in headings with the following paragraph
    selectHtml = selectHtml.replace(/<span class="apa-runin apa-level(\d+)">([\s\S]*?)<\/span>\s*<p>([\s\S]*?)<\/p>/gi, (match, level, title, paragraph) => {
      return `<p><span class="apa-runin apa-level${level}">${title}</span> ${paragraph}</p>`;
    });

    // 1b. Replace cross-references like @fig-id or @tbl-id
    const refRegex = /@(fig-[a-zA-Z0-9_-]+|tbl-[a-zA-Z0-9_-]+)/g;
    selectHtml = selectHtml.replace(refRegex, (match, id) => {
      if (id.startsWith('fig-')) {
        const num = figureMap.get(id);
        if (num !== undefined) {
          return `<a href="#${id}" class="cross-reference-link" style="color: #004080; text-decoration: none; font-weight: 500; border-bottom: 1px dashed #004080;">Figura ${num}</a>`;
        }
      } else if (id.startsWith('tbl-')) {
        const num = tableMap.get(id);
        if (num !== undefined) {
          return `<a href="#${id}" class="cross-reference-link" style="color: #004080; text-decoration: none; font-weight: 500; border-bottom: 1px dashed #004080;">Tabla ${num}</a>`;
        }
      }
      return match;
    });

    // 2. Resolve image uploads
    if (activeUploadedFiles && activeUploadedFiles.length > 0) {
      activeUploadedFiles.forEach((file) => {
        const escapedName = file.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`src=["'](?:[^"']*/)?${escapedName}["']`, 'gi');
        selectHtml = selectHtml.replace(regex, `src="${file.dataUrl}"`);
      });
    }

    // 3. Replace in-text citations with APA style. Supports the same syntax
    //    quarto/citeproc uses:
    //      [@key]  [@key1; @key2]  [-@key]  [@key, p. 10]
    //      [@key1, pp. 27-30; @key2, chap. 2]   (multiple cites w/ locators)
    //      @key                                 (narrative: Key (Year))
    //      @key [p. 10]                         (narrative with locator)
    const yearSuffixMap = assignYearSuffixes(activeBibliography || []);
    const citedKeys = new Set<string>();
    const findCitationItem = (key: string) =>
      activeBibliography.find(b => b.key.toLowerCase() === key.toLowerCase());

    const parseCiteGroup = (group: string): { key: string; suppress: boolean; locator: string }[] => {
      const cites: { key: string; suppress: boolean; locator: string }[] = [];
      for (const rawPart of group.split(';')) {
        const part = rawPart.trim();
        const m = part.match(/^(-?)(@[a-zA-Z0-9_:.\-]+)(?:\s*,\s*(.*))?$/);
        if (!m) continue;
        cites.push({
          suppress: m[1] === '-',
          key: m[2].replace(/^@/, ''),
          locator: (m[3] || '').trim(),
        });
      }
      return cites;
    };

    const renderCite = (cite: { key: string; suppress: boolean; locator: string }): string => {
      const item = findCitationItem(cite.key);
      if (!item) return '';
      const yr = extractAPAYear(item.year) + (yearSuffixMap.get(item.key) || '');
      const locator = cite.locator ? `, ${formatLocator(cite.locator)}` : '';
      return cite.suppress ? `${yr}${locator}` : `${getAPACitationLabel(item)}, ${yr}${locator}`;
    };

    const bracketRegex = /\[(-?@[^\[\]]*)\]/g;
    let citeMatch;
    while ((citeMatch = bracketRegex.exec(selectHtml)) !== null) {
      parseCiteGroup(citeMatch[1]).forEach(c => citedKeys.add(c.key.toLowerCase()));
    }

    selectHtml = selectHtml.replace(bracketRegex, (match, group) => {
      const rendered = parseCiteGroup(group).map(renderCite).filter(Boolean);
      return rendered.length > 0 ? `(${rendered.join('; ')})` : match;
    });

    // Narrative citations: bare @key -> Key (Year). An optional trailing
    // [locator] is consumed only when it looks like a citeproc locator.
    const locatorLike = /^(?:\d|p\.|pp\.|page|pages|para\.|sec\.?|section|chapter|chap\.|fig\.?|figure|tbl\.?|table|appendix|app\.|eq\.?|eqn|vol\.|part|book|line)/i;
    const narrativeRegex = /(?<![\w@])@([a-zA-Z0-9_:.\-]+)(?![a-zA-Z0-9_@])(\s*\[([^\]]*)\])?/g;
    selectHtml = selectHtml.replace(narrativeRegex, (fullMatch, key, bracketPart, bracketContent) => {
      const item = findCitationItem(key);
      if (!item) return fullMatch;
      citedKeys.add(key.toLowerCase());
      const yr = extractAPAYear(item.year) + (yearSuffixMap.get(item.key) || '');
      const label = getAPACitationLabel(item);
      if (bracketContent && locatorLike.test(bracketContent.trim())) {
        return `${label} (${yr}, ${formatLocator(bracketContent)})`;
      }
      if (bracketPart) {
        return `${label} (${yr})${bracketPart}`;
      }
      return `${label} (${yr})`;
    });

    // 3b. Replace manual pagebreaks [PAGEBREAK]
    selectHtml = selectHtml.replace(/<p>\s*\[PAGEBREAK\]\s*<\/p>/gi, '<div class="page-break"></div>');
    selectHtml = selectHtml.replace(/\[PAGEBREAK\]/gi, '<div class="page-break"></div>');

    // 3c. Replace manual bibliography [BIBLIOGRAPHY]
    const hasManualBibliography = selectHtml.includes('[BIBLIOGRAPHY]');
    if (hasManualBibliography) {
      let bibItemsToShow = [...activeBibliography];
      if (settings.showOnlyCitedBibliography) {
        bibItemsToShow = bibItemsToShow.filter(b => citedKeys.has(b.key.toLowerCase()));
      }

      const sortedBib = bibItemsToShow.sort((a, b) => a.authors.localeCompare(b.authors));
      const bibTitle = settings.bibliographyTitle || 'Referencias Bibliográficas';
      
      let bibHtml = `
        <h1 class="wp-bibliography-title" style="font-family: 'Times New Roman', Times, serif; font-size: 16px; font-weight: bold; text-align: center; margin-top: 24px; margin-bottom: 24px;">
          ${bibTitle}
        </h1>
      `;

      sortedBib.forEach(item => {
        bibHtml += `
          <div style="padding-left: 0.5in !important; text-indent: -0.5in !important; line-height: 2.0 !important; font-size: 16px !important; font-family: 'Times New Roman', Times, serif !important; text-align: left !important; display: block !important;" class="wp-bibliography-item">
            ${formatAPABibliographyItem(item, yearSuffixMap.get(item.key) || '')}
          </div>
        `;
      });

      selectHtml = selectHtml.replace(/<p>\s*\[BIBLIOGRAPHY\]\s*<\/p>/gi, bibHtml);
      selectHtml = selectHtml.replace(/\[BIBLIOGRAPHY\]/gi, bibHtml);
    }

    // 3d. Replace manual Table of Contents [TOC]
    const hasManualTOC = selectHtml.includes('[TOC]');
    if (hasManualTOC) {
      // Extract all headings from the current HTML structure (including manual bibliography if inserted, but excluding the manual TOC itself since it's not yet inserted)
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = selectHtml;
      const headingsForManualTOC: { text: string; level: number }[] = [];
      const hElements = Array.from(tempDiv.querySelectorAll('h1, h2, h3, h4, h5, .apa-runin'));
      hElements.forEach((h) => {
        let text = h.textContent?.trim() || '';
        if (text) {
          let level = 1;
          if (h.tagName.startsWith('H') && h.tagName.length === 2) {
            level = parseInt(h.tagName.substring(1), 10);
          } else if (h.classList.contains('apa-runin')) {
            const levelClass = Array.from(h.classList).find(c => c.startsWith('apa-level'));
            if (levelClass) {
              level = parseInt(levelClass.replace('apa-level', ''), 10);
            }
          }

          // Strip trailing period for TOC
          if (h.classList.contains('apa-runin') && text.endsWith('.')) {
            text = text.slice(0, -1).trim();
          }

          headingsForManualTOC.push({
            text,
            level
          });
        }
      });

      const tocTitle = settings.tocTitle || 'Tabla de Contenidos';
      let manualTocHtml = `
        <div class="toc-container select-text manual-toc">
          <div class="toc-header">${tocTitle}</div>
          <ul class="toc-list">
      `;
      if (headingsForManualTOC.length > 0) {
        headingsForManualTOC.forEach((h, hIdx) => {
          const levelClass = `toc-level-${h.level}`;
          manualTocHtml += `
            <li class="toc-item ${levelClass}">
              <span class="toc-title">${h.text}</span>
              <span class="toc-dots"></span>
              <span class="toc-page" data-heading-ref="${hIdx}">999</span>
            </li>
          `;
        });
      } else {
        manualTocHtml += `
          <li class="text-gray-400 italic text-center w-full py-4 flex justify-center items-center">
            (Inserte títulos H1 o H2 en el editor de contenido para generar el índice automático)
          </li>
        `;
      }
      manualTocHtml += `
          </ul>
        </div>
      `;

      selectHtml = selectHtml.replace(/<p>\s*\[TOC\]\s*<\/p>/gi, manualTocHtml);
      selectHtml = selectHtml.replace(/\[TOC\]/gi, manualTocHtml);
    }

    // 4. Append automatic APA bibliography page at the very end (only if not manually inserted)
    if (!hasManualBibliography && settings.showBibliography && activeBibliography && activeBibliography.length > 0) {
      let bibItemsToShow = [...activeBibliography];
      if (settings.showOnlyCitedBibliography) {
        bibItemsToShow = bibItemsToShow.filter(b => citedKeys.has(b.key.toLowerCase()));
      }

      const sortedBib = bibItemsToShow.sort((a, b) => a.authors.localeCompare(b.authors));
      const bibTitle = settings.bibliographyTitle || 'Referencias Bibliográficas';
      
      // We append elements as flat sibling nodes so the paginator can cleanly slice them across pages!
      let bibHtml = `
        <div class="page-break"></div>
        <h1 class="wp-bibliography-title" style="font-family: 'Times New Roman', Times, serif; font-size: 16px; font-weight: bold; text-align: center; margin-top: 24px; margin-bottom: 24px;">
          ${bibTitle}
        </h1>
      `;

      sortedBib.forEach(item => {
        bibHtml += `
          <div style="padding-left: 0.5in !important; text-indent: -0.5in !important; line-height: 2.0 !important; font-size: 16px !important; font-family: 'Times New Roman', Times, serif !important; text-align: left !important; display: block !important;" class="wp-bibliography-item">
            ${formatAPABibliographyItem(item, yearSuffixMap.get(item.key) || '')}
          </div>
        `;
      });
      
      selectHtml += bibHtml;
    }

    return selectHtml;
  }, [activeHtmlContent, activeHtmlBlocks, activeUploadedFiles, activeBibliography, settings.pageSize, settings.showBibliography, settings.bibliographyTitle, settings.showOnlyCitedBibliography, settings.tocTitle, settings.h1LineBreak, settings.h2LineBreak, settings.h3LineBreak, settings.h4LineBreak, settings.h5LineBreak]);

  const resolvedCover = React.useMemo(() => {
    let selectCover = { ...cover };
    if (activeUploadedFiles && activeUploadedFiles.length > 0) {
      activeUploadedFiles.forEach((file) => {
        const escapedName = file.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regexSrc = new RegExp(`src=["'](?:[^"']*/)?${escapedName}["']`, 'gi');
        
        if (selectCover.customHtml) {
          selectCover.customHtml = selectCover.customHtml.replace(regexSrc, `src="${file.dataUrl}"`);
        }
        if (selectCover.overlayHtml) {
          selectCover.overlayHtml = selectCover.overlayHtml.replace(regexSrc, `src="${file.dataUrl}"`);
        }
        if (selectCover.backgroundImage && (selectCover.backgroundImage === file.name || selectCover.backgroundImage.endsWith('/' + file.name))) {
          selectCover.backgroundImage = file.dataUrl;
        }
      });
    }
    return selectCover;
  }, [cover, activeUploadedFiles]);

  // Load the built standalone HTML (documento_formateado.html) produced by
  // `mdwp build`, so the sandbox viewer reflects the real compiled document
  // without requiring an auto-build or a preview server.
  useEffect(() => {
    if (!bridge || !projectFolder) {
      setBuiltHtmlExists(false);
      setBuiltHtml('');
      setLoadingBuiltHtml(false);
      return;
    }
    let cancelled = false;
    setLoadingBuiltHtml(true);
    (async () => {
      try {
        const res = await bridge.readBuiltHtml(projectFolder);
        if (cancelled) return;
        if (res && res.exists) {
          setBuiltHtml(res.html || '');
          setBuiltHtmlExists(true);
        } else {
          setBuiltHtml('');
          setBuiltHtmlExists(false);
        }
      } catch (err) {
        console.error('Error reading built HTML:', err);
        if (!cancelled) {
          setBuiltHtml('');
          setBuiltHtmlExists(false);
        }
      } finally {
        if (!cancelled) setLoadingBuiltHtml(false);
      }
    })();
    return () => { cancelled = true; };
  }, [bridge, projectFolder, sandboxReloadKey]);


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, setIsFullscreen]);

  // Execute custom JS script in the preview environment safely
  useEffect(() => {
    if (!settings.customAddedJs) return;
    
    // Remove previous dynamic user scripts to prevent duplication
    const oldScripts = document.querySelectorAll('.dynamic-user-script');
    oldScripts.forEach((s) => s.remove());

    try {
      const script = document.createElement('script');
      script.className = 'dynamic-user-script';
      script.text = `
        (function() {
          try {
            ${settings.customAddedJs}
          } catch (e) {
            console.error("Error en script de usuario:", e);
          }
        })();
      `;
      document.body.appendChild(script);
    } catch (err) {
      console.error('Error executing custom script:', err);
    }
  }, [settings.customAddedJs, paginatedPages]);

  // Execute inline <script> tags present inside the paginated content pages
  useEffect(() => {
    if (paginatedPages.length === 0) return;

    const timer = setTimeout(() => {
      // Find all rendered bodies in our preview DOM
      const bodies = document.querySelectorAll('.wp-document-body');
      
      // Clean up previously created inline dynamic scripts to prevent duplicates
      const existingDynamicScripts = document.querySelectorAll('.dynamic-inline-user-script');
      existingDynamicScripts.forEach((s) => s.remove());

      const executedScripts = new Set<string>();

      bodies.forEach((body) => {
        const scripts = body.querySelectorAll('script');
        scripts.forEach((originalScript) => {
          try {
            const scriptText = (originalScript.textContent || originalScript.innerText || '').trim();
            if (scriptText && !executedScripts.has(scriptText)) {
              executedScripts.add(scriptText);
              
              const newScript = document.createElement('script');
              newScript.className = 'dynamic-inline-user-script';
              newScript.text = `
                (function() {
                  try {
                    ${scriptText}
                  } catch (e) {
                    console.error("Error en script inline:", e);
                  }
                })();
              `;
              document.body.appendChild(newScript);
            }
          } catch (e) {
            console.error('Error al ejecutar script incrustado en el bloque de contenido:', e);
          }
        });
      });
    }, 300); // Small delay to guarantee elements are fully mounted in the DOM

    return () => clearTimeout(timer);
  }, [paginatedPages, resolvedHtmlContent]);

  // OMML Clipboard Handler for Word (Active only when settings.pageSize === 'continuous')
  useEffect(() => {
    if (settings.pageSize !== 'continuous') return;

    const handleCopy = (e: ClipboardEvent) => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      const container = document.querySelector('.document-rendered-container') || document.body;
      if (!container.contains(range.commonAncestorContainer) && !range.intersectsNode(container)) {
        return;
      }

      const clone = document.createElement('div');
      clone.appendChild(range.cloneContents());

      // Ensure every KaTeX equation in the copied fragment contains the msEquation comment
      const katexNodes = clone.querySelectorAll('.katex');
      katexNodes.forEach((katexNode) => {
        let hasComment = false;
        for (let i = 0; i < katexNode.childNodes.length; i++) {
          const child = katexNode.childNodes[i];
          if (child.nodeType === Node.COMMENT_NODE && child.nodeValue?.includes('msEquation')) {
            hasComment = true;
            break;
          }
        }

        if (!hasComment) {
          const mathEl = katexNode.querySelector('.katex-mathml math') || katexNode.querySelector('math');
          if (mathEl) {
            const isDisplay = katexNode.classList.contains('katex-display') ||
                              katexNode.parentElement?.classList.contains('katex-display') ||
                              katexNode.closest('.katex-display') !== null;
            const ommlXml = mathmlToOmml(mathEl.outerHTML, isDisplay);
            if (ommlXml) {
              const commentStr = `<!--[if gte msEquation 12]>${ommlXml}<![endif]-->`;
              katexNode.insertAdjacentHTML('afterbegin', commentStr);
            }
          }
        }
      });

      const htmlData = clone.innerHTML;
      const textData = selection.toString();

      if (e.clipboardData) {
        e.clipboardData.setData('text/html', htmlData);
        e.clipboardData.setData('text/plain', textData);
        e.preventDefault();
      }
    };

    document.addEventListener('copy', handleCopy);
    return () => {
      document.removeEventListener('copy', handleCopy);
    };
  }, [settings.pageSize]);

  const isLetter = settings.pageSize === 'letter';
  const isA4 = settings.pageSize === 'a4';
  const isPortrait = (settings.orientation || 'portrait') === 'portrait';

  // Letter size at 96 DPI: 816px x 1056px, A4 size: 794px x 1123px (at 96 DPI), 16:9 size: 1120px x 630px
  // Horizontal (Landscape) swap sizes
  const pageWidth = isPortrait 
    ? (isLetter ? 816 : isA4 ? 794 : 630)
    : (isLetter ? 1056 : isA4 ? 1123 : 1120);

  const pageHeight = isPortrait
    ? (isLetter ? 1056 : isA4 ? 1123 : 1120)
    : (isLetter ? 816 : isA4 ? 794 : 630);
  
  const leftMargin = settings.marginLeft !== undefined ? settings.marginLeft : 96;
  const rightMargin = settings.marginRight !== undefined ? settings.marginRight : 96;
  const topMargin = settings.marginTop !== undefined ? settings.marginTop : 96;
  const bottomMargin = settings.marginBottom !== undefined ? settings.marginBottom : 96;

  // Standard content widths at 96 DPI:
  const contentWidth = pageWidth - leftMargin - rightMargin;

  // Paginar el contenido HTML
  useEffect(() => {
    const token = ++paginationTokenRef.current;
    setRecalculating(true);

    const handlePagination = async () => {
      if (!hiddenMeasureRef.current) {
        setRecalculating(false);
        return;
      }
      
      // Select raw rendered children in our hidden container
      const childNodes = Array.from(hiddenMeasureRef.current.children) as HTMLElement[];
      let detectedHeadings: HeadingItem[] = [];

      if (settings.pageSize === 'continuous') {
        let contentHtmls = childNodes.map(node => node.outerHTML);

        if (settings.showTemplatePages && settings.templateHtml && settings.templateJson) {
          try {
            const data = JSON.parse(settings.templateJson);
            if (Array.isArray(data)) {
              const templateHtmls = data.map((item: any) => {
                let html = settings.templateHtml || '';
                Object.keys(item).forEach(key => {
                  const val = item[key];
                  const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
                  html = html.replace(regex, String(val));
                });
                return html;
              });

              const insertIndex = Math.max(0, Math.min(contentHtmls.length, (settings.templateStartPage || 1) - 1));
              contentHtmls.splice(insertIndex, 0, ...templateHtmls);
            }
          } catch (err) {
            console.error("Error parsing templates in continuous mode:", err);
          }
        }

        const pagesList = [contentHtmls];

        contentHtmls.forEach((html) => {
          const parserDiv = document.createElement('div');
          parserDiv.innerHTML = html;
          const hElements = Array.from(parserDiv.querySelectorAll('h1, h2, h3, h4, h5'));
          hElements.forEach((h) => {
            const text = h.textContent?.trim() || '';
            if (text) {
              let level = 1;
              if (h.tagName.startsWith('H') && h.tagName.length === 2) {
                level = parseInt(h.tagName.substring(1), 10);
              }
              detectedHeadings.push({
                text,
                level,
                page: 1,
                pageRelative: 0
              });
            }
          });
        });

        setPaginatedPages(pagesList);
        setPaginatedTOCPages([]);
        setDynamicHeadings(detectedHeadings);
        setPageCount(1);
        setRecalculating(false);
        return;
      }

      const pagesList: string[][] = [[]];
      let currentPageIndex = 0;
      let accumulatedPageHeight = 0;

      // Vertical threshold boundary in pixels, reserving safety margin:
      const totalHeight = pageHeight;
      const maxHeight = totalHeight - topMargin - bottomMargin - 5;

      // Create a temporary measurement container with the exact same styles
      const tempMeasureContainer = document.createElement('div');
      tempMeasureContainer.className = 'wp-document-content';
      tempMeasureContainer.style.position = 'absolute';
      tempMeasureContainer.style.top = '-9999px';
      tempMeasureContainer.style.left = '-9999px';
      tempMeasureContainer.style.width = `${contentWidth}px`;
      tempMeasureContainer.style.boxSizing = 'border-box';
      tempMeasureContainer.style.visibility = 'hidden';
      document.body.appendChild(tempMeasureContainer);

      try {
      let measureCount = 0;
      let lastMeasureYield = performance.now();
      const measureHTMLHeight = async (htmlContent: string): Promise<number> => {
        measureCount += 1;
        if (measureCount % PAGINATION_MEASURE_BATCH === 0) {
          const now = performance.now();
          if (now - lastMeasureYield > 12) {
            lastMeasureYield = now;
            await yieldToMain();
            if (paginationTokenRef.current !== token) {
              throw new PaginationCancelled();
            }
          }
        }
        tempMeasureContainer.innerHTML = htmlContent;
        return tempMeasureContainer.getBoundingClientRect().height;
      };

      // Helper to tokenize HTML string safely (preventing breaking tags)
      const tokenizeHTML = (html: string): string[] => {
        const tokens: string[] = [];
        let i = 0;
        while (i < html.length) {
          if (html[i] === '<') {
            const end = html.indexOf('>', i);
            if (end !== -1) {
              tokens.push(html.substring(i, end + 1));
              i = end + 1;
            } else {
              tokens.push(html[i]);
              i++;
            }
          } else {
            let nextSpace = html.indexOf(' ', i);
            let nextTag = html.indexOf('<', i);
            let endWord = html.length;
            if (nextSpace !== -1 && nextTag !== -1) {
              endWord = Math.min(nextSpace, nextTag);
            } else if (nextSpace !== -1) {
              endWord = nextSpace;
            } else if (nextTag !== -1) {
              endWord = nextTag;
            }
            
            if (endWord === i) {
              tokens.push(' ');
              i++;
            } else {
              tokens.push(html.substring(i, endWord));
              i = endWord;
            }
          }
        }
        return tokens;
      };

      const VOID_TAGS = new Set([
        'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
        'link', 'meta', 'param', 'source', 'track', 'wbr'
      ]);

      const hasVisibleContent = (html: string): boolean => {
        return html.replace(/<[^>]*>/g, '').trim().length > 0 || /<img|<svg|<canvas/i.test(html);
      };

      // Helper to split tokens into balanced HTML parts (reclosing/reopening open tags)
      const getBalancedHTMLParts = (tokens: string[], splitIndex: number) => {
        const part1Tokens = tokens.slice(0, splitIndex);
        const part2Tokens = tokens.slice(splitIndex);
        
        const openTags: string[] = [];
        part1Tokens.forEach(t => {
          if (t.startsWith('<') && t.endsWith('>') && !t.startsWith('</') && !t.endsWith('/>')) {
            const tagNameMatch = t.match(/<([a-zA-Z0-9:-]+)/);
            if (tagNameMatch) {
              const tagLower = tagNameMatch[1].toLowerCase();
              if (!VOID_TAGS.has(tagLower)) {
                openTags.push(tagNameMatch[1]);
              }
            }
          } else if (t.startsWith('</')) {
            const tagNameMatch = t.match(/<\/([a-zA-Z0-9:-]+)/);
            if (tagNameMatch) {
              const idx = openTags.lastIndexOf(tagNameMatch[1]);
              if (idx !== -1) {
                openTags.splice(idx, 1);
              }
            }
          }
        });
        
        const part1Closed = [...part1Tokens];
        for (let i = openTags.length - 1; i >= 0; i--) {
          part1Closed.push(`</${openTags[i]}>`);
        }
        
        const part2Reopened: string[] = [];
        openTags.forEach(tag => {
          part2Reopened.push(`<${tag}>`);
        });
        const part2Final = [...part2Reopened, ...part2Tokens];
        
        return {
          part1: part1Closed.join(''),
          part2: part2Final.join('')
        };
      };

      // Helper to build a table part with cloned caption/thead/tbody
      const buildTablePart = (originalTable: HTMLTableElement, rowsToInsert: HTMLElement[], isContinuation: boolean) => {
        const clone = originalTable.cloneNode(false) as HTMLTableElement;
        
        clone.style.width = '100%';
        clone.style.tableLayout = 'auto';

        const caption = originalTable.querySelector('caption');
        if (caption) {
          const captionClone = caption.cloneNode(true) as HTMLTableCaptionElement;
          if (isContinuation) {
            const textSpan = captionClone.querySelector('.caption-text') || captionClone;
            if (textSpan && textSpan.textContent && !textSpan.textContent.includes('(continuación)')) {
              textSpan.textContent += ' (continuación)';
            }
          }
          clone.appendChild(captionClone);
        }

        const thead = originalTable.querySelector('thead');
        if (thead) {
          if (!isContinuation || (settings.repeatTableHeader ?? true)) {
            clone.appendChild(thead.cloneNode(true));
          }
        }
        
        const tbody = document.createElement('tbody');
        rowsToInsert.forEach(r => tbody.appendChild(r.cloneNode(true)));
        clone.appendChild(tbody);
        
        return clone.outerHTML;
      };

      const getCodeSplitStyles = (part: 'first' | 'middle' | 'last'): string => {
        if (part === 'first') {
          return 'border-bottom: none !important; border-bottom-left-radius: 0px !important; border-bottom-right-radius: 0px !important; margin-bottom: 0px !important; padding-bottom: 4px !important;';
        } else if (part === 'middle') {
          return 'border-top: none !important; border-bottom: none !important; border-radius: 0px !important; margin-top: 0px !important; margin-bottom: 0px !important; padding-top: 4px !important; padding-bottom: 4px !important;';
        } else { // 'last'
          return 'border-top: none !important; border-top-left-radius: 0px !important; border-top-right-radius: 0px !important; margin-top: 0px !important; padding-top: 4px !important;';
        }
      };

      // Create a copy of child nodes info into a processing queue
      const queue: {
        html: string;
        tagName: string;
        className: string;
        styleAttr: string;
        isPageBreak: boolean;
        isTable: boolean;
        isCodeSplit?: boolean;
        codeSplitPart?: 'first' | 'middle' | 'last';
      }[] = childNodes.map(node => ({
        html: node.outerHTML,
        tagName: node.tagName,
        className: node.className || '',
        styleAttr: node.getAttribute('style') || '',
        isPageBreak: node.classList.contains('page-break'),
        isTable: node.tagName === 'TABLE',
      }));

      let qIndex = 0;
      let queueIteration = 0;
      while (qIndex < queue.length) {
        const item = queue[qIndex];
        qIndex++;
        queueIteration++;
        if (queueIteration % 50 === 0) {
          await yieldToMain();
          if (paginationTokenRef.current !== token) {
            throw new PaginationCancelled();
          }
        }

        const isHeading = ['H1', 'H2', 'H3', 'H4', 'H5'].includes(item.tagName);
        const elementHeight = await measureHTMLHeight(item.html);

        if (item.isPageBreak) {
          currentPageIndex++;
          pagesList.push([]);
          accumulatedPageHeight = 0;
          pagesList[currentPageIndex].push(item.html);
          continue;
        }

        // Check if fits entirely on the current page
        if (accumulatedPageHeight + elementHeight <= maxHeight) {
          pagesList[currentPageIndex].push(item.html);
          accumulatedPageHeight += elementHeight;
          
          // Scrape headings for TOC
          const parserDiv = document.createElement('div');
          parserDiv.innerHTML = item.html;
          const hElements = Array.from(parserDiv.querySelectorAll('h1, h2, h3'));
          if (isHeading) {
            const rootEl = parserDiv.firstElementChild as HTMLElement;
            if (rootEl && !hElements.includes(rootEl)) {
              hElements.unshift(rootEl);
            }
          }
          hElements.forEach((h) => {
            const text = h.textContent?.trim() || '';
            if (text) {
              detectedHeadings.push({
                text,
                level: parseInt(h.tagName.substring(1), 10),
                page: currentPageIndex + (settings.showTOC ? 3 : 2),
                pageRelative: currentPageIndex
              });
            }
          });
          continue;
        }

        // Does NOT fit on current page. Let's try to split if eligible!
        if (item.isTable) {
          tempMeasureContainer.innerHTML = item.html;
          const tableEl = tempMeasureContainer.firstElementChild as HTMLTableElement;
          const thead = tableEl.querySelector('thead');
          const theadHeight = thead ? thead.getBoundingClientRect().height : 0;
          const rows = Array.from(tableEl.querySelectorAll('tbody > tr')) as HTMLElement[];
          
          if (elementHeight <= maxHeight && accumulatedPageHeight > 0) {
            // Fits entirely on a single fresh page, so push the entire table to next page
            currentPageIndex++;
            pagesList.push([]);
            accumulatedPageHeight = 0;
            pagesList[currentPageIndex].push(item.html);
            accumulatedPageHeight += elementHeight;
          } else {
            // Table must be split!
            const remainingHeight = maxHeight - accumulatedPageHeight;
            const minStartHeight = theadHeight + (rows[0] ? rows[0].getBoundingClientRect().height : 30) * 2 + 15;
            
            if (remainingHeight < minStartHeight && accumulatedPageHeight > 0) {
              currentPageIndex++;
              pagesList.push([]);
              accumulatedPageHeight = 0;
            }
            
            let currentPartRows: HTMLElement[] = [];
            let currentPartHeight = theadHeight + 10;
            let splitIndex = 0;

            for (let i = 0; i < rows.length; i++) {
              const row = rows[i];
              const rowHeight = row.getBoundingClientRect().height;
              const curLimit = maxHeight - accumulatedPageHeight;
              
              if (currentPartHeight + rowHeight > curLimit && currentPartRows.length > 0) {
                const isCont = splitIndex > 0;
                const tableHtml = buildTablePart(tableEl, currentPartRows, isCont);
                pagesList[currentPageIndex].push(tableHtml);
                splitIndex++;

                currentPageIndex++;
                pagesList.push([]);
                accumulatedPageHeight = 0;
                currentPartRows = [row];
                const shouldRepeatHeader = settings.repeatTableHeader ?? true;
                currentPartHeight = (shouldRepeatHeader ? theadHeight : 0) + 10 + rowHeight;
              } else {
                currentPartRows.push(row);
                currentPartHeight += rowHeight;
              }
            }
            
            if (currentPartRows.length > 0) {
              const isCont = splitIndex > 0;
              const tableHtml = buildTablePart(tableEl, currentPartRows, isCont);
              pagesList[currentPageIndex].push(tableHtml);
              accumulatedPageHeight = currentPartHeight;
            }
          }
        } else if (item.tagName === 'P') {
          // Paragraph splitting!
          tempMeasureContainer.innerHTML = item.html;
          const pEl = tempMeasureContainer.firstElementChild as HTMLElement;
          const tokens = pEl ? tokenizeHTML(pEl.innerHTML) : [];
          
          let low = 1;
          let high = tokens.length;
          let bestSplitIndex = 0;
          let bestPart1HTML = '';
          let bestPart2HTML = '';
          
          const isJustified = (item.styleAttr?.toLowerCase().includes('text-align: justify') || 
                               item.styleAttr?.toLowerCase().includes('text-align:justify') || 
                               settings.pAlign === 'justify');
          
          const part2Style = item.styleAttr
            ? `${item.styleAttr}; text-indent: 0px !important;`
            : `text-indent: 0px !important;`;
          
          while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const { part1, part2 } = getBalancedHTMLParts(tokens, mid);

            // Critical fix: part1 must contain visible content to be a valid split!
            if (!hasVisibleContent(part1)) {
              low = mid + 1;
              continue;
            }

            const part1Style = isJustified
              ? (item.styleAttr ? `${item.styleAttr}; text-align-last: justify !important;` : `text-align-last: justify !important;`)
              : item.styleAttr;
            const testHTML = `<p class="${item.className}" style="${part1Style || ''}">${part1}</p>`;
            const h = await measureHTMLHeight(testHTML);
            
            if (h <= maxHeight - accumulatedPageHeight) {
              bestSplitIndex = mid;
              bestPart1HTML = testHTML;
              bestPart2HTML = `<p class="${item.className}" style="${part2Style}">${part2}</p>`;
              low = mid + 1;
            } else {
              high = mid - 1;
            }
          }
          
          if (bestSplitIndex === 0 && accumulatedPageHeight === 0) {
            // On fresh page, force split at first token with visible content
            for (let idx = 1; idx <= tokens.length; idx++) {
              const { part1, part2 } = getBalancedHTMLParts(tokens, idx);
              if (hasVisibleContent(part1) || idx === tokens.length) {
                bestSplitIndex = idx;
                const part1Style = isJustified
                  ? (item.styleAttr ? `${item.styleAttr}; text-align-last: justify !important;` : `text-align-last: justify !important;`)
                  : item.styleAttr;
                bestPart1HTML = `<p class="${item.className}" style="${part1Style || ''}">${part1}</p>`;
                bestPart2HTML = `<p class="${item.className}" style="${part2Style}">${part2}</p>`;
                break;
              }
            }
          }

          if (bestSplitIndex > 0) {
            pagesList[currentPageIndex].push(bestPart1HTML);
            accumulatedPageHeight += await measureHTMLHeight(bestPart1HTML);
            
            if (bestSplitIndex < tokens.length) {
              // Push the remaining part back to the queue to be processed next
              queue.splice(qIndex, 0, {
                html: bestPart2HTML,
                tagName: item.tagName,
                className: item.className,
                styleAttr: part2Style,
                isPageBreak: false,
                isTable: false
              });
            }
          } else {
            // Cannot fit even 1 word on current page, move to next page and retry
            currentPageIndex++;
            pagesList.push([]);
            accumulatedPageHeight = 0;
            qIndex--; // retry current item on fresh page
          }
        } else if (item.tagName === 'PRE') {
          // Code Block splitting!
          tempMeasureContainer.innerHTML = item.html;
          const preEl = tempMeasureContainer.firstElementChild as HTMLElement;
          const codeEl = preEl.querySelector('code');
          const lines = codeEl ? codeEl.innerHTML.split('\n') : preEl.innerHTML.split('\n');
          
          const codeClass = codeEl ? codeEl.className || '' : '';
          const codeStyle = codeEl ? codeEl.getAttribute('style') || '' : '';
          
          let low = 1;
          let high = lines.length;
          let bestSplitLines = 0;
          let bestPart1HTML = '';
          let bestPart2HTML = '';
          
          const useSplitBorders = settings.splitBlockCodeBorders;
          
          while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const part1Lines = lines.slice(0, mid).join('\n');
            const part2Lines = lines.slice(mid).join('\n');
            
            let part1StyleAttr = item.styleAttr;
            let part2StyleAttr = item.styleAttr;
            
            if (useSplitBorders) {
              const part1Type = item.isCodeSplit ? 'middle' : 'first';
              const part2Type = 'last';
              
              const part1StyleAppend = getCodeSplitStyles(part1Type);
              const part2StyleAppend = getCodeSplitStyles(part2Type);
              
              part1StyleAttr = item.styleAttr ? `${item.styleAttr}; ${part1StyleAppend}` : part1StyleAppend;
              part2StyleAttr = item.styleAttr ? `${item.styleAttr}; ${part2StyleAppend}` : part2StyleAppend;
            }
            
            const testHTML = `<pre class="${item.className}" style="${part1StyleAttr}"><code class="${codeClass}" style="${codeStyle}">${part1Lines}</code></pre>`;
            const h = await measureHTMLHeight(testHTML);
            
            if (h <= maxHeight - accumulatedPageHeight) {
              bestSplitLines = mid;
              bestPart1HTML = testHTML;
              bestPart2HTML = `<pre class="${item.className}" style="${part2StyleAttr}"><code class="${codeClass}" style="${codeStyle}">${part2Lines}</code></pre>`;
              low = mid + 1;
            } else {
              high = mid - 1;
            }
          }
          
          if (bestSplitLines === 0 && accumulatedPageHeight === 0) {
            // Force at least 1 line if on fresh page to avoid infinite loops
            bestSplitLines = 1;
            const part1Lines = lines.slice(0, 1).join('\n');
            const part2Lines = lines.slice(1).join('\n');
            
            let part1StyleAttr = item.styleAttr;
            let part2StyleAttr = item.styleAttr;
            
            if (useSplitBorders) {
              const part1Type = item.isCodeSplit ? 'middle' : 'first';
              const part2Type = 'last';
              
              const part1StyleAppend = getCodeSplitStyles(part1Type);
              const part2StyleAppend = getCodeSplitStyles(part2Type);
              
              part1StyleAttr = item.styleAttr ? `${item.styleAttr}; ${part1StyleAppend}` : part1StyleAppend;
              part2StyleAttr = item.styleAttr ? `${item.styleAttr}; ${part2StyleAppend}` : part2StyleAppend;
            }
            
            bestPart1HTML = `<pre class="${item.className}" style="${part1StyleAttr}"><code class="${codeClass}" style="${codeStyle}">${part1Lines}</code></pre>`;
            bestPart2HTML = `<pre class="${item.className}" style="${part2StyleAttr}"><code class="${codeClass}" style="${codeStyle}">${part2Lines}</code></pre>`;
          }

          if (bestSplitLines > 0) {
            pagesList[currentPageIndex].push(bestPart1HTML);
            accumulatedPageHeight += await measureHTMLHeight(bestPart1HTML);
            
            if (bestSplitLines < lines.length) {
              let part2StyleAttr = item.styleAttr;
              if (useSplitBorders) {
                const part2StyleAppend = getCodeSplitStyles('last');
                part2StyleAttr = item.styleAttr ? `${item.styleAttr}; ${part2StyleAppend}` : part2StyleAppend;
              }
              
              queue.splice(qIndex, 0, {
                html: bestPart2HTML,
                tagName: item.tagName,
                className: item.className,
                styleAttr: part2StyleAttr,
                isPageBreak: false,
                isTable: false,
                isCodeSplit: useSplitBorders ? true : undefined,
                codeSplitPart: useSplitBorders ? 'last' : undefined
              });
            }
          } else {
            // Cannot fit even 1 line, move to next page and retry
            currentPageIndex++;
            pagesList.push([]);
            accumulatedPageHeight = 0;
            qIndex--;
          }
        } else if (item.tagName === 'UL' || item.tagName === 'OL') {
          // List splitting!
          tempMeasureContainer.innerHTML = item.html;
          const listEl = tempMeasureContainer.firstElementChild as HTMLElement;
          const items = Array.from(listEl.children) as HTMLElement[];
          const listTag = item.tagName.toLowerCase();
          
          let low = 1;
          let high = items.length;
          let bestSplitItems = 0;
          let bestPart1HTML = '';
          let bestPart2HTML = '';
          
          while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const part1ItemsHTML = items.slice(0, mid).map(it => it.outerHTML).join('');
            const part2ItemsHTML = items.slice(mid).map(it => it.outerHTML).join('');
            const testHTML = `<${listTag} class="${item.className}" style="${item.styleAttr}">${part1ItemsHTML}</${listTag}>`;
            const h = await measureHTMLHeight(testHTML);
            
            if (h <= maxHeight - accumulatedPageHeight) {
              bestSplitItems = mid;
              bestPart1HTML = testHTML;
              const listStart = listTag === 'ol' ? ` start="${mid + 1}"` : '';
              bestPart2HTML = `<${listTag} class="${item.className}" style="${item.styleAttr}"${listStart}>${part2ItemsHTML}</${listTag}>`;
              low = mid + 1;
            } else {
              high = mid - 1;
            }
          }
          
          if (bestSplitItems === 0 && accumulatedPageHeight === 0) {
            bestSplitItems = 1;
            const part1ItemsHTML = items.slice(0, 1).map(it => it.outerHTML).join('');
            const part2ItemsHTML = items.slice(1).map(it => it.outerHTML).join('');
            bestPart1HTML = `<${listTag} class="${item.className}" style="${item.styleAttr}">${part1ItemsHTML}</${listTag}>`;
            const listStart = listTag === 'ol' ? ` start="2"` : '';
            bestPart2HTML = `<${listTag} class="${item.className}" style="${item.styleAttr}"${listStart}>${part2ItemsHTML}</${listTag}>`;
          }

          if (bestSplitItems > 0) {
            pagesList[currentPageIndex].push(bestPart1HTML);
            accumulatedPageHeight += await measureHTMLHeight(bestPart1HTML);
            
            if (bestSplitItems < items.length) {
              queue.splice(qIndex, 0, {
                html: bestPart2HTML,
                tagName: item.tagName,
                className: item.className,
                styleAttr: item.styleAttr,
                isPageBreak: false,
                isTable: false
              });
            }
          } else {
            currentPageIndex++;
            pagesList.push([]);
            accumulatedPageHeight = 0;
            qIndex--;
          }
} else {
            // Generic block containers (DIV, SECTION, blockquotes, etc.): split
            // by their direct child elements so tall composites like a timeline
            // (.timeline-section > .timeline > .event) can flow across pages
            // instead of being force-drawn whole and clipped by overflow:hidden.
            // Only containers with 2+ element children are split; leaf elements
            // (headings, images, single figures) keep the safe "don't split" path.
            let splitEligible = false;
            let blockEl: HTMLElement | null = null;
            let childEls: HTMLElement[] = [];
            let wrapperChain: HTMLElement[] = [];

            if (!['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(item.tagName)) {
              tempMeasureContainer.innerHTML = item.html;
              blockEl = tempMeasureContainer.firstElementChild as HTMLElement | null;

              const NON_SPLITTABLE_CONTAINERS = new Set([
                'FIGURE', 'PICTURE', 'SVG', 'CANVAS', 'MATH', 'VIDEO', 'AUDIO', 'IFRAME', 'IMG'
              ]);

              if (blockEl && !NON_SPLITTABLE_CONTAINERS.has(blockEl.tagName)) {
                let targetEl: HTMLElement | null = blockEl;
                // Drill down through single-child wrapper elements (e.g. .timeline-section > .timeline)
                while (targetEl && targetEl.children.length === 1) {
                  const onlyChild = targetEl.firstElementChild as HTMLElement;
                  if (!onlyChild || NON_SPLITTABLE_CONTAINERS.has(onlyChild.tagName)) break;
                  // Don't drill into leaf elements handled by their own branches
                  if (['P', 'TABLE', 'PRE', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(onlyChild.tagName)) {
                    break;
                  }
                  wrapperChain.push(targetEl);
                  targetEl = onlyChild;
                }
                if (targetEl) {
                  wrapperChain.push(targetEl);
                  childEls = Array.from(targetEl.children) as HTMLElement[];
                  splitEligible = childEls.length >= 2;
                }
              }
            }

            if (!splitEligible) {
              // Elements that we don't want to split (headings, images, figures etc.)
              if (accumulatedPageHeight > 0) {
                currentPageIndex++;
                pagesList.push([]);
                accumulatedPageHeight = 0;
                qIndex--; // retry on fresh page
              } else {
                pagesList[currentPageIndex].push(item.html);
                accumulatedPageHeight += elementHeight;
              }
              continue;
            }

            let blockOpen = '';
            let blockClose = '';
            for (let w = 0; w < wrapperChain.length; w++) {
              const el = wrapperChain[w];
              const tag = el.tagName.toLowerCase();
              const attribs = Array.from(el.attributes)
                .map((a) => `${a.name}="${a.value.replace(/"/g, '&quot;')}"`).join(' ');
              blockOpen += `<${tag}${attribs ? ' ' + attribs : ''}>`;
            }
            for (let w = wrapperChain.length - 1; w >= 0; w--) {
              const tag = wrapperChain[w].tagName.toLowerCase();
              blockClose += `</${tag}>`;
            }

            let low = 1;
            let high = childEls.length;
            let bestSplitCount = 0;
            let bestPart1HTML = '';
            let bestPart2HTML = '';

            while (low <= high) {
              const mid = Math.floor((low + high) / 2);
              const part1HTML = childEls.slice(0, mid).map((c) => c.outerHTML).join('');
              const part2HTML = childEls.slice(mid).map((c) => c.outerHTML).join('');
              const testHTML = blockOpen + part1HTML + blockClose;
              const h = await measureHTMLHeight(testHTML);
              if (h <= maxHeight - accumulatedPageHeight) {
                bestSplitCount = mid;
                bestPart1HTML = blockOpen + part1HTML + blockClose;
                bestPart2HTML = blockOpen + part2HTML + blockClose;
                low = mid + 1;
              } else {
                high = mid - 1;
              }
            }

            // Only force one child when the block starts on a fresh page; on a
            // partially used page with no fitting child, move to a fresh page
            // and retry (same strategy as paragraphs / code / lists), otherwise
            // the forced child overflows the page and gets clipped.
            if (bestSplitCount === 0 && accumulatedPageHeight === 0) {
              bestSplitCount = 1;
              bestPart1HTML = blockOpen + childEls[0].outerHTML + blockClose;
              bestPart2HTML = blockOpen + childEls.slice(1).map((c) => c.outerHTML).join('') + blockClose;
            }

            if (bestSplitCount > 0) {
              pagesList[currentPageIndex].push(bestPart1HTML);
              accumulatedPageHeight += await measureHTMLHeight(bestPart1HTML);

              if (bestSplitCount < childEls.length) {
                queue.splice(qIndex, 0, {
                  html: bestPart2HTML,
                  tagName: item.tagName,
                  className: item.className,
                  styleAttr: item.styleAttr,
                  isPageBreak: false,
                  isTable: false,
                });
              }
            } else {
              // No child fits on this page: move to a fresh page and retry.
              currentPageIndex++;
              pagesList.push([]);
              accumulatedPageHeight = 0;
              qIndex--;
            }
          }
        }

      // Template insertion
      if (settings.showTemplatePages && settings.templateHtml && settings.templateJson) {
        try {
          const data = JSON.parse(settings.templateJson);
          if (Array.isArray(data)) {
            const templatePages: string[][] = data.map((item: any) => {
              let html = settings.templateHtml || '';
              Object.keys(item).forEach(key => {
                const val = item[key];
                const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
                html = html.replace(regex, String(val));
              });
              return [html];
            });

            const insertIndex = Math.max(0, Math.min(pagesList.length, (settings.templateStartPage || 1) - 1));
            pagesList.splice(insertIndex, 0, ...templatePages);
          }
        } catch (err) {
          console.error("Error parsing template JSON or HTML:", err);
        }
      }

      // Reconstruct detectedHeadings page-by-page from final paginated pages list
      detectedHeadings = [];
      pagesList.forEach((pageBlocks, pageRelativeIndex) => {
        pageBlocks.forEach((blockHtml) => {
          const parserDiv = document.createElement('div');
          parserDiv.innerHTML = blockHtml;
          const hElements = Array.from(parserDiv.querySelectorAll('h1, h2, h3, h4, h5, .apa-runin'));
          
          hElements.forEach((h) => {
            let text = h.textContent?.trim() || '';
            if (text) {
              let level = 1;
              if (h.tagName.startsWith('H') && h.tagName.length === 2) {
                level = parseInt(h.tagName.substring(1), 10);
              } else if (h.classList.contains('apa-runin')) {
                const levelClass = Array.from(h.classList).find(c => c.startsWith('apa-level'));
                if (levelClass) {
                  level = parseInt(levelClass.replace('apa-level', ''), 10);
                }
              }

              // Strip trailing period for TOC
              if (h.classList.contains('apa-runin') && text.endsWith('.')) {
                text = text.slice(0, -1).trim();
              }

              detectedHeadings.push({
                text,
                level,
                page: pageRelativeIndex + (settings.showTOC ? 3 : 2), // placeholder page number, will be adjusted when finalTOCPages.length is known
                pageRelative: pageRelativeIndex
              });
            }
          });
        });
      });

      // 3. Paginate Table of Contents (TOC) if enabled
      let finalTOCPages: HeadingItem[][] = [];
      if (settings.showTOC) {
        const measureTOCPart = (headerText: string, items: HeadingItem[]): number => {
          let html = `<div class="toc-container select-text">`;
          if (headerText) {
            html += `<div class="toc-header">${headerText}</div>`;
          }
          html += `<ul class="toc-list">`;
          items.forEach(h => {
            const levelClass = `toc-level-${h.level}`;
            html += `
              <li class="toc-item ${levelClass}">
                <span class="toc-title">${h.text}</span>
                <span class="toc-dots"></span>
                <span class="toc-page">999</span>
              </li>
            `;
          });
          html += `</ul></div>`;
          
          tempMeasureContainer.innerHTML = html;
          return tempMeasureContainer.getBoundingClientRect().height;
        };

        let currentPendingHeadings: HeadingItem[] = [];
        let currentTOCPageIdx = 0;

        for (let i = 0; i < detectedHeadings.length; i++) {
          const candidateList = [...currentPendingHeadings, detectedHeadings[i]];
          const headerText = currentTOCPageIdx === 0 
            ? (settings.tocTitle || "Tabla de Contenidos") 
            : "";
          
          const hHeight = measureTOCPart(headerText, candidateList);
          if (hHeight <= maxHeight) {
            currentPendingHeadings.push(detectedHeadings[i]);
          } else {
            if (currentPendingHeadings.length > 0) {
              finalTOCPages.push(currentPendingHeadings);
              currentPendingHeadings = [detectedHeadings[i]];
              currentTOCPageIdx++;
            } else {
              // Force at least one item per page to avoid infinite loops
              finalTOCPages.push([detectedHeadings[i]]);
              currentPendingHeadings = [];
              currentTOCPageIdx++;
            }
          }
        }
        if (currentPendingHeadings.length > 0 || detectedHeadings.length === 0) {
          finalTOCPages.push(currentPendingHeadings);
        }
      } else {
        finalTOCPages = [];
      }

      const hasCover = resolvedCover.enabled !== false;
      const coverOffset = hasCover ? 1 : 0;

      // Assign the absolute page numbers based on the final TOC pages count
      finalTOCPages.forEach((tocPage) => {
        tocPage.forEach((heading) => {
          const relPage = heading.pageRelative !== undefined ? heading.pageRelative : 0;
          heading.page = relPage + 1 + coverOffset + finalTOCPages.length;
        });
      });

      detectedHeadings.forEach((heading) => {
        const relPage = heading.pageRelative !== undefined ? heading.pageRelative : 0;
        heading.page = relPage + 1 + coverOffset + (settings.showTOC ? finalTOCPages.length : 0);
      });

      // Update states (kept inside the try so they can see block-scoped vars;
      // they always run before the finally cleanup in the normal flow).
      setPaginatedPages(pagesList);
      setPaginatedTOCPages(finalTOCPages);
      setDynamicHeadings(detectedHeadings);
      setPageCount(pagesList.length + coverOffset + (settings.showTOC ? finalTOCPages.length : 0)); // Content + Cover (if enabled) + TOC (if enabled)
      
      setRecalculating(false);
      } finally {
        // Cleanup our temporary workspace (also runs when a stale run is cancelled)
        if (tempMeasureContainer.parentNode) {
          tempMeasureContainer.parentNode.removeChild(tempMeasureContainer);
        }
      }
    };

    // Run pagination (time-sliced & cancellable so a big paste no longer freezes the UI)
    handlePagination().catch((err) => {
      if (!(err instanceof PaginationCancelled)) {
        console.error('Error during pagination:', err);
      }
      if (paginationTokenRef.current === token) {
        setRecalculating(false);
      }
    });

    return () => {
      paginationTokenRef.current += 1;
      setRecalculating(false);
    };
  }, [resolvedHtmlContent, settings.pageSize, settings.orientation, settings.showTOC, settings.tocTitle, settings.blockStyleTOC, setPageCount, isLetter, leftMargin, rightMargin, topMargin, bottomMargin, pageHeight, settings.splitBlockCodeBorders, resolvedCover.enabled]);

  // Detector de Desbordes Gráfico: Encuentra elementos cuyo ancho o largo excede el espacio neto disponible de la página.
  useEffect(() => {
    // Skip the greedy per-element layout scan for very large documents: for a
    // big paste it is not worth the main-thread cost on every change.
    const skipScan = resolvedHtmlContent.length > OVERFLOW_SCAN_SKIP_THRESHOLD;
    const timer = setTimeout(() => {
      if (skipScan) {
        setDetectedOverflows([]);
        return;
      }

      const bodies = document.querySelectorAll('.wp-document-body');
      const scale = zoom / 100;
      const overflowsList: {
        id: string;
        type: 'ancho' | 'alto';
        tagName: string;
        pageNumber: number;
        measured: number;
        allowed: number;
        outerHTML?: string;
      }[] = [];

      bodies.forEach((body) => {
        const pageEl = body.closest('[name^="document-page-"]');
        const pageNumberAttr = pageEl?.getAttribute('name');
        const pageNum = pageNumberAttr ? parseInt(pageNumberAttr.replace('document-page-', ''), 10) : 1;

        // Get parent visible width & height strictly from physical page margins
        const parentW = contentWidth;
        // height of page body (printable Height)
        const parentH = pageHeight - topMargin - bottomMargin - 5;

        // 1. Check page cumulative height overflow
        const bodyScrollH = body.scrollHeight;
        if (bodyScrollH > parentH + 10) {
          overflowsList.push({
            id: `page-height-${pageNum}`,
            type: 'alto',
            tagName: 'página (contenido acumulado)',
            pageNumber: pageNum,
            measured: Math.round(bodyScrollH),
            allowed: Math.round(parentH),
            outerHTML: body.innerHTML,
          });
        }

        // 2. Check individual children elements
        const candidates = body.querySelectorAll('table, img, div, p, pre, blockquote, figure, ul, ol');
        candidates.forEach((el, index) => {
          const htmlEl = el as HTMLElement;
          
          // Reset attributes and classes
          htmlEl.classList.remove('overflowing-element-width', 'overflowing-element-height');
          htmlEl.removeAttribute('data-width-label');
          htmlEl.removeAttribute('data-allowed-width');
          htmlEl.removeAttribute('data-height-label');
          htmlEl.removeAttribute('data-allowed-height');

          const rect = htmlEl.getBoundingClientRect();
          // Scale measurement because boundingClientRect scales with zoom!
          const actualMeasuredW = Math.round(rect.width / scale);
          const actualMeasuredH = Math.round(rect.height / scale);

          // Rendered size properties (which are layout model based, unscaled)
          const scrollW = htmlEl.scrollWidth;
          const scrollH = htmlEl.scrollHeight;
          const offsetW = htmlEl.offsetWidth;
          const offsetH = htmlEl.offsetHeight;

          // Inline style checks
          const styleAttr = htmlEl.getAttribute('style') || '';
          const inlineWidthMatch = styleAttr.match(/width\s*:\s*(\d+)px/i);
          const inlineHeightMatch = styleAttr.match(/height\s*:\s*(\d+)px/i);

          const styleWidthVal = inlineWidthMatch ? parseInt(inlineWidthMatch[1], 10) : 0;
          const styleHeightVal = inlineHeightMatch ? parseInt(inlineHeightMatch[1], 10) : 0;

          // Compute max dimension seen
          // We exclude boundingClientRect measurements (actualMeasuredW/H) to avoid subpixel/zoom scaling errors
          const finalW = Math.max(scrollW, offsetW, styleWidthVal);
          const finalH = Math.max(scrollH, offsetH, styleHeightVal);

          let isWOver = false;
          let isHOver = false;

          // Check if width exceeds
          if (finalW > parentW + 10) {
            isWOver = true;
          }

          // Check if height exceeds
          if (finalH > parentH + 10) {
            // Avoid flagging the main container itself or root layout utilities
            if (!htmlEl.classList.contains('wp-document-body')) {
              isHOver = true;
            }
          }

          if (isWOver) {
            htmlEl.classList.add('overflowing-element-width');
            htmlEl.setAttribute('data-width-label', `${Math.round(finalW)}`);
            htmlEl.setAttribute('data-allowed-width', `${Math.round(parentW)}`);

            overflowsList.push({
              id: `w-over-${pageNum}-${index}-${htmlEl.tagName}`,
              type: 'ancho',
              tagName: htmlEl.tagName.toLowerCase(),
              pageNumber: pageNum,
              measured: Math.round(finalW),
              allowed: Math.round(parentW),
              outerHTML: htmlEl.outerHTML,
            });
          }

          if (isHOver) {
            htmlEl.classList.add('overflowing-element-height');
            htmlEl.setAttribute('data-height-label', `${Math.round(finalH)}`);
            htmlEl.setAttribute('data-allowed-height', `${Math.round(parentH)}`);

            overflowsList.push({
              id: `h-over-${pageNum}-${index}-${htmlEl.tagName}`,
              type: 'alto',
              tagName: htmlEl.tagName.toLowerCase(),
              pageNumber: pageNum,
              measured: Math.round(finalH),
              allowed: Math.round(parentH),
              outerHTML: htmlEl.outerHTML,
            });
          }
        });
      });

      setDetectedOverflows(overflowsList);
    }, 400);

    return () => clearTimeout(timer);
  }, [paginatedPages, contentWidth, resolvedHtmlContent, zoom, pageHeight, topMargin, bottomMargin]);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 10, 150));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 10, 60));
  const handleResetZoom = () => setZoom(100);

  // Generador de estilos graficos y CSS adicional del usuario para inyectar limpia y preventivamente
  const getGraphicalAndCustomCSS = () => {
    let css = '';
    
    // H1
    if (settings.h1Size || settings.h1Font || settings.h1Align || settings.h1LineHeight || settings.h1Indent !== undefined || settings.h1Bold !== undefined || settings.h1Italic !== undefined || settings.h1Color) {
      css += `\n.wp-document-content h1 {`;
      if (settings.h1Size) css += ` font-size: ${settings.h1Size} !important;`;
      if (settings.h1Font) css += ` font-family: "${settings.h1Font}", sans-serif !important;`;
      if (settings.h1Align) css += ` text-align: ${settings.h1Align} !important;`;
      if (settings.h1LineHeight) css += ` line-height: ${settings.h1LineHeight} !important;`;
      if (settings.h1Indent) css += ` text-indent: ${settings.h1Indent} !important;`;
      if (settings.h1Bold !== undefined) css += ` font-weight: ${settings.h1Bold ? 'bold' : 'normal'} !important;`;
      if (settings.h1Italic !== undefined) css += ` font-style: ${settings.h1Italic ? 'italic' : 'normal'} !important;`;
      if (settings.h1Color) css += ` color: ${settings.h1Color} !important;`;
      css += ` }`;
    }

    // H2
    if (settings.h2Size || settings.h2Font || settings.h2Align || settings.h2LineHeight || settings.h2Indent !== undefined || settings.h2Bold !== undefined || settings.h2Italic !== undefined || settings.h2Color) {
      css += `\n.wp-document-content h2 {`;
      if (settings.h2Size) css += ` font-size: ${settings.h2Size} !important;`;
      if (settings.h2Font) css += ` font-family: "${settings.h2Font}", sans-serif !important;`;
      if (settings.h2Align) css += ` text-align: ${settings.h2Align} !important;`;
      if (settings.h2LineHeight) css += ` line-height: ${settings.h2LineHeight} !important;`;
      if (settings.h2Indent) css += ` text-indent: ${settings.h2Indent} !important;`;
      if (settings.h2Bold !== undefined) css += ` font-weight: ${settings.h2Bold ? 'bold' : 'normal'} !important;`;
      if (settings.h2Italic !== undefined) css += ` font-style: ${settings.h2Italic ? 'italic' : 'normal'} !important;`;
      if (settings.h2Color) css += ` color: ${settings.h2Color} !important;`;
      css += ` }`;
    }

    // P (Cuerpo de texto)
    if (settings.pSize || settings.pFont || settings.pAlign || settings.pLineHeight || settings.pIndent !== undefined || settings.pBold !== undefined || settings.pItalic !== undefined || settings.pColor) {
      css += `\n.wp-document-content, .wp-document-content p, .wp-document-content div:not(.wp-academic-header):not(.wp-academic-footer):not(.toc-container):not(.note):not(.math-expr):not(.wp-bibliography-item):not(.wp-bibliography-title) {`;
      if (settings.pSize) css += ` font-size: ${settings.pSize} !important;`;
      if (settings.pFont) css += ` font-family: "${settings.pFont}", sans-serif !important;`;
      if (settings.pAlign) css += ` text-align: ${settings.pAlign} !important;`;
      if (settings.pLineHeight) css += ` line-height: ${settings.pLineHeight} !important;`;
      if (settings.pIndent) css += ` text-indent: ${settings.pIndent} !important;`;
      if (settings.pBold !== undefined) css += ` font-weight: ${settings.pBold ? 'bold' : 'normal'} !important;`;
      if (settings.pItalic !== undefined) css += ` font-style: ${settings.pItalic ? 'italic' : 'normal'} !important;`;
      if (settings.pColor) css += ` color: ${settings.pColor} !important;`;
      css += ` }`;
    }
    
    // TABLAS (Custom table graphic formatting styles)
    if (settings.tableFontSize || settings.tableHeaderBg || settings.tableHeaderColor || settings.tableBorderColor || settings.tableCellPadding || settings.tableStriped || settings.tableBorderWidth) {
      css += `\n/* Table Formatting Rules */`;
      css += `\n.wp-document-content table {`;
      css += `  word-wrap: break-word !important;`;
      css += `  border-collapse: collapse !important;`;
      if (settings.tableFontSize) css += ` font-size: ${settings.tableFontSize} !important;`;
      if (settings.tableBorderColor) css += ` border-color: ${settings.tableBorderColor} !important;`;
      css += ` }`;

      css += `\n.wp-document-content table th, .wp-document-content table td {`;
      if (settings.tableCellPadding) {
        css += ` padding: ${settings.tableCellPadding} !important;`;
      }
      if (settings.tableBorderColor) {
        css += ` border-color: ${settings.tableBorderColor} !important;`;
      }
      if (settings.tableBorderWidth) {
        css += ` border-width: ${settings.tableBorderWidth} !important;`;
        css += ` border-style: solid !important;`;
      }
      css += ` }`;

      css += `\n.wp-document-content table th, .wp-document-content table thead tr, .wp-document-content table tr[bgcolor] {`;
      if (settings.tableHeaderBg) css += ` background-color: ${settings.tableHeaderBg} !important;`;
      if (settings.tableHeaderColor) css += ` color: ${settings.tableHeaderColor} !important;`;
      css += ` }`;

      if (settings.tableStriped) {
        css += `\n.wp-document-content table tbody tr:nth-child(even) {`;
        css += ` background-color: rgba(0, 0, 0, 0.03) !important;`;
        css += ` }`;
      }
    }

    // Código (Monospace) Graphical Styling
    const blockTheme = settings.blockCodeTheme || settings.codeTheme || 'academic';
    const rawBlockSize = settings.blockCodeSize !== undefined ? settings.blockCodeSize : (settings.codeSize || '13px');
    const blockSize = formatFontSize(rawBlockSize, '13px');
    const inlineTheme = settings.inlineCodeTheme || settings.codeTheme || 'academic';
    const rawInlineSize = settings.inlineCodeSize !== undefined ? settings.inlineCodeSize : '12px';
    const inlineSize = formatFontSize(rawInlineSize, '12px');

    css += `\n.wp-document-content pre, .wp-document-content pre * {`;
    css += ` font-family: "Fira Code", "Courier New", Courier, monospace !important;`;
    css += ` font-size: ${blockSize} !important;`;
    css += ` text-indent: 0px !important;`;
    css += ` }`;

    css += `\n.wp-document-content code:not(pre code) {`;
    css += ` font-family: "Fira Code", "Courier New", Courier, monospace !important;`;
    css += ` font-size: ${inlineSize} !important;`;
    css += ` text-indent: 0px !important;`;
    css += ` }`;
    
    css += `\n.wp-document-content pre {`;
    css += ` padding: 12px 16px !important;`;
    css += ` margin: 16px 0 !important;`;
    css += ` border-radius: 6px !important;`;
    css += ` overflow-x: auto !important;`;
    css += ` line-height: 1.5 !important;`;
    css += ` text-indent: 0px !important;`;
    css += ` }`;

    // Inline code styling
    let inlineBg = '#f1f5f9';
    let inlineColor = '#0f172a';
    let inlineBorder = '#cbd5e1';
    if (inlineTheme === 'dracula') {
      inlineBg = '#282a36';
      inlineColor = '#f8f8f2';
      inlineBorder = '#44475a';
    } else if (inlineTheme === 'monokai') {
      inlineBg = '#272822';
      inlineColor = '#f8f8f2';
      inlineBorder = '#3e3d32';
    } else if (inlineTheme === 'github-light') {
      inlineBg = '#f6f8fa';
      inlineColor = '#24292f';
      inlineBorder = '#d0d7de';
    } else if (inlineTheme === 'solarized-light') {
      inlineBg = '#fdf6e3';
      inlineColor = '#657b83';
      inlineBorder = '#efe8d4';
    } else if (inlineTheme === 'nord') {
      inlineBg = '#2e3440';
      inlineColor = '#d8dee9';
      inlineBorder = '#3b4252';
    } else {
      // academic / default light
      inlineBg = '#f8fafc';
      inlineColor = '#0f172a';
      inlineBorder = '#cbd5e1';
    }

    css += `\n.wp-document-content code:not(pre code) {`;
    css += ` background-color: ${inlineBg} !important;`;
    css += ` color: ${inlineColor} !important;`;
    css += ` padding: 2px 5px !important;`;
    css += ` border-radius: 4px !important;`;
    css += ` border: 1px solid ${inlineBorder} !important;`;
    css += ` display: inline !important;`;
    css += ` text-indent: 0 !important;`;
    css += ` word-break: break-word !important;`;
    css += ` box-decoration-break: clone !important;`;
    css += ` -webkit-box-decoration-break: clone !important;`;
    css += ` }`;
    
    if (blockTheme === 'dracula') {
      css += `\n.wp-document-content pre { background-color: #282a36 !important; border: 1px solid #44475a !important; color: #f8f8f2 !important; }`;
      css += `\n.wp-document-content pre code { color: #f8f8f2 !important; background-color: transparent !important; padding: 0 !important; }`;
      css += `\n.wp-document-content pre .token.comment, .wp-document-content pre .token.prolog, .wp-document-content pre .token.doctype, .wp-document-content pre .token.cdata { color: #6272a4 !important; font-style: italic !important; }`;
      css += `\n.wp-document-content pre .token.keyword, .wp-document-content pre .token.operator, .wp-document-content pre .token.atrule { color: #ff79c6 !important; }`;
      css += `\n.wp-document-content pre .token.string, .wp-document-content pre .token.char { color: #f1fa8c !important; }`;
      css += `\n.wp-document-content pre .token.function, .wp-document-content pre .token.class-name { color: #50fa7b !important; }`;
      css += `\n.wp-document-content pre .token.number, .wp-document-content pre .token.boolean, .wp-document-content pre .token.constant { color: #bd93f9 !important; }`;
      css += `\n.wp-document-content pre .token.punctuation, .wp-document-content pre .token.property, .wp-document-content pre .token.tag { color: #f8f8f2 !important; }`;
    } else if (blockTheme === 'monokai') {
      css += `\n.wp-document-content pre { background-color: #272822 !important; border: 1px solid #3e3d32 !important; color: #f8f8f2 !important; }`;
      css += `\n.wp-document-content pre code { color: #f8f8f2 !important; background-color: transparent !important; padding: 0 !important; }`;
      css += `\n.wp-document-content pre .token.comment, .wp-document-content pre .token.prolog, .wp-document-content pre .token.doctype, .wp-document-content pre .token.cdata { color: #75715e !important; font-style: italic !important; }`;
      css += `\n.wp-document-content pre .token.keyword, .wp-document-content pre .token.operator, .wp-document-content pre .token.atrule { color: #f92672 !important; }`;
      css += `\n.wp-document-content pre .token.string, .wp-document-content pre .token.char { color: #e6db74 !important; }`;
      css += `\n.wp-document-content pre .token.function, .wp-document-content pre .token.class-name { color: #a6e22e !important; }`;
      css += `\n.wp-document-content pre .token.number, .wp-document-content pre .token.boolean, .wp-document-content pre .token.constant { color: #ae81ff !important; }`;
      css += `\n.wp-document-content pre .token.punctuation, .wp-document-content pre .token.property, .wp-document-content pre .token.tag { color: #f8f8f2 !important; }`;
    } else if (blockTheme === 'github-light') {
      css += `\n.wp-document-content pre { background-color: #f6f8fa !important; border: 1px solid #d0d7de !important; color: #24292f !important; }`;
      css += `\n.wp-document-content pre code { color: #24292f !important; background-color: transparent !important; padding: 0 !important; }`;
      css += `\n.wp-document-content pre .token.comment, .wp-document-content pre .token.prolog, .wp-document-content pre .token.doctype, .wp-document-content pre .token.cdata { color: #6e7781 !important; font-style: italic !important; }`;
      css += `\n.wp-document-content pre .token.keyword, .wp-document-content pre .token.operator, .wp-document-content pre .token.atrule { color: #cf222e !important; font-weight: bold !important; }`;
      css += `\n.wp-document-content pre .token.string, .wp-document-content pre .token.char { color: #0a3069 !important; }`;
      css += `\n.wp-document-content pre .token.function, .wp-document-content pre .token.class-name { color: #8250df !important; }`;
      css += `\n.wp-document-content pre .token.number, .wp-document-content pre .token.boolean, .wp-document-content pre .token.constant { color: #0550ae !important; }`;
      css += `\n.wp-document-content pre .token.punctuation, .wp-document-content pre .token.property, .wp-document-content pre .token.tag { color: #24292f !important; }`;
    } else if (blockTheme === 'solarized-light') {
      css += `\n.wp-document-content pre { background-color: #fdf6e3 !important; border: 1px solid #efe8d4 !important; color: #657b83 !important; }`;
      css += `\n.wp-document-content pre code { color: #657b83 !important; background-color: transparent !important; padding: 0 !important; }`;
      css += `\n.wp-document-content pre .token.comment, .wp-document-content pre .token.prolog, .wp-document-content pre .token.doctype, .wp-document-content pre .token.cdata { color: #93a1a1 !important; font-style: italic !important; }`;
      css += `\n.wp-document-content pre .token.keyword, .wp-document-content pre .token.operator, .wp-document-content pre .token.atrule { color: #859900 !important; }`;
      css += `\n.wp-document-content pre .token.string, .wp-document-content pre .token.char { color: #2aa198 !important; }`;
      css += `\n.wp-document-content pre .token.function, .wp-document-content pre .token.class-name { color: #268bd2 !important; }`;
      css += `\n.wp-document-content pre .token.number, .wp-document-content pre .token.boolean, .wp-document-content pre .token.constant { color: #d33682 !important; }`;
      css += `\n.wp-document-content pre .token.punctuation, .wp-document-content pre .token.property, .wp-document-content pre .token.tag { color: #586e75 !important; }`;
    } else if (blockTheme === 'nord') {
      css += `\n.wp-document-content pre { background-color: #2e3440 !important; border: 1px solid #3b4252 !important; color: #d8dee9 !important; }`;
      css += `\n.wp-document-content pre code { color: #d8dee9 !important; background-color: transparent !important; padding: 0 !important; }`;
      css += `\n.wp-document-content pre .token.comment, .wp-document-content pre .token.prolog, .wp-document-content pre .token.doctype, .wp-document-content pre .token.cdata { color: #4c566a !important; font-style: italic !important; }`;
      css += `\n.wp-document-content pre .token.keyword, .wp-document-content pre .token.operator, .wp-document-content pre .token.atrule { color: #81a1c1 !important; }`;
      css += `\n.wp-document-content pre .token.string, .wp-document-content pre .token.char { color: #a3be8c !important; }`;
      css += `\n.wp-document-content pre .token.function, .wp-document-content pre .token.class-name { color: #88c0d0 !important; }`;
      css += `\n.wp-document-content pre .token.number, .wp-document-content pre .token.boolean, .wp-document-content pre .token.constant { color: #b48ead !important; }`;
      css += `\n.wp-document-content pre .token.punctuation, .wp-document-content pre .token.property, .wp-document-content pre .token.tag { color: #eceff4 !important; }`;
    } else {
      // academic / default
      css += `\n.wp-document-content pre { background-color: #f8fafc !important; border: 1px solid #cbd5e1 !important; color: #0f172a !important; }`;
      css += `\n.wp-document-content pre code { color: #0f172a !important; background-color: transparent !important; padding: 0 !important; }`;
      css += `\n.wp-document-content pre .token.comment, .wp-document-content pre .token.prolog, .wp-document-content pre .token.doctype, .wp-document-content pre .token.cdata { color: #64748b !important; font-style: italic !important; }`;
      css += `\n.wp-document-content pre .token.keyword, .wp-document-content pre .token.operator, .wp-document-content pre .token.atrule { color: #0f172a !important; font-weight: bold !important; }`;
      css += `\n.wp-document-content pre .token.string, .wp-document-content pre .token.char { color: #0f172a !important; font-style: italic !important; }`;
      css += `\n.wp-document-content pre .token.function, .wp-document-content pre .token.class-name { color: #0f172a !important; }`;
      css += `\n.wp-document-content pre .token.number, .wp-document-content pre .token.boolean, .wp-document-content pre .token.constant { color: #0f172a !important; }`;
      css += `\n.wp-document-content pre .token.punctuation, .wp-document-content pre .token.property, .wp-document-content pre .token.tag { color: #0f172a !important; }`;
    }

    // Custom CSS input by the user (avoiding selector namespace collisions)
    if (settings.customAddedCss) {
      // We append it cleanly
      css += `\n/* User Custom Additional CSS */\n${settings.customAddedCss}`;
    }

    // Bibliography styling
    css += `
    .wp-bibliography-item {
      padding-left: 0.5in !important;
      text-indent: -0.5in !important;
      line-height: 2.0 !important;
      font-size: 16px !important;
      font-family: 'Times New Roman', Times, serif !important;
      text-align: left !important;
      display: block !important;
    }
    .wp-bibliography-title {
      font-family: 'Times New Roman', Times, serif !important;
      font-size: 16px !important;
      font-weight: bold !important;
      text-align: center !important;
      margin-top: 24px !important;
      margin-bottom: 24px !important;
      display: block !important;
    }
    .wp-margin-element img {
      width: 100% !important;
      height: 100% !important;
      object-fit: fill !important;
    }
    `;

    return css;
  };

  return (
    <div className="flex-1 bg-slate-100 flex flex-col h-full min-w-0 font-sans print:bg-white select-none relative">
      
      {/* Dynamic CSS Code Blocks compilation injected visually right here */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: ${settings.pageSize === 'letter' 
              ? `letter ${isPortrait ? 'portrait' : 'landscape'}` 
              : settings.pageSize === 'a4' 
                ? `a4 ${isPortrait ? 'portrait' : 'landscape'}` 
                : isPortrait ? '167.06mm 297mm' : '297mm 167.06mm'};
            margin: 0 !important;
          }
          .print-page-boundary {
            margin: 0px !important;
            padding: 0px !important;
          }
        }
        ${BASE_TOC_CSS}
        ${externalCss}
        ${getGraphicalAndCustomCSS()}
        ${settings.blockStyleTitles || ''}
        ${settings.blockStyleHeader || ''}
        ${settings.blockStyleFooter || ''}
        ${settings.blockStylePageNum || ''}
        ${settings.blockStyleTOC || ''}
        ${settings.blockStyleLists || ''}
        ${settings.tableCustomCss || ''}
        ${settings.autoNumberHeadings ? `
        /* Numeración automática de títulos */
        body, .document-rendered-container {
          counter-reset: wp-h1-counter !important;
        }
        .wp-document-content h1 {
          counter-reset: wp-h2-counter !important;
          counter-increment: wp-h1-counter !important;
        }
        .wp-document-content h1::before {
          content: counter(wp-h1-counter) ". " !important;
        }
        .wp-document-content h2 {
          counter-reset: wp-h3-counter !important;
          counter-increment: wp-h2-counter !important;
        }
        .wp-document-content h2::before {
          content: counter(wp-h1-counter) "." counter(wp-h2-counter) " " !important;
        }
        .wp-document-content h3 {
          counter-increment: wp-h3-counter !important;
        }
        .wp-document-content h3::before {
          content: counter(wp-h1-counter) "." counter(wp-h2-counter) "." counter(wp-h3-counter) " " !important;
        }
        ` : ''}

        /* Detector de Desbordes Gráfico Visual */
        @media screen {
          .overflowing-element-width {
            outline: 2.5px dashed #f97316 !important;
            outline-offset: -2.5px !important;
            position: relative !important;
          }
          .overflowing-element-width::after {
            content: "⚠️ EXCEDE ANCHO (" attr(data-width-label) "px > MÁX " attr(data-allowed-width) "px)" !important;
            position: absolute !important;
            top: 2px !important;
            right: 2px !important;
            background-color: #f97316 !important;
            color: #ffffff !important;
            font-family: var(--font-sans), system-ui, sans-serif !important;
            font-size: 8px !important;
            font-weight: 800 !important;
            padding: 1.5px 5px !important;
            border-radius: 3px !important;
            z-index: 9999 !important;
            white-space: nowrap !important;
            pointer-events: none !important;
            box-shadow: 0 1px 4px rgba(0,0,0,0.2) !important;
          }

          .overflowing-element-height {
            outline: 2.5px dashed #ef4444 !important;
            outline-offset: -3.5px !important;
            position: relative !important;
          }
          .overflowing-element-height::after {
            content: "⚠️ EXCEDE LARGO (" attr(data-height-label) "px > MÁX " attr(data-allowed-height) "px)" !important;
            position: absolute !important;
            bottom: 2px !important;
            right: 2px !important;
            background-color: #ef4444 !important;
            color: #ffffff !important;
            font-family: var(--font-sans), system-ui, sans-serif !important;
            font-size: 8px !important;
            font-weight: 800 !important;
            padding: 1.5px 5px !important;
            border-radius: 3px !important;
            z-index: 9999 !important;
            white-space: nowrap !important;
            pointer-events: none !important;
            box-shadow: 0 1px 4px rgba(0,0,0,0.2) !important;
          }
        }
      ` }} />

      {/* 1. HIDDEN MEASUREMENT WORKSPACE (Maintained off-screen, matches the actual page widths to calculate wraps) */}
      <div className="absolute top-0 left-0 w-0 h-0 overflow-hidden pointer-events-none opacity-0 select-none">
        <div
          ref={hiddenMeasureRef}
          className="wp-document-content select-none shrink-0"
          style={{
            width: `${contentWidth}px`,
            boxSizing: 'border-box',
          }}
          dangerouslySetInnerHTML={{ __html: resolvedHtmlContent }}
        />
      </div>

      {/* 2. TOP PREVIEW FUNCTIONALITIES HEADER */}
      <div className="p-3 bg-white border-b border-gray-200 flex items-center justify-between shadow-sm select-none shrink-0 print:hidden z-10">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#004080]" />

          {recalculating && (
            <div className="flex items-center gap-1 text-[10px] text-orange-500 font-bold bg-orange-50 px-2 py-0.5 rounded border border-orange-100">
              <RefreshCw className="w-2.5 h-2.5 animate-spin" />
              {language === 'es' ? 'Paginando...' : 'Paginating...'}
            </div>
          )}

          {/* Detector de Desbordes Integrado en Header */}
          <div className="relative flex items-center ml-2">
            {/* Overflow popover indicator disabled per user request */}
          </div>
        </div>

        {/* Dynamic sheet guidelines and dimensions */}
        <div className="flex items-center gap-3">
          {/* Mode Switcher: Static Paginated vs Interactive Sandbox */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 shadow-xs">
            <button
              type="button"
              onClick={() => setIsSandboxMode(false)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                !isSandboxMode
                  ? 'bg-white text-slate-800 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title={language === 'es' ? "Vista estática paginada con medición de desbordes, márgenes y cabeceras" : "Static paginated view with overflow detection, margins, and headers"}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{language === 'es' ? 'Paginado' : 'Paginated'}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsSandboxMode(true)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                isSandboxMode
                  ? 'bg-[#004080] text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title={language === 'es' ? "Vista interactiva aislada en sandbox (ejecuta Canvas, Chart.js, Mermaid, scripts y estilos sin interferencias)" : "Isolated interactive sandbox (runs Canvas, Chart.js, Mermaid, scripts, and styles)"}
            >
              <Play className="w-3.5 h-3.5 text-amber-400" />
              <span>{language === 'es' ? 'Sandbox Interactivo' : 'Interactive Sandbox'}</span>
            </button>
          </div>

          {isSandboxMode && (
            <button
              type="button"
              onClick={() => setSandboxReloadKey((k) => k + 1)}
              className="p-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border border-slate-200 active:scale-95 transition-all cursor-pointer shadow-xs flex items-center justify-center"
              title={language === 'es' ? "Recargar sandbox interactivo" : "Reload interactive sandbox"}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={handleOpenPreview}
            className="py-1.5 px-3 rounded bg-emerald-600 hover:bg-emerald-700 active:scale-[95%] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm border border-emerald-600/25"
            title={language === 'es' ? "Abrir el documento compilado (documento_formateado.html) en el navegador" : "Open the compiled document (documento_formateado.html) in the browser"}
          >
            <ExternalLink className="w-4 h-4 text-white" />
            {language === 'es' ? 'Abrir en navegador' : 'Open in browser'}
          </button>

          {/* Zoom controllers */}
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 p-0.5 rounded text-xs select-none">
            <button
              onClick={handleZoomOut}
              className="p-1 rounded text-gray-500 hover:text-gray-880 hover:bg-white active:scale-90 transition-all cursor-pointer"
              title={language === 'es' ? "Reducir tamaño" : "Zoom out"}
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleResetZoom}
              className="px-2 font-bold tracking-tight text-gray-600 hover:text-gray-800 cursor-pointer"
              title={language === 'es' ? "Restaurar zoom" : "Reset zoom"}
            >
              {zoom}%
            </button>
            <button
              onClick={handleZoomIn}
              className="p-1 rounded text-gray-500 hover:text-gray-880 hover:bg-white active:scale-90 transition-all cursor-pointer"
              title={language === 'es' ? "Aumentar tamaño" : "Zoom in"}
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 4. ACTUAL ENEMY PAGE SHEETS STAGE OR INTERACTIVE SANDBOX IFRAME */}
      {isSandboxMode ? (
        <div className="flex-1 w-full h-full min-h-0 bg-white relative flex flex-col overflow-hidden p-0 m-0">
          {loadingBuiltHtml ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center text-slate-400">
              <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
              <p className="text-xs font-medium text-slate-600">
                {language === 'es' ? 'Cargando documento compilado...' : 'Loading compiled document...'}
              </p>
            </div>
          ) : builtHtmlExists && builtHtml ? (
            <iframe
              key={`built-${sandboxReloadKey}`}
              srcDoc={builtHtml}
              title="Interactive Document Sandbox"
              className="w-full h-full flex-1 border-0 bg-white block"
              sandbox="allow-scripts allow-same-origin allow-popups allow-modals allow-forms"
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center text-slate-400">
              <FileText className="w-8 h-8 text-slate-300" />
              <div className="flex flex-col items-center gap-1.5">
                <p className="text-xs font-bold text-slate-700">
                  {language === 'es' ? 'No hay documento compilado' : 'No compiled document yet'}
                </p>
                <p className="text-xs font-medium text-slate-500 max-w-sm">
                  {language === 'es'
                    ? 'Ejecuta "mdwp build" en la terminal para generar documento_formateado.html y vuelve a esta vista para verlo en el sandbox.'
                    : 'Run "mdwp build" in the terminal to generate documento_formateado.html, then return to this view to see it in the sandbox.'}
                </p>
                <button
                  type="button"
                  onClick={() => setSandboxReloadKey((k) => k + 1)}
                  className="mt-1 px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border border-slate-200 text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  {language === 'es' ? 'Reintentar' : 'Retry'}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-auto custom-scrollbar print:p-0 print:overflow-visible print:bg-white bg-neutral-100 flex flex-col items-center select-none min-h-0 w-full p-8">
        <div
          className={`document-rendered-container flex flex-col ${settings.pageSize === 'continuous' ? 'gap-0 p-0 shadow-none border-none' : 'gap-8'} print:gap-0 transition-transform origin-top`}
          style={{
            transform: `scale(${zoom / 100})`,
            marginBottom: `${(zoom - 100) * 10}px`,
          }}
        >
          {/* PAGE 1: COVER PAGE (No headers/footers) */}
          {settings.pageSize !== 'continuous' && resolvedCover.enabled !== false && (
            <div className="relative group/cover-container">
              <CoverPage 
                config={resolvedCover} 
                pageSize={settings.pageSize} 
                orientation={settings.orientation} 
                marginElements={settings.marginElements}
                totalPages={1 + paginatedPages.length + (settings.showTOC ? paginatedTOCPages.length : 0)}
                uploadedFiles={uploadedFiles}
              />
            </div>
          )}

          {/* PAGE 2+: TABLE OF CONTENTS (Optional academic pages, strictly out of content.html) */}
          {settings.showTOC && paginatedTOCPages.map((tocPageHeadings, tIdx) => {
            const hasCover = settings.pageSize !== 'continuous' && resolvedCover.enabled !== false;
            const coverOffset = hasCover ? 1 : 0;
            const pageNum = 1 + coverOffset + tIdx;
            const totalPages = paginatedPages.length + coverOffset + paginatedTOCPages.length;
            const isFirst = tIdx === 0;

            return (
              <PageTemplate
                key={`toc-page-${tIdx}`}
                pageNumber={pageNum}
                totalPages={totalPages}
                pageSize={settings.pageSize}
                settings={settings}
                showGuides={settings.showGuides}
                coverConfig={resolvedCover}
                uploadedFiles={uploadedFiles}
              >
                <div className="toc-container select-text">
                  {isFirst && (
                    <div className="toc-header">
                      {settings.tocTitle || "Tabla de Contenidos"}
                    </div>
                  )}
                  <ul className="toc-list">
                    {tocPageHeadings.map((heading, hIdx) => {
                      const levelClass = `toc-level-${heading.level}`;
                      // Absolute page calculations
                      const absolutePage = (heading.pageRelative !== undefined ? heading.pageRelative : 0) + 1 + coverOffset + paginatedTOCPages.length;

                      return (
                        <li 
                          key={hIdx} 
                          className={`toc-item ${levelClass}`}
                        >
                          <span className="toc-title">{heading.text}</span>
                          <span className="toc-dots" />
                          <span className="toc-page">{absolutePage}</span>
                        </li>
                      );
                    })}
                    {tocPageHeadings.length === 0 && (
                      <li className="text-gray-400 italic text-center w-full py-4 flex justify-center items-center">
                        (Inserte títulos H1 o H2 en el editor de contenido para generar el índice automático)
                      </li>
                    )}
                  </ul>
                </div>
              </PageTemplate>
            );
          })}

          {/* PAGES 3+ (or 2+): Dynamic pagination sheets */}
          {paginatedPages.length > 0 ? (
            paginatedPages.map((pageHTMLs, index) => {
              const pageHTMLJoined = pageHTMLs.join('');
              const hasCover = settings.pageSize !== 'continuous' && resolvedCover.enabled !== false;
              const coverOffset = hasCover ? 1 : 0;

              let isTemplatePage = false;
              if (settings.showTemplatePages && settings.templateHtml && settings.templateJson) {
                try {
                  const data = JSON.parse(settings.templateJson);
                  if (Array.isArray(data)) {
                    const templateLength = data.length;
                    const originalContentLength = paginatedPages.length - templateLength;
                    const insertIndex = Math.max(0, Math.min(originalContentLength, (settings.templateStartPage || 1) - 1));
                    
                    if (index >= insertIndex && index < insertIndex + templateLength) {
                      isTemplatePage = true;
                    }
                  }
                } catch (e) {
                  // ignore parse error
                }
              }

              return (
                <PageTemplate
                  key={index}
                  pageNumber={index + 1 + coverOffset + (settings.showTOC ? paginatedTOCPages.length : 0)}
                  totalPages={paginatedPages.length + coverOffset + (settings.showTOC ? paginatedTOCPages.length : 0)}
                  pageSize={settings.pageSize}
                  settings={settings}
                  showGuides={settings.showGuides}
                  coverConfig={resolvedCover}
                  uploadedFiles={uploadedFiles}
                  isTemplatePage={isTemplatePage}
                >
                  <div
                    className="wp-document-body"
                    dangerouslySetInnerHTML={{ __html: renderPageHTML(pageHTMLJoined) }}
                  />
                </PageTemplate>
              );
            })
          ) : (
            /* Blank Fallback content page in case there is no body content */
            <PageTemplate
              pageNumber={settings.showTOC ? 2 + paginatedTOCPages.length : 2}
              totalPages={settings.showTOC ? 2 + paginatedTOCPages.length : 2}
              pageSize={settings.pageSize}
              settings={settings}
              showGuides={settings.showGuides}
              coverConfig={resolvedCover}
              uploadedFiles={uploadedFiles}
            >
              <div className="flex flex-col items-center justify-center text-center h-full text-gray-300 gap-2 select-none border-2 border-dashed border-gray-100 rounded-lg p-6">
                <FileText className="w-12 h-12 text-gray-200" />
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Sin contenido cargado</span>
                <p className="text-[11px] text-gray-400 max-w-[320px] leading-relaxed">
                  Utilice el panel editor en la columna izquierda para añadir párrafos, listas o tablas académicas en HTML. Su contenido aparecerá en esta página.
                </p>
              </div>
            </PageTemplate>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
