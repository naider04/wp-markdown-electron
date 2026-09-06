/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { findSyntaxIssues, SyntaxIssue } from '../utils/validation';
import { useLanguage } from '../i18n/LanguageContext';
import { AlertCircle } from 'lucide-react';

// Above this size the inline syntax scanner is skipped (it's a convenience
// indicator; for very large pastes dropping it keeps the editor responsive).
const MAX_INLINE_SYNTAX_SCAN = 150000;

interface ColoredMarkdownEditorProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceDelay?: number;
  autoFocus?: boolean;
  initialCursorPosition?: number;
  initialScrollTop?: number;
  initialScrollLeft?: number;
  selectionRange?: { start: number; end: number; timestamp?: number } | null;
  onOpenFind?: () => void;
  onOpenReplace?: () => void;
}

const SHARED_EDITOR_STYLE: React.CSSProperties = {
  tabSize: 2,
  fontFamily: '"Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontVariantLigatures: 'none',
  fontFeatureSettings: '"liga" 0, "calt" 0',
  letterSpacing: '0px',
  fontSize: '12px',
  lineHeight: '1.6',
  boxSizing: 'border-box',
  padding: '12px',
  margin: 0,
  border: 'none',
  whiteSpace: 'pre',
  wordBreak: 'normal',
  overflowWrap: 'normal',
};

