/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { markdownParser, compileCoverHtml } from '../utils/markdownParser';
import { CoverConfig, PageSettings, UploadedFile, HTMLBlock } from '../types';
import { formatFontSize } from '../utils/fontUtils';
import { useLanguage } from '../i18n/LanguageContext';
import {
  FileText,
  FileCode,
  Layout,
  Printer,
  Plus,
  Sliders,
  User,
  Calendar,
  MapPin,
  Table,
  Quote,
  AlertCircle,
  HelpCircle,
  CheckCircle,
  Eye,
  EyeOff,
  Upload,
  Layers,
  Image,
  Trash2,
  Copy,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUp,
  ChevronsDown,
  List,
  X,
  Maximize2,
  Minimize2,
  Settings,
  Edit2,
  Check,
  Sparkles,
  RefreshCw,
  Code
} from 'lucide-react';

interface ConfigDrawerProps {
  isOpen: boolean;
  activeType: 'cover' | 'settings' | 'uploads' | 'toc' | null;
  onClose: () => void;
  cover: CoverConfig;
  setCover: React.Dispatch<React.SetStateAction<CoverConfig>>;
  settings: PageSettings;
  setSettings: React.Dispatch<React.SetStateAction<PageSettings>>;
  uploadedFiles: UploadedFile[];
  setUploadedFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
  onInsertHTML: (snippet: string) => void;
  isEmbedded?: boolean;
  htmlBlocks?: HTMLBlock[];
  setHtmlBlocks?: React.Dispatch<React.SetStateAction<HTMLBlock[]>>;
  userApiKey?: string;
  markdownSource?: string;
  onMarkdownSourceChange?: (next: string) => void;
  debounceDelay?: number;
}

const DEFAULT_TABLE_CSS = `/* Academic Table Style */
table {
  width: 100%;
}
th {
  background-color: #004080;
  color: #ffffff;
}`;

const COMPATIBLE_LISTS_CSS = `/* 1. Ajustar el contenedor general de las listas */
.wp-document-content ul:not(.toc-list) {
  list-style-type: none !important; /* Desactivar la viñeta nativa */
  padding-left: 20px !important;    /* Espacio reservado para tu nueva viñeta */
  margin-top: 0px !important;
  margin-bottom: 12px !important;
  text-indent: 0px !important;
}

/* 2. Listas ordenadas (numeradas) */
.wp-document-content ol {
  list-style-type: none !important; /* Desactivar número nativo */
  counter-reset: wp-counter !important; /* Iniciar un contador CSS */
  padding-left: 24px !important;
  margin-top: 0px !important;
  margin-bottom: 12px !important;
  text-indent: 0px !important;
}

.wp-document-content ul:not(.toc-list) li,
.wp-document-content ol li {
  text-indent: 0px !important;
  margin-bottom: 6px !important;
  padding-left: 0px !important;
  position: relative !important;
}

/* 3. CONTROL DE DISTANCIA DE VIÑETA (Círculo) */
.wp-document-content ul:not(.toc-list) li:not(.toc-item)::before,
.wp-document-content ul:not(.toc-list) li::before {
  content: "•" !important;
  display: block !important;
  position: absolute !important;
  /* CONTROL DIRECTO: Modificando este valor defines la separación exacta al texto */
  left: -12px !important; 
  top: 6px !important;
  font-size: 14px !important;
  line-height: 1 !important;
}

/* 4. CONTROL DE DISTANCIA DE NÚMEROS */
.wp-document-content ol li {
  counter-increment: wp-counter !important;
}
.wp-document-content ol li::before {
  content: counter(wp-counter) "." !important;
  display: block !important;
  position: absolute !important;
  /* CONTROL DIRECTO: Cambia esto para acercar/alejar los números */
  left: -18px !important; 
  top: 0px !important;
  text-align: right !important;
  width: 14px !important;
}

/* Evitar que párrafos y elementos directos de listas hereden indentación (Ecuaciones seguras) */
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

function AutoGrowingTextArea({
  value,
  onChange,
  placeholder,
  debounceDelay = 300,
  className = 'text-slate-200',
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  debounceDelay?: number;
  className?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [localValue, setLocalValue] = useState(value);
  const lastPropagatedRef = useRef<string>(value);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync with outer changes only if they were initiated externally (e.g. 
  // templates, file loads, undo/reverts)
  useEffect(() => {
    if (value !== lastPropagatedRef.current) {
      setLocalValue(value);
      lastPropagatedRef.current = value;
    }
  }, [value]);

  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.max(150, textarea.scrollHeight)}px`;
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [localValue]);

  // Cleanup active timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleChange = (newVal: string) => {
    setLocalValue(newVal);
    adjustHeight();

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (debounceDelay <= 0) {
      lastPropagatedRef.current = newVal;
      onChange(newVal);
    } else {
      timerRef.current = setTimeout(() => {
        lastPropagatedRef.current = newVal;
        onChange(newVal);
      }, debounceDelay);
    }
  };

  // Flush any pending debounced change on blur so the cover HTML is compiled
  // even if the user clicks away before the delay elapses
  const handleBlur = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      lastPropagatedRef.current = localValue;
      onChange(localValue);
    }
  };

  return (
    <textarea
      ref={textareaRef}
      value={localValue}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={handleBlur}
      style={{ resize: 'none' }}
      className={`w-full p-2.5 bg-slate-950 border border-slate-800 rounded font-mono text-xs focus:ring-1 focus:ring-orange-500 focus:outline-none overflow-y-hidden ${className}`}
      placeholder={placeholder}
    />
  );
}

function readDescriptionFromPng(uint8: Uint8Array): string | null {
  try {
    const view = new DataView(uint8.buffer, uint8.byteOffset, uint8.byteLength);
    let pos = 8; // skip PNG signature
    while (pos + 8 <= uint8.length) {
      const len = view.getUint32(pos, false); // big-endian
      // chunk type at pos + 4
      const type = String.fromCharCode(
        uint8[pos + 4],
        uint8[pos + 5],
        uint8[pos + 6],
        uint8[pos + 7]
      );
      if (type === 'IEND') break;
      if (type === 'tEXt') {
        const dataStart = pos + 8;
        const dataEnd = dataStart + len;
        // find null byte
        let nullIdx = -1;
        for (let i = dataStart; i < dataEnd; i++) {
          if (uint8[i] === 0) {
            nullIdx = i;
            break;
          }
        }
        if (nullIdx !== -1) {
          // Keyword
          let keyword = '';
          for (let i = dataStart; i < nullIdx; i++) {
            keyword += String.fromCharCode(uint8[i]);
          }
          if (keyword === 'Description') {
            // Text is UTF-8 decoded
            const textBytes = uint8.subarray(nullIdx + 1, dataEnd);
            return new TextDecoder('utf-8').decode(textBytes);
          }
        }
      }
      pos += 12 + len;
    }
  } catch (err) {
    console.error('Error reading description from PNG:', err);
  }
  return null;
}

function readDescriptionFromJpeg(uint8: Uint8Array): string | null {
  try {
    let pos = 2; // skip SOI marker (FF D8)
    const view = new DataView(uint8.buffer, uint8.byteOffset, uint8.byteLength);
    while (pos + 4 <= uint8.length) {
      if (uint8[pos] !== 0xFF) break;
      const marker = uint8[pos + 1];
      if (marker === 0xD8 || marker === 0xD9) break; // SOI / EOI
      if (marker === 0xFE) { // COM marker (Comment)
        const len = view.getUint16(pos + 2, false); // big-endian, includes length field itself (2 bytes)
        const start = pos + 4;
        const end = pos + 2 + len;
        if (end <= uint8.length) {
          const textBytes = uint8.subarray(start, end);
          const comment = new TextDecoder('utf-8').decode(textBytes);
          if (comment.trim()) return comment.trim();
        }
        break;
      }
      if (marker === 0x00 || marker === 0xFF) {
        pos++;
        continue;
      }
      const segLen = view.getUint16(pos + 2, false);
      pos += 2 + segLen;
    }
  } catch (err) {
    console.error('Error reading description from JPEG:', err);
  }
  return null;
}

function readDescription(uint8: Uint8Array): string | null {
  if (uint8[0] === 0xFF && uint8[1] === 0xD8) {
    return readDescriptionFromJpeg(uint8);
  }
  if (uint8[0] === 0x89 && uint8[1] === 0x50 && uint8[2] === 0x4E && uint8[3] === 0x47) {
    return readDescriptionFromPng(uint8);
  }
  return null;
}

interface HeadingItem {
  blockId: string;
  blockName: string;
  lineIndex: number;
  type: 'markdown' | 'html';
  level: number;
  cleanText: string;
  originalLine: string;
}

