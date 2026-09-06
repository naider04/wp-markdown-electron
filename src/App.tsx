/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import JSZip from 'jszip';
import { CoverConfig, PageSettings, UploadedFile, HTMLBlock, BibliographyItem } from './types';
import DocumentPreview from './components/DocumentPreview';
import { ProjectPanel } from './components/ProjectPanel';
import { ConfigDrawer } from './components/ConfigDrawer';
import { formatFontSize } from './utils/fontUtils';
import { getAllUploadedFiles, saveUploadedFilesToDB, clearAllUploadedFilesDB } from './utils/indexedDB';
import { BibliographyDrawer } from './components/BibliographyDrawer';
import { MarginsDrawer } from './components/MarginsDrawer';
import { parseBibtex, generateBibtexFromItems } from './utils/bibParser';
import { Layers, Sliders, Image, Upload, Printer, Trash2, Code, ChevronDown, BookOpen, RefreshCw, FolderArchive, Maximize2, Layout, ChevronLeft, ChevronRight, Key, X, List, Grid, AlertTriangle, CheckCircle, Globe, Save } from 'lucide-react';
import { TemplatesDrawer } from './components/TemplatesDrawer';
import { extractCoverCss, compileCoverHtml, getYamlCssSources } from './utils/markdownParser';
import { buildStandaloneHtml } from './lib/standaloneHtml';
import { parseStylesFile, buildStylesFile, STYLES_SECTIONS, STYLES_FILE_NAME } from './lib/stylesSheet';
import { useLanguage } from './i18n/LanguageContext';

// Bridge exposed by the Electron preload script. Falls back gracefully when
// the app is running in a plain browser (e.g. during development).
declare global {
  interface Window {
    wpBridge?: {
      getFolder: () => Promise<string | null>;
      pickFolder: () => Promise<string | null>;
      pickFile: () => Promise<string | null>;
      pickBib: () => Promise<string | null>;
      readFile: (filePath: string) => Promise<string>;
      readFolder: (folder: string) => Promise<any>;
      writeFolder: (payload: any) => Promise<any>;
      writeContent: (payload: any) => Promise<any>;
      writeStyles: (payload: any) => Promise<any>;
      saveBuiltHtml: (payload: any) => Promise<any>;
    };
    __wpCompileDone?: () => void;
    __wpPageCount?: number;
  }
}

// Compile-mode settings passed by the CLI via query parameters.
interface CompileQuery {
  mode?: string;
  server?: string;
}


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
.toc-container .toc-dots,
.toc-item .toc-dots {
  border-bottom: 1px dotted black !important;
  margin: 0 8px;
}
.toc-page {
  font-weight: bold;
  font-size: 16px;
}`;

const DEFAULT_BLOCK_TABLE = `/* Estilos de Tablas Académicas APA 7 */
.wp-document-content table {
  width: 100% !important;
  border-collapse: collapse !important;
  margin-bottom: 24px !important;
  margin-top: 12px !important;
  box-sizing: border-box !important;
  font-family: "Times New Roman", Times, Georgia, serif !important;
}

.wp-document-content table th {
  background-color: transparent !important;
  color: #000000 !important;
  font-family: "Times New Roman", Times, Georgia, serif !important;
  font-size: 12px !important;
  font-weight: bold !important;
  text-transform: none !important;
  padding: 8px 12px !important;
  text-align: left !important;
  border-top: 2px solid #000000 !important; /* APA 7: Top border */
  border-bottom: 1.5px solid #000000 !important; /* APA 7: Bottom border of header */
  border-left: none !important; /* No vertical borders */
  border-right: none !important;
}

.wp-document-content table td {
  font-size: 12px !important;
  color: #000000 !important;
  padding: 8px 12px !important;
  border-top: none !important;
  border-left: none !important;
  border-right: none !important;
  line-height: 1.5 !important;
  text-align: left !important;
}

.wp-document-content table tbody tr td {
  border-bottom: 1px solid rgba(0, 0, 0, 0.1) !important;
}

.wp-document-content table tbody tr:last-child td {
  border-bottom: 2px solid #000000 !important; /* APA 7: Bottom border of the entire table */
}

/* Zebra alternating rows - disabled for pure APA 7 */
.wp-document-content table tbody tr:nth-child(even) {
  background-color: transparent !important;
}