export function ColoredMarkdownEditor({
  id,
  value,
  onChange,
  placeholder,
  debounceDelay = 300,
  autoFocus = false,
  initialCursorPosition,
  initialScrollTop,
  initialScrollLeft,
  selectionRange,
  onOpenFind,
  onOpenReplace
}: ColoredMarkdownEditorProps) {
  const { language } = useLanguage();
  const [localValue, setLocalValue] = useState(value);
  const [syntaxIssues, setSyntaxIssues] = useState<SyntaxIssue[]>([]);
  const resolvedPlaceholder = placeholder || (language === 'es' ? "Escribe aquí en Markdown (puedes incluir fórmulas LaTeX y HTML)..." : "Write here in Markdown (you can include LaTeX and HTML formulas)...");

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastPropagatedRef = useRef(value);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const syntaxTimerRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync external changes
  useEffect(() => {
    if (value !== lastPropagatedRef.current) {
      setLocalValue(value);
      lastPropagatedRef.current = value;
    }
  }, [value]);

  // Synchronize height mathematically based on line count up to max-height before paint
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const lineCount = (localValue.match(/\n/g) || []).length + 1;
    const computedHeight = Math.min(380, Math.max(140, Math.ceil(lineCount * 19.2 + 28)));
    textarea.style.height = `${computedHeight}px`;
  }, [localValue]);

  // Handle autofocus, cursor positioning, and visual scroll preservation
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    if (typeof initialCursorPosition === 'number') {
      const pos = Math.min(Math.max(0, initialCursorPosition), localValue.length);
      textarea.setSelectionRange(pos, pos);
    }

    if (autoFocus) {
      textarea.focus({ preventScroll: true });
    }

    // Preserve the exact scroll positions from the preview so text never scrolls to top
    if (typeof initialScrollTop === 'number') {
      textarea.scrollTop = initialScrollTop;
    }
    if (typeof initialScrollLeft === 'number') {
      textarea.scrollLeft = initialScrollLeft;
    }

    requestAnimationFrame(() => {
      if (textareaRef.current) {
        if (typeof initialScrollTop === 'number') {
          textareaRef.current.scrollTop = initialScrollTop;
        }
        if (typeof initialScrollLeft === 'number') {
          textareaRef.current.scrollLeft = initialScrollLeft;
        }
      }
    });
  }, [autoFocus, initialCursorPosition, initialScrollTop, initialScrollLeft]);

  // Handle active Find & Replace selection range updates
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || !selectionRange) return;

    const start = Math.min(Math.max(0, selectionRange.start), localValue.length);
    const end = Math.min(Math.max(0, selectionRange.end), localValue.length);

    textarea.focus();
    textarea.setSelectionRange(start, end);

    // Smoothly scroll the line containing the match into comfortable view
    const textBefore = localValue.substring(0, start);
    const lineNumber = (textBefore.match(/\n/g) || []).length;
    const estimatedLineHeight = 19.2;
    const targetScrollTop = Math.max(0, lineNumber * estimatedLineHeight - 60);
    textarea.scrollTop = targetScrollTop;
  }, [selectionRange]);

  // Debounced propagation to parent matching universal sync delay
  const handleTextChange = (newVal: string, immediate = false) => {
    setLocalValue(newVal);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (immediate || debounceDelay <= 0) {
      lastPropagatedRef.current = newVal;
      onChange(newVal);
    } else {
      timerRef.current = setTimeout(() => {
        lastPropagatedRef.current = newVal;
        onChange(newVal);
      }, debounceDelay);
    }
  };

  // Debounced syntax checker matching universal sync delay
  useEffect(() => {
    if (syntaxTimerRef.current) {
      clearTimeout(syntaxTimerRef.current);
    }
    syntaxTimerRef.current = setTimeout(() => {
      setSyntaxIssues(localValue.length > MAX_INLINE_SYNTAX_SCAN ? [] : findSyntaxIssues(localValue));
    }, Math.max(100, debounceDelay));

    return () => {
      if (syntaxTimerRef.current) {
        clearTimeout(syntaxTimerRef.current);
      }
    };
  }, [localValue, debounceDelay]);

  // Flush any pending debounced change on blur & run immediate syntax check
  const handleBlur = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      lastPropagatedRef.current = localValue;
      onChange(localValue);
    }
    if (syntaxTimerRef.current) {
      clearTimeout(syntaxTimerRef.current);
      syntaxTimerRef.current = null;
    }
    setSyntaxIssues(localValue.length > MAX_INLINE_SYNTAX_SCAN ? [] : findSyntaxIssues(localValue));
  };

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      if (syntaxTimerRef.current) {
        clearTimeout(syntaxTimerRef.current);
      }
    };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Find & Replace shortcuts
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      onOpenFind?.();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      onOpenReplace?.();
      return;
    }

    // Tab key support (inserts 2 spaces)
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newText = localValue.substring(0, start) + '  ' + localValue.substring(end);
      handleTextChange(newText);
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  };

  return (
    <div ref={containerRef} className="relative flex flex-col w-full rounded-lg border border-slate-800 bg-slate-950 overflow-hidden shadow-inner group">
      {/* Editor Content Area: Native High-Performance Monospace Textarea */}
      <div className="relative w-full bg-slate-950 min-h-[140px] max-h-[380px]">
        <textarea
          id={id}
          ref={textareaRef}
          value={localValue}
          onChange={(e) => handleTextChange(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          style={{
            ...SHARED_EDITOR_STYLE,
            resize: 'none',
            caretColor: '#FF6600',
            color: '#e2e8f0', // Crisp, high-contrast readable slate text
          }}
          className="colored-markdown-textarea relative z-10 w-full min-h-[140px] max-h-[380px] bg-transparent focus:outline-none border-0 focus:ring-0 custom-scrollbar overflow-x-auto overflow-y-auto selection:bg-orange-500/30 caret-orange-500"
          placeholder={resolvedPlaceholder}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
        />

        {/* Debounced Syntax Error Pill (only appears if errors exist after typing pauses) */}
        {syntaxIssues.length > 0 && (
          <div
            className="absolute bottom-2 right-3 z-20 flex items-center gap-1.5 px-2 py-1 rounded bg-red-950/90 text-red-300 border border-red-800/80 text-[10.5px] font-mono font-semibold shadow-lg backdrop-blur-sm pointer-events-none transition-opacity animate-fade-in"
            title={syntaxIssues.map((i, idx) => `${idx + 1}. [${i.type.toUpperCase()}] ${i.message}`).join('\n')}
          >
            <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span>
              {syntaxIssues.length}{' '}
              {language === 'es'
                ? (syntaxIssues.length === 1 ? 'error de sintaxis' : 'errores de sintaxis')
                : (syntaxIssues.length === 1 ? 'syntax error' : 'syntax errors')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default ColoredMarkdownEditor;
