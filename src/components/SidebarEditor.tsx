/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { HTMLBlock } from '../types';
import {
  Plus,
  ChevronDown,
  ChevronUp,
  Code,
  Trash2,
  AlertTriangle,
  AlertCircle,
  Copy,
  Check,
  FileText,
  Search,
  Replace,
  Edit3,
  Sparkles
} from 'lucide-react';
import { validateContent } from '../utils/validation';
import { copyToWordClipboard } from '../lib/wordExporter';
import { ColoredMarkdownEditor } from './ColoredMarkdownEditor';
import { highlightMarkdownCode } from '../utils/markdownHighlighter';
import { FindReplaceBar, FindMatch } from './FindReplaceBar';
import { useLanguage } from '../i18n/LanguageContext';


const BlockPreviewContent = React.memo(function BlockPreviewContent({
  code,
  findQuery,
  matchCase,
  wholeWord,
  useRegex,
}: {
  code: string;
  findQuery?: string;
  matchCase?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const highlightedHtml = useMemo(() => {
    const base = highlightMarkdownCode(code);
    if (!findQuery) return base;

    try {
      let pattern = useRegex ? findQuery : findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (wholeWord) {
        pattern = `\\b${pattern}\\b`;
      }
      const flags = matchCase ? 'g' : 'gi';
      const regex = new RegExp(pattern, flags);

      return base.replace(/(<[^>]+>)|([^<]+)/g, (_match, isTag, textContent) => {
        if (isTag) return isTag;
        if (!textContent) return '';
        return textContent.replace(regex, (m: string) => {
          return `<mark class="find-highlight bg-amber-400/40 text-amber-100 rounded-sm px-0.5 ring-1 ring-amber-400/60 font-semibold">${m}</mark>`;
        });
      });
    } catch {
      return base;
    }
  }, [code, findQuery, matchCase, wholeWord, useRegex]);

  useEffect(() => {
    if (containerRef.current) {
      if (containerRef.current.innerHTML !== highlightedHtml) {
        const prevScrollTop = containerRef.current.scrollTop;
        const prevScrollLeft = containerRef.current.scrollLeft;
        containerRef.current.innerHTML = highlightedHtml;
        containerRef.current.scrollTop = prevScrollTop;
        containerRef.current.scrollLeft = prevScrollLeft;
      }
    }
  }, [highlightedHtml]);

  return (
    <div
      ref={containerRef}
      className="preview-content-container font-mono text-xs text-slate-300 whitespace-pre overflow-x-auto min-h-[140px] max-h-[380px] overflow-y-auto custom-scrollbar p-3 rounded bg-slate-950/70"
      style={{
        fontFamily: '"Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        lineHeight: '1.6',
      }}
    />
  );
});

function getCharIndexFromClick(
  e: React.MouseEvent<HTMLElement>,
  fullText: string,
  containerEl: HTMLElement | null
): number {
  if (!fullText) return 0;
  try {
    let node: Node | null = null;
    let offset = 0;

    if (typeof (document as any).caretPositionFromPoint === 'function') {
      const pos = (document as any).caretPositionFromPoint(e.clientX, e.clientY);
      if (pos) {
        node = pos.offsetNode;
        offset = pos.offset;
      }
    } else if (typeof document.caretRangeFromPoint === 'function') {
      const range = document.caretRangeFromPoint(e.clientX, e.clientY);
      if (range) {
        node = range.startContainer;
        offset = range.startOffset;
      }
    }

    if (node && containerEl && containerEl.contains(node)) {
      let charCount = 0;
      const walker = document.createTreeWalker(containerEl, NodeFilter.SHOW_TEXT, null);
      let currentNode = walker.nextNode();
      while (currentNode) {
        if (currentNode === node) {
          charCount += offset;
          return Math.min(Math.max(0, charCount), fullText.length);
        }
        charCount += currentNode.textContent?.length || 0;
        currentNode = walker.nextNode();
      }
    }
  } catch (err) {
    // Non-critical fallback
  }

  // Fallback: estimate from line-height and click Y position
  if (containerEl) {
    const rect = containerEl.getBoundingClientRect();
    const relativeY = Math.max(0, e.clientY - rect.top + containerEl.scrollTop);
    const estimatedLineHeight = 19.2; // 12px * 1.6
    const lineIndex = Math.floor(relativeY / estimatedLineHeight);

    const lines = fullText.split('\n');
    let count = 0;
    for (let i = 0; i < Math.min(lineIndex, lines.length); i++) {
      count += lines[i].length + 1; // +1 for newline
    }
    return Math.min(Math.max(0, count), fullText.length);
  }

  return 0;
}

interface AutoGrowingTextAreaProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceDelay: number;
  autoFocus?: boolean;
}

