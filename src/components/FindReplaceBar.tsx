/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState } from 'react';
import {
  Search,
  Replace,
  ChevronUp,
  ChevronDown,
  X,
  CaseSensitive,
  WholeWord,
  Regex,
  Layers,
  FileCode,
  Check,
  AlertCircle
} from 'lucide-react';
import { HTMLBlock } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

export interface FindMatch {
  blockId: string;
  blockIndex: number;
  startIndex: number;
  endIndex: number;
  matchText: string;
}

export interface FindReplaceBarProps {
  isOpen: boolean;
  onClose: () => void;
  htmlBlocks: HTMLBlock[];
  setHtmlBlocks: React.Dispatch<React.SetStateAction<HTMLBlock[]>>;
  lastFocusedBlockId: string | null;
  setLastFocusedBlockId: (id: string | null) => void;
  activeEditingBlockId: string | null;
  setActiveEditingBlockId: (id: string | null) => void;
  setIsLocallyEdited: (val: boolean) => void;
  findQuery: string;
  setFindQuery: (query: string) => void;
  replaceQuery: string;
  setReplaceQuery: (query: string) => void;
  matchCase: boolean;
  setMatchCase: React.Dispatch<React.SetStateAction<boolean>>;
  wholeWord: boolean;
  setWholeWord: React.Dispatch<React.SetStateAction<boolean>>;
  useRegex: boolean;
  setUseRegex: React.Dispatch<React.SetStateAction<boolean>>;
  searchScope: 'all' | 'current';
  setSearchScope: React.Dispatch<React.SetStateAction<'all' | 'current'>>;
  showReplace: boolean;
  setShowReplace: React.Dispatch<React.SetStateAction<boolean>>;
  matches: FindMatch[];
  activeMatchIndex: number;
  setActiveMatchIndex: React.Dispatch<React.SetStateAction<number>>;
  onGoToMatch: (match: FindMatch) => void;
}

