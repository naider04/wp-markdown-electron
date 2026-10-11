/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CoverConfig {
  enabled?: boolean;
  institution: string;
  facultad: string;
  carrera: string;
  title: string;
  subtitle: string;
  authors: string;
  tutor: string;
  city: string;
  date: string;
  logoType: 'standard' | 'minimal' | 'modern';
  mode?: 'standard' | 'code' | 'image-overlay';
  customHtml?: string;
  backgroundImage?: string;
  overlayHtml?: string;
  overlayTemplate?: string;
  overlayMarkdown?: string;
  bgImageWidth?: string;
  bgImageHeight?: string;
  bgImageObjectFit?: 'cover' | 'fill' | 'contain' | 'none';
  bgImagePositionX?: string;
  bgImagePositionY?: string;
  applyBgImageToAllPages?: boolean;
}

export type PageSize = 'letter' | 'a4' | '16:9' | 'continuous';
export type PageOrientation = 'portrait' | 'landscape';

export interface PageSettings {
  pageSize: PageSize;
  lightMode?: boolean;
  orientation?: PageOrientation;
  showGuides: boolean;
  headerText: string;
  footerText: string;
  autoRefreshFile: boolean;
  showTOC?: boolean;
  tocTitle?: string;
  tocLevels?: number[];
  // Entradas manuales del índice: títulos ocultos (no existen como encabezado
  // real en el contenido) con la página absoluta donde aparecen, para que se
  // muestren en el TOC sin ensuciar el documento (p. ej. "Línea de Tiempo").
  manualTOCEntries?: { title: string; page: number; level?: number }[];
  blockStyleTitles?: string;
  blockStyleHeader?: string;
  blockStyleFooter?: string;
  blockStylePageNum?: string;
  blockStyleTOC?: string;
  blockStyleLists?: string;
  pageNumTemplate?: string;
  autoNumberHeadings?: boolean;
  
  // Toggles de salto de línea (APA 7 - Niveles de título)
  h1LineBreak?: boolean;
  h2LineBreak?: boolean;
  h3LineBreak?: boolean;
  h4LineBreak?: boolean;
  h5LineBreak?: boolean;
  
  // Margenes editables (en pixeles)
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;

  // Personalización Gráfica H1
  h1Size?: string;
  h1Font?: string;
  h1Align?: string;
  h1LineHeight?: string;
  h1Indent?: string;
  h1Bold?: boolean;
  h1Italic?: boolean;
  h1Color?: string;

  // Personalización Gráfica H2
  h2Size?: string;
  h2Font?: string;
  h2Align?: string;
  h2LineHeight?: string;
  h2Indent?: string;
  h2Bold?: boolean;
  h2Italic?: boolean;
  h2Color?: string;

  // Personalización Gráfica P (Párrafos)
  pSize?: string;
  pFont?: string;
  pAlign?: string;
  pLineHeight?: string;
  pIndent?: string;
  pBold?: boolean;
  pItalic?: boolean;
  pColor?: string;

  // Personalización Gráfica de Tablas
  tableFontSize?: string;
  tableHeaderBg?: string;
  tableHeaderColor?: string;
  tableBorderColor?: string;
  tableCellPadding?: string;
  tableStriped?: boolean;
  tableBorderWidth?: string;
  tableCustomCss?: string;
  repeatTableHeader?: boolean;

  // Campo de código CSS personalizado para añadir nuevos estilos
  customAddedCss?: string;

  // Campo de código JS personalizado para añadir nuevos scripts interactivos
  customAddedJs?: string;

  // Personalización Gráfica de Código (Monospace)
  codeSize?: string;
  codeTheme?: string;
  inlineCodeSize?: string;
  inlineCodeTheme?: string;
  blockCodeSize?: string;
  blockCodeTheme?: string;
  splitBlockCodeBorders?: boolean;

  // Bibliografía APA automática
  showBibliography?: boolean;
  showOnlyCitedBibliography?: boolean;
  bibliographyTitle?: string;
  marginElements?: MarginElement[];

  // Configuración de Plantillas dinámicas (HTML + JSON)
  showTemplatePages?: boolean;
  templateHtml?: string;
  templateJson?: string;
  templateStartPage?: number;
}

export interface MarginElement {
  id: string;
  name: string;
  code: string;
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  width?: string;
  height?: string;
  pagesPattern: string;
  hidden?: boolean;
}

export interface BibliographyItem {
  id: string;
  key: string;       // Unique citation key, e.g., "patino2026"
  type: 'book' | 'article' | 'web' | 'thesis' | 'inproceedings' | 'report';
  authors: string;    // Authors list, e.g., "Patiño, W., & Gómez, E."
  year: string;       // Publication year, e.g., "2026"
  title: string;      // Title of the work, e.g., "Tecnologías de la Información en el Ecuador"
  publisher?: string; // Publisher (for books)
  journal?: string;   // Journal name (for articles)
  volume?: string;    // Journal volume
  issue?: string;     // Journal issue
  pages?: string;     // Journal pages
  url?: string;       // URL (for web/articles)
  retrievedDate?: string; // Retrieved date (for web)
  school?: string;       // School/institution for thesis
  thesisType?: string;   // Type of thesis (e.g. Doctoral dissertation, Master's thesis)
  address?: string;      // Location/address for thesis or publisher
  booktitle?: string;    // Book/proceedings title for inproceedings
  editor?: string;       // Editor for inproceedings or book chapters
  doi?: string;          // DOI for articles, books, chapters
  edition?: string;      // Book edition, e.g. "5th ed." or "8"
  institution?: string;  // Institution for reports/theses
  reportNumber?: string; // Report number for reports
}

export interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string; // Base64 data string
  uploadedAt: string;
  description?: string; // Metadata or user-entered description
}

export interface HTMLBlock {
  id: string;
  name: string;
  code: string;
  collapsed: boolean;
  isMarkdown?: boolean;
}

export interface DocumentState {
  cover: CoverConfig;
  settings: PageSettings;
  htmlContent: string;
  uploadedFiles?: UploadedFile[];
  htmlBlocks?: HTMLBlock[];
  bibliography?: BibliographyItem[];
}