function AutoGrowingTextArea({ id, value, onChange, placeholder, debounceDelay, autoFocus }: AutoGrowingTextAreaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastWidthRef = useRef<number>(0);
  const [localValue, setLocalValue] = useState(value);
  const lastPropagatedRef = useRef(value);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus({ preventScroll: true });
    }
  }, [autoFocus]);

  // Sync with outer changes only if they were initiated externally (e.g. templates, file loads, undo/reverts)
  useEffect(() => {
    if (value !== lastPropagatedRef.current) {
      setLocalValue(value);
      lastPropagatedRef.current = value;
    }
  }, [value]);

  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Save scroll position of all scrollable parent containers before height recalculation
    const scrollParents: { el: HTMLElement; scrollTop: number }[] = [];
    let parent = textarea.parentElement;
    while (parent && parent !== document.body) {
      const style = window.getComputedStyle(parent);
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
        scrollParents.push({ el: parent, scrollTop: parent.scrollTop });
      }
      parent = parent.parentElement;
    }

    const currentHeight = textarea.offsetHeight;

    if (textarea.scrollHeight > currentHeight) {
      // Expanding content (e.g., Enter key, Ctrl+V paste, typing new lines).
      // Direct expansion prevents height collapsing to 'auto' and avoids scroll jumps.
      textarea.style.height = `${Math.max(130, textarea.scrollHeight)}px`;
    } else {
      // Contracting content (e.g., Ctrl+X cut, Backspace, Delete).
      textarea.style.height = 'auto';
      const newHeight = Math.max(130, textarea.scrollHeight);
      textarea.style.height = `${newHeight}px`;

      // Instantly restore original parent scroll positions
      for (const sp of scrollParents) {
        sp.el.scrollTop = sp.scrollTop;
      }
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [localValue]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    lastWidthRef.current = textarea.clientWidth;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const currentWidth = entry.contentRect.width;
        if (Math.abs(currentWidth - lastWidthRef.current) > 0.5) {
          lastWidthRef.current = currentWidth;
          adjustHeight();
        }
      }
    });

    resizeObserver.observe(textarea);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

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
    }

    if (debounceDelay === 0) {
      lastPropagatedRef.current = newVal;
      onChange(newVal);
    } else {
      timerRef.current = setTimeout(() => {
        lastPropagatedRef.current = newVal;
        onChange(newVal);
      }, debounceDelay);
    }
  };

  return (
    <textarea
      id={id}
      ref={textareaRef}
      value={localValue}
      onChange={(e) => handleChange(e.target.value)}
      style={{ resize: 'none' }}
      className="w-full p-2 bg-slate-950 text-slate-300 font-mono text-xs focus:outline-none border-0 focus:ring-0 leading-relaxed custom-scrollbar overflow-y-hidden"
      placeholder={placeholder}
    />
  );
}

interface SidebarEditorProps {
  htmlBlocks: HTMLBlock[];
  setHtmlBlocks: React.Dispatch<React.SetStateAction<HTMLBlock[]>>;
  lastFocusedBlockId: string | null;
  setLastFocusedBlockId: (id: string | null) => void;
  onRefreshFile: () => void;
  isSyncing: boolean;
  pageCount: number;
  isLocallyEdited: boolean;
  setIsLocallyEdited: (val: boolean) => void;
  onResetToOriginal: () => void;
  syncStatusMsg: string;
  debounceDelay?: number;
}