.wp-document-content table tbody tr:hover {
  background-color: rgba(0, 0, 0, 0.02) !important;
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

const DEFAULT_MARGIN_ELEMENTS = [
  {
    id: 'wp-logo-margin',
    name: 'Logo WP',
    code: '<img src="icon.png">',
    top: '37',
    right: '42',
    pagesPattern: '!first',
    width: '120'
  },
  {
    id: 'wp-page-number-margin',
    name: 'Número de página',
    code: `<span style="font-family: 'Times New Roman'; font-size: 16px;">
    {page}
</span>`,
    top: '48',
    left: '96',
    pagesPattern: '!first'
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
    pagesPattern: '!first'
  },
  {
    id: 'wp-cover-margin',
    name: 'Cover page',
    code: '<img src="cover.png">',
    top: '0',
    right: '0',
    width: '100%',
    height: '100%',
    pagesPattern: '1'
  },
  {
    id: 'wp-footer-margin',
    name: 'Final footer',
    code: '<img src="footer-wp.png">',
    bottom: '0',
    left: '0',
    width: '100%',
    height: 'auto',
    pagesPattern: 'n'
  }
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

export default function App() {
  const { language, setLanguage, toggleLanguage, t } = useLanguage();

  // 1. Initial Cover Page Metadata with localStorage fallback
  const [cover, setCover] = useState<CoverConfig>(() => {
    const cached = localStorage.getItem('wp_cover_config');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed) {
          if (parsed.overlayTemplate) {
            parsed.overlayTemplate = extractCoverCss(parsed.overlayTemplate);
          } else {
            parsed.overlayTemplate = DEFAULT_OVERLAY_TEMPLATE;
          }
          if (parsed.overlayMarkdown === undefined || parsed.overlayMarkdown === '') {
            parsed.overlayMarkdown = DEFAULT_OVERLAY_MARKDOWN;
          }
          if (!parsed.overlayHtml || parsed.overlayHtml.includes('.cv-logo') || parsed.overlayHtml.includes('{{content}}')) {
            parsed.overlayHtml = compileCoverHtml(parsed.overlayTemplate, parsed.overlayMarkdown);
          }
          return parsed;
        }
      } catch (e) {
        console.error('Error parsing cover config cache:', e);
      }
    }
    return {
      institution: 'Nombre de la Institución',
      facultad: 'Nombre de la Facultad',
      carrera: 'Carrera Académica / Especialidad',
      title: 'DISEÑO E IMPLEMENTACIÓN DE UN MOTOR WEB DE AUTOPAGINACIÓN DINÁMICA DE ALTA FIDELIDAD CON BORDES REGLAMENTARIOS',
      subtitle: 'Proyecto Integrador o Informe de Investigación',
      authors: 'Nombre del Autor',
      tutor: 'Nombre del Docente / Tutor',
      city: 'Ciudad, País',
      date: 'Junio, 2026',
      logoType: 'standard',
      overlayHtml: compileCoverHtml(DEFAULT_OVERLAY_TEMPLATE, DEFAULT_OVERLAY_MARKDOWN),
      overlayTemplate: DEFAULT_OVERLAY_TEMPLATE,
      overlayMarkdown: DEFAULT_OVERLAY_MARKDOWN,
    };
  });

  const handleCoverChange = (field: keyof CoverConfig, value: any) => {
    setCover((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  // 1.5. Fullscreen indicator state
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // 2. Page configuration settings with localStorage fallback
  const [settings, setSettings] = useState<PageSettings>(() => {
    const cached = localStorage.getItem('wp_page_settings');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        
        // Delete old HTML fields that were used for header and footer overrides
        delete parsed.headerHtml;
        delete parsed.footerHtml;
        
        // Force-migrate block styles only if they are exactly matching old non-APA7 defaults to avoid overriding user customizations.
        // We have removed aggressive substring-based migrations (like using .includes() for common CSS rules/properties)
        // because they were overriding valid user customizations on page reload (e.g. keeping custom dot-borders or typography sizes).
        
        // Fill defaults if block styles are missing from cache
        return {
          pageSize: 'letter',
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
          marginElements: parsed.marginElements || DEFAULT_MARGIN_ELEMENTS,
          h1LineBreak: parsed.h1LineBreak !== undefined ? parsed.h1LineBreak : true,
          h2LineBreak: parsed.h2LineBreak !== undefined ? parsed.h2LineBreak : true,
          h3LineBreak: parsed.h3LineBreak !== undefined ? parsed.h3LineBreak : true,
          h4LineBreak: parsed.h4LineBreak !== undefined ? parsed.h4LineBreak : false,
          h5LineBreak: parsed.h5LineBreak !== undefined ? parsed.h5LineBreak : false,
          showTemplatePages: parsed.showTemplatePages !== undefined ? parsed.showTemplatePages : false,
          templateHtml: parsed.templateHtml !== undefined ? parsed.templateHtml : '',
          templateJson: parsed.templateJson !== undefined ? parsed.templateJson : '',
          templateStartPage: parsed.templateStartPage !== undefined ? parsed.templateStartPage : 2,
          ...parsed
        };
      } catch (e) {
        console.error('Error parsing settings cache:', e);
      }
    }
    return {
      pageSize: 'letter',
      showGuides: false, // Display the dashed margin line by default (now false by user request)
      headerText: '',
      footerText: '',
      autoRefreshFile: true, // Auto polls /content.html unless locally edited
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
      h1LineBreak: true,
      h2LineBreak: true,
      h3LineBreak: true,
      h4LineBreak: false,
      h5LineBreak: false,
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
      showTemplatePages: false,
      templateHtml: '',
      templateJson: '',
      templateStartPage: 2,
    };
  });

  // 2b. BibTeX references string state
  const [bibtex, setBibtex] = useState<string>(() => {
    const savedBib = localStorage.getItem('wp_bibtex');
    if (savedBib) return savedBib;
    
    // Fallback migration: if there is an existing 'wp_bibliography' array in localStorage, convert it to BibTeX
    const savedItems = localStorage.getItem('wp_bibliography');
    if (savedItems) {
      try {
        const parsed = JSON.parse(savedItems);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return generateBibtexFromItems(parsed);
        }
      } catch (e) {
        console.error('Error migrating old bibliography to BibTeX:', e);
      }
    }
    
    return `@book{wp2025,
  author    = {Universidad Estatal de Milagro},
  year      = {2025},
  title     = {Guía Metodológica para la Redacción de Trabajos Científicos},
  publisher = {Editorial WP},
  url       = {https://www.wp.edu.ec}
}

@article{patino2024,
  author    = {Patiño, W.},
  year      = {2024},
  title     = {Arquitecturas de Software Orientadas a Servicios en la Educación Superior},
  journal   = {Revista de Tecnología WP},
  volume    = {15},
  number    = {2},
  pages     = {45-58},
  url       = {https://ojs.wp.edu.ec}
}`;
  });

  useEffect(() => {
    localStorage.setItem('wp_bibtex', bibtex);
  }, [bibtex]);

  // Derived bibliography array
  const bibliography = useMemo(() => {
    return parseBibtex(bibtex);
  }, [bibtex]);

  const setBibliography = (itemsOrFn: any) => {
    const items = typeof itemsOrFn === 'function' ? itemsOrFn(bibliography) : itemsOrFn;
    setBibtex(generateBibtexFromItems(items));
  };

  // 3. Document HTML Content with localStorage fallback
  const [htmlContent, setHtmlContent] = useState<string>(() => {
    return localStorage.getItem('wp_html_content') || '';
  });

  // 3b. HTML blocks (for multiple stacked renamable editors)
  const [htmlBlocks, setHtmlBlocks] = useState<HTMLBlock[]>(() => {
    const cached = localStorage.getItem('wp_html_blocks');
    if (cached) {
      try {
        const blocks = JSON.parse(cached);
        if (Array.isArray(blocks) && blocks.length > 0) {
          return blocks.map(b => ({ ...b, isMarkdown: true }));
        }
      } catch (e) {
        console.error('Error parsing cached html blocks:', e);
      }
    }
    
    // Fallback: If there are no blocks but there is single htmlContent in localStorage from previous session, convert it to a block!
    const singleContent = localStorage.getItem('wp_html_content') || '';
    return [{
      id: 'block_default',
      name: 'Bloque Principal',
      code: singleContent || `<!-- === INICIO DEL DOCUMENTO === -->\n<h1>Tema del Reporte Académico</h1>\n<p>Escriba aquí la introducción de su tarea académica...</p>\n`,
      collapsed: false,
      isMarkdown: true
    }];
  });

  const [lastFocusedBlockId, setLastFocusedBlockId] = useState<string | null>(null);
  const [activeDrawerType, setActiveDrawerType] = useState<'cover' | 'settings' | 'uploads' | 'bibliography' | 'margins' | 'toc' | 'templates' | null>(null);

  // Reset activeDrawerType from 'cover' to null if continuous paper size is selected
  // and turn off showTOC and showBibliography automatically
  useEffect(() => {
    if (settings.pageSize === 'continuous') {
      if (activeDrawerType === 'cover') {
        setActiveDrawerType(null);
      }
      if (settings.showTOC || settings.showBibliography) {
        setSettings((prev) => ({
          ...prev,
          showTOC: false,
          showBibliography: false,
        }));
      }
    }
  }, [settings.pageSize, activeDrawerType, settings.showTOC, settings.showBibliography]);

  const [staticSyncDelay, setStaticSyncDelay] = useState<number>(() => {
    const cached = localStorage.getItem('wp_static_sync_delay');
    return cached ? parseInt(cached, 10) : 300;
  });
  const [isCompiling, setIsCompiling] = useState<boolean>(false);

  // Helper to split any flat content back into blocks (used for initial or backup parses)
  const updateBlocksFromHTML = (htmlText: string) => {
    const blocks: HTMLBlock[] = [];
    // Search for block comment structures
    const blockRegex = /<!--\s*===BLOCK_START===\s*name="([^"]+)"\s*collapsed="([^"]+)"\s*(?:isMarkdown="([^"]+)"\s*)?-->([\s\S]*?)<!--\s*===BLOCK_END===\s*-->/g;
    
    let match;
    let index = 0;
    while ((match = blockRegex.exec(htmlText)) !== null) {
      const name = match[1];
      const isCollapsed = match[2] === 'true';
      const code = match[4];
      blocks.push({
        id: `block_${Date.now()}_${index++}_${Math.random().toString(36).substr(2, 5)}`,
        name,
        code,
        collapsed: isCollapsed,
        isMarkdown: true
      });
    }
    
    if (blocks.length > 0) {
      setHtmlBlocks(blocks);
    } else {
      // Create a single default block
      setHtmlBlocks([{
        id: 'block_default',
        name: 'Bloque Principal',
        code: htmlText,
        collapsed: false,
        isMarkdown: true
      }]);
    }
  };

  // 4. Tracking if user has customized the document locally to protect their changes
  const [isLocallyEdited, setIsLocallyEdited] = useState<boolean>(() => {
    return localStorage.getItem('wp_is_locally_edited') === 'true';
  });

  // 5. Sidebar width custom size state
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const cachedWidth = localStorage.getItem('wp_sidebar_width');
    return cachedWidth ? parseInt(cachedWidth, 10) : 430;
  });

  // 6. Custom download file name state (without extension)
  const [exportFileName, setExportFileName] = useState<string>(() => {
    return localStorage.getItem('wp_export_filename') || '';
  });

  // 7. List of uploaded files
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDbLoaded, setIsDbLoaded] = useState<boolean>(false);

  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [pageCount, setPageCount] = useState<number>(1);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string>('');
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState<boolean>(false);
  const [isArchivoOpen, setIsArchivoOpen] = useState<boolean>(false);

  // 8. User Gemini API Key and API key connection modal state
  const [userApiKey, setUserApiKey] = useState<string>(() => {
    return localStorage.getItem('user_gemini_api_key') || '';
  });
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState<boolean>(false);

  // 9. Desktop project state (Electron bridge)
  const [projectFolder, setProjectFolder] = useState<string | null>(() => {
    return (window as any).__wpProjectFolder ?? null;
  });
  const [contentPath, setContentPath] = useState<string | null>(null);
  const [contentText, setContentText] = useState<string>('');
  const [externalCssText, setExternalCssText] = useState<string>('');
  const [bibPath, setBibPath] = useState<string | null>(null);
  const [showContentInPreview, setShowContentInPreview] = useState<boolean>(true);
  const [projectToast, setProjectToast] = useState<string | null>(null);
  const [buildNotice, setBuildNotice] = useState<string | null>(
    () => (window as any).__wpBuildNotice ?? null,
  );
  const [isProjectReady, setIsProjectReady] = useState<boolean>(false);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const savedFingerprintRef = useRef<string | null>(null);
  const baselineSetRef = useRef<boolean>(false);

  const bridge = (window as any).wpBridge;

  // On mount in Electron edit-mode: load the project folder that the CLI opened
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (bridge) {
          const folder = await bridge.getFolder();
          if (!cancelled && folder) {
            setProjectFolder(folder);
            const data = await bridge.readFolder(folder);
            if (!cancelled && data) {
              applyProjectData(data);
            }
          }
          if (!cancelled) setIsProjectReady(true);
          return;
        }
      } catch (e) {
        console.error('Error reading project via bridge:', e);
      }
      // In a plain browser, fall back to a /content.html fetch if present
      if (!cancelled) {
        setIsProjectReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyProjectData = (data: any) => {
    if (!data) return;
    if (data.manifest) {
      if (data.manifest.cover) {
        setCover((prev) => {
          const c: any = { ...prev, ...data.manifest.cover };
          if (
            !c.overlayHtml ||
            (c.overlayHtml as string).includes('.cv-logo') ||
            (c.overlayHtml as string).includes('{{content}}')
          ) {
            c.overlayHtml = compileCoverHtml(
              c.overlayTemplate || DEFAULT_OVERLAY_TEMPLATE,
              c.overlayMarkdown || DEFAULT_OVERLAY_MARKDOWN,
            );
          }
          return c;
        });
      }
      if (data.manifest.settings) {
        setSettings((prev) => ({ ...prev, ...data.manifest.settings, autoRefreshFile: true }));
      }
      // The external styles sheet wins over the manifest mirror for CSS blocks.
      if (data.stylesText) {
        const parsed = parseStylesFile(data.stylesText);
        if (Object.keys(parsed).length > 0) {
          setSettings((prev) => {
            const next: any = { ...prev };
            for (const sec of STYLES_SECTIONS) {
              const value = parsed[sec.field];
              if (value !== undefined) next[sec.field] = value;
            }
            return next;
          });
        }
      }
      if (data.manifest.bibliography) setBibliography(data.manifest.bibliography);
      if (data.manifest.uploadedFiles) setUploadedFiles(data.manifest.uploadedFiles);
    }
    if (data.bibtex !== undefined && data.bibtex !== null) {
      setBibtex(data.bibtex);
      setBibPath(data.bibPath || (data.manifest?.bibFile || null));
    }
    if (data.images && data.images.length > 0) {
      setUploadedFiles((prev) => {
        const merged = [...prev];
        for (const img of data.images) {
          if (!merged.some((f) => f.name === img.name)) {
            merged.push({
              id: 'file_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
              name: img.name,
              type: img.type,
              size: img.size,
              dataUrl: img.dataUrl,
              uploadedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            });
          }
        }
        return merged;
      });
    }
    if (data.contentText) {
      setContentText(data.contentText);
      setContentPath(data.contentPath || null);
    }
  };

  // Auto-refresh the paginated view every time `mdwp build` runs (or any
  // relevant project file changes on disk) by reloading the project.
  useEffect(() => {
    if (!bridge) return;
    const reload = async () => {
      try {
        const folder = await bridge.getFolder();
        if (!folder) return;
        const data = await bridge.readFolder(folder);
        if (!data) return;
        if (isLocallyEdited) {
          // Keep the user's local content edits, refresh everything else.
          const { contentText: _keep, contentPath: _keep2, ...rest } = data;
          applyProjectData(rest);
        } else {
          applyProjectData(data);
        }
      } catch (e) {
        console.error('No se pudo recargar el proyecto tras un cambio:', e);
      }
    };
    const unsubscribe = bridge.onProjectChanged?.(reload);
    return () => {
      if (unsubscribe) unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge, isLocallyEdited]);

  const handlePickFolder = async () => {
    if (!bridge) {
      const input = document.createElement('input');
      input.type = 'file';
      input.webkitdirectory = true as any;
      input.onchange = (e: any) => {
        const first = e.target?.files?.[0];
        if (first) {
          const folder = first.webkitRelativePath.split('/')[0];
          setProjectFolder(folder);
        }
      };
      input.click();
      return;
    }
    const folder = await bridge.pickFolder();
    if (folder) {
      setProjectFolder(folder);
      setProjectToast(null);
      const data = await bridge.readFolder(folder);
      if (data) applyProjectData(data);
    }
  };

  const handlePickFile = async () => {
    if (!bridge || !projectFolder) return;
    const filePath = await bridge.pickFile();
    if (!filePath) return;
    setContentPath(filePath);
    try {
      const text = await bridge.readFile(filePath);
      setContentText(text || '');
    } catch (e) {
      console.error('Error reading content file:', e);
    }
  };

  const handlePickBib = async () => {
    if (!bridge || !projectFolder) return;
    const filePath = await bridge.pickBib();
    if (!filePath) return;
    setBibPath(filePath);
    try {
      const text = await bridge.readFile(filePath);
      setBibtex(text || '');
    } catch (e) {
      console.error('Error reading bibliography file:', e);
    }
  };

  const handleSaveProject = async () => {
    if (!bridge || !projectFolder) return;
    try {
      const res = await bridge.writeFolder({
        folder: projectFolder,
        manifest: {
          cover,
          settings,
          uploadedFiles,
          htmlBlocks,
          bibliography,
          bibFile: bibPath || undefined,
          stylesFile: STYLES_FILE_NAME,
        },
        // contentPath/contentText are intentionally omitted: in the desktop
        // app the content file (contenido_fuente.qmd) is edited externally and
        // must never be overwritten by a stale in-memory snapshot on Save.
        bibtex,
        images: uploadedFiles,
        saveContent: false,
      });
      if (res && res.ok) {
        setBibPath(res.bibPath || bibPath);
        // Persist the CSS blocks to the external styles sheet too.
        try {
          const stylesText = buildStylesFile(settings);
          await bridge.writeStyles({
            folder: projectFolder,
            filename: STYLES_FILE_NAME,
            text: stylesText,
          });
        } catch (e) {
          console.error('Error al escribir documento-estilos.css:', e);
        }
        setProjectToast('Configuración guardada en ' + res.folder);
        savedFingerprintRef.current = saveFingerprint;
        setIsDirty(false);
      } else {
        setProjectToast('Error al guardar: ' + (res?.error || 'desconocido'));
      }
    } catch (e: any) {
      setProjectToast('Error al guardar: ' + (e?.message || e));
    }
  };

  const handleToggleShowContent = () => setShowContentInPreview((v) => !v);
  const handleDismissToast = () => setProjectToast(null);

  // Heading level edits from the TOC drawer are written back to the qmd file.
  const handleUpdateHeadingSource = (next: string) => {
    setContentText(next);
    const filePath = contentPath || (projectFolder ? `${projectFolder}/contenido_fuente.qmd` : null);
    if (bridge && filePath) {
      bridge.writeContent({ filePath, text: next })
        .then((res: any) => {
          if (res && res.ok) {
            const name = String(res.path || filePath).split(/[\\/]/).pop();
            setProjectToast('Título actualizado en ' + name);
          } else if (res && res.error) {
            setProjectToast('Error al guardar el título: ' + res.error);
          }
        })
        .catch((err: any) => {
          setProjectToast('Error al guardar el título: ' + (err?.message || err));
        });
    }
  };

  // Derived preview blocks: content file (when enabled) or empty (preview without content)
  const previewBlocks = useMemo<HTMLBlock[]>(() => {
    if (showContentInPreview && contentText) {
      return [
        {
          id: 'block_contenido',
          name: 'Contenido',
          code: contentText,
          collapsed: false,
          isMarkdown: true,
        },
      ];
    }
    return [];
  }, [contentText, showContentInPreview]);

  // In build mode (CLI), load the project from the data server and compile.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const server = params.get('server');
    const title = params.get('title');
    if (mode !== 'build' && mode !== 'pdf') return;
    if (title) buildTitleRef.current = title;
    runHeadlessCompile(mode, server);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load CSS files referenced in the qmd YAML front matter (e.g. timeline.css)
  // so the preview and the exported document render them like Quarto does. The
  // WP styles sheet (documento-estilos.css) is excluded because it is already
  // parsed into the settings blocks above.
  const loadExternalStyles = useCallback(
    async (text: string, server: string | null) => {
      let next = '';
      try {
        const names = getYamlCssSources(text).filter((n) => n !== STYLES_FILE_NAME);
        for (const name of names) {
          let cssText = '';
          if (server) {
            const res = await fetch(server.replace(/\/$/, '') + '/' + encodeURIComponent(name));
            if (res.ok) cssText = await res.text();
          } else if (bridge && projectFolder) {
            cssText = await bridge.readFile(projectFolder + '/' + name);
          }
          if (cssText) next += (next ? '\n' : '') + `/* === CSS YAML: ${name} === */\n` + cssText;
        }
      } catch (e) {
        console.error('Error cargando CSS externo del YAML:', e);
      }
      setExternalCssText(next);
    },
    [bridge, projectFolder],
  );

  // Desktop mode: reload the YAML CSS whenever the content file changes.
  useEffect(() => {
    const mode = new URLSearchParams(window.location.search).get('mode');
    if (mode === 'build' || mode === 'pdf' || !contentText || !projectFolder) return;
    loadExternalStyles(contentText, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentText, projectFolder]);

  const runHeadlessCompile = async (mode: string, server: string | null) => {
    try {
      if (server) {
        const base = server.replace(/\/$/, '');
        const manifestRes = await fetch(base + '/configuracion_metadatos.json');
        let manifest = {};
        if (manifestRes.ok) {
          try {
            manifest = await manifestRes.json();
          } catch (e) {
            manifest = {};
          }
        }
        if (manifest) {
          const m: any = manifest;
          if (m.cover) {
            setCover((prev) => {
              const c: any = { ...prev, ...m.cover };
              if (
                !c.overlayHtml ||
                (c.overlayHtml as string).includes('.cv-logo') ||
                (c.overlayHtml as string).includes('{{content}}')
              ) {
                c.overlayHtml = compileCoverHtml(
                  c.overlayTemplate || DEFAULT_OVERLAY_TEMPLATE,
                  c.overlayMarkdown || DEFAULT_OVERLAY_MARKDOWN,
                );
              }
              return c;
            });
          }
          if (m.settings) setSettings((prev) => ({ ...prev, ...m.settings, autoRefreshFile: true }));
          if (m.bibliography) setBibliography(m.bibliography);
          if (m.uploadedFiles) setUploadedFiles(m.uploadedFiles);
          if (m.htmlBlocks) setHtmlBlocks(m.htmlBlocks);
          // The external styles sheet (documento-estilos.css, referenced in the
          // YAML) wins over the manifest mirror, so `mdwp build` renders with
          // the same CSS Quarto sees.
          try {
            const styleNames = [...new Set([STYLES_FILE_NAME, m.stylesFile].filter(Boolean))] as string[];
            for (const name of styleNames) {
              const stylesRes = await fetch(base + '/' + encodeURIComponent(name));
              if (stylesRes.ok && stylesRes.headers.get('content-type')?.includes('css')) {
                const parsed = parseStylesFile(await stylesRes.text());
                if (Object.keys(parsed).length > 0) {
                  setSettings((prev) => {
                    const next: any = { ...prev };
                    for (const sec of STYLES_SECTIONS) {
                      const value = parsed[sec.field];
                      if (value !== undefined) next[sec.field] = value;
                    }
                    return next;
                  });
                }
                break;
              }
            }
          } catch (e) {
            /* ignore missing styles file */
          }
        }
        // Fetch content file (try to use the one the CLI tells us via content file name).
        // Fall back to the legacy .md name for projects created before .qmd.
        const contentNames = [
          (manifest as any)?.contentFile?.split(/[\\/]/).pop() || 'contenido_fuente.qmd',
          'contenido_fuente.md',
        ];
        for (const contentName of [...new Set(contentNames)]) {
          const contentRes = await fetch(base + '/' + encodeURIComponent(contentName));
          if (contentRes.ok) {
            const text = await contentRes.text();
            if (text) {
              setContentText(text);
              setContentPath(contentName);
              await loadExternalStyles(text, base);
              break;
            }
          }
        }
        // Fetch bibliography (.bib) file, falling back to the parsed array.
        const bibName = (manifest as any)?.bibFile?.split(/[\\/]/).pop() || 'bibliografia.bib';
        try {
          const bibRes = await fetch(base + '/' + encodeURIComponent(bibName));
          if (bibRes.ok) {
            const text = await bibRes.text();
            if (text) setBibtex(text);
          }
        } catch (e) {
          /* ignore missing bib file */
        }
      }

      // Persist the compiled output after pagination settles
      await persistCompiledDocument(mode, server);
    } catch (e) {
      console.error('Headless compile error:', e);
      window.__wpCompileDone?.();
    }
  };

  const persistCompiledDocument = async (mode: string, server: string | null) => {
    const currentCover = coverRef.current || cover;
    const currentSettings = settingsRef.current || settings;
    const hasCover = currentSettings.pageSize !== 'continuous' && currentCover.enabled !== false;
    const maxWait = 90000;
    const started = Date.now();
    let lastPageCount = -1;
    let stableTicks = 0;
    while (Date.now() - started < maxWait) {
      const currentPageCount = pageCountRef.current;
      const pages = document.querySelectorAll('[name^="document-page-"]');
      const textLen = (document.querySelector('.wp-document-content')?.textContent || '').length;
      const hasContent = textLen > 0 || currentPageCount > 0;
      const covEl = document.getElementById('wp-cover-page');
      const hasCoverReady = !hasCover || (covEl ? covEl.textContent.trim().length > 3 : false);
      if (hasContent && hasCoverReady && currentPageCount === lastPageCount && currentPageCount > 0) {
        stableTicks += 1;
        if (stableTicks >= 3) break;
      } else {
        lastPageCount = currentPageCount;
        stableTicks = 0;
      }
      await new Promise((r) => setTimeout(r, 400));
    }

    await new Promise((r) => setTimeout(r, 800));

    // Serialize the paginated DOM into a standalone HTML document
    const html = await captureStandaloneHtml();
    if (!html) {
      window.__wpCompileDone?.();
      return;
    }

    if (server) {
      try {
        await fetch(server.replace(/\/$/, '') + '/__output', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ html, mode }),
        });
      } catch (e) {
        console.error('Error posting output:', e);
      }
    }
    window.__wpCompileDone?.();
  };

  const pageCountRef = useRef<number>(1);
  useEffect(() => {
    pageCountRef.current = pageCount;
    (window as any).__wpPageCount = pageCount;
  }, [pageCount]);

  const coverRef = useRef<CoverConfig>(cover);
  useEffect(() => {
    coverRef.current = cover;
  }, [cover]);

  const settingsRef = useRef<PageSettings>(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const uploadedFilesRef = useRef<UploadedFile[]>(uploadedFiles);
  useEffect(() => {
    uploadedFilesRef.current = uploadedFiles;
  }, [uploadedFiles]);

  const saveFingerprint = useMemo(() => {
    const images = uploadedFiles
      .map((f) => `${f.name}:${f.type}:${f.size}:${f.dataUrl.length}:${f.dataUrl.slice(0, 64)}:${f.dataUrl.slice(-64)}`)
      .join('|');
    const blocks = htmlBlocks
      .map((b) => `${b.id}:${b.collapsed}:${b.name}:${b.code}`)
      .join('|');
    return JSON.stringify({ cover, settings, bibliography }) + '##' + blocks + '##' + images;
  }, [cover, settings, uploadedFiles, htmlBlocks, bibliography]);

  useEffect(() => {
    if (!isProjectReady || baselineSetRef.current) return;
    baselineSetRef.current = true;
    savedFingerprintRef.current = saveFingerprint;
    setIsDirty(false);
  }, [isProjectReady, saveFingerprint]);

  useEffect(() => {
    if (!baselineSetRef.current) return;
    setIsDirty(saveFingerprint !== savedFingerprintRef.current);
  }, [saveFingerprint]);

  const saveHandlerRef = useRef<() => void>(() => {});
  saveHandlerRef.current = handleSaveProject;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        if (projectFolder) saveHandlerRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [projectFolder]);

  const buildTitleRef = useRef<string | null>(null);

  const captureStandaloneHtml = async (): Promise<string | null> => {
    const currentCover = coverRef.current || cover;
    const currentSettings = settingsRef.current || settings;
    const coverEl = document.getElementById('wp-cover-page');
    const pageEls = document.querySelectorAll('[name^="document-page-"]');
    if (pageEls.length === 0 && !coverEl) return null;

    let body = '';
    const hasCover = currentSettings.pageSize !== 'continuous' && currentCover.enabled !== false;
    if (hasCover && coverEl) {
      const c = coverEl.cloneNode(true) as HTMLElement;
      c.style.boxShadow = 'none';
      c.style.border = 'none';
      c.style.margin = '0 auto';
      body += `<div class="print-page-boundary">${c.outerHTML}</div>\n`;
    }
    pageEls.forEach((el) => {
      const clone = el.cloneNode(true) as HTMLElement;
      clone.style.boxShadow = 'none';
      clone.style.border = 'none';
      clone.style.margin = '0 auto';
      body += `<div class="print-page-boundary">${clone.outerHTML}</div>\n`;
    });

    // Capture the live preview's own CSS (compiled app bundle + injected document
    // styles). The paginator measures content under THIS CSS, so the export must
    // reproduce it faithfully or content can render taller than the page and get
    // clipped by the sheet's overflow:hidden.
    let previewCss = '';
    try {
      const cssParts: string[] = [];
      for (const link of Array.from(document.querySelectorAll('link[rel="stylesheet"]'))) {
        const href = (link as HTMLLinkElement).href;
        if (href) {
          try {
            const res = await fetch(href);
            if (res.ok) cssParts.push(await res.text());
          } catch (e) {
            /* omitir estilosheets no accesibles (CORS / protocolos custom) */
          }
        }
      }
      document.querySelectorAll('style').forEach((styleEl) => {
        const text = (styleEl as HTMLStyleElement).textContent || '';
        if (text.trim()) cssParts.push(text);
      });
      previewCss = cssParts.join('\n');
    } catch (e) {
      previewCss = '';
    }

    // Reuse the same global/typography CSS used by the editor
    let html = buildStandaloneHtml({
      settings: currentSettings,
      cover: currentCover,
      pagesHTML: body,
      exportFileName: buildTitleRef.current || exportFileName,
      previewCss,
    });

    // Reference uploaded images by their filename (relative to this HTML file)
    // instead of embedding them as base64. The image files live in the same
    // folder as the generated document, so the browser can resolve them.
    const activeUploadedFiles = uploadedFilesRef.current || [];
    if (activeUploadedFiles.length > 0) {
      activeUploadedFiles.forEach((file) => {
        if (file && file.dataUrl && file.name) {
          html = html.replaceAll(file.dataUrl, file.name);
        }
      });
    }
    return html;
  };


  useEffect(() => {
    localStorage.setItem('user_gemini_api_key', userApiKey);
  }, [userApiKey]);
  
  const lastFetchedContentRef = useRef<string>('');
  const isResizingRef = useRef<boolean>(false);
  const [isResizing, setIsResizing] = useState<boolean>(false);

  // Global Drag-and-Drop state & effect
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [dragFileType, setDragFileType] = useState<'image' | 'bib' | 'mixed' | 'generic'>('generic');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const dragCounterRef = useRef<number>(0);

  // Auto-clear toast notification
  useEffect(() => {
    if (toastMsg) {
      const timer = setTimeout(() => setToastMsg(null), 4500);
      return () => clearTimeout(timer);
    }
  }, [toastMsg]);

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current += 1;

      if (e.dataTransfer && e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
        let hasImage = false;
        let hasBib = false;

        if (e.dataTransfer.items) {
          for (let i = 0; i < e.dataTransfer.items.length; i++) {
            const item = e.dataTransfer.items[i];
            const type = (item.type || '').toLowerCase();
            if (type.startsWith('image/')) {
              hasImage = true;
            } else if (type.includes('bib') || type.includes('bibtex')) {
              hasBib = true;
            }
          }
        }

        if (hasImage && hasBib) {
          setDragFileType('mixed');
        } else if (hasImage) {
          setDragFileType('image');
        } else if (hasBib) {
          setDragFileType('bib');
        } else {
          setDragFileType('generic');
        }

        setIsDraggingOver(true);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current -= 1;
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0;
        setIsDraggingOver(false);
      }
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDraggingOver(false);

      if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) {
        return;
      }

      const files = Array.from(e.dataTransfer.files);

      const imageFiles = files.filter(f => 
        f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(f.name)
      );

      const bibFiles = files.filter(f => 
        f.name.toLowerCase().endsWith('.bib') || f.type.includes('bibtex') || f.type.includes('bib')
      );

      let messages: string[] = [];

      // 1. Process Images
      if (imageFiles.length > 0) {
        const newUploadedFiles: UploadedFile[] = await Promise.all(
          imageFiles.map(file => new Promise<UploadedFile>((resolve) => {
            const reader = new FileReader();
            reader.onload = (event) => {
              resolve({
                id: 'file_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
                name: file.name,
                type: file.type || 'image',
                size: file.size,
                dataUrl: event.target?.result as string,
                uploadedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                description: ''
              });
            };
            reader.readAsDataURL(file);
          }))
        );

        setUploadedFiles(prev => [...prev, ...newUploadedFiles]);
        messages.push(
          imageFiles.length === 1 
            ? `Imagen "${imageFiles[0].name}" agregada con éxito a tus recursos.` 
            : `${imageFiles.length} imágenes agregadas con éxito a tus recursos.`
        );
      }

      // 2. Process .bib file
      if (bibFiles.length > 0) {
        const bibFile = bibFiles[0];
        const reader = new FileReader();
        reader.onload = (event) => {
          const text = event.target?.result as string;
          if (text) {
            setBibtex(text);
            setToastMsg(`Bibliografía actual eliminada y reemplazada con éxito por el archivo "${bibFile.name}".`);
          }
        };
        reader.readAsText(bibFile);
        if (imageFiles.length > 0) {
          messages.push(`Bibliografía .bib reemplazada.`);
        }
      }

      if (messages.length > 0 && bibFiles.length === 0) {
        setToastMsg(messages.join(' '));
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  // Compiled states for frozen preview
  const [compiledCover, setCompiledCover] = useState<CoverConfig>(cover);
  const [compiledSettings, setCompiledSettings] = useState<PageSettings>(settings);
  const [compiledHtmlBlocks, setCompiledHtmlBlocks] = useState<HTMLBlock[]>(htmlBlocks);
  const [compiledBibliography, setCompiledBibliography] = useState<BibliographyItem[]>(bibliography);
  const [compiledUploadedFiles, setCompiledUploadedFiles] = useState<UploadedFile[]>(uploadedFiles);
  const [compiledHtmlContent, setCompiledHtmlContent] = useState<string>(htmlContent);

  // Save sync delays setting
  useEffect(() => {
    localStorage.setItem('wp_static_sync_delay', String(staticSyncDelay));
  }, [staticSyncDelay]);

  // Handle instant manual sync (Ctrl+S)
  const handleCompile = () => {
    setCompiledCover(JSON.parse(JSON.stringify(cover)));
    setCompiledSettings(JSON.parse(JSON.stringify(settings)));
    setCompiledHtmlBlocks(JSON.parse(JSON.stringify(htmlBlocks)));
    setCompiledBibliography(JSON.parse(JSON.stringify(bibliography)));
    setCompiledUploadedFiles(JSON.parse(JSON.stringify(uploadedFiles)));
    setCompiledHtmlContent(htmlContent);
    setIsCompiling(false);
  };

  // Keyboard shortcut listener for Ctrl+S / Cmd+S manual compilation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleCompile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [cover, settings, htmlBlocks, bibliography, uploadedFiles, htmlContent]);

  // Click outside detector for export & archivo dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const container = document.getElementById('export-dropdown-container');
      if (container && !container.contains(e.target as Node)) {
        setIsExportDropdownOpen(false);
      }
      const archivoContainer = document.getElementById('archivo-dropdown-container');
      if (archivoContainer && !archivoContainer.contains(e.target as Node)) {
        setIsArchivoOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Global static pages sync effect debounced by staticSyncDelay
  useEffect(() => {
    const isDifferent =
      JSON.stringify(cover) !== JSON.stringify(compiledCover) ||
      JSON.stringify(settings) !== JSON.stringify(compiledSettings) ||
      JSON.stringify(htmlBlocks) !== JSON.stringify(compiledHtmlBlocks) ||
      JSON.stringify(bibliography) !== JSON.stringify(compiledBibliography) ||
      JSON.stringify(uploadedFiles) !== JSON.stringify(compiledUploadedFiles) ||
      htmlContent !== compiledHtmlContent;

    if (!isDifferent) {
      setIsCompiling(false);
      return;
    }

    setIsCompiling(true);
    const timer = setTimeout(() => {
      setCompiledCover(cover);
      setCompiledSettings(settings);
      setCompiledHtmlBlocks(htmlBlocks);
      setCompiledBibliography(bibliography);
      setCompiledUploadedFiles(uploadedFiles);
      setCompiledHtmlContent(htmlContent);
      setIsCompiling(false);
    }, staticSyncDelay);

    return () => clearTimeout(timer);
  }, [
    staticSyncDelay,
    cover,
    settings,
    htmlBlocks,
    bibliography,
    uploadedFiles,
    htmlContent,
    compiledCover,
    compiledSettings,
    compiledHtmlBlocks,
    compiledBibliography,
    compiledUploadedFiles,
    compiledHtmlContent
  ]);

  // Sync state changes back to localStorage
  useEffect(() => {
    localStorage.setItem('wp_cover_config', JSON.stringify(cover));
  }, [cover]);

  useEffect(() => {
    localStorage.setItem('wp_page_settings', JSON.stringify(settings));
  }, [settings]);

  // Synchronize htmlBlocks changes and serialize them inside computed htmlContent
  useEffect(() => {
    localStorage.setItem('wp_html_blocks', JSON.stringify(htmlBlocks));
    const merged = htmlBlocks.map(b => {
      return `<!-- ===BLOCK_START=== name="${b.name}" collapsed="${b.collapsed}"${b.isMarkdown ? ' isMarkdown="true"' : ''} -->\n${b.code}\n<!-- ===BLOCK_END=== -->`;
    }).join('\n\n');
    setHtmlContent(merged);
    localStorage.setItem('wp_html_content', merged);
  }, [htmlBlocks]);

  useEffect(() => {
    localStorage.setItem('wp_static_sync_delay', String(staticSyncDelay));
  }, [staticSyncDelay]);

  useEffect(() => {
    localStorage.setItem('wp_is_locally_edited', String(isLocallyEdited));
  }, [isLocallyEdited]);

  useEffect(() => {
    localStorage.setItem('wp_sidebar_width', String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem('wp_export_filename', exportFileName);
  }, [exportFileName]);

  // Sync main tab document.title with the custom filename or cover title
  useEffect(() => {
    if (exportFileName && exportFileName.trim()) {
      document.title = exportFileName.trim();
    } else {
      document.title = cover.title || "Plantilla de Documentación Académica";
    }
  }, [exportFileName, cover.title]);

  // Initialize and load files from IndexedDB or migrate from localStorage
  useEffect(() => {
    async function loadFiles() {
      const cached = localStorage.getItem('wp_uploaded_files');
      if (cached) {
        try {
          const files = JSON.parse(cached);
          if (files && files.length > 0) {
            setUploadedFiles(files);
            await saveUploadedFilesToDB(files);
          }
          localStorage.removeItem('wp_uploaded_files');
        } catch (e) {
          console.error('Error migrating files from localStorage:', e);
        }
      } else {
        const files = await getAllUploadedFiles();
        if (files && files.length > 0) {
          setUploadedFiles(files);
        }
      }
      setIsDbLoaded(true);
    }
    loadFiles();
  }, []);

  // Save files to IndexedDB
  useEffect(() => {
    if (isDbLoaded) {
      saveUploadedFilesToDB(uploadedFiles);
    }
  }, [uploadedFiles, isDbLoaded]);

  // Core Function to Fetch /content.html content
  const fetchContentFile = async (silent = false) => {
    // CRITICAL BUG FIX: If user has edited local values, do NOT poll/overwrite unless they explicitly chose to
    if (isLocallyEdited && silent) return;

    // Desktop (Electron) or Headless CLI build mode: content comes from the project folder via the
    // bridge or runHeadlessCompile, not from a legacy /content.html endpoint.
    const isHeadless = typeof window !== 'undefined' && (new URLSearchParams(window.location.search).get('mode') === 'build' || new URLSearchParams(window.location.search).get('mode') === 'pdf');
    if (bridge || isHeadless) return;

    if (!silent) setIsSyncing(true);
    try {
      const timestamp = Date.now();
      const response = await fetch(`/content.html?t=${timestamp}`);
      if (response.ok) {
        const text = await response.text();
        if (text) {
          // If the user hasn't edited anything on the UI, pull the file safely
          if (!isLocallyEdited) {
            lastFetchedContentRef.current = text;
            updateBlocksFromHTML(text);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching content.html file:', err);
    } finally {
      if (!silent) setIsSyncing(false);
    }
  };

  // Initial fetch on mount if local cache is empty
  useEffect(() => {
    if (!htmlContent) {
      fetchContentFile();
    }
  }, []);

  // Interval for Live Auto-Refresher polling
  useEffect(() => {
    let intervalId: any = null;
    if (settings.autoRefreshFile && !isLocallyEdited) {
      intervalId = setInterval(() => {
        fetchContentFile(true);
      }, 2000); // Polls every 2 seconds for server edits
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [settings.autoRefreshFile, isLocallyEdited]);

  // Handle local textbox edits safely
  const handleHtmlContentChange = (newVal: string) => {
    updateBlocksFromHTML(newVal);
    setIsLocallyEdited(true); // Flag as customized so live polling doesn't wipe changes
  };

  // Re-sync with server file (reverting manual edits)
  const handleResetToOriginal = async () => {
    setIsSyncing(true);
    setSyncStatusMsg('Reincorporando...');
    try {
      const timestamp = Date.now();
      const response = await fetch(`/content.html?t=${timestamp}`);
      if (response.ok) {
        const text = await response.text();
        updateBlocksFromHTML(text);
        setIsLocallyEdited(false);
        setSyncStatusMsg('Sincronizado');
        setTimeout(() => setSyncStatusMsg(''), 2500);
      } else {
        setSyncStatusMsg('Error de servidor');
        setTimeout(() => setSyncStatusMsg(''), 3000);
      }
    } catch (err) {
      console.error('Error restoring original content:', err);
      setSyncStatusMsg('Fallo conexión');
      setTimeout(() => setSyncStatusMsg(''), 3000);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleInsertHTML = (snippet: string) => {
    const targetBlockId = lastFocusedBlockId || (htmlBlocks[0] && htmlBlocks[0].id);
    if (!targetBlockId) {
      alert("Por favor haga clic o enfoque algún bloque primero.");
      return;
    }
    setHtmlBlocks(prev => prev.map(b => {
      if (b.id !== targetBlockId) return b;
      
      const textarea = document.getElementById(`editor-textarea-${targetBlockId}`) as HTMLTextAreaElement;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const currentVal = b.code;
        const newVal = currentVal.substring(0, start) + snippet + currentVal.substring(end);
        
        setTimeout(() => {
          textarea.focus();
          textarea.selectionStart = textarea.selectionEnd = start + snippet.length;
        }, 50);
        return { ...b, code: newVal };
      }
      return { ...b, code: b.code + snippet };
    }));
  };

  // Complete Reset of all settings and contents to start from 0
  const handleResetAllToZero = async () => {
    if (window.confirm('¿Está seguro de que desea eliminar TODOS los cambios (portada, margen, estilos, imágenes y contenido html) y empezar desde cero? Esta acción no se puede deshacer.')) {
      localStorage.removeItem('wp_cover_config');
      localStorage.removeItem('wp_page_settings');
      localStorage.removeItem('wp_html_content');
      localStorage.removeItem('wp_html_blocks');
      localStorage.removeItem('wp_is_locally_edited');
      localStorage.removeItem('wp_sidebar_width');
      localStorage.removeItem('wp_export_filename');
      localStorage.removeItem('wp_uploaded_files');
      
      try {
        await clearAllUploadedFilesDB();
      } catch (e) {
        console.error('Error clearing IndexedDB:', e);
      }
      
      window.location.reload();
    }
  };

  // ZIP FILE PROJECT IMPORT SYSTEM
  const handleImportZIP = async (file: File) => {
    try {
      const zip = await JSZip.loadAsync(file);
      const metaFile = zip.file("configuracion_metadatos.json");
      const sourceFile = zip.file("contenido_fuente.html");

      if (!metaFile) {
        alert("El archivo ZIP no contiene la configuración del proyecto (configuracion_metadatos.json). Asegúrese de importar un ZIP válido exportado por esta aplicación.");
        return;
      }

      // Automatically download the current open project as a backup before loading the new one
      handleExport('project');

      const metaText = await metaFile.async("string");
      const metaData = JSON.parse(metaText);

      if (metaData.cover) {
        setCover(metaData.cover);
      }
      if (metaData.settings) {
        // Enforce autoRefreshFile stays true as per instructions, but load everything else
        const parsedSettings = { ...metaData.settings };
        parsedSettings.autoRefreshFile = true;
        setSettings(parsedSettings);
      }
      if (metaData.uploadedFiles) {
        setUploadedFiles(metaData.uploadedFiles);
      }

      if (metaData.htmlBlocks) {
        setHtmlBlocks(metaData.htmlBlocks);
      } else if (sourceFile) {
        const sourceText = await sourceFile.async("string");
        updateBlocksFromHTML(sourceText);
      }

      if (metaData.bibliography) {
        setBibliography(metaData.bibliography);
      }

      setIsLocallyEdited(true);

      // Extract original file name (excluding extension) to pre-fill the name picker
      const baseName = file.name.replace(/\.zip$/i, '').replace(/_proyecto_academico$/i, '').replace(/_proyecto$/i, '');
      setExportFileName(baseName);

      alert("¡Proyecto importado con éxito! El proyecto que tenías abierto se descargó automáticamente como respaldo.");
    } catch (err) {
      console.error("Error al importar el archivo ZIP:", err);
      alert("Error al procesar el archivo ZIP. Asegúrese de que no esté dañado o no sea un ZIP de proyecto válido.");
    }
  };

  // RESIZING DRAG ALGORITHM
  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    setIsResizing(true);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResizing);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizingRef.current) return;
    const newWidth = Math.max(290, Math.min(e.clientX - 76, 1000));
    setSidebarWidth(newWidth);
  };

  const stopResizing = () => {
    isResizingRef.current = false;
    setIsResizing(false);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopResizing);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  // HIGH-FIDELITY SELF-CONTAINED ZIP EXPORTER
  const handleExport = (type: 'project' | 'html' | 'pdf_generator' = 'project') => {
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

    const coverElement = document.getElementById('wp-cover-page');
    const pageElements = document.querySelectorAll('[name^="document-page-"]');

    const hasCover = settings.pageSize !== 'continuous' && cover.enabled !== false;
    if ((hasCover && !coverElement) || pageElements.length === 0) {
      alert('Error: Por favor, asegúrese de que el previsualizador haya cargado las páginas antes de exportar.');
      return;
    }

    // Capture pages markup
    let pagesHTML = '';
    // Append cover if enabled
    if (hasCover && coverElement) {
      pagesHTML += `<div class="print-page-boundary">${coverElement.outerHTML}</div>\n`;
    }
    // Append each page structure
    pageElements.forEach((el) => {
      const clone = el.cloneNode(true) as HTMLElement;
      // Strip dashboard specific dashed guide lines overlay
      const guide = clone.querySelector('.absolute.inset-0.pointer-events-none');
      if (guide && guide.innerHTML.includes('Guía:')) {
        guide.remove();
      }
      pagesHTML += `<div class="print-page-boundary">${clone.outerHTML}</div>\n`;
    });

    const isLetterSize = settings.pageSize === 'letter';
    const isA4 = settings.pageSize === 'a4';
    const isContinuous = settings.pageSize === 'continuous';
    const isPortrait = (settings.orientation || 'portrait') === 'portrait';
    
    // Base physical dimensions for layout (swapped if Landscape orientation is selected)
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

    // Helper to sanitize any CSS input by removing manual <style> tags and avoiding stylesheet breakages
    const sanitizeCSS = (rawCss: string) => {
      if (!rawCss) return '';
      return rawCss
        .replace(/<\/?style[^>]*>/gi, '') // Strips <style> and </style> case insensitive
        .replace(/<\/script>/gi, '');     // Strips </script>
    };

    // Compile dynamic styles matching DocumentPreview.tsx layout parameters
    const getGraphicalCSS = () => {
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

      // P
      if (settings.pSize || settings.pFont || settings.pAlign || settings.pLineHeight || settings.pIndent !== undefined || settings.pBold !== undefined || settings.pItalic !== undefined || settings.pColor) {
        css += `\n.wp-document-content, .wp-document-content p, .wp-document-content div:not(.wp-academic-header):not(.wp-academic-footer):not(.toc-container):not(.note):not(.math-expr) {`;
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

      // Tablas
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
      
      return css;
    };

    const cleanHTML = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${exportFileName || cover.title || 'Plantilla de Documento Académico'}</title>
  
  <!-- Tailwind CSS Play CDN compiler to guarantee precise styling of layout positions & borders -->
  <script src="https://cdn.tailwindcss.com"></script>
  
  <!-- KaTeX CSS for mathematical symbol styling -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">

  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Space+Grotesk:wght@400;500;600;700&family=Fira+Code:wght@400;500&display=swap');
    
    * {
      box-sizing: border-box;
    }
    
    body, html {
      margin: 0;
      padding: 0;
      background-color: #fafafa !important;
      font-family: "Inter", system-ui, -apple-system, sans-serif;
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
    }
    
    /* Screen staging preview classes (centered stacked sheets) */
    .document-rendered-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 32px;
      padding: 48px 24px;
      background-color: #fafafa !important;
    }

    /* Core Pages layout constraints matching original previews */
    div[name^="document-page-"] {
      position: relative !important;
      background-color: #ffffff !important;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1) !important;
      border: none !important;
      padding-top: ${topMargin}px !important;
      padding-bottom: ${bottomMargin}px !important;
      padding-left: ${leftMargin}px !important;
      padding-right: ${rightMargin}px !important;
      box-sizing: border-box !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: space-between !important;
      overflow: hidden !important;
      flex-shrink: 0 !important;
      width: ${paperWidth} !important;
      height: ${paperHeight} !important;
    }

    #wp-cover-page {
      position: relative !important;
      background-color: #ffffff !important;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1) !important;
      border: none !important;
      padding: 0 !important; /* Cover is full bleed */
      box-sizing: border-box !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: space-between !important;
      overflow: hidden !important;
      flex-shrink: 0 !important;
      width: ${paperWidth} !important;
      height: ${paperHeight} !important;
    }

    /* Position wrappers */
    .absolute { position: absolute !important; }
    
    /* WP Typography core blocks rules */
    .wp-document-content *:not(.katex):not(.katex *):not(table):not(thead):not(tbody):not(tr):not(th):not(td):not(figure):not(.note):not(hr):not(.toc-dots),
    .wp-document-content *::before,
    .wp-document-content *::after,
    .wp-template-content *:not(.katex):not(.katex *):not(table):not(thead):not(tbody):not(tr):not(th):not(td):not(figure):not(.note):not(hr):not(.toc-dots),
    .wp-template-content *::before,
    .wp-template-content *::after,
    .document-rendered-container *:not(.katex):not(.katex *):not(table):not(thead):not(tbody):not(tr):not(th):not(td):not(figure):not(.note):not(hr):not(.toc-dots),
    .continuous-page-boundary {
      border: 0px none transparent !important;
      border-width: 0px !important;
      border-style: none !important;
      outline: none !important;
      box-shadow: none !important;
    }

    .katex .frac-line {
      border-bottom-style: solid !important;
      border-bottom-width: 0.04em !important;
      border-bottom-color: currentColor !important;
      display: inline-block !important;
    }

    .wp-document-content {
      font-family: "Times New Roman", Times, Georgia, serif !important;
      font-size: 16px !important;
      line-height: 1.8 !important;
      color: #000000 !important;
      text-align: left !important;
    }

    .wp-document-content h1 {
      font-family: "Times New Roman", Times, Georgia, serif !important;
      font-size: 16px !important;
      font-weight: bold !important;
      color: #000000 !important;
      text-transform: none !important;
      text-align: center !important;
      text-indent: 0px !important;
      margin-top: 24px !important;
      margin-bottom: 12px !important;
      padding-bottom: 0 !important;
      border-bottom: 0px none transparent !important;
      border-width: 0px !important;
      border-style: none !important;
      position: relative !important;
    }

    .wp-document-content h1::after {
      display: none !important;
      content: none !important;
    }

    .wp-document-content h2 {
      font-family: "Times New Roman", Times, Georgia, serif !important;
      font-size: 16px !important;
      font-weight: bold !important;
      color: #000000 !important;
      text-align: left !important;
      text-indent: 0px !important;
      margin-top: 18px !important;
      margin-bottom: 8px !important;
    }

    .wp-document-content h3 {
      font-family: "Times New Roman", Times, Georgia, serif !important;
      font-size: 16px !important;
      font-weight: bold !important;
      font-style: italic !important;
      color: #000000 !important;
      text-align: left !important;
      text-indent: 0px !important;
      margin-top: 12px !important;
      margin-bottom: 6px !important;
    }

    .wp-document-content h4 {
      font-family: "Times New Roman", Times, Georgia, serif !important;
      font-size: 16px !important;
      font-weight: bold !important;
      color: #000000 !important;
      text-align: left !important;
      text-indent: 0.5in !important;
      margin-top: 10px !important;
      margin-bottom: 4px !important;
    }

    .wp-document-content h5 {
      font-family: "Times New Roman", Times, Georgia, serif !important;
      font-size: 16px !important;
      font-weight: bold !important;
      font-style: italic !important;
      color: #000000 !important;
      text-align: left !important;
      text-indent: 0.5in !important;
      margin-top: 10px !important;
      margin-bottom: 4px !important;
    }

    .wp-document-content p {
      margin-top: 0 !important;
      margin-bottom: 0px !important;
      line-height: 200% !important;
      text-indent: 0.5in !important;
      text-align: left !important;
      border: 0px none transparent !important;
      border-width: 0px !important;
      border-style: none !important;
      outline: none !important;
      box-shadow: none !important;
    }

    .wp-document-content ul:not(.toc-list) {
      list-style-type: disc !important;
      padding-left: 0.5in !important;
      margin-bottom: 12px !important;
    }

    .wp-document-content ul:not(.toc-list) li:not(.toc-item) {
      position: relative !important;
      margin-bottom: 6px !important;
      line-height: 1.8 !important;
      font-size: 16px !important;
    }

    .wp-document-content ul:not(.toc-list) li:not(.toc-item)::before {
      display: none;
      content: none;
    }

    .wp-document-content ol {
      list-style-type: decimal !important;
      padding-left: 0.5in !important;
      margin-bottom: 12px !important;
    }

    .wp-document-content ol li {
      margin-bottom: 6px !important;
      line-height: 1.8 !important;
      font-size: 16px !important;
    }

    .wp-document-content .note {
      border-left: 3px solid #000000 !important;
      background-color: #f8fafc !important;
      padding: 12px 14px !important;
      margin: 16px 0 !important;
      border-radius: 0 4px 4px 0 !important;
      font-size: 12px !important;
      line-height: 1.6 !important;
      color: #000000 !important;
    }

    .wp-document-content blockquote {
      border-left: none !important;
      background-color: transparent !important;
      padding: 0 !important;
      margin: 12px 0 12px 0.5in !important;
      font-style: normal !important;
      line-height: 1.8 !important;
      color: #000000 !important;
      font-size: 12px !important;
    }

    /* Figure and academic Thumbnail/Image formatting */
    .wp-document-content figure {
      display: block !important;
      margin: 16px auto !important;
      border: 1px solid #e2e8f0 !important;
      background-color: #f8fafc !important;
      padding: 8px !important;
      border-radius: 4px !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
    }

    .wp-document-content figure.mw-default-size,
    .wp-document-content figure[class*="thumb"] {
      float: right !important;
      margin-left: 18px !important;
      margin-top: 4px !important;
      margin-bottom: 12px !important;
      width: 220px !important;
    }

    .wp-document-content figcaption {
      font-family: "Inter", sans-serif !important;
      font-size: 10.5px !important;
      color: #64748b !important;
      margin-top: 8px !important;
      line-height: 1.4 !important;
      text-align: center !important;
      font-style: italic !important;
    }

    .wp-document-content img,
    .wp-document-content .mw-file-element {
      max-width: 100% !important;
      height: auto !important;
      display: block !important;
      margin: 0 auto !important;
      border-radius: 2px !important;
    }

    /* Absolute running elements styling */
    .wp-academic-header {
      position: absolute !important;
      top: ${Math.max(10, topMargin - 60)}px !important;
      left: ${leftMargin}px !important;
      right: ${rightMargin}px !important;
      height: 50px !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: flex-end !important;
      pointer-events: none !important;
      user-select: none !important;
      z-index: 10 !important;
    }
    
    .wp-academic-footer {
      position: absolute !important;
      bottom: ${Math.max(10, bottomMargin - 50)}px !important;
      left: ${leftMargin}px !important;
      right: ${rightMargin}px !important;
      height: 40px !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: flex-start !important;
      pointer-events: none !important;
      user-select: none !important;
      z-index: 10 !important;
    }

    /* Print styling rules */
    @media print {
      #wp-academic-toolbar, .print\:hidden, .print-hidden {
        display: none !important;
        opacity: 0 !important;
        visibility: hidden !important;
        height: 0 !important;
        width: 0 !important;
        overflow: hidden !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      body, html {
        background-color: #ffffff !important;
      }
      .document-rendered-container {
        padding: 0 !important;
        gap: 0 !important;
        display: block !important;
      }
      div[name^="document-page-"] {
        box-shadow: none !important;
        border: none !important;
        page-break-after: always !important;
        break-after: page !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        margin: 0 !important;
        padding-top: ${topMargin}px !important;
        padding-bottom: ${bottomMargin}px !important;
        padding-left: ${leftMargin}px !important;
        padding-right: ${rightMargin}px !important;
      }
      div[name^="document-page-"]:last-of-type {
        page-break-after: avoid !important;
        break-after: avoid !important;
      }
      #wp-cover-page {
        box-shadow: none !important;
        border: none !important;
        page-break-after: always !important;
        break-after: page !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        margin: 0 !important;
        padding: 0 !important; /* Full bleed cover */
      }
      .print-page-boundary {
        margin: 0px !important;
        padding: 0px !important;
      }
      @page {
        margin: 0 !important;
        size: ${settings.pageSize === 'letter' ? '8.5in 11in' : settings.pageSize === 'a4' ? '210mm 297mm' : '297mm 167.06mm'} ${isPortrait ? 'portrait' : 'landscape'};
      }
    }
    
    /* BASE TOC STYLING PRE-INJECTED BEFORE USER'S CUSTOM TOC CSS */
    ${BASE_TOC_CSS}
    
    /* BLOQUES DE ESTILOS PERSONALIZADOS POR EL USUARIO (SANEADOS CONTRA ETIQUETAS ANIDADAS) */
    ${getGraphicalCSS()}
    ${sanitizeCSS(settings.blockStyleTitles || '')}
    ${sanitizeCSS(settings.blockStyleHeader || '')}
    ${sanitizeCSS(settings.blockStyleFooter || '')}
    ${sanitizeCSS(settings.blockStylePageNum || '')}
    ${sanitizeCSS(settings.blockStyleTOC || '')}
    ${sanitizeCSS(settings.blockStyleLists || DEFAULT_BLOCK_LISTS)}
    ${sanitizeCSS(settings.tableCustomCss || '')}
    ${sanitizeCSS(settings.customAddedCss || '')}
    
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
  </style>
</head>
<body>
  <!-- Floating Academic Toolbar (Omitted when printing) -->
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
  </div>

  <div class="document-rendered-container">
    ${pagesHTML}
  </div>
  
  <script>
    document.addEventListener("DOMContentLoaded", function() {
      if (window.location.protocol === 'file:') {
        var iframes = document.querySelectorAll('iframe[src*="youtube.com"], iframe[src*="youtu.be"]');
        iframes.forEach(function(iframe) {
          var src = iframe.src;
          var videoId = "";
          var match = src.match(/(?:embed\/|v=)([a-zA-Z0-9_-]{11})/);
          if (match && match[1]) {
            videoId = match[1];
          }
          
          var wrapper = document.createElement('div');
          wrapper.style.position = 'relative';
          wrapper.style.display = 'block';
          var iframeW = iframe.getAttribute('width');
          var iframeH = iframe.getAttribute('height');
          
          wrapper.style.width = iframeW ? (iframeW.indexOf('%') !== -1 ? iframeW : iframeW + 'px') : '100%';
          wrapper.style.maxWidth = '100%';
          wrapper.style.height = iframeH ? (iframeH.indexOf('%') !== -1 ? iframeH : iframeH + 'px') : '315px';
          wrapper.style.minHeight = '240px';
          wrapper.style.backgroundColor = '#0f172a';
          wrapper.style.borderRadius = '6px';
          wrapper.style.border = '1px solid #ea580c';
          wrapper.style.fontFamily = '"Inter", system-ui, -apple-system, sans-serif';
          wrapper.style.boxSizing = 'border-box';
          wrapper.style.margin = '16px auto';
          wrapper.style.overflow = 'hidden';
          
          var overlay = document.createElement('div');
          overlay.style.position = 'absolute';
          overlay.style.inset = '0';
          overlay.style.display = 'flex';
          overlay.style.flexDirection = 'column';
          overlay.style.alignItems = 'center';
          overlay.style.justifyContent = 'center';
          overlay.style.padding = '16px';
          overlay.style.textAlign = 'center';
          overlay.style.color = '#ffffff';
          overlay.style.zIndex = '5';
          overlay.style.boxSizing = 'border-box';
          
          var title = document.createElement('h4');
          title.textContent = '🔒 Reproductor Local Restringido (YouTube)';
          title.style.margin = '0 0 6px 0';
          title.style.fontSize = '13px';
          title.style.fontWeight = '750';
          title.style.color = '#f97316';
          
          var desc = document.createElement('p');
          desc.textContent = 'YouTube prohíbe reproducir vídeos en páginas abiertas localmente mediante doble clic (protocolo file:///).';
          desc.style.margin = '0 0 14px 0';
          desc.style.fontSize = '11px';
          desc.style.lineHeight = '1.4';
          desc.style.color = '#cbd5e1';
          desc.style.maxWidth = '390px';
          
          var btnContainer = document.createElement('div');
          btnContainer.style.display = 'flex';
          btnContainer.style.gap = '10px';
          btnContainer.style.justifyContent = 'center';
          btnContainer.style.flexWrap = 'wrap';
          
          var watchBtn = document.createElement('a');
          watchBtn.href = videoId ? 'https://www.youtube.com/watch?v=' + videoId : src;
          watchBtn.target = '_blank';
          watchBtn.textContent = '🌐 Ver Vídeo en YouTube';
          watchBtn.style.padding = '8px 14px';
          watchBtn.style.backgroundColor = '#e11d48';
          watchBtn.style.color = '#ffffff';
          watchBtn.style.borderRadius = '4px';
          watchBtn.style.fontSize = '11.5px';
          watchBtn.style.fontWeight = 'bold';
          watchBtn.style.textDecoration = 'none';
          watchBtn.style.display = 'inline-block';
          watchBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.15)';
          
          var serverText = document.createElement('span');
          serverText.innerHTML = 'Para habilitar el reproductor aquí directamente, levante un servidor local ejecutando <code style="background:#1e293b; padding:2px 4px; border-radius:3px; font-family: monospace;">npx serve .</code> o cargue el proyecto en la web.';
          serverText.style.display = 'block';
          serverText.style.marginTop = '10px';
          serverText.style.fontSize = '9.5px';
          serverText.style.color = '#94a3b8';
          serverText.style.maxWidth = '380px';
          
          overlay.appendChild(title);
          overlay.appendChild(desc);
          btnContainer.appendChild(watchBtn);
          overlay.appendChild(btnContainer);
          overlay.appendChild(serverText);
          
          iframe.parentNode.insertBefore(wrapper, iframe);
          wrapper.appendChild(overlay);
          iframe.style.display = 'none';
        });
      }
    });
  </script>

  <script>
    document.addEventListener("DOMContentLoaded", function() {
      var pages = Array.from(document.querySelectorAll('#wp-cover-page, div[name^="document-page-"]'));

      window.addEventListener('beforeprint', function() {
        var toolbar = document.getElementById('wp-academic-toolbar');
        if (toolbar) {
          toolbar.style.setProperty('display', 'none', 'important');
        }
      });
      window.addEventListener('afterprint', function() {
        var toolbar = document.getElementById('wp-academic-toolbar');
        if (toolbar) {
          toolbar.style.setProperty('display', 'flex', 'important');
        }
      });
    });
  </script>
  ${settings.customAddedJs ? `
  <script>
    // Código script personalizado inyectado
    (function() {
      try {
        ${settings.customAddedJs}
      } catch (err) {
        console.error("Script de usuario falló:", err);
      }
    })();
  </script>
  ` : ''}
</body>
</html>`;

    // Rewrite protocol relative schema links like //upload.wikimedia... to use explicit https:// protocols.
    // This allows browser security managers to fetch the resources correctly offline when double-clicked.
    const sanitizedHTML = cleanHTML
      .replace(/src="\/\//g, 'src="https://')
      .replace(/srcset="\/\//g, 'srcset="https://')
      .replace(/href="\/\//g, 'href="https://');

    if (type === 'html') {
      let customName = (exportFileName || '').trim();
      if (!customName) {
        customName = cover.title.slice(0, 30).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'proyecto_academico';
      }
      const blob = new Blob([sanitizedHTML], { type: 'text/html;charset=utf-8' });
      const fileUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = fileUrl;
      link.setAttribute('download', `${customName}.html`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(fileUrl);
      return;
    }

    // Package the documents asynchronously into high-fidelity academic ZIP
    const zip = new JSZip();

    const isWindows = /windows/i.test(navigator.userAgent || '');
    const docSizeText = isLetterSize ? 'Carta / Letter' : isA4 ? 'A4' : 'Pantalla Ancha (Widescreen 16:9)';
    const docOrientationText = isPortrait ? 'Vertical (Portrait)' : 'Horizontal (Landscape)';

    let pdfWidthMM = '297mm';
    let pdfHeightMM = '167.06mm';

    if (isLetterSize) {
      pdfWidthMM = isPortrait ? '215.9mm' : '279.4mm';
      pdfHeightMM = isPortrait ? '279.4mm' : '215.9mm';
    } else if (isA4) {
      pdfWidthMM = isPortrait ? '210mm' : '297mm';
      pdfHeightMM = isPortrait ? '297mm' : '210mm';
    } else {
      // Default: 16:9
      pdfWidthMM = isPortrait ? '167.06mm' : '297mm';
      pdfHeightMM = isPortrait ? '297mm' : '167.06mm';
    }

    let readmeText = `=== PAQUETE DE ENTREGA DE DOCUMENTO ACADÉMICO ===
Generado el: ${new Date().toLocaleDateString('es-EC')}
Institución: ${cover.institution}
Facultad/Carrera: ${cover.facultad} / ${cover.carrera}
Tema: ${cover.title}
Tamaño Definido: ${docSizeText} (${docOrientationText})

Este archivo comprimido (.zip) estructurado contiene sus componentes académicos de entrega listos para presentación:

========================================================================
1. [DOCUMENTO DIGITAL] "documento_formateado_imprimible.html"
========================================================================
El documento definitivo de alta resolución formateado con la carátula reglamentaria,
márgenes de diseño de 1 pulgada, paginación real automática, y bandas institucionales.

¿Cómo visualizarlo correctamente?
- Puede abrir este archivo directamente haciendo Doble Clic.
- NOTA IMPORTANTÍSIMA SOBRE IMÁGENES: Todas las imágenes que subió y utilizó en el documento han sido
  guardadas como archivos reales individuales en esta misma carpeta (ej: "icon.png", "cover.png").
  El archivo HTML las enlaza directamente usando sus nombres simples para evitar códigos kilométricos base64,
  permitiéndole editarlos y manejarlos de forma extremadamente sencilla.

========================================================================
2. [CONVERSOR DIRECTO A PDF PERFECTO] (AUTOMATIZADO)
========================================================================
¿Tiene problemas con el tamaño de papel de la presentación/documento?
¡Hemos incluido scripts automáticos de conversión local con Puppeteer!
Estos scripts buscarán automáticamente Google Chrome o Microsoft Edge en su computadora,
instalarán las dependencias necesarias en segundos y crearán un PDF impecable en el tamaño exacto definido (${docSizeText} ${docOrientationText}).

¿Cómo usarlo?
- En Windows:
  Simplemente haga Doble Clic en el archivo "generar_pdf_windows.bat".`;

    if (!isWindows) {
      readmeText += `
- En macOS / Linux:
  Abra una terminal en esta carpeta y ejecute: sh generar_pdf_mac_linux.sh
  (O haga doble clic al archivo shell script).`;
    }

    readmeText += `

Requerimiento mínimo: Tener Node.js instalado en su sistema.
El script se encargará del resto de manera silenciosa y exportará "documento_final_perfecto.pdf".

========================================================================
3. [CÓDIGO FUENTE] "contenido_fuente.html"
========================================================================
Su contenido de texto crudo en HTML limpio para que pueda copiarlo o editarlo en el futuro de ser necesario.

========================================================================
4. [METADATOS DE RESPALDO] "configuracion_metadatos.json"
========================================================================
Archivo JSON que contiene toda su configuración (carátula, autores, tutores, páginas). Sirve para que el sistema retenga de forma permanente la base de datos de su trabajo.
`;

    zip.file("README_ENTREGA.txt", readmeText);

    // Replace all base64 dataUrls in final HTML and source code with their plain filenames for local linking,
    // and write each uploaded visual asset as a clean binary file in the root of the ZIP
    let processedHTML = sanitizedHTML;
    let processedContent = htmlContent;

    if (uploadedFiles && uploadedFiles.length > 0) {
      uploadedFiles.forEach((file) => {
        if (file.dataUrl) {
          // Replace exactly matching dataUrl with its file.name for local folder file references
          processedHTML = processedHTML.replaceAll(file.dataUrl, file.name);
          processedContent = processedContent.replaceAll(file.dataUrl, file.name);
          
          // Add binary image file to zip folder natively using JSZip base64 mode
          try {
            if (file.dataUrl.includes(';base64,')) {
              const base64Parts = file.dataUrl.split(';base64,');
              const base64Data = base64Parts[1];
              zip.file(file.name, base64Data, { base64: true });
            }
          } catch (err) {
            console.error(`Error adding custom file '${file.name}' to ZIP:`, err);
          }
        }
      });
    }

    // 4. GENERADORES AUTOMATIZADOS DE PDF POR PUPPETEER LOCAL (Incluidos en el ZIP)
    const scriptPuppeteerText = `const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('========================================================================');
console.log('   GENERADOR DE PDF CORPORATIVO - PROTOCOLO AUTOMÁTICO ACADÉMICO        ');
console.log('========================================================================\\n');

// 1. Instalar puppeteer-core dinámicamente si no está presente (tarda 5 segundos, súper liviano)
try {
  require.resolve('puppeteer-core');
} catch (e) {
  console.log('Se detecta que "puppeteer-core" no está instalado localmente.');
  console.log('Instalando dependencias mínimas de manera automática y silenciosa...');
  try {
    execSync('npm install puppeteer-core', { stdio: 'inherit' });
    console.log('\\n✔ Dependencias de PDF instaladas correctamente.\\n');
  } catch (error) {
    console.error('❌ Error de conexión o de permisos al iniciar "npm install".');
    console.error('Asegúrese de tener Node.js instalado en su sistema y conexión a internet.');
    process.exit(1);
  }
}

const puppeteer = require('puppeteer-core');

// 2. Buscador automatizado inteligente de navegadores instalados (Google Chrome o MS Edge)
function searchBrowserExecutable() {
  const paths = {
    win32: [
      'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
      'C:\\\\Program Files (x86)\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Google\\\\Chrome\\\\Application\\\\chrome.exe'),
      'C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe',
      'C:\\\\Program Files\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe'
    ],
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    ],
    linux: [
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chrome',
      '/usr/bin/microsoft-edge'
    ]
  };

  const possiblePaths = paths[process.platform] || [];
  for (const executablePath of possiblePaths) {
    if (executablePath && fs.existsSync(executablePath)) {
      console.log(\`✔ Navegador apto y compatible localizado en: \${executablePath}\`);
      return executablePath;
    }
  }
  return null;
}

(async () => {
  const chromePath = searchBrowserExecutable();
  if (!chromePath) {
    console.error('❌ ERROR: No se encontró Google Chrome ni Microsoft Edge en sus ubicaciones de sistema estándar.');
    console.error('Por favor, instale Google Chrome para permitir la conversión del documento.');
    return;
  }

  console.log('Iniciando entorno sandbox de Puppeteer...');
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    
    // Obtenemos el archivo html del proyecto extraído
    const htmlFile = path.resolve(__dirname, 'documento_formateado_imprimible.html');
    if (!fs.existsSync(htmlFile)) {
      throw new Error(\`No se pudo encontrar el archivo HTML: \${htmlFile}\`);
    }
    
    const fileUrl = 'file:///' + htmlFile.replace(/\\\\/g, '/');
    console.log(\`Abriendo archivo local extraído: \${fileUrl}\`);

    await page.goto(fileUrl, {
      waitUntil: 'networkidle0'
    });

    console.log('Diseñando documento final y compilando a PDF...');

    const pdfPath = path.resolve(__dirname, 'documento_final_perfecto.pdf');
    
    // Convertir el documento a PDF real respetando las dimensiones inyectadas por el CSS
    await page.pdf({
      path: pdfPath,
      printBackground: true,
      width: '${pdfWidthMM}',
      height: '${pdfHeightMM}',
      margin: {
      top: '0',
      right: '0',
      bottom: '0',
      left: '0'
      }
    });

    console.log(\`\\n🎉 ¡PROCESO COMPLETADO! PDF generado perfectamente en la misma carpeta.\`);
    console.log(\`Ruta del archivo: \${pdfPath}\\n\`);
  } catch (error) {
    console.error('\\n❌ El proceso de compilación falló:\\n');
    console.error(error);
  } finally {
    await browser.close();
  }
})();`;

    const scriptBatText = `@echo off
title Generador de PDF Academico
echo ==========================================================
echo    PREPARANDO EL CONVERTIDOR DE PDF PARA SU TRABAJO
echo ==========================================================
echo.

if not exist "generar_pdf.js" (
    echo.
    echo [ERROR] No se encontraron todos los archivos necesarios.
    echo.
    echo Es posible que este programa se este ejecutando directamente
    echo desde un archivo ZIP.
    echo.
    echo Por favor extraiga todo el contenido del ZIP antes de ejecutar.
    echo.
    pause
    exit /b 1
)

node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] No se pudo detectar Node.js en su sistema.
    echo Node.js es requerido para poder automatizar el proceso de Puppeteer localmente.
    echo Por favor, descargue e instale Node.js desde: https://nodejs.org
    echo.
    pause
    exit /b 1
)

echo Detectado Node.js correctamente en su sistema.
echo Ejecutando script de conversion de alta fidelidad...
echo.
node generar_pdf.js
echo.
if exist "documento_final_perfecto.pdf" (
    echo.
    echo Abriendo "documento_final_perfecto.pdf" automaticamente...
    start "" "documento_final_perfecto.pdf"
)
echo.
echo Presione cualquier tecla para cerrar este asistente.
pause`;

    const scriptShText = `#!/bin/bash
echo "=========================================================="
echo "   PREPARANDO EL CONVERTIDOR DE PDF PARA SU TRABAJO"
echo "=========================================================="
echo ""

if ! command -v node &> /dev/null
then
    echo "[ERROR] No se pudo detectar Node.js en su sistema."
    echo "Node.js es requerido para poder automatizar el proceso de Puppeteer localmente."
    echo "Por favor, descargue e instale Node.js desde: https://nodejs.org"
    echo ""
    read -p "Presione [Enter] para salir..."
    exit 1
fi

echo "Detectado Node.js correctamente en su sistema."
echo "Ejecutando script de conversión de alta fidelidad..."
echo ""
node generar_pdf.js
echo ""
if [ -f "documento_final_perfecto.pdf" ]; then
    echo "Abriendo PDF generado de forma automática..."
    open "documento_final_perfecto.pdf" 2>/dev/null || xdg-open "documento_final_perfecto.pdf" 2>/dev/null &
fi
echo ""
read -p "Presione [Enter] para salir..."`;

    zip.file("generar_pdf.js", scriptPuppeteerText);
    zip.file("generar_pdf_windows.bat", scriptBatText);
    if (!isWindows) {
      zip.file("generar_pdf_mac_linux.sh", scriptShText);
    }

    zip.file("documento_formateado_imprimible.html", processedHTML);
    if (type === 'project') {
      zip.file("contenido_fuente.html", processedContent);
      zip.file("configuracion_metadatos.json", JSON.stringify({ cover, settings, uploadedFiles, htmlBlocks, bibliography }, null, 2));
    }

    // Compile & download
    zip.generateAsync({ type: 'blob' }).then((blob) => {
      const fileUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = fileUrl;
      
      let customName = (exportFileName || '').trim();
      if (!customName) {
        customName = cover.title.slice(0, 30).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'proyecto_academico';
      }
      
      const suffix = type === 'pdf_generator' ? '_generador_pdf' : '_proyecto';
      link.setAttribute('download', `${customName}${suffix}.zip`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(fileUrl);
    }).catch((err) => {
      console.error('Error compiling ZIP package:', err);
      alert('Error al compilar el archivo ZIP.');
    });
  };



  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 font-sans antialiased text-slate-100 select-none">
      
      {/* 1. Global Top Bar */}
      {!isFullscreen && (
        <div className="h-14 bg-slate-950 border-b border-slate-800 shrink-0 flex items-center justify-between px-4 z-40 select-none print:hidden gap-3">
          {/* Left part: Save button + Filename input */}
          <div className="flex items-center gap-3.5 min-w-0">
            {/* Save project to folder (replaces export/download dropdown) */}
            <button
              onClick={() => {
                handleSaveProject();
              }}
              disabled={!projectFolder}
              title={!projectFolder
                ? ''
                : isDirty
                  ? (t('saveBtn') + ' (Ctrl+S)')
                  : t('savedBtn')}
              className={`py-1.5 px-3 rounded font-extrabold text-[12px] flex items-center gap-1.5 transition-all shadow-sm ${
                !projectFolder
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : isDirty
                    ? 'bg-[#004080] hover:bg-[#00509e] cursor-pointer border border-[#FF6600]/60 text-white'
                    : 'bg-slate-800 cursor-pointer border border-emerald-600/40 text-emerald-300'
              }`}
            >
              {isDirty ? <Save className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
              {isDirty ? t('saveBtn') : t('savedBtn')}
            </button>

            {/* Hidden Input File for Import */}
            <input
              id="import-project-file-input"
              type="file"
              accept=".zip"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  handleImportZIP(file);
                }
                e.target.value = ''; // Reset
              }}
              className="hidden"
            />
            
            {/* Custom File Name Input */}
            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded px-2.5 py-1 min-w-[210px] max-w-[260px]">
              <span className="text-[9px] text-[#FF6600] font-bold uppercase tracking-wider shrink-0">{t('fileNameLabel')}</span>
              <input
                type="text"
                value={exportFileName}
                onChange={(e) => setExportFileName(e.target.value.replace(/[^a-zA-Z0-9_\-\s]/g, ''))}
                className="bg-transparent text-xs text-slate-100 font-bold focus:outline-none w-full pr-1 shrink"
                placeholder={cover.title ? cover.title.slice(0, 30).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_') : t('fileNamePlaceholder')}
                title={t('fileNameTitle')}
              />
            </div>
          </div>

          {/* Middle part: GLOBAL SYNCHRONIZATION DELAY INPUT */}
          <div className="flex items-center gap-2.5 bg-slate-950/80 px-3 py-1 rounded-md border border-slate-800/80 shadow-inner">
            {/* Input: Retraso Sincronización */}
            <div
              className="flex items-center gap-1.5"
              title={t('waitAfterTypingTitle')}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 select-none">
                {t('waitAfterTyping')}
              </span>
              <input
                type="number"
                min="0"
                max="5000"
                step="50"
                value={staticSyncDelay}
                onChange={(e) => setStaticSyncDelay(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-14 h-6 px-1 bg-slate-900 border border-slate-700 text-slate-100 text-[10.5px] rounded font-mono font-bold text-center focus:outline-none focus:border-orange-500 transition-colors"
              />
              <span className="text-[9px] text-slate-400 font-mono font-bold select-none">ms</span>
            </div>

            {/* Syncing Indicator */}
            {isCompiling && (
              <div className="flex items-center gap-1 ml-0.5 text-orange-400 animate-pulse" title={t('syncing')}>
                <RefreshCw className="w-3 h-3 animate-spin text-orange-500" />
              </div>
            )}
          </div>

          {/* Right part: Language Selector & API Key Connection Button */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Language Switcher Button */}
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded p-0.5 shadow-sm">
              <button
                type="button"
                onClick={() => setLanguage('es')}
                className={`px-2 py-1 rounded text-[10.5px] font-extrabold flex items-center gap-1 transition-all cursor-pointer ${
                  language === 'es'
                    ? 'bg-[#004080] text-white border border-[#FF6600]/80 shadow-[0_0_8px_rgba(255,102,0,0.2)]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
                title="Español (Spanish)"
              >
                <Globe className={`w-3 h-3 ${language === 'es' ? 'text-orange-400' : 'text-slate-400'}`} />
                <span>ES</span>
              </button>
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`px-2 py-1 rounded text-[10.5px] font-extrabold flex items-center gap-1 transition-all cursor-pointer ${
                  language === 'en'
                    ? 'bg-[#004080] text-white border border-[#FF6600]/80 shadow-[0_0_8px_rgba(255,102,0,0.2)]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
                title="English (Inglés)"
              >
                <span>EN</span>
              </button>
            </div>

            {/* API Key Connection Button */}
            <button
              onClick={() => setIsApiKeyModalOpen(true)}
              className={`py-1.5 px-3 rounded text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm border ${
                userApiKey 
                  ? 'bg-emerald-950/50 hover:bg-emerald-900/40 border-emerald-500/30 text-emerald-400' 
                  : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
              }`}
              title={t('apiKeyConfigTitle')}
            >
              <Key className="w-3.5 h-3.5" />
              <span>{userApiKey ? t('apiKeyConnected') : t('connectApiKey')}</span>
              {userApiKey && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block"></span>}
            </button>
          </div>
        </div>
      )}

      {/* 2. Main Workspace Row (contains Left Sidebar and Right Preview Panel) */}
      <div className="flex-1 flex overflow-hidden w-full relative">
        {/* Dynamic Sized Container Wrap */}
        {!isFullscreen && (
          <>
            {/* 1. Left Toolbar Sidebar (Narrow vertical navigation bar with stacked buttons) */}
            <div className="w-[76px] shrink-0 bg-slate-950 border-r border-slate-800/80 flex flex-col items-center py-4 gap-3 h-full print:hidden select-none animate-fade-in">
              <button
                disabled={settings.pageSize === 'continuous'}
                onClick={() => {
                  if (activeDrawerType === 'cover') {
                    setActiveDrawerType(null);
                  } else {
                    setActiveDrawerType('cover');
                  }
                }}
                className={`w-16 h-16 rounded-lg flex flex-col items-center justify-center gap-1 transition-all text-center relative ${
                  settings.pageSize === 'continuous'
                    ? 'opacity-30 cursor-not-allowed text-slate-600'
                    : activeDrawerType === 'cover'
                      ? 'bg-[#004080] text-white border border-[#FF6600]/80 shadow-[0_0_12px_rgba(255,102,0,0.15)] cursor-pointer'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 cursor-pointer'
                }`}
                title={settings.pageSize === 'continuous' ? t('navCoverDisabledContinuous') : cover.enabled === false ? t('navCoverDeactivated') : t('navCoverConfig')}
              >
                <Layers className="w-5 h-5 shrink-0" />
                <span className="text-[9px] font-bold tracking-tight leading-tight mt-0.5">{t('navCover')}</span>
                {cover.enabled === false && settings.pageSize !== 'continuous' && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 border border-slate-950" title={t('navCoverDeactivated')} />
                )}
              </button>

              <button
                onClick={() => setActiveDrawerType(null)}
                className={`w-16 h-16 rounded-lg flex flex-col items-center justify-center gap-1 transition-all text-center cursor-pointer ${
                  activeDrawerType === null
                    ? 'bg-[#004080] text-white border border-[#FF6600]/80 shadow-[0_0_12px_rgba(255,102,0,0.15)]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
                title={t('navContentTitle')}
              >
                <Code className="w-5 h-5 shrink-0" />
                <span className="text-[9px] font-bold tracking-tight leading-tight mt-0.5">{t('navContent')}</span>
              </button>

              <button
                onClick={() => {
                  if (activeDrawerType === 'settings') {
                    setActiveDrawerType(null);
                  } else {
                    setActiveDrawerType('settings');
                  }
                }}
                className={`w-16 h-16 rounded-lg flex flex-col items-center justify-center gap-1 transition-all text-center cursor-pointer ${
                  activeDrawerType === 'settings'
                    ? 'bg-[#004080] text-white border border-[#FF6600]/80 shadow-[0_0_12px_rgba(255,102,0,0.15)]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
                title={t('navStylesTitle')}
              >
                <Sliders className="w-5 h-5 shrink-0" />
                <span className="text-[9px] font-bold tracking-tight leading-tight mt-0.5">{t('navStyles')}</span>
              </button>

              <button
                onClick={() => {
                  if (activeDrawerType === 'uploads') {
                    setActiveDrawerType(null);
                  } else {
                    setActiveDrawerType('uploads');
                  }
                }}
                className={`w-16 h-16 rounded-lg flex flex-col items-center justify-center gap-1 transition-all text-center cursor-pointer ${
                  activeDrawerType === 'uploads'
                    ? 'bg-[#004080] text-white border border-[#FF6600]/80 shadow-[0_0_12px_rgba(255,102,0,0.15)]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
                title={t('navGraphicsTitle')}
              >
                <Image className="w-5 h-5 shrink-0" />
                <span className="text-[9px] font-bold tracking-tight leading-tight mt-0.5">{t('navGraphics')}</span>
              </button>

              <button
                onClick={() => {
                  if (activeDrawerType === 'bibliography') {
                    setActiveDrawerType(null);
                  } else {
                    setActiveDrawerType('bibliography');
                  }
                }}
                className={`w-16 h-16 rounded-lg flex flex-col items-center justify-center gap-1 transition-all text-center cursor-pointer ${
                  activeDrawerType === 'bibliography'
                    ? 'bg-[#004080] text-white border border-[#FF6600]/80 shadow-[0_0_12px_rgba(255,102,0,0.15)]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
                title={t('navBibliographyTitle')}
              >
                <BookOpen className="w-5 h-5 shrink-0" />
                <span className="text-[9px] font-bold tracking-tight leading-tight mt-0.5">{t('navBibliography')}</span>
              </button>

              <button
                onClick={() => {
                  if (activeDrawerType === 'margins') {
                    setActiveDrawerType(null);
                  } else {
                    setActiveDrawerType('margins');
                  }
                }}
                className={`w-16 h-16 rounded-lg flex flex-col items-center justify-center gap-1 transition-all text-center cursor-pointer ${
                  activeDrawerType === 'margins'
                    ? 'bg-[#004080] text-white border border-[#FF6600]/80 shadow-[0_0_12px_rgba(255,102,0,0.15)]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
                title={t('navPageElementsTitle')}
              >
                <Layout className="w-5 h-5 shrink-0" />
                <span className="text-[9px] font-bold tracking-tight leading-tight mt-0.5">{t('navPageElements')}</span>
              </button>

              <button
                onClick={() => {
                  if (activeDrawerType === 'toc') {
                    setActiveDrawerType(null);
                  } else {
                    setActiveDrawerType('toc');
                  }
                }}
                className={`w-16 h-16 rounded-lg flex flex-col items-center justify-center gap-1 transition-all text-center cursor-pointer ${
                  activeDrawerType === 'toc'
                    ? 'bg-[#004080] text-white border border-[#FF6600]/80 shadow-[0_0_12px_rgba(255,102,0,0.15)]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
                title={t('navTocTitle')}
              >
                <List className="w-5 h-5 shrink-0" />
                <span className="text-[9px] font-bold tracking-tight leading-tight mt-0.5">{t('navToc')}</span>
              </button>

              <button
                onClick={() => {
                  if (activeDrawerType === 'templates') {
                    setActiveDrawerType(null);
                  } else {
                    setActiveDrawerType('templates');
                  }
                }}
                className={`w-16 h-16 rounded-lg flex flex-col items-center justify-center gap-1 transition-all text-center cursor-pointer ${
                  activeDrawerType === 'templates'
                    ? 'bg-[#004080] text-white border border-[#FF6600]/80 shadow-[0_0_12px_rgba(255,102,0,0.15)]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
                title={t('navTemplatesTitle')}
              >
                <Grid className="w-5 h-5 shrink-0" />
                <span className="text-[9px] font-bold tracking-tight leading-tight mt-0.5">{t('navTemplates')}</span>
              </button>
            </div>

            {/* 2. Content Editing Screen (second part) */}
            <div 
              style={{ width: `${sidebarWidth}px` }} 
              className="shrink-0 flex flex-col h-full print:hidden select-none border-r border-slate-800 bg-slate-900"
            >
              {activeDrawerType === null ? (
                <ProjectPanel
                  projectFolder={projectFolder}
                  contentPath={contentPath}
                  contentText={contentText}
                  bibPath={bibPath}
                  showContentInPreview={showContentInPreview}
                  onPickFolder={handlePickFolder}
                  onPickFile={handlePickFile}
                  onPickBib={handlePickBib}
                  onToggleShowContent={handleToggleShowContent}
                  onSaveProject={handleSaveProject}
                  onLoadContentText={(text) => setContentText(text)}
                  toastMsg={projectToast}
                  onDismissToast={handleDismissToast}
                  buildNotice={buildNotice}
                  isDirty={isDirty}
                />
              ) : activeDrawerType === 'bibliography' ? (
                <BibliographyDrawer
                  bibtex={bibtex}
                  setBibtex={setBibtex}
                  onClose={() => setActiveDrawerType(null)}
                  showBibliography={!!settings.showBibliography}
                  onToggleShowBibliography={(show) => setSettings(prev => ({ ...prev, showBibliography: show }))}
                  showOnlyCitedBibliography={!!settings.showOnlyCitedBibliography}
                  onToggleShowOnlyCitedBibliography={(show) => setSettings(prev => ({ ...prev, showOnlyCitedBibliography: show }))}
                  bibliographyTitle={settings.bibliographyTitle || 'Referencias Bibliográficas'}
                  onChangeBibliographyTitle={(title) => setSettings(prev => ({ ...prev, bibliographyTitle: title }))}
                  onInsertHTML={handleInsertHTML}
                  pageSize={settings.pageSize}
                />
              ) : activeDrawerType === 'margins' ? (
                <MarginsDrawer
                  settings={settings}
                  setSettings={setSettings}
                  onClose={() => setActiveDrawerType(null)}
                />
              ) : activeDrawerType === 'templates' ? (
                <TemplatesDrawer
                  settings={settings}
                  setSettings={setSettings}
                  onClose={() => setActiveDrawerType(null)}
                />
              ) : (
                <ConfigDrawer
                  isOpen={activeDrawerType !== null}
                  activeType={activeDrawerType}
                  onClose={() => setActiveDrawerType(null)}
                  cover={cover}
                  setCover={setCover}
                  settings={settings}
                  setSettings={setSettings}
                  uploadedFiles={uploadedFiles}
                  setUploadedFiles={setUploadedFiles}
                  onInsertHTML={handleInsertHTML}
                  isEmbedded={true}
                  htmlBlocks={htmlBlocks}
                  setHtmlBlocks={setHtmlBlocks}
                  userApiKey={userApiKey}
                  markdownSource={contentText}
                  onMarkdownSourceChange={handleUpdateHeadingSource}
                />
              )}
            </div>
          </>
        )}

        {/* Resize handle divider bar */}
        <div
          onMouseDown={startResizing}
          className="w-[6px] bg-slate-950 border-r border-l border-slate-850 cursor-col-resize h-full select-none print:hidden z-20 shrink-0 flex items-center justify-center relative"
          title="Arrastra para ajustar el ancho de la barra editora"
        >
          {/* Collapsible toggle arrow button fused with the right of the divider bar */}
          <button
            onMouseDown={(e) => {
              e.stopPropagation(); // Prevent triggering startResizing drag on mousedown
              e.preventDefault();
              setIsFullscreen(!isFullscreen);
            }}
            className="absolute left-full -translate-x-[1px] w-[26px] h-14 bg-slate-950 hover:bg-[#004080] border-t border-b border-r border-slate-850 hover:border-[#FF6600] border-l-0 text-slate-350 hover:text-white flex items-center justify-center cursor-pointer transition-all z-30 active:scale-95 rounded-r-lg shadow-lg"
            title={isFullscreen ? "Mostrar panel de edición" : "Ocultar panel de edición"}
            style={{ top: 'calc(50% - 28px)' }}
          >
            {isFullscreen ? (
              <ChevronRight className="w-5 h-5" />
            ) : (
              <ChevronLeft className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* RIGHT COLUMN: Real page preview layout Stage */}
        <div className="flex-1 h-full flex flex-col relative overflow-hidden min-w-0">
          {isResizing && (
            <div className="absolute inset-0 z-50 bg-transparent cursor-col-resize pointer-events-auto" />
          )}
          <DocumentPreview
            cover={cover}
            settings={settings}
            htmlContent={showContentInPreview ? htmlContent : ''}
            setPageCount={setPageCount}
            onExportZIP={() => handleExport('project')}
            isFullscreen={isFullscreen}
            setIsFullscreen={setIsFullscreen}
            onCoverChange={handleCoverChange}
            uploadedFiles={uploadedFiles}
            htmlBlocks={previewBlocks}
            bibliography={bibliography}
            isCompiling={isCompiling}
            compiledCover={compiledCover}
            compiledSettings={compiledSettings}
            compiledHtmlContent={showContentInPreview ? compiledHtmlContent : ''}
            compiledUploadedFiles={compiledUploadedFiles}
            compiledHtmlBlocks={previewBlocks}
            compiledBibliography={compiledBibliography}
            exportFileName={exportFileName}
            projectFolder={projectFolder}
            bridge={bridge}
            externalCss={externalCssText}
          />
        </div>
      </div>

      {/* API Key Setup Modal */}
      {isApiKeyModalOpen && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] select-text">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4 animate-fade-in text-slate-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-[#FF6600]">
                <Key className="w-5 h-5" />
                <h3 className="font-extrabold text-sm uppercase tracking-wider text-slate-100">
                  {t('apiKeyModalTitle')}
                </h3>
              </div>
              <button 
                onClick={() => setIsApiKeyModalOpen(false)}
                className="text-slate-500 hover:text-white cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <p className="text-[11.5px] text-slate-400 leading-relaxed font-normal">
                {t('apiKeyModalDesc')}
              </p>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">{t('apiKeyInputLabel')}:</label>
                <div className="relative">
                  <input
                    type="password"
                    placeholder={userApiKey ? "••••••••••••••••••••••••••••••••••••" : "AIzaSy..."}
                    value={userApiKey}
                    onChange={(e) => setUserApiKey(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:border-orange-500 placeholder-slate-600"
                  />
                </div>
              </div>

              <div className="bg-slate-950/60 p-2.5 rounded border border-slate-850/60 text-[10.5px] leading-normal text-slate-400">
                <span className="font-bold text-slate-300 block mb-0.5">{t('apiKeyNoKeyPrompt')}</span>
                {t('apiKeyGetFree')}{' '}
                <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="text-[#FF6600] font-bold hover:underline">Google AI Studio</a>.
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-800 pt-4 mt-1">
              <div>
                {userApiKey && (
                  <button
                    onClick={() => {
                      setUserApiKey('');
                      setIsApiKeyModalOpen(false);
                    }}
                    className="px-3 py-1.5 bg-red-950/50 hover:bg-red-900/50 border border-red-900 text-red-400 font-bold text-[10.5px] rounded transition-all cursor-pointer"
                  >
                    {t('apiKeyDisconnect')}
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsApiKeyModalOpen(false)}
                  className="px-3.5 py-1.5 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-400 font-bold text-[10.5px] rounded transition-all cursor-pointer"
                >
                  {t('apiKeyCancel')}
                </button>
                <button
                  onClick={() => {
                    if (userApiKey.trim() === '') {
                      alert(language === 'es' ? 'Por favor ingresa una API Key válida.' : 'Please enter a valid API Key.');
                      return;
                    }
                    setIsApiKeyModalOpen(false);
                  }}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10.5px] rounded transition-all cursor-pointer shadow-md"
                >
                  {t('apiKeySave')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global Drag and Drop Overlay */}
      {isDraggingOver && (
        <div className="fixed inset-0 z-[10000] bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-6 select-none animate-fade-in pointer-events-none">
          <div className="max-w-lg w-full bg-slate-900/95 border-2 border-dashed border-orange-500 rounded-2xl p-8 flex flex-col items-center text-center gap-5 shadow-2xl ring-4 ring-orange-500/20">
            {dragFileType === 'bib' ? (
              <>
                <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-lg animate-bounce">
                  <BookOpen className="w-8 h-8" />
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-black tracking-widest text-amber-400 uppercase bg-amber-950/80 border border-amber-800/80 px-3 py-1 rounded-full self-center">
                    📚 {t('dropBibDetected')}
                  </span>
                  <h2 className="text-xl font-extrabold text-white tracking-wide">
                    {t('dropBibTitle')}
                  </h2>
                  <div className="mt-2 bg-amber-950/40 border border-amber-800/60 rounded-xl p-3 text-left flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-200 leading-relaxed font-medium">
                      <strong>{t('dropBibWarningLabel')}</strong> {t('dropBibWarning')}
                    </p>
                  </div>
                </div>
              </>
            ) : dragFileType === 'image' ? (
              <>
                <div className="w-16 h-16 rounded-2xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-[#FF6600] shadow-lg animate-bounce">
                  <Image className="w-8 h-8" />
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-black tracking-widest text-[#FF6600] uppercase bg-orange-950/80 border border-orange-800/80 px-3 py-1 rounded-full self-center">
                    📸 {t('dropImageDetected')}
                  </span>
                  <h2 className="text-xl font-extrabold text-white tracking-wide">
                    {t('dropImageTitle')}
                  </h2>
                  <p className="text-xs text-slate-300 max-w-sm leading-relaxed">
                    {t('dropImageDesc')}
                  </p>
                </div>
              </>
            ) : dragFileType === 'mixed' ? (
              <>
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-lg animate-bounce">
                  <Upload className="w-8 h-8" />
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-black tracking-widest text-emerald-400 uppercase bg-emerald-950/80 border border-emerald-800/80 px-3 py-1 rounded-full self-center">
                    📁 {t('dropMultipleDetected')}
                  </span>
                  <h2 className="text-xl font-extrabold text-white tracking-wide">
                    {t('dropMultipleTitle')}
                  </h2>
                  <div className="mt-1 bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-left flex flex-col gap-1.5 text-xs text-slate-300">
                    <p>• <strong>{language === 'es' ? 'Imágenes:' : 'Images:'}</strong> {t('dropMultipleImages')}</p>
                    <p className="text-amber-300">• <strong>{language === 'es' ? 'Archivo .bib:' : '.bib file:'}</strong> {t('dropMultipleBib')}</p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-2xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400 shadow-lg animate-bounce">
                  <Upload className="w-8 h-8" />
                </div>
                <div className="flex flex-col gap-2">
                  <h2 className="text-xl font-extrabold text-white tracking-wide">
                    {t('dropFileTitle')}
                  </h2>
                  <p className="text-xs text-slate-300 max-w-sm leading-relaxed">
                    {t('dropFileDesc')}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Floating Toast Notification Banner */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-[10001] bg-slate-900 border border-emerald-500/80 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-fade-in text-xs font-medium max-w-md select-text">
          <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="flex-1 leading-relaxed text-slate-100">{toastMsg}</span>
          <button 
            onClick={() => setToastMsg(null)}
            className="text-slate-400 hover:text-white p-1 cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