export function ConfigDrawer({
  isOpen,
  activeType,
  onClose,
  cover,
  setCover,
  settings,
  setSettings,
  uploadedFiles,
  setUploadedFiles,
  onInsertHTML,
  isEmbedded = false,
  htmlBlocks = [],
  setHtmlBlocks,
  userApiKey,
  markdownSource,
  onMarkdownSourceChange,
  debounceDelay = 300,
}: ConfigDrawerProps) {
  const { language, t } = useLanguage();
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [copiedAPA7, setCopiedAPA7] = useState<boolean>(false);
  const [showFormats, setShowFormats] = useState<boolean>(false);
  const [isInsertingAI, setIsInsertingAI] = useState<string | null>(null);
  const [aiExplanations, setAiExplanations] = useState<Array<{ imageName: string; text: string }> | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [isAIFormatModalOpen, setIsAIFormatModalOpen] = useState<boolean>(false);
  const [customFormatInstruction, setCustomFormatInstruction] = useState<string>('');
  const [urlInputSrc, setUrlInputSrc] = useState<string>('');
  const [urlInputDesc, setUrlInputDesc] = useState<string>('');

  // Modal para escoger entre Markdown o HTML (con CSS inline para posiciones y tamaños)
  const [copyModalFile, setCopyModalFile] = useState<UploadedFile | null>(null);
  const [copyFormatTab, setCopyFormatTab] = useState<'markdown' | 'html'>('html');
  const [copyModalDescription, setCopyModalDescription] = useState<string>('');
  const [htmlAlign, setHtmlAlign] = useState<'center' | 'left' | 'right' | 'float-left' | 'float-right'>('center');
  const [htmlWidthPreset, setHtmlWidthPreset] = useState<string>('60%');
  const [htmlCustomWidth, setHtmlCustomWidth] = useState<string>('');
  const [markdownWidthPreset, setMarkdownWidthPreset] = useState<string>('60%');

  const handleClipboardPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      handleMultipleFilesUpload(imageFiles);
      triggerSuccessMsg('¡Imagen del portapapeles agregada!');
    }
  };

  const handleToggleSelectFile = (id: string) => {
    setSelectedFileIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleDeleteSelectedFiles = () => {
    if (selectedFileIds.length === 0) return;
    setUploadedFiles(prev => prev.filter(file => !selectedFileIds.includes(file.id)));
    setSelectedFileIds([]);
    triggerSuccessMsg('Imágenes seleccionadas eliminadas');
  };

  const handleCopyAllNames = () => {
    if (uploadedFiles.length === 0) return;
    const namesText = uploadedFiles.map(f => f.name).join('\n');
    navigator.clipboard.writeText(namesText).then(() => {
      triggerSuccessMsg('¡Nombres copiados al portapapeles!');
    }).catch(() => {
      alert('Error al copiar los nombres al portapapeles.');
    });
  };

  const handleExecuteAIInsertion = async () => {
    if (!htmlBlocks || htmlBlocks.length === 0) {
      alert("No hay bloques de texto (Markdown) disponibles para insertar estas imágenes.");
      return;
    }

    const selectedFiles = uploadedFiles.filter(f => selectedFileIds.includes(f.id));
    if (selectedFiles.length === 0) {
      alert("Por favor, selecciona al menos una imagen para insertar.");
      return;
    }

    setIsInsertingAI("all_selected");
    try {
      const response = await fetch("/api/gemini/insert-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-api-key": userApiKey || "",
        },
        body: JSON.stringify({
          htmlBlocks: htmlBlocks.map(b => ({ id: b.id, name: b.name, code: b.code })),
          images: selectedFiles.map(img => ({
            name: img.name,
            description: img.description || ""
          })),
          formatInstruction: customFormatInstruction.trim(),
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Error al procesar con IA");
      }

      const result = await response.json();
      const { modifiedBlocks, explanations } = result;

      if (setHtmlBlocks && modifiedBlocks) {
        setHtmlBlocks(modifiedBlocks);
      }

      if (explanations && explanations.length > 0) {
        setAiExplanations(explanations);
      }
      
      setSelectedFileIds([]);
      setIsAIFormatModalOpen(false);
      triggerSuccessMsg("¡Imágenes insertadas con IA!");
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Ocurrió un error al procesar la inserción de las imágenes con IA.");
    } finally {
      setIsInsertingAI(null);
    }
  };

  const [localMarginTop, setLocalMarginTop] = useState<string>('');
  const [localMarginBottom, setLocalMarginBottom] = useState<string>('');
  const [localMarginLeft, setLocalMarginLeft] = useState<string>('');
  const [localMarginRight, setLocalMarginRight] = useState<string>('');

  useEffect(() => {
    if (settings.marginTop !== undefined) setLocalMarginTop(String(settings.marginTop));
    if (settings.marginBottom !== undefined) setLocalMarginBottom(String(settings.marginBottom));
    if (settings.marginLeft !== undefined) setLocalMarginLeft(String(settings.marginLeft));
    if (settings.marginRight !== undefined) setLocalMarginRight(String(settings.marginRight));
  }, [settings.marginTop, settings.marginBottom, settings.marginLeft, settings.marginRight]);

  const handleCommitMargin = (field: 'marginTop' | 'marginBottom' | 'marginLeft' | 'marginRight', valueStr: string) => {
    const val = parseInt(valueStr, 10);
    const finalVal = isNaN(val) ? 0 : val;
    handleSettingsChange(field, finalVal);
  };

  const handleMarginKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, field: 'marginTop' | 'marginBottom' | 'marginLeft' | 'marginRight', valueStr: string) => {
    if (e.key === 'Enter') {
      handleCommitMargin(field, valueStr);
      e.currentTarget.blur();
    }
  };

  const formats = [
    { label: 'Título H1', description: 'Sección Principal', snippet: '\n<h1>Título de Sección</h1>\n' },
    { label: 'Subtítulo H2', description: 'Sección Secundaria', snippet: '\n<h2>Subtítulo Secundario</h2>\n' },
    { label: 'Párrafo', description: 'Bloque Académico', snippet: '\n<p>Escriba aquí el bloque de texto académico formal...</p>\n' },
    { label: 'Lista', description: 'Lista de Viñetas', snippet: '\n<ul>\n  <li>Primer elemento de la lista académica</li>\n  <li>Segundo elemento de desarrollo</li>\n</ul>\n' },
    { label: 'Cita en Bloque', description: 'Cita Académica Profesional', snippet: `\n<blockquote>\n  "El desarrollo contemporáneo de aplicaciones de auto-paginación demanda balances estrictos entre rendimiento y adaptabilidad visual."\n  <cite>— Decanato de la Facultad (2026)</cite>\n</blockquote>\n` },
    { label: 'Fórmula Matemática', description: 'Fórmula MathJax auto-renderizada', snippet: `\n<div class="math-expr">\n  \\[ f(x) = \\sum_{n=0}^{\\infty} \\frac{f^{(n)}(a)}{n!} (x-a)^n \\]\n</div>\n` },
    { label: 'Salto de Página', description: 'Forzar Nueva Página en Impresión', snippet: '\n<div class="page-break"></div>\n' },
  ];
  
  // Accordion open/collapse states
  const [isMarginsOpen, setIsMarginsOpen] = useState<boolean>(false);
  const [isTextEditorOpen, setIsTextEditorOpen] = useState<boolean>(false);
  const [isTableStyleOpen, setIsTableStyleOpen] = useState<boolean>(false);
  const [isCustomCssStyleOpen, setIsCustomCssStyleOpen] = useState<boolean>(false);
  const [isTOCStyleOpen, setIsTOCStyleOpen] = useState<boolean>(false);
  const [isListsStyleOpen, setIsListsStyleOpen] = useState<boolean>(false);
  const [isCodeStyleOpen, setIsCodeStyleOpen] = useState<boolean>(false);

  // File renaming states
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingFileName, setEditingFileName] = useState<string>('');

  // Description editing states
  const [isEditingDescId, setIsEditingDescId] = useState<string | null>(null);
  const [editingDescText, setEditingDescText] = useState<string>('');

  const triggerSuccessMsg = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 2500);
  };

  const getHeadings = (): HeadingItem[] => {
    const list: HeadingItem[] = [];

    // Preferred path: scan the qmd source (markdown) line by line. The
    // document content now lives in contenido_fuente.md rather than in
    // htmlBlocks (the built-in HTML editor was removed).
    if (markdownSource !== undefined) {
      const lines = markdownSource.split('\n');
      let inFence = false;
      lines.forEach((line, lineIndex) => {
        if (inFence) {
          if (/^\s*(?:```+|~~~+)\s*$/.test(line.trim())) inFence = false;
          return;
        }
        if (/^\s*(?:```+|~~~+)/.test(line)) { inFence = true; return; }
        const mdMatch = line.match(/^\s*(#{1,6})\s+(.+)$/);
        if (!mdMatch) return;
        const level = mdMatch[1].length;
        let textContent = mdMatch[2]
          .replace(/\s*\{[#.][^}]*\}\s*$/, '') // strip pandoc {#id .class} attributes
          .replace(/\s+#+\s*$/, '')            // strip closing ATX hashes: "## Título ##"
          .replace(/<[^>]+>/g, '')
          .replace(/[*_`]/g, '')
          .trim();
        if (!textContent) return;
        list.push({
          blockId: 'source',
          blockName: 'Contenido',
          lineIndex,
          type: 'markdown',
          level,
          cleanText: textContent,
          originalLine: line,
        });
      });
      return list;
    }

    if (!htmlBlocks) return list;
    htmlBlocks.forEach((block) => {
      // Compile block content to HTML
      let htmlContent = "";
      if (block.isMarkdown) {
        try {
          htmlContent = String(markdownParser.parse(block.code));
        } catch (e) {
          htmlContent = "";
        }
      } else {
        htmlContent = block.code;
      }

      // Create a temporary element to query headings
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = htmlContent;
      const headingElements = Array.from(tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6'));

      const lines = block.code.split('\n');
      let searchStartIndex = 0;

      headingElements.forEach((el) => {
        const level = parseInt(el.tagName.substring(1), 10);
        const cleanText = el.textContent?.trim() || "";
        if (!cleanText) return;

        // Find the matching line in block.code
        let foundLineIndex = -1;
        for (let i = searchStartIndex; i < lines.length; i++) {
          const line = lines[i];
          if (block.isMarkdown) {
            const mdMatch = line.match(/^\s*(#{1,6})\s+(.+)$/);
            if (mdMatch) {
              const hashes = mdMatch[1];
              const textContent = mdMatch[2].replace(/<\/?[^>]+(>|$)/g, "").trim();
              if (hashes.length === level && (textContent.includes(cleanText) || cleanText.includes(textContent))) {
                foundLineIndex = i;
                break;
              }
            }
          } else {
            const htmlMatch = line.match(/<h([1-6])(\s[^>]*)?>([\s\S]*?)<\/h\1>/i);
            if (htmlMatch) {
              const hLevel = parseInt(htmlMatch[1], 10);
              const textContent = htmlMatch[3].replace(/<\/?[^>]+(>|$)/g, "").trim();
              if (hLevel === level && (textContent.includes(cleanText) || cleanText.includes(textContent))) {
                foundLineIndex = i;
                break;
              }
            }
          }
        }

        if (foundLineIndex !== -1) {
          list.push({
            blockId: block.id,
            blockName: block.name,
            lineIndex: foundLineIndex,
            type: block.isMarkdown ? 'markdown' : 'html',
            level,
            cleanText,
            originalLine: lines[foundLineIndex],
          });
          // Update search index so next duplicate headings match sequential lines correctly
          searchStartIndex = foundLineIndex + 1;
        }
      });
    });
    return list;
  };

  const handleUpdateHeadingLevel = (heading: HeadingItem, direction: 'left' | 'right') => {
    const newLevel = direction === 'left' ? heading.level - 1 : heading.level + 1;
    if (newLevel < 1 || newLevel > 6) return;

    // Headings found in the qmd source: rewrite the line in the markdown
    // and persist it back to the content file.
    if (heading.blockId === 'source') {
      if (!onMarkdownSourceChange || markdownSource === undefined) return;
      const lines = markdownSource.split('\n');
      const targetLine = lines[heading.lineIndex] || '';
      lines[heading.lineIndex] = targetLine.replace(
        /^(\s*)(#{1,6})\s+(.+)$/,
        (m, leadingSpaces, hashes, inner) => `${leadingSpaces}${'#'.repeat(newLevel)} ${inner}`
      );
      onMarkdownSourceChange(lines.join('\n'));
      triggerSuccessMsg(`Nivel de título actualizado a H${newLevel}`);
      return;
    }

    if (!setHtmlBlocks || !htmlBlocks) return;

    const updatedBlocks = htmlBlocks.map((block) => {
      if (block.id !== heading.blockId) return block;

      const lines = block.code.split('\n');
      const targetLine = lines[heading.lineIndex];

      let newLine = targetLine;
      if (heading.type === 'markdown') {
        newLine = targetLine.replace(/^(\s*)(#{1,6})\s+(.+)$/, (m, leadingSpaces, hashes, inner) => {
          return `${leadingSpaces}${'#'.repeat(newLevel)} ${inner}`;
        });
      } else {
        newLine = targetLine.replace(/<h([1-6])(\s[^>]*)?>([\s\S]*?)<\/h\1>/i, (m, currentLvl, attrs, inner) => {
          const finalAttrs = attrs || '';
          return `<h${newLevel}${finalAttrs}>${inner}</h${newLevel}>`;
        });
      }

      lines[heading.lineIndex] = newLine;
      return {
        ...block,
        code: lines.join('\n'),
      };
    });

    setHtmlBlocks(updatedBlocks);
    triggerSuccessMsg(`Nivel de título actualizado a H${newLevel}`);
  };

  // Shift every heading one level up ('up') or down ('down') in one click.
  const handleShiftAllHeadings = (direction: 'up' | 'down') => {
    const shiftLine = (line: string): string | null => {
      const m = line.match(/^(\s*)(#{1,6})\s+(.+)$/);
      if (!m) return null;
      const level = m[2].length;
      const newLevel = direction === 'up' ? level - 1 : level + 1;
      if (newLevel < 1 || newLevel > 6) return line;
      return `${m[1]}${'#'.repeat(newLevel)} ${m[3]}`;
    };

    if (markdownSource !== undefined) {
      if (!onMarkdownSourceChange) return;
      const lines = markdownSource.split('\n');
      let inFence = false;
      let changed = 0;
      const next = lines.map((line) => {
        if (inFence) {
          if (/^\s*(?:```+|~~~+)\s*$/.test(line.trim())) inFence = false;
          return line;
        }
        if (/^\s*(?:```+|~~~+)/.test(line)) { inFence = true; return line; }
        const shifted = shiftLine(line);
        if (shifted === null) return line;
        if (shifted !== line) changed++;
        return shifted;
      });
      if (changed === 0) return;
      onMarkdownSourceChange(next.join('\n'));
      triggerSuccessMsg(`${changed} título${changed === 1 ? '' : 's'} movido${changed === 1 ? '' : 's'} ${direction === 'up' ? 'un nivel arriba' : 'un nivel abajo'}`);
      return;
    }

    if (!setHtmlBlocks || !htmlBlocks) return;
    const updatedBlocks = htmlBlocks.map((block) => {
      const lines = block.code.split('\n');
      let inFence = false;
      const next = lines.map((line) => {
        if (inFence) {
          if (/^\s*(?:```+|~~~+)\s*$/.test(line.trim())) inFence = false;
          return line;
        }
        if (/^\s*(?:```+|~~~+)/.test(line)) { inFence = true; return line; }
        if (block.isMarkdown) {
          const shifted = shiftLine(line);
          if (shifted !== null) return shifted;
        } else {
          const htmlMatch = line.match(/<h([1-6])(\s[^>]*)?>([\s\S]*?)<\/h\1>/i);
          if (htmlMatch) {
            const hLevel = parseInt(htmlMatch[1], 10);
            const newLevel = direction === 'up' ? hLevel - 1 : hLevel + 1;
            if (newLevel >= 1 && newLevel <= 6) {
              return `<h${newLevel}${htmlMatch[2] || ''}>${htmlMatch[3]}</h${newLevel}>`;
            }
          }
        }
        return line;
      });
      return { ...block, code: next.join('\n') };
    });
    setHtmlBlocks(updatedBlocks);
    triggerSuccessMsg('Niveles de títulos actualizados para todos los bloques');
  };

  const handleCopyAllCSS = () => {
    const blockStyleTitles = settings.blockStyleTitles || '';
    const blockStyleHeader = settings.blockStyleHeader || '';
    const blockStyleFooter = settings.blockStyleFooter || '';
    const blockStylePageNum = settings.blockStylePageNum || '';
    const blockStyleTOC = settings.blockStyleTOC || '';
    const blockStyleLists = settings.blockStyleLists || '';
    const tableCustomCss = settings.tableCustomCss || '';
    const customAddedCss = settings.customAddedCss || '';

    const combinedCss = [
      '/* === ESTILOS CSS COMPLETOS PARA EL DOCUMENTO === */',
      blockStyleTitles && `/* --- TIPOGRAFÍA Y ESTILOS DE TEXTO --- */\n${blockStyleTitles}`,
      blockStyleHeader && `/* --- ENCABEZADO (HEADER) --- */\n${blockStyleHeader}`,
      blockStyleFooter && `/* --- PIE DE PÁGINA (FOOTER) --- */\n${blockStyleFooter}`,
      blockStylePageNum && `/* --- NUMERACIÓN DE PÁGINAS --- */\n${blockStylePageNum}`,
      blockStyleTOC && `/* --- TABLA DE CONTENIDOS (TOC) --- */\n${blockStyleTOC}`,
      blockStyleLists && `/* --- ESTILO DE LISTAS --- */\n${blockStyleLists}`,
      tableCustomCss && `/* --- FORMATO DE TABLAS --- */\n${tableCustomCss}`,
      customAddedCss && `/* --- OTROS ESTILOS PERSONALIZADOS --- */\n${customAddedCss}`,
    ].filter(Boolean).join('\n\n');

    navigator.clipboard.writeText(combinedCss).then(() => {
      triggerSuccessMsg('¡Estilos CSS copiados al portapapeles!');
    }).catch(() => {
      alert('Error al copiar al portapapeles.');
    });
  };

  const handleCopyDimensions = () => {
    const isLetter = settings.pageSize === 'letter';
    const isA4 = settings.pageSize === 'a4';
    const isContinuous = settings.pageSize === 'continuous';
    const isPortrait = (settings.orientation || 'portrait') === 'portrait';

    const width = isContinuous
      ? 794
      : isPortrait
        ? (isLetter ? 816 : isA4 ? 794 : 630)
        : (isLetter ? 1056 : isA4 ? 1123 : 1120);

    const height = isContinuous
      ? 1500 // arbitrary height description for pixels
      : isPortrait
        ? (isLetter ? 1056 : isA4 ? 1123 : 1120)
        : (isLetter ? 816 : isA4 ? 794 : 630);

    const topMarg = settings.marginTop !== undefined ? settings.marginTop : 96;
    const bottomMarg = settings.marginBottom !== undefined ? settings.marginBottom : 96;
    const leftMarg = settings.marginLeft !== undefined ? settings.marginLeft : 96;
    const rightMarg = settings.marginRight !== undefined ? settings.marginRight : 96;

    const usableWidth = width - leftMarg - rightMarg;
    const usableHeight = isContinuous ? 'Auto' : (height - topMarg - bottomMarg);

    const sizeName = isLetter ? 'Carta (Letter)' : isA4 ? 'A4' : isContinuous ? 'Tira Continua' : 'Personalizado (16:9)';
    const orientName = isPortrait ? 'Vertical (Portrait)' : 'Horizontal (Landscape)';

    const textToCopy = `=== AJUSTES FÍSICOS Y DIMENSIONES DE PÁGINA ===
Tamaño de Papel: ${sizeName}
Orientación: ${orientName}
DPI de Renderizado: 96 DPI

Dimensiones Totales de Hoja:
- Píxeles: ${width}px × ${isContinuous ? 'Auto' : `${height}px`}
- Pulgadas: ${(width / 96).toFixed(2)}" × ${isContinuous ? 'Auto' : `${(height / 96).toFixed(2)}"`}
- Centímetros: ${((width / 96) * 2.54).toFixed(2)} cm × ${isContinuous ? 'Auto' : `${((height / 96) * 2.54).toFixed(2)} cm`}

Márgenes de Página (Bordes):
- Superior (Top): ${topMarg}px (${(topMarg / 96).toFixed(2)}" / ${((topMarg / 96) * 2.54).toFixed(2)} cm)
- Inferior (Bottom): ${bottomMarg}px (${(bottomMarg / 96).toFixed(2)}" / ${((bottomMarg / 96) * 2.54).toFixed(2)} cm)
- Izquierdo (Left): ${leftMarg}px (${(leftMarg / 96).toFixed(2)}" / ${((leftMarg / 96) * 2.54).toFixed(2)} cm)
- Derecho (Right): ${rightMarg}px (${(rightMarg / 96).toFixed(2)}" / ${((rightMarg / 96) * 2.54).toFixed(2)} cm)

Área Útil de Contenido (Restando los bordes):
- Píxeles: ${usableWidth}px × ${isContinuous ? 'Auto' : `${usableHeight}px`}
- Pulgadas: ${(usableWidth / 96).toFixed(2)}" × ${isContinuous ? 'Auto' : `${(Number(usableHeight) / 96).toFixed(2)}"`}
- Centímetros: ${((usableWidth / 96) * 2.54).toFixed(2)} cm × ${isContinuous ? 'Auto' : `${((Number(usableHeight) / 96) * 2.54).toFixed(2)} cm`}`;

    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        triggerSuccessMsg('¡Ajustes y dimensiones copiados!');
      })
      .catch((err) => {
        console.error('Error al copiar las dimensiones:', err);
        alert('Error al copiar al portapapeles.');
      });
  };

  const handleCopyAPA7Styles = () => {
    const apa7CSS = `/* === CONFIGURACIÓN DE ESTILOS FORMATO APA 7 (NORMAS APA 7ma EDICIÓN) === */

/* Nivel 1: Centrado, Negrita, Caso de Título (Párrafo nuevo) */
.wp-document-content h1 {
  font-family: "Times New Roman", Times, Georgia, serif !important;
  font-size: 16px !important;
  font-weight: bold !important;
  text-align: center !important;
  margin-top: 0px !important;
  margin-bottom: 0px !important;
  line-height: 200% !important;
}

/* Nivel 2: Alineado a la izquierda, Negrita, Caso de Título (Párrafo nuevo) */
.wp-document-content h2 {
  font-family: "Times New Roman", Times, Georgia, serif !important;
  font-size: 16px !important;
  font-weight: bold !important;
  text-align: left !important;
  margin-top: 0px !important;
  margin-bottom: 0px !important;
  line-height: 200% !important;
}

/* Nivel 3: Alineado a la izquierda, Negrita, Cursiva, Caso de Título (Párrafo nuevo) */
.wp-document-content h3 {
  font-family: "Times New Roman", Times, Georgia, serif !important;
  font-size: 16px !important;
  font-weight: bold !important;
  font-style: italic !important;
  text-align: left !important;
  margin-top: 0px !important;
  margin-bottom: 0px !important;
  line-height: 200% !important;
}

/* Nivel 4 (Salto de Línea): Sangría 0.5 in, Negrita, punto final */
.wp-document-content h4 {
  font-family: "Times New Roman", Times, Georgia, serif !important;
  font-size: 16px !important;
  font-weight: bold !important;
  font-style: normal !important;
  text-align: left !important;
  text-indent: 0.5in !important;
  margin-top: 0px !important;
  margin-bottom: 0px !important;
  line-height: 200% !important;
}

/* Nivel 5 (Salto de Línea): Sangría 0.5 in, Negrita Cursiva, punto final */
.wp-document-content h5 {
  font-family: "Times New Roman", Times, Georgia, serif !important;
  font-size: 16px !important;
  font-weight: bold !important;
  font-style: italic !important;
  text-align: left !important;
  text-indent: 0.5in !important;
  margin-top: 0px !important;
  margin-bottom: 0px !important;
  line-height: 200% !important;
}

/* Nivel 4 (Run-in): En la misma línea, Negrita, punto final (hereda sangría de primera línea del párrafo) */
.wp-document-content .apa-runin.apa-level4 {
  font-weight: bold !important;
  font-style: normal !important;
}

/* Nivel 5 (Run-in): En la misma línea, Negrita Cursiva, punto final (hereda sangría de primera línea del párrafo) */
.wp-document-content .apa-runin.apa-level5 {
  font-weight: bold !important;
  font-style: italic !important;
}

/* Párrafo APA 7 general */
.wp-document-content p {
  font-family: "Times New Roman", Times, Georgia, serif !important;
  font-size: 16px !important;
  line-height: 2.0 !important;
  color: #000000 !important;
  text-align: left !important;
  text-indent: 0.5in !important;
  margin-top: 0px !important;
  margin-bottom: 0px !important;
}

/* APA 7: Los niveles 4 y 5 run-in SÍ llevan sangría de primera línea (0.5 in).
   Sobrescribe el valor por defecto de la app (0px) al inyectarse después. */
.wp-document-content p:has(.apa-runin) {
  text-indent: 0.5in !important;
}`;

    navigator.clipboard.writeText(apa7CSS).then(() => {
      setCopiedAPA7(true);
      setTimeout(() => setCopiedAPA7(false), 2500);
    }).catch((err) => {
      console.error('Error al copiar estilos APA 7:', err);
      alert('Error al copiar al portapapeles.');
    });
  };

  if (!isOpen || !activeType) return null;

  const handleCoverChange = (field: keyof CoverConfig, value: any) => {
    setCover((prev) => {
      const updated = { ...prev, [field]: value };
      if (field === 'overlayTemplate' || field === 'overlayMarkdown') {
        try {
          const md = updated.overlayMarkdown || '';
          const tmpl = updated.overlayTemplate || '';
          updated.overlayHtml = compileCoverHtml(tmpl, md);
        } catch (e) {
          console.error('Error compiling markdown on cover change:', e);
        }
      }
      return updated;
    });
  };

  const handleSettingsChange = (field: keyof PageSettings, value: any) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleMultipleFilesUpload = (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    let successCount = 0;
    Array.from(files).forEach((file, index) => {
      if (file.size > 5 * 1024 * 1024) {
        alert(`El archivo "${file.name}" supera el límite de 5MB.`);
        return;
      }

      // Read ArrayBuffer to extract PNG/JPEG metadata description
      const bufferReader = new FileReader();
      bufferReader.onload = (be) => {
        const arrayBuffer = be.target?.result as ArrayBuffer;
        let extractedDesc = '';
        if (arrayBuffer) {
          const uint8 = new Uint8Array(arrayBuffer);
          const metaDesc = readDescription(uint8);
          if (metaDesc) {
            extractedDesc = metaDesc;
          }
        }

        // Read DataURL for previews and document compilation
        const dataUrlReader = new FileReader();
        dataUrlReader.onload = (de) => {
          const dataUrl = de.target?.result as string;
          if (!dataUrl) return;

          const newFile: UploadedFile = {
            id: 'file_' + Date.now() + '_' + index + '_' + Math.random().toString(36).substring(2, 6),
            name: file.name,
            type: file.type,
            size: file.size,
            dataUrl: dataUrl,
            uploadedAt: new Date().toISOString(),
            description: extractedDesc || '',
          };
          setUploadedFiles((prev) => [...prev, newFile]);
          successCount++;
          if (successCount === files.length) {
            triggerSuccessMsg(`${files.length} imagen(es) cargada(s) con éxito`);
          }
        };
        dataUrlReader.readAsDataURL(file);
      };
      bufferReader.readAsArrayBuffer(file);
    });
  };

  const handleSaveDesc = (id: string) => {
    setUploadedFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, description: editingDescText } : f))
    );
    setIsEditingDescId(null);
    triggerSuccessMsg('¡Descripción guardada!');
  };

  const handleAddFileByUrl = (url: string, description?: string) => {
    if (!url.trim()) return;
    const sanitizedUrl = url.trim();
    let sanitizedName = '';
    try {
      const urlObj = new URL(sanitizedUrl);
      const pathname = urlObj.pathname;
      const parts = pathname.split('/');
      const lastPart = parts[parts.length - 1];
      if (lastPart && lastPart.includes('.')) {
        sanitizedName = decodeURIComponent(lastPart);
      }
    } catch {
      const parts = sanitizedUrl.split('/');
      const lastPart = parts[parts.length - 1];
      sanitizedName = lastPart.split('?')[0] || '';
    }

    if (!sanitizedName || sanitizedName.trim() === '') {
      sanitizedName = 'imagen_url_' + Date.now().toString().slice(-4) + '.png';
    }

    if (!sanitizedName.includes('.')) {
      sanitizedName += '.png';
    }

    const newFile: UploadedFile = {
      id: 'file_url_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      name: sanitizedName,
      type: 'image/url',
      size: 0,
      dataUrl: sanitizedUrl,
      uploadedAt: new Date().toISOString(),
      description: description?.trim() || '',
    };
    setUploadedFiles((prev) => [...prev, newFile]);
    triggerSuccessMsg('¡Imagen por URL agregada!');
  };

  const getComputedHtmlSnippet = (filename: string, description: string) => {
    const width = htmlWidthPreset === 'custom'
      ? (htmlCustomWidth.trim() || '100%')
      : htmlWidthPreset;

    let style = `width: ${width}; max-width: 100%; height: auto;`;
    if (htmlAlign === 'center') {
      style += ' display: block; margin: 12px auto;';
    } else if (htmlAlign === 'left') {
      style += ' display: block; margin: 12px auto 12px 0;';
    } else if (htmlAlign === 'right') {
      style += ' display: block; margin: 12px 0 12px auto;';
    } else if (htmlAlign === 'float-left') {
      style += ' float: left; margin: 0 16px 12px 0;';
    } else if (htmlAlign === 'float-right') {
      style += ' float: right; margin: 0 0 12px 16px;';
    }

    const alt = description.trim();
    return `<img src="${filename}" alt="${alt}" style="${style}" />`;
  };

  const getComputedMarkdownSnippet = (filename: string, description: string) => {
    const alt = description.trim() || 'Descripción de la figura';
    const widthPart = markdownWidthPreset && markdownWidthPreset !== 'none'
      ? `{width=${markdownWidthPreset}}`
      : '';
    return `![${alt}](${filename})${widthPart}`;
  };

  const handleOpenCopyModal = (file: UploadedFile) => {
    setCopyModalFile(file);
    setCopyModalDescription(file.description || '');
  };

  const handleExecuteCopySnippet = (format: 'markdown' | 'html') => {
    if (!copyModalFile) return;
    const snippet = format === 'markdown'
      ? getComputedMarkdownSnippet(copyModalFile.name, copyModalDescription)
      : getComputedHtmlSnippet(copyModalFile.name, copyModalDescription);

    navigator.clipboard.writeText(snippet).then(() => {
      triggerSuccessMsg(format === 'markdown' ? '¡Sintaxis Markdown copiada!' : '¡Sintaxis HTML copiada!');
      setCopyModalFile(null);
    }).catch(() => {
      alert('Error de portapapeles.');
    });
  };

  const handleExecuteInsertSnippet = (format: 'markdown' | 'html') => {
    if (!copyModalFile) return;
    const snippet = format === 'markdown'
      ? `\n${getComputedMarkdownSnippet(copyModalFile.name, copyModalDescription)}\n`
      : `\n${getComputedHtmlSnippet(copyModalFile.name, copyModalDescription)}\n`;

    onInsertHTML(snippet);
    triggerSuccessMsg(format === 'markdown' ? '¡Figura Markdown insertada en el editor!' : '¡Etiqueta HTML insertada en el editor!');
    setCopyModalFile(null);
  };

  const handleCopySnippet = (filename: string) => {
    const file = uploadedFiles.find(f => f.name === filename);
    if (file) {
      handleOpenCopyModal(file);
    } else {
      const figureSnippet = `![Descripción de la figura](${filename}){width=60%}`;
      navigator.clipboard.writeText(figureSnippet).then(() => {
        triggerSuccessMsg('¡Formato de Figura copiado!');
      }).catch(() => {
        alert('Error de portapapeles.');
      });
    }
  };

  const handleInsertImgTag = (filename: string) => {
    const figureSnippet = `\n![Descripción de la figura](${filename}){width=60%}\n`;
    
    onInsertHTML(figureSnippet);
    triggerSuccessMsg('¡Figura insertada en el editor!');
  };

  const handleDeleteFile = (id: string) => {
    setUploadedFiles((prev) => prev.filter((item) => item.id !== id));
    triggerSuccessMsg('Archivo eliminado');
  };

  const handleSaveRename = (id: string) => {
    const trimmed = editingFileName.trim();
    if (!trimmed) {
      alert("El nombre de archivo no puede estar vacío");
      return;
    }
    // Check for duplicate names (case insensitive) among other files
    const duplicate = uploadedFiles.some(f => f.id !== id && f.name.toLowerCase() === trimmed.toLowerCase());
    if (duplicate) {
      alert("Ya existe un archivo con este nombre");
      return;
    }
    setUploadedFiles(prev => prev.map(f => f.id === id ? { ...f, name: trimmed } : f));
    setEditingFileId(null);
    triggerSuccessMsg('Archivo renombrado con éxito');
  };

  return (
    <div className={isEmbedded 
      ? "w-full h-full bg-slate-900 flex flex-col font-sans select-none print:hidden relative"
      : "absolute top-14 right-0 bottom-0 w-[420px] bg-slate-900 border-l border-slate-800 shadow-2xl z-40 flex flex-col font-sans select-none print:hidden"}>
      
      {/* Header bar */}
      <div className="p-3 bg-slate-950 border-b border-slate-850 flex items-center justify-between shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {activeType === 'cover' && (
            <>
              <Layers className="w-4 h-4 text-orange-500 shrink-0" />
              <span className="text-[11px] font-extrabold text-slate-100 uppercase tracking-wider truncate">{t('coverConfigTitle')}</span>
            </>
          )}
          {activeType === 'settings' && (
            <>
              <Sliders className="w-4 h-4 text-orange-500 shrink-0" />
              <span className="text-[11px] font-extrabold text-slate-100 uppercase tracking-wider truncate">{t('pageStylesTitle')}</span>
            </>
          )}
          {activeType === 'uploads' && (
            <div className="flex items-center gap-2 min-w-0 flex-1 justify-between">
              <div className="flex items-center gap-1.5 min-w-0 shrink-0">
                <Image className="w-4 h-4 text-orange-500 shrink-0" />
                <span className="text-[11px] font-extrabold text-slate-100 uppercase tracking-wider truncate">{t('uploadsTitle')}</span>
              </div>

              {/* Botones de acción arriba: Eliminar (icono) e Insertar */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* 1. Eliminar (Solo icono + contador) */}
                <button
                  type="button"
                  disabled={selectedFileIds.length === 0}
                  onClick={handleDeleteSelectedFiles}
                  className="py-1 px-2 rounded font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1 transition-all cursor-pointer border disabled:opacity-30 disabled:cursor-not-allowed bg-red-950/40 hover:bg-red-900/60 text-red-300 border-red-800/60 active:scale-95"
                  title={selectedFileIds.length > 0 ? (language === 'es' ? `Eliminar imágenes seleccionadas (${selectedFileIds.length})` : `Delete selected images (${selectedFileIds.length})`) : (language === 'es' ? "Eliminar seleccionadas" : "Delete selected")}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {selectedFileIds.length > 0 && <span className="text-[9px] font-mono font-bold">({selectedFileIds.length})</span>}
                </button>

                {/* 2. Insertar */}
                <button
                  type="button"
                  disabled={selectedFileIds.length === 0}
                  onClick={() => setIsAIFormatModalOpen(true)}
                  className="py-1 px-2.5 rounded font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer border disabled:opacity-30 disabled:cursor-not-allowed bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 border-orange-500/40 active:scale-95"
                  title={language === 'es' ? "Insertar imágenes seleccionadas" : "Insert selected images"}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{language === 'es' ? 'Insertar' : 'Insert'} {selectedFileIds.length > 0 ? `(${selectedFileIds.length})` : ''}</span>
                </button>
              </div>
            </div>
          )}
          {activeType === 'toc' && (
            <>
              <List className="w-4 h-4 text-orange-500 shrink-0" />
              <span className="text-[11px] font-extrabold text-slate-100 uppercase tracking-wider truncate">{t('tocTitle')}</span>
            </>
          )}
        </div>
        <button 
          onClick={onClose}
          className="p-1.5 hover:bg-slate-850 rounded transition-all text-slate-400 hover:text-slate-200 cursor-pointer shrink-0"
          title={language === 'es' ? "Cerrar panel" : "Close panel"}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body content scroll section */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col gap-5 text-slate-200">
        
        {/* TAB 1: COVERPORTADA CONTROLS */}
        {activeType === 'cover' && (
          <div className="flex flex-col gap-4 text-xs">
            {/* Activar / Desactivar Portada Control Box */}
            <div className="p-3.5 bg-slate-950/90 border border-slate-800 rounded-lg flex flex-col gap-2.5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`p-2 rounded-lg shrink-0 ${cover.enabled !== false ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                    {cover.enabled !== false ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[11px] font-bold text-slate-100 truncate">
                      {language === 'es' ? 'Mostrar Portada en Documento' : 'Show Cover Page in Document'}
                    </span>
                    <span className="text-[9.5px] text-slate-400 truncate">
                      {cover.enabled !== false
                        ? (language === 'es' ? 'La portada se incluye en el documento' : 'Cover page is included in the document')
                        : (language === 'es' ? 'Portada desactivada / eliminada del documento' : 'Cover page disabled / removed from document')}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleCoverChange('enabled', cover.enabled === false ? true : false)}
                  className={`px-3 py-1.5 rounded-md font-extrabold text-[10.5px] tracking-wider uppercase transition-all cursor-pointer flex items-center gap-1.5 border shrink-0 active:scale-95 ${
                    cover.enabled !== false
                      ? 'bg-red-950/80 hover:bg-red-900 border-red-700/80 text-red-200 shadow-sm'
                      : 'bg-emerald-950/80 hover:bg-emerald-900 border-emerald-700/80 text-emerald-200 shadow-sm'
                  }`}
                  title={cover.enabled !== false ? (language === 'es' ? "Desactivar y eliminar la portada del documento" : "Disable and remove cover page from document") : (language === 'es' ? "Activar e incluir la portada en el documento" : "Enable and include cover page in document")}
                >
                  {cover.enabled !== false ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5 text-red-400" />
                      <span>{language === 'es' ? 'Desactivar Portada' : 'Disable Cover'}</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{language === 'es' ? 'Activar Portada' : 'Enable Cover'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Markdown content of cover */}
            <div className="flex flex-col gap-2 mt-2">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-orange-500" />
                {language === 'es' ? 'Contenido Markdown de Portada' : 'Cover Page Markdown Content'}
              </span>
              <p className="text-[9px] text-slate-400 leading-normal mb-0.5">
                {language === 'es'
                  ? 'Escribe o pega el contenido textual de tu portada utilizando formato Markdown. Este se inyectará automáticamente en la plantilla definida abajo.'
                  : 'Write or paste the textual content of your cover using Markdown format. It will be injected automatically into the template defined below.'}
              </p>
              <AutoGrowingTextArea
                value={cover.overlayMarkdown || ''}
                onChange={(val) => handleCoverChange('overlayMarkdown', val)}
                debounceDelay={debounceDelay}
                className="text-white"
                placeholder={language === 'es' ? "Escribe el contenido en Markdown de la carátula..." : "Write cover page Markdown content..."}
              />
            </div>

            {/* Custom CSS overlay (Pure CSS) */}
            <div className="flex flex-col gap-2 mt-2">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5 text-orange-500" />
                {language === 'es' ? 'Estilos CSS de Portada' : 'Cover Page CSS Styles'}
              </span>
              <p className="text-[9px] text-slate-400 leading-normal mb-0.5">
                {language === 'es'
                  ? 'Define únicamente las reglas CSS de la carátula. La envoltura HTML (.cv-page y .cv-content) y las etiquetas <style> se incorporan automáticamente.'
                  : 'Define only the CSS rules for the cover page. The HTML wrapper (.cv-page and .cv-content) and <style> tags are incorporated automatically.'}
              </p>
              <AutoGrowingTextArea
                value={cover.overlayTemplate || ''}
                onChange={(val) => handleCoverChange('overlayTemplate', val)}
                debounceDelay={debounceDelay}
                className="text-green-400 font-mono text-xs"
                placeholder={language === 'es' ? "Escribe solo tus reglas CSS de la carátula..." : "Write only your cover CSS rules..."}
              />
            </div>

            {/* Plantilla academic banner code block mockup */}
            <div className="p-3 bg-slate-950/80 border border-slate-850 rounded flex flex-col gap-2">
              <div className="flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-orange-400 shrink-0" />
                <span className="text-[10px] font-bold text-slate-200 uppercase tracking-wider">
                  🎓 {language === 'es' ? 'Plantillas Académicas para Portada' : 'Academic Cover Page Templates'}
                </span>
              </div>
              <p className="text-[9px] text-slate-400 leading-normal">
                {language === 'es'
                  ? 'Usa estas plantillas modulares para configurar tu portada académica en segundos. Copia los estilos CSS y el contenido textual (Markdown).'
                  : 'Use these modular templates to configure your academic cover in seconds. Copy CSS styles and textual content (Markdown).'}
              </p>
              
              <div className="flex flex-col gap-1.5 mt-1">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`body{
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
}`);
                    triggerSuccessMsg('¡Plantilla Estilos CSS Copiada!');
                  }}
                  className="w-full py-1.5 px-3 rounded bg-slate-800 hover:bg-slate-700 hover:text-white transition-all text-[11px] font-bold text-orange-400 cursor-pointer text-center"
                >
                  Copiar Plantilla Estilos CSS
                </button>

                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(`<img src="icon.png" style="max-width:40%; margin-bottom:40px; display:block; margin-left:auto; margin-right:auto;">

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

# MILAGRO-ECUADOR`);
                    triggerSuccessMsg('¡Contenido Markdown Copiado!');
                  }}
                  className="w-full py-1.5 px-3 rounded bg-slate-800 hover:bg-slate-700 hover:text-white transition-all text-[11px] font-bold text-orange-400 cursor-pointer text-center"
                >
                  Copiar Contenido (Markdown)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PAGE DESIGN AND STYLING STUFF */}
        {activeType === 'settings' && (
          <div className="flex flex-col gap-4 text-xs">
            {/* General CSS Copy Action */}
            <button
              type="button"
              onClick={handleCopyAllCSS}
              className="py-2 px-3 rounded bg-orange-600 hover:bg-orange-700 active:scale-[98%] text-white font-extrabold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md border border-orange-500"
              title="Copiar al portapapeles todos los estilos CSS definidos de títulos, textos, párrafos, tablas, encabezados y pies de página"
            >
              <Copy className="w-3.5 h-3.5 text-white" />
              <span>Copiar todos los Estilos CSS</span>
            </button>

            {/* Page Dimensions selector */}
            <div className="flex flex-col gap-1.5 flex-1">
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Tamaño de Papel</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleSettingsChange('pageSize', 'letter')}
                  className={`p-2 rounded border text-center font-bold tracking-wide text-xs transition-all cursor-pointer ${
                    settings.pageSize === 'letter'
                      ? 'bg-[#004080] border-[#FF6600] text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                  title="Carta (8.5in x 11in)"
                >
                  Letter
                  <span className="block text-[8px] font-normal text-slate-400 mt-0.5">8.5" × 11"</span>
                </button>
                <button
                  onClick={() => handleSettingsChange('pageSize', 'a4')}
                  className={`p-2 rounded border text-center font-bold tracking-wide text-xs transition-all cursor-pointer ${
                    settings.pageSize === 'a4'
                      ? 'bg-[#004080] border-[#FF6600] text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                  title="A4 (21.0cm x 29.7cm)"
                >
                  A4
                  <span className="block text-[8px] font-normal text-slate-400 mt-0.5">21 × 29.7cm</span>
                </button>
                <button
                  onClick={() => handleSettingsChange('pageSize', '16:9')}
                  className={`p-2 rounded border text-center font-bold tracking-wide text-xs transition-all cursor-pointer ${
                    settings.pageSize === '16:9'
                      ? 'bg-[#004080] border-[#FF6600] text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                  title="Diapositiva / Widescreen (16:9)"
                >
                  16:9
                  <span className="block text-[8px] font-normal text-slate-400 mt-0.5">Pantalla</span>
                </button>
                <button
                  onClick={() => handleSettingsChange('pageSize', 'continuous')}
                  className={`p-2 rounded border text-center font-bold tracking-wide text-xs transition-all cursor-pointer ${
                    settings.pageSize === 'continuous'
                      ? 'bg-[#004080] border-[#FF6600] text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                  title="Modo sin división de hojas ni bordes para copiar directamente a Microsoft Word"
                >
                  Continua
                  <span className="block text-[8px] font-normal text-slate-400 mt-0.5">Copiar a Word</span>
                </button>
              </div>
            </div>

            {/* Page Orientation selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Orientación de Página</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleSettingsChange('orientation', 'portrait')}
                  className={`p-2.5 rounded border text-center font-bold tracking-wide transition-all cursor-pointer ${
                    (settings.orientation || 'portrait') === 'portrait'
                      ? 'bg-[#004080] border-[#FF6600] text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Vertical (Portrait)
                </button>
                <button
                  onClick={() => handleSettingsChange('orientation', 'landscape')}
                  className={`p-2.5 rounded border text-center font-bold tracking-wide transition-all cursor-pointer ${
                    settings.orientation === 'landscape'
                      ? 'bg-[#004080] border-[#FF6600] text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Horizontal (Landscape)
                </button>
              </div>
            </div>

            {/* Copy Page Details Action */}
            <button
              type="button"
              onClick={handleCopyDimensions}
              className="py-2.5 px-3 rounded bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-[#FF6600]/80 text-slate-300 hover:text-orange-450 font-bold text-[10.5px] flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-[98%]"
              title="Copiar dimensiones de página, orientación, DPI y área de contenido útil restando el ancho de los bordes"
            >
              <Copy className="w-3.5 h-3.5 text-orange-500" />
              <span>Copiar Ajustes de Página y Área Útil</span>
            </button>

            {/* Boundary guides toggler */}
            <div className="flex items-center justify-between p-2.5 bg-slate-950 rounded border border-slate-850">
              <div className="flex flex-col gap-0.5">
                <span className="font-bold text-[10px] uppercase tracking-wider text-slate-300">Guías de márgenes (1 in)</span>
                <span className="text-[9px] text-slate-500">Muestra líneas límite de impresión</span>
              </div>
              <button
                onClick={() => handleSettingsChange('showGuides', !settings.showGuides)}
                className={`p-1 flex items-center transition-all cursor-pointer ${
                  settings.showGuides ? 'text-orange-400' : 'text-slate-500'
                }`}
              >
                {settings.showGuides ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5 opacity-40" />}
              </button>
            </div>

            {/* Accordions */}
            <div className="flex flex-col gap-3">
              
              {/* Margins */}
              <div className="border border-slate-800 rounded bg-slate-950/25 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setIsMarginsOpen(!isMarginsOpen)}
                  className="w-full p-2.5 bg-slate-950 hover:bg-slate-900/80 flex justify-between items-center text-left transition-all"
                >
                  <span className="font-extrabold uppercase text-[10px] tracking-wider text-slate-350">
                    📐 Márgenes de Página (px)
                  </span>
                  <span>{isMarginsOpen ? '▲' : '▼'}</span>
                </button>
                {isMarginsOpen && (
                  <div className="p-3 border-t border-slate-850 bg-slate-900/10 flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Superior (Top)</label>
                        <input
                          type="number"
                          value={localMarginTop}
                          onChange={(e) => setLocalMarginTop(e.target.value)}
                          onBlur={() => handleCommitMargin('marginTop', localMarginTop)}
                          onKeyDown={(e) => handleMarginKeyDown(e, 'marginTop', localMarginTop)}
                          className="w-full p-1.5 bg-slate-950 border border-slate-800 rounded text-slate-200"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Inferior (Bottom)</label>
                        <input
                          type="number"
                          value={localMarginBottom}
                          onChange={(e) => setLocalMarginBottom(e.target.value)}
                          onBlur={() => handleCommitMargin('marginBottom', localMarginBottom)}
                          onKeyDown={(e) => handleMarginKeyDown(e, 'marginBottom', localMarginBottom)}
                          className="w-full p-1.5 bg-slate-950 border border-slate-800 rounded text-slate-200"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Izquierdo (Left)</label>
                        <input
                          type="number"
                          value={localMarginLeft}
                          onChange={(e) => setLocalMarginLeft(e.target.value)}
                          onBlur={() => handleCommitMargin('marginLeft', localMarginLeft)}
                          onKeyDown={(e) => handleMarginKeyDown(e, 'marginLeft', localMarginLeft)}
                          className="w-full p-1.5 bg-slate-950 border border-slate-800 rounded text-slate-200"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Derecho (Right)</label>
                        <input
                          type="number"
                          value={localMarginRight}
                          onChange={(e) => setLocalMarginRight(e.target.value)}
                          onBlur={() => handleCommitMargin('marginRight', localMarginRight)}
                          onKeyDown={(e) => handleMarginKeyDown(e, 'marginRight', localMarginRight)}
                          className="w-full p-1.5 bg-slate-950 border border-slate-800 rounded text-slate-200"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="border border-slate-800 rounded bg-slate-950/25 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setIsTextEditorOpen(!isTextEditorOpen)}
                  className="w-full p-2.5 bg-slate-950 hover:bg-slate-900/80 flex justify-between items-center text-left transition-all"
                >
                  <span className="font-extrabold uppercase text-[10px] tracking-wider text-slate-350">
                    📝 Configuración de Texto
                  </span>
                  <span>{isTextEditorOpen ? '▲' : '▼'}</span>
                </button>
                {isTextEditorOpen && (
                  <div className="p-3 border-t border-slate-850 bg-slate-900/10 flex flex-col gap-3">
                    {/* Botones de Salto de Línea para Títulos (APA 7 Run-in) */}
                    <div className="flex flex-col gap-2 p-2.5 bg-slate-950 border border-slate-850 rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] text-[#FF6600] font-bold uppercase tracking-wider flex items-center gap-1">
                          🔄 Salto de Línea (APA 7 Run-in)
                        </span>
                        
                        <button
                          type="button"
                          onClick={handleCopyAPA7Styles}
                          className="flex items-center gap-1 px-1.5 py-0.5 bg-orange-600/10 hover:bg-orange-600/20 text-orange-400 hover:text-orange-300 border border-orange-600/20 hover:border-orange-600/40 rounded text-[9px] font-bold transition-all uppercase cursor-pointer"
                        >
                          {copiedAPA7 ? (
                            <>
                              <Check className="w-2.5 h-2.5 text-green-400 animate-pulse" />
                              <span>Copiado!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-2.5 h-2.5 text-orange-400" />
                              <span>Copy APA 7 format</span>
                            </>
                          )}
                        </button>
                      </div>
                      
                      <p className="text-[8px] text-slate-400 leading-normal">
                        Marca para salto de línea (Línea Nueva) o desmarca para texto inline (Run-in, por defecto en H4 y H5 en APA 7).
                      </p>
                      
                      <div className="grid grid-cols-5 gap-1.5 mt-1">
                        {([1, 2, 3, 4, 5] as const).map((level) => {
                          const configKey = `h${level}LineBreak` as const;
                          const isChecked = settings[configKey] !== undefined ? !!settings[configKey] : level <= 3;
                          return (
                            <label
                              key={level}
                              className={`flex items-center gap-1 justify-center px-1 py-1 bg-slate-900 border rounded cursor-pointer select-none transition-all ${
                                isChecked
                                  ? 'border-orange-600/40 bg-orange-600/5 text-orange-400'
                                  : 'border-slate-800 hover:bg-slate-850 text-slate-400'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleSettingsChange(configKey, !isChecked)}
                                className="w-3 h-3 accent-orange-600 rounded cursor-pointer"
                              />
                              <span className="text-[9.5px] font-bold">H{level}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <span className="text-[9px] text-slate-400 font-bold uppercase mb-1">Editor CSS de Títulos y Párrafos</span>
                    <textarea
                      value={settings.blockStyleTitles || ''}
                      onChange={(e) => handleSettingsChange('blockStyleTitles', e.target.value)}
                      rows={14}
                      className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 font-mono text-[10.5px]"
                      placeholder="/* .wp-document-content h1 {} */"
                    />
                  </div>
                )}
              </div>

              {/* Table custom styles */}
              <div className="border border-slate-800 rounded bg-slate-950/25 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setIsTableStyleOpen(!isTableStyleOpen)}
                  className="w-full p-2.5 bg-slate-950 hover:bg-slate-900/80 flex justify-between items-center text-left transition-all"
                >
                  <span className="font-extrabold uppercase text-[10px] tracking-wider text-slate-350">
                    📊 Visualización de Tablas
                  </span>
                  <span>{isTableStyleOpen ? '▲' : '▼'}</span>
                </button>
                {isTableStyleOpen && (
                  <div className="p-3 border-t border-slate-850 bg-slate-900/10 flex flex-col gap-3">
                    {/* Toggle button for repeating table headers on page splits */}
                    <div className="flex items-center justify-between p-2.5 bg-slate-950 rounded-lg border border-slate-800">
                      <div className="flex flex-col gap-0.5 pr-2">
                        <span className="font-bold text-[10px] uppercase tracking-wider text-slate-200">
                          Repetir encabezado al dividir tabla
                        </span>
                        <span className="text-[9px] text-slate-400 leading-tight">
                          Repite el encabezado (thead) en cada hoja cuando la tabla se divide entre páginas
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSettingsChange('repeatTableHeader', !(settings.repeatTableHeader ?? true))}
                        className={`px-3 py-1.5 rounded font-bold text-[10px] uppercase tracking-wider transition-all cursor-pointer border shrink-0 ${
                          (settings.repeatTableHeader ?? true)
                            ? 'bg-orange-500/15 border-orange-500/40 text-orange-400 hover:bg-orange-500/25'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                        }`}
                      >
                        {(settings.repeatTableHeader ?? true) ? 'Activado' : 'Desactivado'}
                      </button>
                    </div>

                    <span className="text-[9px] text-slate-400 font-bold uppercase">Editor CSS de Tablas de Documento</span>
                    <textarea
                      value={settings.tableCustomCss !== undefined && settings.tableCustomCss !== null ? settings.tableCustomCss : DEFAULT_TABLE_CSS}
                      onChange={(e) => handleSettingsChange('tableCustomCss', e.target.value)}
                      rows={6}
                      className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 font-mono text-[10px]"
                    />
                    <div className="mt-1 p-2.5 bg-slate-950 border border-slate-850 rounded-lg flex flex-col gap-1.5 text-[10px]">
                      <span className="text-[10px] text-[#FF6600] font-extrabold flex items-center gap-1 uppercase tracking-wider">
                        <span>📊 ¿Cómo poner bordes a tus Tablas?</span>
                      </span>
                      <p className="text-slate-400 text-[10px] leading-relaxed">
                        Por defecto, el estilo WP/APA 7 inserta tablas sin bordes verticales. Copia y pega el siguiente código arriba para activar una cuadrícula completa en tu previsualización de tablas:
                      </p>
                      <pre className="p-2 bg-slate-900 rounded font-mono text-[9px] text-[#FF6600]/90 select-all border border-slate-800/60 overflow-x-auto leading-normal">
{`.wp-document-content table, 
.wp-document-content table th, 
.wp-document-content table td {
  border: 1px solid #000000 !important;
}`}
                      </pre>
                      <p className="text-slate-500 text-[9px] italic">
                        * Nota: Haz clic dentro del recuadro naranja de arriba para seleccionarlo y copiarlo fácilmente, luego pégalo en el editor de arriba.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Estilo de Listas */}
              <div className="border border-slate-800 rounded bg-slate-950/25 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setIsListsStyleOpen(!isListsStyleOpen)}
                  className="w-full p-2.5 bg-slate-950 hover:bg-slate-900/80 flex justify-between items-center text-left transition-all"
                >
                  <span className="font-extrabold uppercase text-[10px] tracking-wider text-slate-350 flex items-center gap-1.5">
                    <span>📌</span> Lista y Viñetas (ul, ol)
                  </span>
                  <span>{isListsStyleOpen ? '▲' : '▼'}</span>
                </button>
                {isListsStyleOpen && (
                  <div className="p-3 border-t border-slate-850 bg-slate-900/10 flex flex-col gap-3.5">
                    {/* CSS Editor for blockStyleLists */}
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[9.5px] text-slate-400 font-bold uppercase tracking-wider">
                          Editor CSS de Listas
                        </span>
                        <div className="flex gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(COMPATIBLE_LISTS_CSS)
                                .then(() => triggerSuccessMsg('¡CSS compatible copiado!'))
                                .catch(() => alert('Error al copiar al portapapeles.'));
                            }}
                            className="px-1.5 py-0.5 bg-slate-900 hover:bg-slate-850 text-[8.5px] text-orange-400 hover:text-orange-300 rounded font-bold flex items-center gap-0.5 border border-slate-800 transition-colors cursor-pointer"
                            title="Copiar CSS de listas compatible con ecuaciones"
                          >
                            <Copy className="w-2.5 h-2.5" />
                            <span>Copiar Compatible</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm('¿Deseas aplicar directamente el CSS de listas compatible con ecuaciones en tu editor?')) {
                                handleSettingsChange('blockStyleLists', COMPATIBLE_LISTS_CSS);
                                triggerSuccessMsg('¡CSS compatible aplicado!');
                              }
                            }}
                            className="px-1.5 py-0.5 bg-orange-600 hover:bg-orange-500 text-white text-[8.5px] rounded font-bold flex items-center gap-0.5 transition-colors cursor-pointer"
                            title="Aplicar el CSS compatible directamente"
                          >
                            <Check className="w-2.5 h-2.5" />
                            <span>Aplicar</span>
                          </button>
                        </div>
                      </div>
                      <textarea
                        value={settings.blockStyleLists || ''}
                        onChange={(e) => handleSettingsChange('blockStyleLists', e.target.value)}
                        rows={10}
                        className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 font-mono text-[10px] leading-relaxed focus:border-[#FF6600]/80 focus:outline-none"
                        placeholder="/* Estilos CSS para listas académicas (ul, ol, li) */"
                      />
                    </div>

                    {/* Guías rápidas de Listas */}
                    <div className="p-2.5 bg-slate-950 border border-slate-850 rounded flex flex-col gap-1">
                      <span className="text-[8.5px] font-bold text-slate-400 uppercase tracking-wide">💡 Consejos Rápidos para Listas</span>
                      <ul className="text-[10px] text-slate-400 list-disc list-inside space-y-1">
                        <li>Usa <code className="text-[#FF6600] font-mono text-[9px]">padding-left: 24px</code> para cambiar el espacio de la viñeta.</li>
                        <li>Las viñetas se alinean por defecto para eliminar separaciones excesivas.</li>
                        <li>Para listas con números, usa <code className="text-[#FF6600] font-mono text-[9px]">list-style-type: decimal</code>.</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>

              {/* Código (Monospace) */}
              <div className="border border-slate-800 rounded bg-slate-950/25 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setIsCodeStyleOpen(!isCodeStyleOpen)}
                  className="w-full p-2.5 bg-slate-950 hover:bg-slate-900/80 flex justify-between items-center text-left transition-all"
                >
                  <span className="font-extrabold uppercase text-[10px] tracking-wider text-slate-350 flex items-center gap-1.5">
                    <span>💻</span> Código (Monospace)
                  </span>
                  <span>{isCodeStyleOpen ? '▲' : '▼'}</span>
                </button>
                {isCodeStyleOpen && (
                  <div className="p-3 border-t border-slate-850 bg-slate-900/10 flex flex-col gap-4">
                    {/* --- CÓDIGO EN BLOQUE --- */}
                    <div className="border-b border-slate-850 pb-3 flex flex-col gap-2.5">
                      <span className="text-[9.5px] text-orange-400 font-extrabold uppercase tracking-wide">📦 Código en Bloque (Multi-línea)</span>
                      
                      {/* Block Size */}
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] text-slate-400 font-bold uppercase">Tamaño de Fuente (ej. 13px, 0.85em)</label>
                        <input
                          type="text"
                          value={settings.blockCodeSize !== undefined ? settings.blockCodeSize : (settings.codeSize || '13px')}
                          onChange={(e) => handleSettingsChange('blockCodeSize', e.target.value)}
                          className="w-full p-1.5 bg-slate-950 border border-slate-800 rounded text-slate-200 font-mono text-xs focus:ring-1 focus:ring-orange-500 focus:outline-none"
                          placeholder="13px"
                        />
                      </div>

                      {/* Block Theme */}
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] text-slate-400 font-bold uppercase">Tema de Código</label>
                        <select
                          value={settings.blockCodeTheme || settings.codeTheme || 'academic'}
                          onChange={(e) => handleSettingsChange('blockCodeTheme', e.target.value)}
                          className="w-full p-1.5 bg-slate-950 border border-slate-800 rounded text-slate-200 text-xs focus:ring-1 focus:ring-orange-500 focus:outline-none"
                        >
                          <option value="academic">Academic (Default Light)</option>
                          <option value="dracula">Dracula (Dark)</option>
                          <option value="monokai">Monokai (Dark Retro)</option>
                          <option value="github-light">GitHub Light</option>
                          <option value="solarized-light">Solarized Light (Warm)</option>
                          <option value="nord">Nord (Nordic Dark)</option>
                        </select>
                      </div>

                      {/* Split Block Code Borders Toggle */}
                      <div className="flex flex-col gap-1 mt-1 bg-slate-950/20 p-2 rounded border border-slate-850">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[9px] text-slate-400 font-bold uppercase">Bordes continuos al dividir</span>
                          <label className="relative inline-flex items-center gap-1.5 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={!!settings.splitBlockCodeBorders}
                              onChange={(e) => handleSettingsChange('splitBlockCodeBorders', e.target.checked)}
                              className="absolute opacity-0 w-0 h-0 pointer-events-none peer"
                            />
                            <div className="w-7 h-4 bg-slate-950 rounded-full peer peer-checked:bg-orange-600 relative transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-3 peer-checked:after:bg-slate-100" />
                          </label>
                        </div>
                        <p className="text-[8.5px] text-slate-500 leading-normal">
                          Une visualmente los bloques de código que se dividen entre hojas (borde superior solo al inicio, sin bordes internos horizontales, borde inferior solo al final).
                        </p>
                      </div>

                      {/* Block Highlight Live Preview */}
                      <div className="mt-1">
                        <label className="text-[8px] text-slate-500 font-bold uppercase tracking-wider mb-1 block">Vista Previa del Bloque</label>
                        {(() => {
                          const previewTheme = settings.blockCodeTheme || settings.codeTheme || 'academic';
                          const rawSize = settings.blockCodeSize !== undefined ? settings.blockCodeSize : (settings.codeSize || '13px');
                          const previewSize = formatFontSize(rawSize, '13px');
                          let previewBg = '#f8fafc';
                          let previewFg = '#0f172a';
                          let previewBorder = '#cbd5e1';
                          let commentColor = '#64748b';
                          let keywordColor = '#0f172a';
                          let stringColor = '#0f172a';
                          let isBoldKeyword = true;
                          let isItalicString = true;

                          if (previewTheme === 'dracula') {
                            previewBg = '#282a36';
                            previewFg = '#f8f8f2';
                            previewBorder = '#44475a';
                            commentColor = '#6272a4';
                            keywordColor = '#ff79c6';
                            stringColor = '#f1fa8c';
                            isBoldKeyword = false;
                            isItalicString = false;
                          } else if (previewTheme === 'monokai') {
                            previewBg = '#272822';
                            previewFg = '#f8f8f2';
                            previewBorder = '#3e3d32';
                            commentColor = '#75715e';
                            keywordColor = '#f92672';
                            stringColor = '#e6db74';
                            isBoldKeyword = false;
                            isItalicString = false;
                          } else if (previewTheme === 'github-light') {
                            previewBg = '#f6f8fa';
                            previewFg = '#24292f';
                            previewBorder = '#d0d7de';
                            commentColor = '#6e7781';
                            keywordColor = '#cf222e';
                            stringColor = '#0a3069';
                            isBoldKeyword = true;
                            isItalicString = false;
                          } else if (previewTheme === 'solarized-light') {
                            previewBg = '#fdf6e3';
                            previewFg = '#657b83';
                            previewBorder = '#efe8d4';
                            commentColor = '#93a1a1';
                            keywordColor = '#859900';
                            stringColor = '#2aa198';
                            isBoldKeyword = false;
                            isItalicString = false;
                          } else if (previewTheme === 'nord') {
                            previewBg = '#2e3440';
                            previewFg = '#d8dee9';
                            previewBorder = '#3b4252';
                            commentColor = '#4c566a';
                            keywordColor = '#81a1c1';
                            stringColor = '#a3be8c';
                            isBoldKeyword = false;
                            isItalicString = false;
                          }

                          return (
                            <div 
                              className="rounded p-2.5 font-mono text-[10px] border leading-normal transition-all duration-200"
                              style={{ 
                                backgroundColor: previewBg, 
                                color: previewFg, 
                                borderColor: previewBorder,
                                fontSize: previewSize 
                              }}
                            >
                              <span style={{ color: commentColor, fontStyle: 'italic' }}>{"// Comentario de ejemplo"}</span>
                              <br />
                              <span style={{ color: keywordColor, fontWeight: isBoldKeyword ? 'bold' : 'normal' }}>{"const "}</span>
                              <span>{"mensaje = "}</span>
                              <span style={{ color: stringColor, fontStyle: isItalicString ? 'italic' : 'normal' }}>{`"Hola WP"`}</span>
                              <span>{";"}</span>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* --- CÓDIGO EN LÍNEA --- */}
                    <div className="flex flex-col gap-2.5">
                      <span className="text-[9.5px] text-teal-400 font-extrabold uppercase tracking-wide">🏷️ Código en Línea (En-texto)</span>
                      
                      {/* Inline Size */}
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] text-slate-400 font-bold uppercase">Tamaño de Fuente (ej. 12px, 0.8em)</label>
                        <input
                          type="text"
                          value={settings.inlineCodeSize !== undefined ? settings.inlineCodeSize : '12px'}
                          onChange={(e) => handleSettingsChange('inlineCodeSize', e.target.value)}
                          className="w-full p-1.5 bg-slate-950 border border-slate-800 rounded text-slate-200 font-mono text-xs focus:ring-1 focus:ring-orange-500 focus:outline-none"
                          placeholder="12px"
                        />
                      </div>

                      {/* Inline Theme */}
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] text-slate-400 font-bold uppercase">Tema de Código en Línea</label>
                        <select
                          value={settings.inlineCodeTheme || settings.codeTheme || 'academic'}
                          onChange={(e) => handleSettingsChange('inlineCodeTheme', e.target.value)}
                          className="w-full p-1.5 bg-slate-950 border border-slate-800 rounded text-slate-200 text-xs focus:ring-1 focus:ring-orange-500 focus:outline-none"
                        >
                          <option value="academic">Academic (Default Light)</option>
                          <option value="dracula">Dracula (Dark)</option>
                          <option value="monokai">Monokai (Dark Retro)</option>
                          <option value="github-light">GitHub Light</option>
                          <option value="solarized-light">Solarized Light (Warm)</option>
                          <option value="nord">Nord (Nordic Dark)</option>
                        </select>
                      </div>

                      {/* Inline Highlight Live Preview */}
                      <div className="mt-1">
                        <label className="text-[8px] text-slate-500 font-bold uppercase tracking-wider mb-1 block">Vista Previa del Código en Línea</label>
                        {(() => {
                          const previewTheme = settings.inlineCodeTheme || settings.codeTheme || 'academic';
                          const rawSize = settings.inlineCodeSize !== undefined ? settings.inlineCodeSize : '12px';
                          const previewSize = formatFontSize(rawSize, '12px');
                          let inlineBg = '#f1f5f9';
                          let inlineColor = '#0f172a';
                          let inlineBorder = '#cbd5e1';

                          if (previewTheme === 'dracula') {
                            inlineBg = '#282a36';
                            inlineColor = '#f8f8f2';
                            inlineBorder = '#44475a';
                          } else if (previewTheme === 'monokai') {
                            inlineBg = '#272822';
                            inlineColor = '#f8f8f2';
                            inlineBorder = '#3e3d32';
                          } else if (previewTheme === 'github-light') {
                            inlineBg = '#f6f8fa';
                            inlineColor = '#24292f';
                            inlineBorder = '#d0d7de';
                          } else if (previewTheme === 'solarized-light') {
                            inlineBg = '#fdf6e3';
                            inlineColor = '#657b83';
                            inlineBorder = '#efe8d4';
                          } else if (previewTheme === 'nord') {
                            inlineBg = '#2e3440';
                            inlineColor = '#d8dee9';
                            inlineBorder = '#3b4252';
                          } else {
                            // academic / default light
                            inlineBg = '#f8fafc';
                            inlineColor = '#0f172a';
                            inlineBorder = '#cbd5e1';
                          }

                          return (
                            <div className="p-2 bg-slate-950/80 rounded border border-slate-850 text-slate-350 text-[11px] leading-relaxed">
                              <span>{"El método "}</span>
                              <span 
                                className="font-mono px-1 rounded transition-all duration-200"
                                style={{ 
                                  backgroundColor: inlineBg, 
                                  color: inlineColor, 
                                  border: `1px solid ${inlineBorder}`,
                                  fontSize: previewSize 
                                }}
                              >
                                {"console.log()"}
                              </span>
                              <span>{" sirve para depurar."}</span>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                )}
              </div>





            </div>
          </div>
        )}

        {/* TAB 4: TABLA DE CONTENIDOS (TOC) LEVEL EDITING & STYLE CONFIG */}
        {activeType === 'toc' && (
          <div className="flex flex-col gap-4 text-xs">
            {/* 1. Interactive TOC Schema & Level Editors */}
            <div className="flex flex-col gap-2 p-3 bg-slate-950 rounded border border-slate-850">
              {(() => {
                const headings = getHeadings();
                const hasUpCandidates = headings.some((h) => h.level > 1);
                const hasDownCandidates = headings.some((h) => h.level < 6);
                return (
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <span>📋</span> Esquema y Niveles de Títulos ({headings.length})
                    </span>
                    <p className="text-[10px] text-slate-500 mb-1 leading-normal">
                      Usa las flechas para subir (izq) o bajar (der) el nivel jerárquico de tus títulos directamente en tu código.
                    </p>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleShiftAllHeadings('up')}
                        disabled={!hasUpCandidates || headings.length === 0}
                        className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-20 disabled:hover:bg-slate-900 disabled:hover:text-slate-300 transition-all cursor-pointer"
                        title="Subir todos los títulos un nivel"
                      >
                        <ChevronsUp className="w-3.5 h-3.5" />
                        <span>Subir todos</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleShiftAllHeadings('down')}
                        disabled={!hasDownCandidates || headings.length === 0}
                        className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-20 disabled:hover:bg-slate-900 disabled:hover:text-slate-300 transition-all cursor-pointer"
                        title="Bajar todos los títulos un nivel"
                      >
                        <ChevronsDown className="w-3.5 h-3.5" />
                        <span>Bajar todos</span>
                      </button>
                    </div>
                    
                    {headings.length === 0 ? (
                      <div className="p-4 bg-slate-950/40 rounded border border-slate-850 text-center text-slate-500 text-[11px]">
                        No se detectaron títulos en el documento. Añade marcas de Markdown #, ##, ### en tu archivo de contenido (contenido_fuente.md).
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar border border-slate-850 bg-slate-950/20 rounded p-2">
                        {headings.map((heading, i) => {
                          const indentPadding = (heading.level - 1) * 12;
                          return (
                            <div 
                              key={`${heading.blockId}-${heading.lineIndex}-${i}`}
                              className="flex items-center justify-between p-1.5 bg-slate-950/80 hover:bg-slate-900/40 border border-slate-900 rounded transition-all group gap-2"
                            >
                              <div className="flex items-center gap-1.5 min-w-0 flex-1" style={{ paddingLeft: `${indentPadding}px` }}>
                                <span className="text-[8px] font-extrabold px-1 py-0.5 rounded bg-slate-900 text-orange-400 border border-slate-800 shrink-0 uppercase tracking-tight font-mono">
                                  H{heading.level}
                                </span>
                                <span className="text-[11px] font-medium text-slate-250 truncate" title={heading.cleanText}>
                                  {heading.cleanText}
                                </span>
                                <span className="text-[8px] text-slate-500 italic shrink-0 hidden group-hover:inline truncate max-w-[80px]">
                                  ({heading.blockName})
                                </span>
                              </div>
                              
                              <div className="flex items-center gap-1 shrink-0">
                                {/* Left Arrow Button (Promote Level) */}
                                <button
                                  type="button"
                                  onClick={() => handleUpdateHeadingLevel(heading, 'left')}
                                  disabled={heading.level <= 1}
                                  className="p-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-20 disabled:hover:bg-slate-900 disabled:hover:text-slate-300 transition-all cursor-pointer"
                                  title="Subir nivel (ej. H2 a H1)"
                                >
                                  <ChevronLeft className="w-3.5 h-3.5" />
                                </button>
                                
                                {/* Right Arrow Button (Demote Level) */}
                                <button
                                  type="button"
                                  onClick={() => handleUpdateHeadingLevel(heading, 'right')}
                                  disabled={heading.level >= 6}
                                  className="p-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-20 disabled:hover:bg-slate-900 disabled:hover:text-slate-300 transition-all cursor-pointer"
                                  title="Bajar nivel (ej. H2 a H3)"
                                >
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* 2. TOC Visibility & Global Settings */}
            <div className="flex flex-col gap-3.5 p-3 bg-slate-950 rounded border border-slate-850">
              <span className="text-[10px] text-slate-450 font-bold uppercase tracking-wider">
                Ajustes Generales del Índice
              </span>

              {/* Headings autonumbering toggle */}
              <div className="flex items-center justify-between border-t border-slate-900 pt-3">
                <span className="text-[9.5px] font-bold text-slate-350 uppercase">Auto-Numerar Títulos (H1, H2, H3)</span>
                <button
                  onClick={() => handleSettingsChange('autoNumberHeadings', !settings.autoNumberHeadings)}
                  className={`text-xs px-2.5 py-1 rounded border font-bold transition-all cursor-pointer ${
                    settings.autoNumberHeadings 
                      ? 'bg-[#004080] border-[#FF6600] text-white' 
                      : 'bg-slate-900 border-slate-800 text-slate-500'
                  }`}
                >
                  {settings.autoNumberHeadings ? 'SÍ (1. 2. 2.1)' : 'NO'}
                </button>
              </div>

              <div className="border-t border-slate-900 pt-3">
                <span className="text-[9.5px] font-bold text-slate-350 uppercase">Niveles incluidos en el índice</span>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {[1, 2, 3, 4, 5, 6].map((level) => {
                    const selectedLevels = settings.tocLevels ?? [1, 2];
                    const checked = selectedLevels.includes(level);
                    return (
                      <label key={level} className="flex items-center gap-1.5 text-[10px] text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const nextLevels = checked
                              ? selectedLevels.filter((item) => item !== level)
                              : [...selectedLevels, level].sort((a, b) => a - b);
                            handleSettingsChange('tocLevels', nextLevels);
                          }}
                          className="accent-orange-500"
                        />
                        H{level}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 2b. Hidden/Manual TOC entries */}
            <div className="flex flex-col gap-3 p-3 bg-slate-950 rounded border border-slate-850">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Entradas Manuales del Índice
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const current = settings.manualTOCEntries || [];
                    handleSettingsChange('manualTOCEntries', [...current, { title: '', page: 1, level: 1 }]);
                  }}
                  className="px-2 py-1 bg-[#004080] hover:bg-[#005299] border border-[#FF6600] text-white text-[9px] font-bold rounded transition-all cursor-pointer"
                  title="Añadir un título oculto al índice"
                >
                  + Añadir
                </button>
              </div>
              <p className="text-[9px] text-slate-500 leading-relaxed">
                Títulos que no existen como encabezado en el contenido pero que sí deben aparecer en la tabla de contenidos. Indica el título y la página absoluta donde se encuentra (p.&nbsp;ej. "Línea de Tiempo" en la página 19).
              </p>

              {(settings.manualTOCEntries || []).length === 0 ? (
                <div className="p-3 bg-slate-950/40 rounded border border-slate-850 text-slate-500 text-[10px] italic text-center">
                  Sin entradas manuales. Añade una para incluir contenido oculto en el índice.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {(settings.manualTOCEntries || []).map((entry, idx) => (
                    <div key={idx} className="flex flex-col gap-1.5 p-2 bg-slate-900/40 border border-slate-800 rounded">
                      <input
                        type="text"
                        placeholder="Título (ej. Línea de Tiempo)"
                        value={entry.title || ''}
                        onChange={(e) => {
                          const updated = (settings.manualTOCEntries || []).map((x, i) =>
                            i === idx ? { ...x, title: e.target.value } : x
                          );
                          handleSettingsChange('manualTOCEntries', updated);
                        }}
                        className="p-1.5 bg-slate-900 border border-slate-850 rounded text-slate-200 text-xs focus:ring-1 focus:ring-orange-500 focus:outline-none"
                      />
                      <div className="flex items-center gap-2">
                        <label className="text-[8px] text-slate-400 font-bold uppercase shrink-0">Página</label>
                        <input
                          type="number"
                          min={1}
                          value={entry.page || 1}
                          onChange={(e) => {
                            const updated = (settings.manualTOCEntries || []).map((x, i) =>
                              i === idx ? { ...x, page: parseInt(e.target.value, 10) || 1 } : x
                            );
                            handleSettingsChange('manualTOCEntries', updated);
                          }}
                          className="w-16 p-1.5 bg-slate-900 border border-slate-850 rounded text-slate-200 text-xs text-center focus:ring-1 focus:ring-orange-500 focus:outline-none"
                        />
                        <label className="text-[8px] text-slate-400 font-bold uppercase shrink-0 ml-1">Nivel</label>
                        <select
                          value={entry.level || 1}
                          onChange={(e) => {
                            const updated = (settings.manualTOCEntries || []).map((x, i) =>
                              i === idx ? { ...x, level: parseInt(e.target.value, 10) || 1 } : x
                            );
                            handleSettingsChange('manualTOCEntries', updated);
                          }}
                          className="p-1.5 bg-slate-900 border border-slate-850 rounded text-slate-200 text-xs focus:ring-1 focus:ring-orange-500 focus:outline-none"
                        >
                          <option value={1}>1</option>
                          <option value={2}>2</option>
                          <option value={3}>3</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = (settings.manualTOCEntries || []).filter((_, i) => i !== idx);
                            handleSettingsChange('manualTOCEntries', updated);
                          }}
                          className="ml-auto px-2 py-1 bg-slate-900 hover:bg-red-950 border border-slate-800 text-slate-400 hover:text-red-400 text-[9px] font-bold rounded transition-all cursor-pointer"
                          title="Eliminar esta entrada"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 3. CSS Customization Editor for blockStyleTOC */}
            <div className="flex flex-col gap-2 p-3 bg-slate-950 rounded border border-slate-850">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Diseño de Tabla de Contenidos
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      const cssToCopy = settings.blockStyleTOC || DEFAULT_BLOCK_TOC;
                      navigator.clipboard.writeText(cssToCopy)
                        .then(() => triggerSuccessMsg('¡Estilos CSS copiados!'))
                        .catch(() => alert('Error al copiar al portapapeles.'));
                    }}
                    className="px-1.5 py-0.5 bg-slate-900 hover:bg-slate-850 text-[8.5px] text-slate-300 rounded font-medium flex items-center gap-0.5 border border-slate-800"
                    title="Copiar los estilos CSS de la tabla de contenidos al portapapeles"
                  >
                    Copiar CSS
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('¿Restablecer los estilos del Índice a los predeterminados?')) {
                        handleSettingsChange('blockStyleTOC', DEFAULT_BLOCK_TOC);
                        triggerSuccessMsg('Estilos del Índice restablecidos.');
                      }
                    }}
                    className="px-1.5 py-0.5 bg-slate-900 hover:bg-slate-850 text-[8.5px] text-slate-400 hover:text-slate-300 rounded font-medium flex items-center gap-0.5 border border-slate-800"
                    title="Restablecer a los estilos predeterminados"
                  >
                    Restablecer
                  </button>
                </div>
              </div>
              
              <textarea
                value={settings.blockStyleTOC || ''}
                onChange={(e) => handleSettingsChange('blockStyleTOC', e.target.value)}
                rows={10}
                className="w-full p-2 bg-slate-900 border border-slate-800 rounded text-slate-200 font-mono text-[10px] leading-relaxed focus:border-orange-500 focus:outline-none"
                placeholder="/* Estilos CSS para el TOC de la hoja */"
              />
            </div>
          </div>
        )}

        {/* TAB 3: FILE BANK GESTION */}
        {activeType === 'uploads' && (
          <div className="flex flex-col gap-4 text-xs">
            {/* Panel de Enlaces URL Externos */}
            <div 
              className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg flex flex-col gap-2"
              onPaste={handleClipboardPaste}
            >
              <span className="font-extrabold uppercase text-[9.5px] tracking-wider text-slate-350">
                🌐 Añadir imagen por URL externa (o pega Ctrl+V)
              </span>

              {/* Instant Image Preview if URL is pasted */}
              {urlInputSrc.trim().length > 0 && (
                <div className="w-full h-28 rounded bg-slate-900 border border-slate-800 flex items-center justify-center overflow-hidden p-1 relative">
                  <img
                    src={urlInputSrc.trim()}
                    alt="Previsualización"
                    className="max-w-full max-h-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                    onLoad={(e) => {
                      (e.target as HTMLElement).style.display = 'block';
                    }}
                    referrerPolicy="no-referrer"
                  />
                  <span className="absolute bottom-1 right-1 text-[8.5px] bg-slate-950/80 text-slate-400 px-1.5 py-0.5 rounded font-mono border border-slate-800">
                    Vista previa
                  </span>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <input
                  type="text"
                  value={urlInputSrc}
                  onChange={(e) => setUrlInputSrc(e.target.value)}
                  onPaste={handleClipboardPaste}
                  placeholder="Pegue la URL de la imagen o presione Ctrl+V..."
                  className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 text-[11px] focus:ring-1 focus:ring-orange-500 focus:outline-none focus:border-[#FF6600]/80 font-mono"
                />
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={urlInputDesc}
                    onChange={(e) => setUrlInputDesc(e.target.value)}
                    placeholder="Descripción opcional (ej: Diagrama de flujo)"
                    className="flex-1 p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 text-[11px] focus:ring-1 focus:ring-orange-500 focus:outline-none focus:border-[#FF6600]/80 font-sans"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (urlInputSrc.trim()) {
                        handleAddFileByUrl(urlInputSrc, urlInputDesc);
                        setUrlInputSrc('');
                        setUrlInputDesc('');
                      } else {
                        alert('Por favor ingrese una URL de imagen válida.');
                      }
                    }}
                    className="px-3 bg-[#004080] hover:bg-[#003060] border border-slate-800 rounded text-white font-bold text-[10.5px] cursor-pointer transition-all active:scale-95 shrink-0"
                  >
                    Agregar URL
                  </button>
                </div>
              </div>
            </div>

            {/* Uploaded assets list */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                <span>Imágenes Guardadas ({uploadedFiles.length})</span>
                {selectedFileIds.length > 0 && (
                  <button
                    onClick={() => setSelectedFileIds([])}
                    className="text-[9px] lowercase font-bold text-orange-400 hover:text-orange-300 cursor-pointer"
                  >
                    Deseleccionar todo
                  </button>
                )}
              </div>

              {uploadedFiles.length === 0 ? (
                <div className="p-6 text-center border border-slate-800 bg-slate-950/20 rounded-md text-slate-500 italic text-[11px]">
                  No hay imágenes agregadas. Use el cuadro superior para cargar su primer recurso.
                </div>
              ) : (
                <div className="flex flex-col gap-2.5 select-text">
                  {uploadedFiles.map((item) => {
                    const isEditingName = editingFileId === item.id;
                    const isSelected = selectedFileIds.includes(item.id);

                    return (
                      <div 
                        key={item.id}
                        className={`p-2.5 border rounded flex items-start gap-2.5 transition-all text-xs ${
                          isSelected
                            ? 'border-orange-500/60 bg-orange-950/20 shadow-sm'
                            : 'border-slate-800/50 bg-slate-950/40'
                        }`}
                      >
                        {/* 1. Left Column: Thumbnail (Clickable to select image) */}
                        <div className="w-20 shrink-0 flex flex-col items-center">
                          {/* Thumbnail */}
                          <div 
                            onClick={() => handleToggleSelectFile(item.id)}
                            className={`w-20 h-20 rounded bg-slate-900 border shrink-0 overflow-hidden flex items-center justify-center cursor-pointer transition-all ${
                              isSelected 
                                ? 'border-orange-500 ring-2 ring-orange-500/40' 
                                : 'border-transparent hover:border-slate-700'
                            }`}
                            title={isSelected ? "Haz clic para deseleccionar" : "Haz clic para seleccionar esta imagen"}
                          >
                            <img 
                              src={item.dataUrl} 
                              alt={item.name} 
                              className="max-w-full max-h-full object-contain"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        </div>

                        {/* 2. Middle Column: Unified Note Container (Title + Size + Description inside same box) */}
                        <div className="flex-1 min-w-0 border-l border-slate-800/50 pl-2.5 flex flex-col h-full">
                          <div className="flex-1 min-w-0 bg-slate-950/60 border border-slate-800/80 rounded p-2 flex flex-col gap-1.5 focus-within:border-slate-700 transition-colors">
                            {/* Note Title (Image Name + Extension) & Size Badge */}
                            {(() => {
                              const lastDot = item.name.lastIndexOf('.');
                              const baseName = lastDot > 0 ? item.name.substring(0, lastDot) : item.name;
                              const ext = lastDot > 0 ? item.name.substring(lastDot) : '';

                              return (
                                <div className="flex items-center justify-between gap-1 text-[11px] font-bold font-mono min-w-0 border-b border-slate-800/60 pb-1">
                                  {isEditingName ? (
                                    <div className="flex items-center gap-0.5 flex-1 min-w-0">
                                      <input
                                        type="text"
                                        value={editingFileName}
                                        onChange={(e) => setEditingFileName(e.target.value)}
                                        onBlur={() => {
                                          const cleanBase = editingFileName.trim() || baseName;
                                          const finalName = cleanBase + ext;
                                          if (finalName !== item.name) {
                                            const duplicate = uploadedFiles.some(f => f.id !== item.id && f.name.toLowerCase() === finalName.toLowerCase());
                                            if (duplicate) {
                                              alert("Ya existe un archivo con este nombre");
                                            } else {
                                              setUploadedFiles(prev => prev.map(f => f.id === item.id ? { ...f, name: finalName } : f));
                                              triggerSuccessMsg('Archivo renombrado con éxito');
                                            }
                                          }
                                          setEditingFileId(null);
                                        }}
                                        className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[11px] text-white font-mono font-bold focus:outline-none focus:border-slate-500"
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                          if (e.key === 'Escape') setEditingFileId(null);
                                        }}
                                        autoFocus
                                      />
                                      <span className="text-slate-400 font-mono text-[11px] select-text shrink-0 font-normal pl-0.5">{ext}</span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-0.5 min-w-0 flex-1">
                                      <span 
                                        onClick={() => {
                                          setEditingFileId(item.id);
                                          setEditingFileName(baseName);
                                        }}
                                        className="text-slate-100 hover:text-orange-400 cursor-pointer truncate transition-colors"
                                        title="Haz clic para cambiar el nombre"
                                      >
                                        {baseName}
                                      </span>
                                      <span className="text-slate-400 font-mono text-[11px] select-text shrink-0 font-normal">
                                        {ext}
                                      </span>
                                    </div>
                                  )}

                                  {/* File Size Badge at top-right inside note header */}
                                  <span className="text-[8.5px] text-slate-500 font-mono bg-slate-900/50 px-1.5 py-0.5 rounded shrink-0 border border-transparent">
                                    {item.size ? `${(item.size / 1024).toFixed(1)} KB` : 'URL'}
                                  </span>
                                </div>
                              );
                            })()}

                            {/* Description Textarea integrated seamlessly (no resize handle) */}
                            <textarea
                              value={item.description || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setUploadedFiles(prev => prev.map(f => f.id === item.id ? { ...f, description: val } : f));
                              }}
                              placeholder="Escribe la descripción aquí..."
                              rows={2}
                              className="w-full flex-1 bg-transparent border-none p-0 text-[10.5px] text-slate-200 focus:outline-none leading-relaxed resize-none font-sans placeholder:italic placeholder:text-slate-600"
                              title="Descripción de la imagen (se guarda automáticamente)"
                            />
                          </div>
                        </div>

                        {/* 3. Right Column: Controls Sidebar (3 Icon-Only Buttons) */}
                        <div className="w-10 shrink-0 border-l border-slate-800/50 pl-2 flex flex-col justify-center items-end min-h-[95px]">
                          {/* 3 Icon-Only Action Buttons */}
                          <div className="flex flex-col gap-1 w-full items-end">
                            {/* 1. Seleccionar */}
                            <button
                              type="button"
                              onClick={() => handleToggleSelectFile(item.id)}
                              className={`w-full py-1.5 rounded transition-all cursor-pointer border flex items-center justify-center ${
                                isSelected
                                  ? 'bg-orange-500 border-orange-400 text-slate-950 font-black shadow-sm'
                                  : 'bg-slate-950 border-transparent hover:border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800'
                              }`}
                              title={isSelected ? "Deseleccionar imagen para IA" : "Seleccionar imagen para IA"}
                            >
                              <Check className={`w-3.5 h-3.5 ${isSelected ? 'stroke-[3]' : ''}`} />
                            </button>

                            {/* 2. Copiar Sintaxis */}
                            <button
                              type="button"
                              onClick={() => handleOpenCopyModal(item)}
                              className="w-full py-1.5 rounded bg-slate-950 hover:bg-[#004080] border border-transparent hover:border-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer flex items-center justify-center"
                              title="Copiar sintaxis (Markdown o HTML con CSS inline)"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>

                            {/* 3. Insertar */}
                            <button
                              type="button"
                              onClick={() => handleInsertImgTag(item.name)}
                              className="w-full py-1.5 rounded bg-slate-950 hover:bg-[#004080] border border-transparent hover:border-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer flex items-center justify-center"
                              title="Insertar en último editor activo"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Copiar Nombres button positioned after images list */}
            {uploadedFiles.length > 0 && (
              <button
                type="button"
                onClick={handleCopyAllNames}
                className="w-full py-2 px-3 rounded font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer border bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700 active:scale-95 shadow-sm"
                title="Copiar los nombres de todas las imágenes (separados por salto de línea)"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar Nombres de las Imágenes</span>
              </button>
            )}

            {/* Instruction helper */}
            <div className="p-3 bg-slate-950 border border-slate-850 rounded text-slate-400 flex flex-col gap-2 text-[10.5px]">
              <span className="font-bold text-slate-300 uppercase text-[9.5px] tracking-wider">💡 Sintaxis y Variables de Imagen:</span>
              <p className="text-slate-400 leading-normal">
                Puedes personalizar las figuras usando atributos clave-valor entre llaves <code className="text-orange-400 font-mono text-[9.5px]">{"{...}"}</code> justo después del paréntesis:
              </p>
              <ul className="list-disc pl-4 space-y-1 text-slate-400 leading-normal">
                <li><strong className="text-slate-200">id</strong>: Identificador de la figura para citas (ej: <code className="text-orange-400 font-mono text-[9px]">id=fig-mi_grafico</code>).</li>
                <li><strong className="text-slate-200">width</strong>: Ancho de la imagen (ej: <code className="text-orange-400 font-mono text-[9px]">width=60%</code> o <code className="text-orange-400 font-mono text-[9px]">width=400px</code>).</li>
                <li><strong className="text-slate-200">align</strong>: Alineación horizontal (<code className="text-orange-400 font-mono text-[9px]">left</code>, <code className="text-orange-400 font-mono text-[9px]">center</code> o <code className="text-orange-400 font-mono text-[9px]">right</code>; solo si <code className="text-slate-300 font-mono text-[9px]">wrap=none</code>).</li>
                <li><strong className="text-slate-200">wrap</strong>: Ajuste y flotación del texto (<code className="text-orange-400 font-mono text-[9px]">left</code>, <code className="text-orange-400 font-mono text-[9px]">right</code>, <code className="text-orange-400 font-mono text-[9px]">square</code> o <code className="text-orange-400 font-mono text-[9px]">none</code>).</li>
                <li><strong className="text-slate-200">note</strong>: Nota explicativa al pie de la figura, adaptada al formato académico APA 7.</li>
              </ul>
              <div className="mt-1 pt-1.5 border-t border-slate-900">
                <span className="font-bold text-slate-300 text-[9px] uppercase block mb-1">Ejemplo de sintaxis:</span>
                <pre className="p-1.5 bg-slate-900 rounded font-mono text-[9px] text-[#FF6600]/90 select-all border border-slate-800/60 overflow-x-auto leading-normal">
{`![Título de la Figura](imagen.png){
  id=fig-ejemplo
  width=60%
  align=center
  wrap=none
  note="Datos recopilados del censo de software 2026."
}`}
                </pre>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Floating toast notifications local */}
      {successMsg && (
        <div className="fixed bottom-4 right-4 bg-orange-600 text-white px-3 py-1.5 rounded-md shadow-2xl text-xs font-bold z-50 flex items-center gap-1.5">
          <CheckCircle className="w-3.5 h-3.5" />
          {successMsg}
        </div>
      )}

      {/* AI Format Modal */}
      {isAIFormatModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] select-text">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-5 shadow-2xl flex flex-col gap-4 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-orange-500">
                <Sparkles className="w-5 h-5 animate-pulse" />
                <h3 className="font-extrabold text-sm uppercase tracking-wider text-slate-100">
                  Insertar Imágenes con IA ({selectedFileIds.length})
                </h3>
              </div>
              <button 
                onClick={() => setIsAIFormatModalOpen(false)}
                className="text-slate-500 hover:text-white cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Selected files preview thumbnails */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
              {uploadedFiles.filter(f => selectedFileIds.includes(f.id)).map((file) => (
                <div key={file.id} className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-950 border border-slate-800 shrink-0 text-[10px]">
                  <img src={file.dataUrl} className="w-5 h-5 object-contain rounded" referrerPolicy="no-referrer" />
                  <span className="font-mono text-slate-300 max-w-[100px] truncate">{file.name}</span>
                </div>
              ))}
            </div>

            {/* Natural Language Format Input */}
            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-bold text-slate-200">
                Especifica el formato o sintaxis de inserción (lenguaje natural):
              </label>
              <textarea
                value={customFormatInstruction}
                onChange={(e) => setCustomFormatInstruction(e.target.value)}
                placeholder="Ej: En formato HTML sin descripción y con tamaño de 400px..."
                rows={3}
                className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded text-slate-200 text-xs focus:ring-1 focus:ring-orange-500 focus:outline-none font-sans leading-relaxed"
              />

              {/* Format Examples quick buttons */}
              <div className="flex flex-col gap-1.5 mt-1">
                <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider">
                  Ejemplos de referencia (haz clic para aplicar):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCustomFormatInstruction('Formato APA 7 con título, id=fig-1 y nota al pie')}
                    className="px-2 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded text-[9.5px] text-orange-400 font-mono transition-colors cursor-pointer"
                  >
                    APA 7
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomFormatInstruction('Formato HTML simple sin nombre ni descripción, con tamaño especificado de 400px')}
                    className="px-2 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded text-[9.5px] text-orange-400 font-mono transition-colors cursor-pointer"
                  >
                    HTML (solo imagen)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomFormatInstruction('Solo nombre de la figura sin descripción ni nota')}
                    className="px-2 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded text-[9.5px] text-orange-400 font-mono transition-colors cursor-pointer"
                  >
                    Solo nombre
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomFormatInstruction('Solo la imagen sin nombre ni nada, con ancho del 80%')}
                    className="px-2 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded text-[9.5px] text-orange-400 font-mono transition-colors cursor-pointer"
                  >
                    Sin nada (solo imagen)
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-800 pt-3 mt-1">
              <button
                type="button"
                onClick={() => setIsAIFormatModalOpen(false)}
                className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-400 text-xs font-bold rounded transition-all cursor-pointer border border-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isInsertingAI !== null}
                onClick={handleExecuteAIInsertion}
                className="px-4 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white font-extrabold text-xs rounded transition-all cursor-pointer flex items-center gap-1.5 shadow-md active:scale-95"
              >
                {isInsertingAI ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Insertando...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Insertar Ahora con IA</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Explanation Modal */}
      {aiExplanations && aiExplanations.length > 0 && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] select-text">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-orange-500">
                <Sparkles className="w-5 h-5 animate-pulse" />
                <h3 className="font-extrabold text-sm uppercase tracking-wider text-slate-100">
                  Inserción de Imágenes con IA
                </h3>
              </div>
              <button 
                onClick={() => setAiExplanations(null)}
                className="text-slate-500 hover:text-white cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="text-xs text-slate-350 leading-relaxed flex flex-col gap-3 max-h-[350px] overflow-y-auto custom-scrollbar pr-1">
              <p className="font-bold text-slate-200">
                Se han insertado las figuras de forma inteligente en el documento.
              </p>
              {aiExplanations.map((exp, idx) => (
                <div key={idx} className="bg-slate-950/60 p-3.5 border border-slate-850 rounded-lg font-normal text-slate-300 flex flex-col gap-1">
                  <span className="font-mono text-xs text-orange-400 font-bold bg-slate-900/80 px-2 py-1 rounded border border-slate-800 self-start">
                    {exp.imageName}
                  </span>
                  <div className="mt-2">
                    <span className="font-black text-[9px] text-[#FF6600] uppercase block mb-1 tracking-wider">Análisis y Justificación de la IA:</span>
                    <p className="whitespace-pre-line leading-relaxed">{exp.text}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end mt-1 border-t border-slate-800 pt-3">
              <button
                onClick={() => setAiExplanations(null)}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-500 active:scale-95 text-white font-bold text-xs rounded transition-all cursor-pointer shadow-md"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Escoger entre Markdown o HTML (con CSS inline para posiciones y tamaños) */}
      {copyModalFile && (
        <div 
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[9999] select-text"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCopyModalFile(null);
          }}
        >
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-5 shadow-2xl flex flex-col gap-4 animate-fade-in max-h-[92vh] overflow-y-auto custom-scrollbar">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5 text-orange-500">
                <div className="p-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400">
                  <Copy className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm uppercase tracking-wider text-slate-100">
                    Copiar Sintaxis de Imagen
                  </h3>
                  <span className="text-[10px] text-slate-400 font-normal">
                    Elige entre formato Markdown o HTML con CSS inline
                  </span>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => setCopyModalFile(null)}
                className="text-slate-500 hover:text-white cursor-pointer transition-colors p-1"
                title="Cerrar (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Image Info & Alt Description input */}
            <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/80 flex items-center gap-3">
              <div className="w-12 h-12 rounded bg-slate-900 border border-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                {copyModalFile.dataUrl ? (
                  <img src={copyModalFile.dataUrl} alt={copyModalFile.name} className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                ) : (
                  <Image className="w-5 h-5 text-slate-600" />
                )}
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-slate-200 truncate font-semibold">
                    {copyModalFile.name}
                  </span>
                  <span className="text-[9px] text-slate-400 font-mono bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 shrink-0">
                    {copyModalFile.size ? `${(copyModalFile.size / 1024).toFixed(1)} KB` : 'URL'}
                  </span>
                </div>
                <input
                  type="text"
                  value={copyModalDescription}
                  onChange={(e) => setCopyModalDescription(e.target.value)}
                  placeholder="Texto alternativo / descripción..."
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-[11px] text-slate-300 focus:outline-none focus:border-orange-500 placeholder:text-slate-600 placeholder:italic font-sans"
                  title="Descripción / Alt text"
                />
              </div>
            </div>

            {/* Format Selection Tabs */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setCopyFormatTab('markdown')}
                className={`py-2 px-3 rounded-md text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  copyFormatTab === 'markdown'
                    ? 'bg-orange-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>Markdown</span>
              </button>
              <button
                type="button"
                onClick={() => setCopyFormatTab('html')}
                className={`py-2 px-3 rounded-md text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  copyFormatTab === 'html'
                    ? 'bg-orange-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                <Code className="w-3.5 h-3.5" />
                <span>HTML (CSS inline)</span>
              </button>
            </div>

            {/* TAB: MARKDOWN */}
            {copyFormatTab === 'markdown' && (
              <div className="flex flex-col gap-3">
                {/* Markdown width selector */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Ancho de la figura (width)
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {['100%', '80%', '60%', '50%', '40%', 'none'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setMarkdownWidthPreset(preset)}
                        className={`px-2.5 py-1 rounded text-[10.5px] font-mono font-bold transition-all cursor-pointer border ${
                          markdownWidthPreset === preset
                            ? 'bg-[#004080] border-orange-500 text-white shadow-sm'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                        }`}
                      >
                        {preset === 'none' ? 'Sin atributo' : preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Markdown snippet preview */}
                <div className="flex flex-col gap-1">
                  <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider">
                    Sintaxis resultante:
                  </span>
                  <pre className="p-2.5 bg-slate-950 border border-slate-800 rounded font-mono text-xs text-orange-400 select-all overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
                    {getComputedMarkdownSnippet(copyModalFile.name, copyModalDescription)}
                  </pre>
                </div>

                {/* Markdown action buttons */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => handleExecuteInsertSnippet('markdown')}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1.5 border border-slate-700"
                    title="Insertar sintaxis Markdown en el editor activo"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Insertar en Editor</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExecuteCopySnippet('markdown')}
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-500 active:scale-95 text-white font-extrabold text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shadow-md"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar Markdown</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB: HTML */}
            {copyFormatTab === 'html' && (
              <div className="flex flex-col gap-3.5">
                {/* Position / Alignment selector */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Posición / Alineación (CSS inline)
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'center', label: 'Centrado', desc: 'display: block; margin: auto;' },
                      { id: 'left', label: 'Izquierda', desc: 'display: block; margin-left: 0;' },
                      { id: 'right', label: 'Derecha', desc: 'display: block; margin-right: 0;' },
                      { id: 'float-left', label: 'Flotar Izq.', desc: 'float: left;' },
                      { id: 'float-right', label: 'Flotar Der.', desc: 'float: right;' },
                    ].map((pos) => (
                      <button
                        key={pos.id}
                        type="button"
                        onClick={() => setHtmlAlign(pos.id as any)}
                        className={`py-1.5 px-2 rounded text-left transition-all cursor-pointer border ${
                          htmlAlign === pos.id
                            ? 'bg-[#004080] border-orange-500 text-white shadow-sm'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                        }`}
                        title={pos.desc}
                      >
                        <span className="block text-[11px] font-bold">{pos.label}</span>
                        <span className="block text-[8px] opacity-60 font-mono truncate">{pos.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Width / Size selector */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Tamaño / Ancho (width)
                    </label>
                    {htmlWidthPreset === 'custom' && (
                      <span className="text-[9px] text-orange-400 font-mono font-bold">
                        Personalizado: {htmlCustomWidth || '100%'}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {['100%', '80%', '60%', '50%', '40%', '30%', 'custom'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setHtmlWidthPreset(preset);
                          if (preset === 'custom' && !htmlCustomWidth) {
                            setHtmlCustomWidth('400px');
                          }
                        }}
                        className={`px-2.5 py-1 rounded text-[10.5px] font-mono font-bold transition-all cursor-pointer border ${
                          htmlWidthPreset === preset
                            ? 'bg-[#004080] border-orange-500 text-white shadow-sm'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                        }`}
                      >
                        {preset === 'custom' ? 'Personalizado' : preset}
                      </button>
                    ))}
                  </div>
                  {htmlWidthPreset === 'custom' && (
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="text"
                        value={htmlCustomWidth}
                        onChange={(e) => setHtmlCustomWidth(e.target.value)}
                        placeholder="Ej: 400px, 75%, 25rem..."
                        className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-orange-400 font-mono focus:outline-none focus:border-orange-500"
                        title="Especifica el ancho con cualquier unidad CSS (px, %, rem, etc.)"
                      />
                    </div>
                  )}
                </div>

                {/* HTML snippet preview */}
                <div className="flex flex-col gap-1">
                  <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider">
                    Código HTML resultante (con CSS inline):
                  </span>
                  <pre className="p-2.5 bg-slate-950 border border-slate-800 rounded font-mono text-[11px] text-emerald-400 select-all overflow-x-auto whitespace-pre-wrap break-all leading-relaxed max-h-[100px]">
                    {getComputedHtmlSnippet(copyModalFile.name, copyModalDescription)}
                  </pre>
                </div>

                {/* HTML action buttons */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => handleExecuteInsertSnippet('html')}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1.5 border border-slate-700"
                    title="Insertar etiqueta HTML en el editor activo"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Insertar en Editor</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleExecuteCopySnippet('html')}
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-500 active:scale-95 text-white font-extrabold text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shadow-md"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar HTML</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
