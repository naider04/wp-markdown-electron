import { PageSettings, CoverConfig } from '../types';
import { formatFontSize } from '../utils/fontUtils';
import { DEFAULT_BLOCK_LISTS } from './defaults';

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
  list-style-type: none !important;
  padding-left: 0 !important;
  margin: 0 !important;
}
.toc-item {
  display: flex !important;
  align-items: flex-end !important;
  margin-bottom: 12px !important;
}
.toc-item::before {
  content: none !important;
}
.toc-title {
  white-space: nowrap !important;
  flex-shrink: 0 !important;
}
.toc-container .toc-dots,
.toc-item .toc-dots {
  flex-grow: 1 !important;
  border-bottom: 1px dotted black !important;
  margin: 0 8px !important;
}
.toc-page {
  font-weight: bold !important;
  flex-shrink: 0 !important;
}
`;

function sanitizeCSS(rawCss: string): string {
  if (!rawCss) return '';
  return rawCss
    .replace(/<\/?style[^>]*>/gi, '')
    .replace(/<\/script>/gi, '');
}

function getGraphicalCSS(settings: PageSettings): string {
  let css = '';

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

  if (settings.tableFontSize || settings.tableHeaderBg || settings.tableHeaderColor || settings.tableBorderColor || settings.tableCellPadding || settings.tableStriped || settings.tableBorderWidth) {
    css += `\n/* Table Formatting Rules */`;
    css += `\n.wp-document-content table {`;
    css += `  word-wrap: break-word !important;`;
    css += `  border-collapse: collapse !important;`;
    if (settings.tableFontSize) css += ` font-size: ${settings.tableFontSize} !important;`;
    if (settings.tableBorderColor) css += ` border-color: ${settings.tableBorderColor} !important;`;
    css += ` }`;

    css += `\n.wp-document-content table th, .wp-document-content table td {`;
    if (settings.tableCellPadding) css += ` padding: ${settings.tableCellPadding} !important;`;
    if (settings.tableBorderColor) css += ` border-color: ${settings.tableBorderColor} !important;`;
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

  let inlineBg = '#f1f5f9';
  let inlineColor = '#0f172a';
  let inlineBorder = '#cbd5e1';
  if (inlineTheme === 'dracula') { inlineBg = '#282a36'; inlineColor = '#f8f8f2'; inlineBorder = '#44475a'; }
  else if (inlineTheme === 'monokai') { inlineBg = '#272822'; inlineColor = '#f8f8f2'; inlineBorder = '#3e3d32'; }
  else if (inlineTheme === 'github-light') { inlineBg = '#f6f8fa'; inlineColor = '#24292f'; inlineBorder = '#d0d7de'; }
  else if (inlineTheme === 'solarized-light') { inlineBg = '#fdf6e3'; inlineColor = '#657b83'; inlineBorder = '#efe8d4'; }
  else if (inlineTheme === 'nord') { inlineBg = '#2e3440'; inlineColor = '#d8dee9'; inlineBorder = '#3b4252'; }
  else { inlineBg = '#f8fafc'; inlineColor = '#0f172a'; inlineBorder = '#cbd5e1'; }

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
  } else if (blockTheme === 'monokai') {
    css += `\n.wp-document-content pre { background-color: #272822 !important; border: 1px solid #3e3d32 !important; color: #f8f8f2 !important; }`;
    css += `\n.wp-document-content pre code { color: #f8f8f2 !important; background-color: transparent !important; padding: 0 !important; }`;
  } else if (blockTheme === 'github-light') {
    css += `\n.wp-document-content pre { background-color: #f6f8fa !important; border: 1px solid #d0d7de !important; color: #24292f !important; }`;
    css += `\n.wp-document-content pre code { color: #24292f !important; background-color: transparent !important; padding: 0 !important; }`;
  } else if (blockTheme === 'solarized-light') {
    css += `\n.wp-document-content pre { background-color: #fdf6e3 !important; border: 1px solid #efe8d4 !important; color: #657b83 !important; }`;
    css += `\n.wp-document-content pre code { color: #657b83 !important; background-color: transparent !important; padding: 0 !important; }`;
  } else if (blockTheme === 'nord') {
    css += `\n.wp-document-content pre { background-color: #2e3440 !important; border: 1px solid #3b4252 !important; color: #d8dee9 !important; }`;
    css += `\n.wp-document-content pre code { color: #d8dee9 !important; background-color: transparent !important; padding: 0 !important; }`;
  } else {
    css += `\n.wp-document-content pre { background-color: #f8fafc !important; border: 1px solid #cbd5e1 !important; color: #0f172a !important; }`;
    css += `\n.wp-document-content pre code { color: #0f172a !important; background-color: transparent !important; padding: 0 !important; }`;
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
}

export interface StandaloneInput {
  settings: PageSettings;
  cover: CoverConfig;
  pagesHTML: string;
  exportFileName?: string;
  /**
   * CSS capturado de la vista previa viva (bundle compilado + estilos del
   * documento). Se inyecta al final del documento para que la exportación
   * reproduzca EXACTAMENTE el mismo layout que midió el paginador — de lo
   * contrario el contenido exportado puede renderizar más alto y desbordar
   * la hoja (recorte de texto/celdas de tablas).
   */
  previewCss?: string;
}

export function buildStandaloneHtml({ settings, cover, pagesHTML, exportFileName, previewCss }: StandaloneInput): string {
  const isLetterSize = settings.pageSize === 'letter';
  const isA4 = settings.pageSize === 'a4';
  const isContinuous = settings.pageSize === 'continuous';
  const isPortrait = (settings.orientation || 'portrait') === 'portrait';

  const paperWidth = isContinuous
    ? '794px'
    : isPortrait
      ? (isLetterSize ? '816px' : isA4 ? '794px' : '630px')
      : (isLetterSize ? '1056px' : isA4 ? '1123px' : '1120px');

  const paperHeight = isContinuous
    ? 'auto'
    : isPortrait
      ? (isLetterSize ? '1056px' : isA4 ? '1123px' : '1120px')
      : (isLetterSize ? '816px' : isA4 ? '794px' : '630px');

  const topMargin = settings.marginTop !== undefined ? settings.marginTop : 96;
  const bottomMargin = settings.marginBottom !== undefined ? settings.marginBottom : 96;
  const leftMargin = settings.marginLeft !== undefined ? settings.marginLeft : 96;
  const rightMargin = settings.marginRight !== undefined ? settings.marginRight : 96;

  const clean = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${exportFileName || cover.title || 'Documento Académico'}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Space+Grotesk:wght@400;500;600;700&family=Fira+Code:wght@400;500&display=swap');

    * { box-sizing: border-box; }

    body, html {
      margin: 0; padding: 0;
      background-color: #fafafa !important;
      font-family: "Inter", system-ui, -apple-system, sans-serif;
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
    }

    .document-rendered-container {
      display: flex; flex-direction: column; align-items: center; gap: 32px;
      padding: 48px 24px; background-color: #fafafa !important;
    }

    div[name^="document-page-"] {
      position: relative !important; background-color: #ffffff !important;
      box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1) !important;
      border: none !important;
      padding-top: ${topMargin}px !important; padding-bottom: ${bottomMargin}px !important;
      padding-left: ${leftMargin}px !important; padding-right: ${rightMargin}px !important;
      box-sizing: border-box !important; display: flex !important; flex-direction: column !important;
      justify-content: space-between !important; overflow: hidden !important; flex-shrink: 0 !important;
      width: ${paperWidth} !important; height: ${paperHeight} !important;
    }

    #wp-cover-page {
      position: relative !important; background-color: #ffffff !important;
      box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1) !important;
      border: none !important; padding: 0 !important;
      box-sizing: border-box !important; display: flex !important; flex-direction: column !important;
      justify-content: space-between !important; overflow: hidden !important; flex-shrink: 0 !important;
      width: ${paperWidth} !important; height: ${paperHeight} !important;
    }

    .absolute { position: absolute !important; }

    .wp-document-content *:not(.katex):not(.katex *):not(table):not(thead):not(tbody):not(tr):not(th):not(td):not(figure):not(.note):not(hr):not(.toc-dots),
    .wp-document-content *::before, .wp-document-content *::after,
    .wp-template-content *:not(.katex):not(.katex *):not(table):not(thead):not(tbody):not(tr):not(th):not(td):not(figure):not(.note):not(hr):not(.toc-dots),
    .wp-template-content *::before, .wp-template-content *::after,
    .document-rendered-container *:not(.katex):not(.katex *):not(table):not(thead):not(tbody):not(tr):not(th):not(td):not(figure):not(.note):not(hr):not(.toc-dots),
    .continuous-page-boundary {
      border: 0px none transparent !important; border-width: 0px !important;
      border-style: none !important; outline: none !important; box-shadow: none !important;
    }

    .katex .frac-line {
      border-bottom-style: solid !important; border-bottom-width: 0.04em !important;
      border-bottom-color: currentColor !important; display: inline-block !important;
    }

    .wp-document-content {
      font-family: "Times New Roman", Times, Georgia, serif !important;
      font-size: 16px !important; line-height: 1.8 !important; color: #000000 !important; text-align: left !important;
    }

    .wp-document-content h1 {
      font-family: "Times New Roman", Times, Georgia, serif !important; font-size: 16px !important;
      font-weight: bold !important; color: #000000 !important; text-transform: none !important;
      text-align: center !important; text-indent: 0px !important; margin-top: 24px !important; margin-bottom: 12px !important;
      padding-bottom: 0 !important; border-bottom: 0px none transparent !important; position: relative !important;
    }
    .wp-document-content h1::after { display: none !important; content: none !important; }
    .wp-document-content h2 {
      font-family: "Times New Roman", Times, Georgia, serif !important; font-size: 16px !important; font-weight: bold !important;
      color: #000000 !important; text-align: left !important; text-indent: 0px !important; margin-top: 18px !important; margin-bottom: 8px !important;
    }
    .wp-document-content h3 {
      font-family: "Times New Roman", Times, Georgia, serif !important; font-size: 16px !important; font-weight: bold !important;
      font-style: italic !important; color: #000000 !important; text-align: left !important; text-indent: 0px !important;
      margin-top: 12px !important; margin-bottom: 6px !important;
    }
    .wp-document-content h4 {
      font-family: "Times New Roman", Times, Georgia, serif !important; font-size: 16px !important; font-weight: bold !important;
      color: #000000 !important; text-align: left !important; text-indent: 0.5in !important; margin-top: 10px !important; margin-bottom: 4px !important;
    }
    .wp-document-content h5 {
      font-family: "Times New Roman", Times, Georgia, serif !important; font-size: 16px !important; font-weight: bold !important;
      font-style: italic !important; color: #000000 !important; text-align: left !important; text-indent: 0.5in !important;
      margin-top: 10px !important; margin-bottom: 4px !important;
    }
    .wp-document-content p { margin-top: 0 !important; margin-bottom: 0px !important; line-height: 200% !important; text-indent: 0.5in !important; text-align: left !important; }

    .wp-document-content ul:not(.toc-list) { list-style-type: disc !important; padding-left: 0.5in !important; margin-bottom: 12px !important; }
    .wp-document-content ul:not(.toc-list) li:not(.toc-item) { position: relative !important; margin-bottom: 6px !important; line-height: 1.8 !important; font-size: 16px !important; }
    .wp-document-content ul:not(.toc-list) li:not(.toc-item)::before { display: none; content: none; }
    .wp-document-content ol { list-style-type: decimal !important; padding-left: 0.5in !important; margin-bottom: 12px !important; }
    .wp-document-content ol li { margin-bottom: 6px !important; line-height: 1.8 !important; font-size: 16px !important; }

    .wp-document-content .note {
      border-left: 3px solid #000000 !important; background-color: #f8fafc !important;
      padding: 12px 14px !important; margin: 16px 0 !important; border-radius: 0 4px 4px 0 !important;
      font-size: 12px !important; line-height: 1.6 !important; color: #000000 !important;
    }
    .wp-document-content blockquote {
      border-left: none !important; background-color: transparent !important; padding: 0 !important;
      margin: 12px 0 12px 0.5in !important; font-style: normal !important; line-height: 1.8 !important;
      color: #000000 !important; font-size: 12px !important;
    }
    .wp-document-content figure {
      display: block !important; margin: 16px auto !important; border: 1px solid #e2e8f0 !important;
      background-color: #f8fafc !important; padding: 8px !important; border-radius: 4px !important;
      max-width: 100% !important; box-sizing: border-box !important;
    }
    .wp-document-content figcaption {
      font-family: "Inter", sans-serif !important; font-size: 10.5px !important; color: #64748b !important;
      margin-top: 8px !important; line-height: 1.4 !important; text-align: center !important; font-style: italic !important;
    }
    .wp-document-content img, .wp-document-content .mw-file-element {
      max-width: 100% !important; height: auto !important; display: block !important;
      margin: 0 auto !important; border-radius: 2px !important;
    }

    .wp-academic-header {
      position: absolute !important; top: ${Math.max(10, topMargin - 60)}px !important;
      left: ${leftMargin}px !important; right: ${rightMargin}px !important; height: 50px !important;
      display: flex !important; flex-direction: column !important; justify-content: flex-end !important;
      pointer-events: none !important; user-select: none !important; z-index: 10 !important;
    }
    .wp-academic-footer {
      position: absolute !important; bottom: ${Math.max(10, bottomMargin - 50)}px !important;
      left: ${leftMargin}px !important; right: ${rightMargin}px !important; height: 40px !important;
      display: flex !important; flex-direction: column !important; justify-content: flex-start !important;
      pointer-events: none !important; user-select: none !important; z-index: 10 !important;
    }

    @media print {
      #wp-academic-toolbar, .print\\:hidden, .print-hidden { display: none !important; opacity: 0 !important; visibility: hidden !important; height: 0 !important; width: 0 !important; overflow: hidden !important; margin: 0 !important; padding: 0 !important; }
      body, html { background-color: #ffffff !important; }
      .document-rendered-container { padding: 0 !important; gap: 0 !important; display: block !important; }
      div[name^="document-page-"] {
        box-shadow: none !important; border: none !important; page-break-after: always !important;
        break-after: page !important; page-break-inside: avoid !important; break-inside: avoid !important;
        margin: 0 !important; padding-top: ${topMargin}px !important; padding-bottom: ${bottomMargin}px !important;
        padding-left: ${leftMargin}px !important; padding-right: ${rightMargin}px !important;
      }
      div[name^="document-page-"]:last-of-type { page-break-after: avoid !important; break-after: avoid !important; }
      #wp-cover-page {
        box-shadow: none !important; border: none !important; page-break-after: always !important;
        break-after: page !important; page-break-inside: avoid !important; break-inside: avoid !important;
        margin: 0 !important; padding: 0 !important;
      }
      .print-page-boundary { margin: 0px !important; padding: 0px !important; }
      @page {
        margin: 0 !important;
        size: ${settings.pageSize === 'letter' ? '8.5in 11in' : settings.pageSize === 'a4' ? '210mm 297mm' : '297mm 167.06mm'} ${isPortrait ? 'portrait' : 'landscape'};
      }
    }

    ${BASE_TOC_CSS}

    ${getGraphicalCSS(settings)}
    ${sanitizeCSS(settings.blockStyleTitles || '')}
    ${sanitizeCSS(settings.blockStyleHeader || '')}
    ${sanitizeCSS(settings.blockStyleFooter || '')}
    ${sanitizeCSS(settings.blockStylePageNum || '')}
    ${sanitizeCSS(settings.blockStyleTOC || '')}
    ${sanitizeCSS(settings.blockStyleLists || DEFAULT_BLOCK_LISTS)}
    ${sanitizeCSS(settings.tableCustomCss || '')}
    ${sanitizeCSS(settings.customAddedCss || '')}

    ${settings.autoNumberHeadings ? `
    body, .document-rendered-container { counter-reset: wp-h1-counter !important; }
    .wp-document-content h1 { counter-reset: wp-h2-counter !important; counter-increment: wp-h1-counter !important; }
    .wp-document-content h1::before { content: counter(wp-h1-counter) ". " !important; }
    .wp-document-content h2 { counter-reset: wp-h3-counter !important; counter-increment: wp-h2-counter !important; }
    .wp-document-content h2::before { content: counter(wp-h1-counter) "." counter(wp-h2-counter) " " !important; }
    .wp-document-content h3 { counter-increment: wp-h3-counter !important; }
    .wp-document-content h3::before { content: counter(wp-h1-counter) "." counter(wp-h2-counter) "." counter(wp-h3-counter) " " !important; }
    ` : ''}
  </style>

  <!--
    CSS capturado de la vista previa del editor (bundle compilado + estilos del
    documento). Va al final para mantener el mismo layout que usó el paginador
    al medir el contenido. Sin esto, las utilidades/reset de Tailwind y los
    estilos del documento faltan en la exportación y el texto/tablas pueden
    renderizar más alto que la hoja (contenido recortado por overflow:hidden).
  -->
  ${previewCss ? `<style>\n${previewCss}\n</style>` : ''}
</head>
<body>
  <div id="wp-academic-toolbar" class="fixed top-4 right-4 z-50 print:hidden flex items-center gap-2 bg-slate-900/95 text-slate-300 px-2.5 py-1.5 border border-slate-800 rounded-lg shadow-xl backdrop-blur-sm select-none" style="display:none;">
    <span class="text-[11px] font-mono font-medium min-w-[36px] text-center">100%</span>
  </div>
  <div class="document-rendered-container">
    ${pagesHTML}
  </div>
</body>
</html>`;

  return clean
    .replace(/src="\/\//g, 'src="https://')
    .replace(/srcset="\/\//g, 'srcset="https://')
    .replace(/href="\/\//g, 'href="https://');
}