export function SidebarEditor({
  htmlBlocks,
  setHtmlBlocks,
  lastFocusedBlockId,
  setLastFocusedBlockId,
  onRefreshFile,
  isSyncing,
  pageCount,
  isLocallyEdited,
  setIsLocallyEdited,
  onResetToOriginal,
  syncStatusMsg,
  debounceDelay = 300,
}: SidebarEditorProps) {
  const { t } = useLanguage();

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Copy state
  const [copied, setCopied] = useState(false);
  const [copiedWord, setCopiedWord] = useState(false);

  const handleCopyAllMarkdown = () => {
    const allMarkdown = htmlBlocks.map(block => block.code).join('\n\n');
    navigator.clipboard.writeText(allMarkdown).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  };

  const handleCopyAllForWord = async () => {
    const success = await copyToWordClipboard(htmlBlocks);
    if (success) {
      setCopiedWord(true);
      setTimeout(() => setCopiedWord(false), 2000);
    }
  };

  // State to handle block delete confirmation modal
  const [blockToDelete, setBlockToDelete] = useState<HTMLBlock | null>(null);

  // State to track which block is actively in 3rd-click edit mode and its scroll/click position
  const [activeEditingBlockId, setActiveEditingBlockId] = useState<string | null>(null);
  const [activeEditingBlockInfo, setActiveEditingBlockInfo] = useState<{
    blockId: string;
    charIndex: number;
    scrollTop?: number;
    scrollLeft?: number;
  } | null>(null);

  // Find and Replace state
  const [isFindOpen, setIsFindOpen] = useState<boolean>(false);
  const [showReplace, setShowReplace] = useState<boolean>(false);
  const [findQuery, setFindQuery] = useState<string>('');
  const [replaceQuery, setReplaceQuery] = useState<string>('');
  const [matchCase, setMatchCase] = useState<boolean>(false);
  const [wholeWord, setWholeWord] = useState<boolean>(false);
  const [useRegex, setUseRegex] = useState<boolean>(false);
  const [searchScope, setSearchScope] = useState<'all' | 'current'>('all');
  const [activeMatchIndex, setActiveMatchIndex] = useState<number>(0);
  const [activeSelectionRange, setActiveSelectionRange] = useState<{
    start: number;
    end: number;
    timestamp: number;
  } | null>(null);

  // Global keyboard shortcuts for Find (Ctrl+F) and Replace (Ctrl+H)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setIsFindOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        setIsFindOpen(true);
        setShowReplace(true);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Compute all matching occurrences across blocks
  const matches = useMemo(() => {
    if (!findQuery) return [];
    let regex: RegExp;
    try {
      let pattern = useRegex ? findQuery : findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (wholeWord) {
        pattern = `\\b${pattern}\\b`;
      }
      const flags = matchCase ? 'g' : 'gi';
      regex = new RegExp(pattern, flags);
    } catch {
      return [];
    }

    const result: FindMatch[] = [];
    htmlBlocks.forEach((block, blockIndex) => {
      if (searchScope === 'current' && block.id !== lastFocusedBlockId) {
        return;
      }
      const code = block.code;
      let match: RegExpExecArray | null;
      regex.lastIndex = 0;
      while ((match = regex.exec(code)) !== null) {
        result.push({
          blockId: block.id,
          blockIndex,
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          matchText: match[0],
        });
        if (match[0].length === 0) {
          regex.lastIndex++;
        }
      }
    });

    return result;
  }, [htmlBlocks, findQuery, matchCase, wholeWord, useRegex, searchScope, lastFocusedBlockId]);

  // Adjust active match index if list shrinks
  useEffect(() => {
    if (matches.length === 0) {
      setActiveMatchIndex(0);
    } else if (activeMatchIndex >= matches.length) {
      setActiveMatchIndex(0);
    }
  }, [matches.length, activeMatchIndex]);

  // Navigate to a specific match: expand target block, focus it, open editor, select match in textarea
  const handleGoToMatch = (match: FindMatch) => {
    // 1. Expand block if collapsed
    setHtmlBlocks((prev) =>
      prev.map((b) => (b.id === match.blockId ? { ...b, collapsed: false } : b))
    );
    // 2. Focus this block
    setLastFocusedBlockId(match.blockId);
    // 3. Switch to edit mode
    setActiveEditingBlockId(match.blockId);
    setActiveEditingBlockInfo({
      blockId: match.blockId,
      charIndex: match.startIndex,
    });
    // 4. Update selection range for ColoredMarkdownEditor
    setActiveSelectionRange({
      start: match.startIndex,
      end: match.endIndex,
      timestamp: Date.now(),
    });
  };

  // State for showing the "Nuevo Bloque" dropdown menu
  const [showAddMenu, setShowAddMenu] = useState<boolean>(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(event.target as Node)) {
        setShowAddMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Add a new block
  const handleAddBlock = () => {
    const nextNum = htmlBlocks.length + 1;
    const blockId = 'block_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    const name = `Bloque ${nextNum}: Sección Nueva`;
    const code = `## Sección Nueva ${nextNum}\n\nEscribe el contenido de esta sección en Markdown o HTML. Puedes usar los Formatos Rápidos de la barra superior para insertar estructuras.\n`;

    const newBlock: HTMLBlock = {
      id: blockId,
      name,
      code,
      collapsed: false,
      isMarkdown: true,
    };
    setHtmlBlocks((prev) => [...prev, newBlock]);
    setIsLocallyEdited(true);
    setLastFocusedBlockId(newBlock.id);
    setActiveEditingBlockId(newBlock.id);
    setShowAddMenu(false);
  };

  // Toggle state of block collapse
  const toggleCollapseBlock = (id: string) => {
    setHtmlBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, collapsed: !b.collapsed } : b))
    );
    setActiveEditingBlockId(null);
    setIsLocallyEdited(true);
  };

  // Update name inside a block
  const handleNameChange = (id: string, newName: string) => {
    setHtmlBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, name: newName } : b))
    );
    setIsLocallyEdited(true);
  };

  // Toggle markdown mode inside a block
  const handleToggleMarkdown = (id: string, isMarkdown: boolean) => {
    setHtmlBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, isMarkdown } : b))
    );
    setIsLocallyEdited(true);
  };

  // Update code content inside a block
  const handleCodeChange = (id: string, newCode: string) => {
    setHtmlBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, code: newCode } : b))
    );
    setIsLocallyEdited(true);
  };

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const sourceIdxStr = e.dataTransfer.getData('text/plain');
    const sourceIndex = sourceIdxStr !== '' ? parseInt(sourceIdxStr, 10) : draggedIndex;

    if (sourceIndex !== null && !isNaN(sourceIndex) && sourceIndex !== targetIndex) {
      setHtmlBlocks((prev) => {
        const list = [...prev];
        const [removed] = list.splice(sourceIndex, 1);
        list.splice(targetIndex, 0, removed);
        return list;
      });
      setIsLocallyEdited(true);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const selectedBlock = htmlBlocks.find((b) => b.id === lastFocusedBlockId);

  const handleToggleCollapseSelected = () => {
    if (lastFocusedBlockId) {
      toggleCollapseBlock(lastFocusedBlockId);
    }
  };

  const handleDeleteSelected = () => {
    if (!lastFocusedBlockId) return;
    const selectedBlock = htmlBlocks.find((b) => b.id === lastFocusedBlockId);
    if (!selectedBlock) return;
    if (blockToDelete?.id === selectedBlock.id) {
      setBlockToDelete(null);
    } else {
      setBlockToDelete(selectedBlock);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-880 text-xs text-slate-300 font-sans select-none">
      
      {/* Workspace Header */}
      <div className="p-3 bg-slate-950 border-b border-slate-850 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Code className="w-4 h-4 text-orange-500 shrink-0" />
            <span className="font-extrabold uppercase tracking-widest text-[11px] text-slate-100 truncate">
              {t('navContent')} ({htmlBlocks.length})
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Buscar y Reemplazar button */}
            <button
              type="button"
              onClick={() => {
                setIsFindOpen((prev) => !prev);
              }}
              className={`h-7 px-2 border transition-all flex items-center gap-1 text-[10px] font-bold rounded cursor-pointer ${
                isFindOpen
                  ? 'bg-orange-950/80 text-orange-400 border-orange-600/80 shadow-[0_0_8px_rgba(255,102,0,0.25)]'
                  : 'bg-slate-800 hover:bg-slate-700 hover:text-orange-400 border-slate-700 text-slate-200 active:scale-95'
              }`}
              title={t('findAndReplace') + ' (Ctrl+F / Ctrl+H)'}
            >
              <Search className="w-3.5 h-3.5 text-orange-500" />
              <span>{t('find')}</span>
            </button>

            {/* Colapsar / Expandir button */}
            <button
              onClick={handleToggleCollapseSelected}
              disabled={!selectedBlock}
              className={`h-7 px-2 border transition-all flex items-center gap-1 text-[10px] font-bold rounded ${
                selectedBlock
                  ? 'bg-slate-800 hover:bg-slate-700 hover:text-orange-400 border-slate-700 text-slate-200 cursor-pointer active:scale-95'
                  : 'bg-slate-900/40 text-slate-600 border-slate-850 cursor-not-allowed opacity-35'
              }`}
              title={selectedBlock ? (selectedBlock.collapsed ? t('expandBlock') : t('collapseBlock')) : t('selectBlockToToggle')}
            >
              {selectedBlock?.collapsed ? (
                <>
                  <ChevronDown className="w-3.5 h-3.5 text-orange-500" />
                  <span>{t('expand')}</span>
                </>
              ) : (
                <>
                  <ChevronUp className="w-3.5 h-3.5 text-orange-500" />
                  <span>{t('collapse')}</span>
                </>
              )}
            </button>

            {/* Eliminar button */}
            <button
              onClick={handleDeleteSelected}
              disabled={!selectedBlock}
              className={`h-7 px-2 border transition-all flex items-center gap-1 text-[10px] font-bold rounded ${
                selectedBlock
                  ? 'bg-red-950/40 hover:bg-red-900/40 border-red-900/60 hover:border-red-500 text-red-400 cursor-pointer active:scale-95'
                  : 'bg-slate-900/40 text-slate-600 border-slate-850 cursor-not-allowed opacity-35'
              }`}
              title={selectedBlock ? t('deleteSelectedBlock') : t('selectBlockToDelete')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>

            {/* Nuevo Bloque button */}
            <button
              onClick={() => handleAddBlock()}
              className="h-7 px-2 border border-[#FF6600] bg-[#004080] hover:bg-[#003060] text-white font-bold transition-all flex items-center gap-1 cursor-pointer rounded text-[10px] active:scale-95 shadow-md"
              title={t('addContentBlockTooltip')}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Compact inline confirmation right below the buttons */}
        {blockToDelete && (
          <div className="p-2 bg-red-950/90 border border-red-800/80 rounded flex items-center justify-between gap-2 shadow-sm">
            <span className="text-[10.5px] text-red-200 font-medium truncate">
              {t('deleteBlockConfirm')} <strong className="text-orange-400 font-semibold">"{blockToDelete.name}"</strong>?
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setBlockToDelete(null)}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-semibold text-slate-300 transition-all cursor-pointer active:scale-95"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setHtmlBlocks((prev) => prev.filter((b) => b.id !== blockToDelete.id));
                  setIsLocallyEdited(true);
                  if (lastFocusedBlockId === blockToDelete.id) {
                    setLastFocusedBlockId(null);
                  }
                  setBlockToDelete(null);
                }}
                className="px-2.5 py-0.5 rounded bg-red-650 hover:bg-red-550 border border-red-600 text-white text-[10px] font-bold transition-all cursor-pointer shadow-md active:scale-95"
              >
                {t('confirmDelete')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Find and Replace Panel Bar */}
      <FindReplaceBar
        isOpen={isFindOpen}
        onClose={() => setIsFindOpen(false)}
        htmlBlocks={htmlBlocks}
        setHtmlBlocks={setHtmlBlocks}
        lastFocusedBlockId={lastFocusedBlockId}
        setLastFocusedBlockId={setLastFocusedBlockId}
        activeEditingBlockId={activeEditingBlockId}
        setActiveEditingBlockId={setActiveEditingBlockId}
        setIsLocallyEdited={setIsLocallyEdited}
        findQuery={findQuery}
        setFindQuery={setFindQuery}
        replaceQuery={replaceQuery}
        setReplaceQuery={setReplaceQuery}
        matchCase={matchCase}
        setMatchCase={setMatchCase}
        wholeWord={wholeWord}
        setWholeWord={setWholeWord}
        useRegex={useRegex}
        setUseRegex={setUseRegex}
        searchScope={searchScope}
        setSearchScope={setSearchScope}
        showReplace={showReplace}
        setShowReplace={setShowReplace}
        matches={matches}
        activeMatchIndex={activeMatchIndex}
        setActiveMatchIndex={setActiveMatchIndex}
        onGoToMatch={handleGoToMatch}
      />

      {/* Editor scroll blocks list */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col gap-5 bg-slate-900/40">
        
        {htmlBlocks.length === 0 && (
          <div className="p-6 rounded-lg border-2 border-dashed border-slate-850 bg-slate-950/40 text-center text-slate-500 py-10 flex flex-col items-center gap-2">
            <Code className="w-8 h-8 text-slate-600 mb-1" />
            <span className="text-[12px] font-bold text-slate-400">{t('noBlocks')}</span>
            <p className="text-[10px] text-slate-500 max-w-[200px] leading-relaxed">
              {t('noBlocksDesc')}
            </p>
          </div>
        )}

        {htmlBlocks.map((block, index) => {
          const isFocused = lastFocusedBlockId === block.id;
          const isEditing = activeEditingBlockId === block.id;
          const isExpanded = !block.collapsed;

          return (
            <div
              key={block.id}
              className={`relative border rounded-lg transition-all duration-150 flex flex-col shrink-0 bg-slate-950 ${
                isFocused
                  ? 'border-orange-500 shadow-md ring-1 ring-orange-500/25'
                  : 'border-slate-800 hover:border-slate-700'
              } ${
                dragOverIndex === index ? 'border-orange-500 ring-2 ring-orange-500/30 bg-orange-950/10' : ''
              } ${
                draggedIndex === index ? 'opacity-30' : ''
              }`}
              onFocus={() => {
                if (lastFocusedBlockId !== block.id) {
                  setLastFocusedBlockId(block.id);
                  if (activeEditingBlockId !== block.id) {
                    setActiveEditingBlockId(null);
                  }
                }
              }}
              onClick={() => {
                if (!isFocused) {
                  // 1st click: Select block
                  setLastFocusedBlockId(block.id);
                  if (activeEditingBlockId !== block.id) {
                    setActiveEditingBlockId(null);
                  }
                } else if (!isExpanded) {
                  // 2nd click: Expand block (non-editable view)
                  setHtmlBlocks((prev) =>
                    prev.map((b) => (b.id === block.id ? { ...b, collapsed: false } : b))
                  );
                  setIsLocallyEdited(true);
                  setActiveEditingBlockId(null);
                }
              }}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
            >
              {/* Top border toggle button - positioned perfectly absolute overlaying upper border, shifted to the left */}
              {isExpanded && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCollapseBlock(block.id);
                  }}
                  className="absolute -top-2.5 left-1/4 transform -translate-x-1/2 z-20 w-5 h-5 flex items-center justify-center rounded-full bg-slate-900 border border-slate-700 text-slate-400 hover:text-orange-500 hover:border-orange-500 shadow-md transition-all cursor-pointer hover:scale-110 active:scale-95"
                  title={t('collapse')}
                >
                  <ChevronUp className="w-3.5 h-3.5 text-slate-350" />
                </button>
              )}

              {/* Bottom border toggle button - positioned perfectly absolute overlaying lower border, shifted to the right */}
              {isExpanded && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCollapseBlock(block.id);
                  }}
                  className="absolute -bottom-2.5 left-3/4 transform -translate-x-1/2 z-20 w-5 h-5 flex items-center justify-center rounded-full bg-slate-900 border border-slate-700 text-slate-400 hover:text-orange-500 hover:border-orange-500 shadow-md transition-all cursor-pointer hover:scale-110 active:scale-95"
                  title={t('collapse')}
                >
                  <ChevronUp className="w-3.5 h-3.5 text-slate-350" />
                </button>
              )}

              {/* Center Column: Code Editor content / Collapsed preview / Expanded preview */}
              <div className={`flex-1 flex flex-col min-w-0 ${isExpanded ? 'pr-0' : 'pr-14'}`}>
                {(() => {
                  const validationErrors = validateContent(block.code);
                  const hasErrors = validationErrors.some(e => e.severity === 'error');

                  if (!isExpanded) {
                    // Stage 1 / Collapsed preview
                    return (
                      <div
                        className="flex-1 p-3 py-3.5 bg-[#002e45]/5 hover:bg-[#002e45]/10 cursor-pointer flex flex-col justify-center min-w-0 select-none"
                        title={isFocused ? t('secondClickToExpand') : t('firstClickToSelect')}
                      >
                        <div className="flex items-center justify-between gap-1.5 min-w-0">
                          <span className="font-mono text-xs text-slate-300 truncate flex-1">
                            {block.code.trim().split('\n')[0] || <span className="italic text-slate-600">&lt;{t('emptyBlock')}&gt;</span>}
                          </span>
                          {validationErrors.length > 0 && (
                            <span 
                              className={`shrink-0 flex items-center justify-center p-0.5 rounded-full ${
                                hasErrors ? 'bg-red-950 text-red-500 border border-red-900/40' : 'bg-amber-950 text-amber-500 border border-amber-900/40'
                              }`}
                              title={`${validationErrors.length} ${t('syntaxWarnings')}`}
                            >
                              <AlertTriangle className="w-2.5 h-2.5" />
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  }

                  if (!isEditing) {
                    // Stage 2 / Expanded Read-Only View with Rich Colored Markdown Syntax Highlighting
                    return (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          const containerEl = e.currentTarget.querySelector('.preview-content-container') as HTMLElement || e.currentTarget;
                          const charIndex = getCharIndexFromClick(e, block.code, containerEl);
                          const scrollTop = containerEl.scrollTop;
                          const scrollLeft = containerEl.scrollLeft;
                          setActiveEditingBlockId(block.id);
                          setActiveEditingBlockInfo({
                            blockId: block.id,
                            charIndex,
                            scrollTop,
                            scrollLeft,
                          });
                        }}
                        className="flex-1 p-2.5 bg-slate-950 rounded-lg flex flex-col gap-2 cursor-pointer group hover:bg-slate-900/60 transition-colors border border-slate-850/60 hover:border-orange-500/50"
                        title={t('clickToEditTitle')}
                      >
                        <div className="flex items-center justify-between gap-2 pb-1 border-b border-slate-900/60 select-none">
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-semibold">
                            <Sparkles className="w-3 h-3 text-orange-400" />
                            <span className="text-slate-300">{t('syntaxColorPreview')}</span>
                          </div>
                          <span className="text-[10px] text-orange-400 group-hover:text-orange-300 font-bold flex items-center gap-1 transition-colors">
                            <Edit3 className="w-3 h-3" />
                            <span>{t('clickToEdit')}</span>
                          </span>
                        </div>
                        {block.code ? (
                          <BlockPreviewContent
                            code={block.code}
                            findQuery={isFindOpen ? findQuery : undefined}
                            matchCase={matchCase}
                            wholeWord={wholeWord}
                            useRegex={useRegex}
                          />
                        ) : (
                          <div className="font-mono text-xs text-slate-600 italic p-3 min-h-[140px]">
                            &lt;{t('emptyBlockPrompt')}&gt;
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Stage 3 / Active Editable Mode with Real-time Colored Markdown & Inline Syntax Error Highlighting
                  return (
                    <div className="flex-1 flex flex-col relative bg-slate-950 select-text p-1">
                      <ColoredMarkdownEditor
                        id={`editor-textarea-${block.id}`}
                        value={block.code}
                        onChange={(val) => handleCodeChange(block.id, val)}
                        placeholder={t('editorPlaceholder')}
                        debounceDelay={debounceDelay}
                        autoFocus={true}
                        initialCursorPosition={
                          activeEditingBlockInfo?.blockId === block.id
                            ? activeEditingBlockInfo.charIndex
                            : undefined
                        }
                        initialScrollTop={
                          activeEditingBlockInfo?.blockId === block.id
                            ? activeEditingBlockInfo.scrollTop
                            : undefined
                        }
                        initialScrollLeft={
                          activeEditingBlockInfo?.blockId === block.id
                            ? activeEditingBlockInfo.scrollLeft
                            : undefined
                        }
                        selectionRange={
                          isFindOpen && activeSelectionRange?.timestamp && activeEditingBlockId === block.id
                            ? activeSelectionRange
                            : null
                        }
                        onOpenFind={() => {
                          setIsFindOpen(true);
                        }}
                        onOpenReplace={() => {
                          setIsFindOpen(true);
                          setShowReplace(true);
                        }}
                      />
                    </div>
                  );
                })()}
              </div>

              {/* Floating Absolute Block Number & Drag Handle on the Right side - Only visible when collapsed */}
              {!isExpanded && (
                <div
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragEnd={() => {
                    setDraggedIndex(null);
                    setDragOverIndex(null);
                  }}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing shadow-md hover:scale-105 active:scale-95 transition-all select-none border bg-slate-900 hover:bg-slate-800 border-slate-800 hover:border-orange-500 text-slate-300 hover:text-orange-400"
                  title={t('dragToReorder')}
                >
                  <span className="text-xs font-extrabold font-mono tracking-tighter">
                    {index + 1}
                  </span>
                </div>
              )}
            </div>
          );
        })}

        {htmlBlocks.length > 0 && (
          <div className="mt-4 flex flex-col sm:flex-row gap-2 w-full shrink-0">
            <button
              onClick={handleCopyAllMarkdown}
              className="flex-1 h-9 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-98 text-slate-200 hover:text-white border border-slate-700 hover:border-orange-500 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md select-none shrink-0"
              title={t('copyMarkdownTooltip')}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">{t('markdownCopied')}</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-orange-500" />
                  <span>{t('copyMarkdown')}</span>
                </>
              )}
            </button>

            <button
              onClick={handleCopyAllForWord}
              className="flex-1 h-9 px-3 rounded-lg bg-blue-950/60 hover:bg-blue-900/80 active:scale-98 text-blue-200 hover:text-white border border-blue-800/80 hover:border-blue-400 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md select-none shrink-0"
              title={t('copyWordTooltip')}
            >
              {copiedWord ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">{t('copiedForWord')}</span>
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4 text-blue-400" />
                  <span>{t('copyForWord')}</span>
                </>
              )}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

export default SidebarEditor;