export function FindReplaceBar({
  isOpen,
  onClose,
  htmlBlocks,
  setHtmlBlocks,
  lastFocusedBlockId,
  setLastFocusedBlockId,
  activeEditingBlockId,
  setActiveEditingBlockId,
  setIsLocallyEdited,
  findQuery,
  setFindQuery,
  replaceQuery,
  setReplaceQuery,
  matchCase,
  setMatchCase,
  wholeWord,
  setWholeWord,
  useRegex,
  setUseRegex,
  searchScope,
  setSearchScope,
  showReplace,
  setShowReplace,
  matches,
  activeMatchIndex,
  setActiveMatchIndex,
  onGoToMatch,
}: FindReplaceBarProps) {
  const { t, language } = useLanguage();
  const findInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replaceFeedback, setReplaceFeedback] = useState<string | null>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        findInputRef.current?.focus();
        findInputRef.current?.select();
      }, 50);
    }
  }, [isOpen]);

  // Navigate to previous match
  const handlePrevMatch = () => {
    if (matches.length === 0) return;
    const prevIdx = (activeMatchIndex - 1 + matches.length) % matches.length;
    setActiveMatchIndex(prevIdx);
    onGoToMatch(matches[prevIdx]);
  };

  // Navigate to next match
  const handleNextMatch = () => {
    if (matches.length === 0) return;
    const nextIdx = (activeMatchIndex + 1) % matches.length;
    setActiveMatchIndex(nextIdx);
    onGoToMatch(matches[nextIdx]);
  };

  // Execute single replace on current active match
  const handleReplaceCurrent = () => {
    if (matches.length === 0 || activeMatchIndex < 0 || activeMatchIndex >= matches.length) return;
    const currentMatch = matches[activeMatchIndex];
    const targetBlock = htmlBlocks.find((b) => b.id === currentMatch.blockId);
    if (!targetBlock) return;

    const originalCode = targetBlock.code;
    const before = originalCode.substring(0, currentMatch.startIndex);
    const after = originalCode.substring(currentMatch.endIndex);
    const newCode = before + replaceQuery + after;

    setHtmlBlocks((prev) =>
      prev.map((b) => (b.id === targetBlock.id ? { ...b, code: newCode } : b))
    );
    setIsLocallyEdited(true);

    setReplaceFeedback(language === 'es' ? '1 coincidencia reemplazada' : '1 occurrence replaced');
    setTimeout(() => setReplaceFeedback(null), 2000);
  };

  // Execute replace all across scope
  const handleReplaceAll = () => {
    if (!findQuery || matches.length === 0) return;

    let regex: RegExp;
    try {
      let pattern = useRegex ? findQuery : findQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (wholeWord) {
        pattern = `\\b${pattern}\\b`;
      }
      const flags = matchCase ? 'g' : 'gi';
      regex = new RegExp(pattern, flags);
    } catch (e) {
      return;
    }

    let totalReplacements = 0;

    setHtmlBlocks((prev) =>
      prev.map((block) => {
        if (searchScope === 'current' && block.id !== lastFocusedBlockId) {
          return block;
        }
        const matchesInBlock = block.code.match(regex);
        if (matchesInBlock) {
          totalReplacements += matchesInBlock.length;
          return {
            ...block,
            code: block.code.replace(regex, replaceQuery),
          };
        }
        return block;
      })
    );

    setIsLocallyEdited(true);

    if (totalReplacements > 0) {
      const msg =
        totalReplacements === 1
          ? `1 ${t('occurrenceReplaced')}`
          : `${totalReplacements} ${t('occurrencesReplaced')}`;
      setReplaceFeedback(msg);
      setTimeout(() => setReplaceFeedback(null), 3000);
    }
  };

  // Keydown handler inside find/replace inputs
  const handleFindKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        handlePrevMatch();
      } else {
        handleNextMatch();
      }
    } else if (e.altKey && e.key.toLowerCase() === 'r') {
      e.preventDefault();
      handleReplaceCurrent();
    } else if (e.altKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      handleReplaceAll();
    }
  };

  const handleReplaceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        handleReplaceAll();
      } else {
        handleReplaceCurrent();
      }
    } else if (e.altKey && e.key.toLowerCase() === 'r') {
      e.preventDefault();
      handleReplaceCurrent();
    } else if (e.altKey && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      handleReplaceAll();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="p-3 bg-slate-950 border-b border-slate-800 flex flex-col gap-2.5 shadow-xl select-none animate-fade-in relative z-30">
      {/* Header bar of Find & Replace */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Search className="w-3.5 h-3.5 text-orange-500 shrink-0" />
          <span className="font-extrabold text-[11px] text-slate-100 uppercase tracking-wider truncate">
            {t('findAndReplace')}
          </span>
          {replaceFeedback && (
            <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 animate-fade-in truncate ml-1 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded">
              <Check className="w-3 h-3 text-emerald-400" />
              {replaceFeedback}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Toggle Replace row */}
          <button
            type="button"
            onClick={() => setShowReplace(!showReplace)}
            className={`h-6 px-2 rounded text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer border ${
              showReplace
                ? 'bg-orange-950/60 text-orange-400 border-orange-700/60'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title={t('toggleReplace')}
          >
            <Replace className="w-3 h-3" />
            <span className="hidden sm:inline">{t('replace')}</span>
          </button>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
            title={t('closeSearch')}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Row 1: Find input, options, navigation buttons & counter */}
      <div className="flex items-center gap-1.5 w-full">
        {/* Search input with match count badge inside */}
        <div className="relative flex-1 min-w-0">
          <input
            ref={findInputRef}
            type="text"
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
            onKeyDown={handleFindKeyDown}
            placeholder={t('findPlaceholder')}
            className="w-full h-8 pl-2.5 pr-20 bg-slate-900 border border-slate-750 focus:border-orange-500 rounded text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500/30 transition-all"
          />

          {/* Counter pill inside input */}
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {findQuery && (
              <span
                className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded leading-none ${
                  matches.length > 0
                    ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40'
                    : 'bg-red-950/80 text-red-400 border border-red-800/60'
                }`}
              >
                {matches.length > 0 ? `${activeMatchIndex + 1}/${matches.length}` : '0'}
              </span>
            )}
            {findQuery && (
              <button
                type="button"
                onClick={() => setFindQuery('')}
                className="text-slate-500 hover:text-slate-300 p-0.5 cursor-pointer"
                title="Limpiar"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Previous Match button */}
        <button
          type="button"
          onClick={handlePrevMatch}
          disabled={matches.length === 0}
          className={`w-8 h-8 rounded border flex items-center justify-center transition-all ${
            matches.length > 0
              ? 'bg-slate-900 border-slate-750 text-slate-300 hover:text-orange-400 hover:border-orange-500 hover:bg-slate-800 cursor-pointer active:scale-95'
              : 'bg-slate-900/40 border-slate-850 text-slate-600 cursor-not-allowed opacity-40'
          }`}
          title={t('prevMatch')}
        >
          <ChevronUp className="w-4 h-4" />
        </button>

        {/* Next Match button */}
        <button
          type="button"
          onClick={handleNextMatch}
          disabled={matches.length === 0}
          className={`w-8 h-8 rounded border flex items-center justify-center transition-all ${
            matches.length > 0
              ? 'bg-slate-900 border-slate-750 text-slate-300 hover:text-orange-400 hover:border-orange-500 hover:bg-slate-800 cursor-pointer active:scale-95'
              : 'bg-slate-900/40 border-slate-850 text-slate-600 cursor-not-allowed opacity-40'
          }`}
          title={t('nextMatch')}
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {/* Row 2: Replace Input & Action Buttons (if showReplace is true) */}
      {showReplace && (
        <div className="flex items-center gap-1.5 w-full animate-fade-in">
          <input
            ref={replaceInputRef}
            type="text"
            value={replaceQuery}
            onChange={(e) => setReplaceQuery(e.target.value)}
            onKeyDown={handleReplaceKeyDown}
            placeholder={t('replacePlaceholder')}
            className="flex-1 min-w-0 h-8 px-2.5 bg-slate-900 border border-slate-750 focus:border-orange-500 rounded text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500/30 transition-all"
          />

          {/* Replace Single */}
          <button
            type="button"
            onClick={handleReplaceCurrent}
            disabled={matches.length === 0}
            className={`h-8 px-2.5 rounded border text-[10.5px] font-bold transition-all flex items-center gap-1 ${
              matches.length > 0
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border-slate-700 hover:border-orange-500 cursor-pointer active:scale-95'
                : 'bg-slate-900/40 text-slate-600 border-slate-850 cursor-not-allowed opacity-40'
            }`}
            title="Reemplazar coincidencia actual (Alt+R)"
          >
            <Replace className="w-3 h-3 text-orange-400" />
            <span>{t('replace')}</span>
          </button>

          {/* Replace All */}
          <button
            type="button"
            onClick={handleReplaceAll}
            disabled={matches.length === 0}
            className={`h-8 px-2.5 rounded border text-[10.5px] font-bold transition-all flex items-center gap-1 ${
              matches.length > 0
                ? 'bg-orange-600 hover:bg-orange-500 text-white border-orange-500 shadow-md cursor-pointer active:scale-95'
                : 'bg-slate-900/40 text-slate-600 border-slate-850 cursor-not-allowed opacity-40'
            }`}
            title="Reemplazar todas las coincidencias (Alt+A)"
          >
            <span>{t('replaceAll')}</span>
          </button>
        </div>
      )}

      {/* Row 3: Options toggles (Case sensitive, Whole word, Regex, Scope: All / Current) */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-900 text-[10px]">
        {/* Modifier buttons */}
        <div className="flex items-center gap-1">
          {/* Match Case (Aa) */}
          <button
            type="button"
            onClick={() => setMatchCase((prev) => !prev)}
            className={`h-6 px-1.5 rounded font-mono font-bold flex items-center gap-1 transition-all cursor-pointer border ${
              matchCase
                ? 'bg-orange-950/80 text-orange-400 border-orange-700/80'
                : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title={t('matchCase')}
          >
            <CaseSensitive className="w-3.5 h-3.5" />
            <span className="text-[9px]">Aa</span>
          </button>

          {/* Whole Word (\b) */}
          <button
            type="button"
            onClick={() => setWholeWord((prev) => !prev)}
            className={`h-6 px-1.5 rounded font-mono font-bold flex items-center gap-1 transition-all cursor-pointer border ${
              wholeWord
                ? 'bg-orange-950/80 text-orange-400 border-orange-700/80'
                : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title={t('wholeWord')}
          >
            <WholeWord className="w-3.5 h-3.5" />
            <span className="text-[9px]">\b</span>
          </button>

          {/* Regex (.*) */}
          <button
            type="button"
            onClick={() => setUseRegex((prev) => !prev)}
            className={`h-6 px-1.5 rounded font-mono font-bold flex items-center gap-1 transition-all cursor-pointer border ${
              useRegex
                ? 'bg-orange-950/80 text-orange-400 border-orange-700/80'
                : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title={t('useRegex')}
          >
            <Regex className="w-3.5 h-3.5" />
            <span className="text-[9px]">.*</span>
          </button>
        </div>

        {/* Scope selector */}
        <div className="flex items-center bg-slate-900 border border-slate-800 rounded p-0.5">
          <button
            type="button"
            onClick={() => setSearchScope('all')}
            className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
              searchScope === 'all'
                ? 'bg-[#004080] text-white border border-orange-500/60 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Buscar en todos los bloques de contenido"
          >
            <Layers className="w-3 h-3" />
            <span>{t('scopeAllBlocks')}</span>
          </button>

          <button
            type="button"
            onClick={() => setSearchScope('current')}
            className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
              searchScope === 'current'
                ? 'bg-[#004080] text-white border border-orange-500/60 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Buscar únicamente en el bloque actualmente enfocado"
          >
            <FileCode className="w-3 h-3" />
            <span>{t('scopeCurrentBlock')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default FindReplaceBar;
