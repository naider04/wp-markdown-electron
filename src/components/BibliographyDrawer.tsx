/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { parseBibtex } from '../utils/bibParser';
import { getAPACitationLabel, extractAPAYear, assignYearSuffixes } from '../utils/apaFormatter';
import {
  BookOpen,
  Copy,
  Plus,
  X,
  Check,
  Info,
  Code,
  FileText
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface BibliographyDrawerProps {
  bibtex: string;
  setBibtex: (bibtex: string) => void;
  onClose: () => void;
  onInsertHTML: (snippet: string) => void;
  showBibliography: boolean;
  onToggleShowBibliography: (show: boolean) => void;
  showOnlyCitedBibliography: boolean;
  onToggleShowOnlyCitedBibliography: (show: boolean) => void;
  bibliographyTitle: string;
  onChangeBibliographyTitle: (title: string) => void;
  pageSize?: string;
}

export function BibliographyDrawer({
  bibtex,
  setBibtex,
  onClose,
  onInsertHTML,
  showBibliography,
  onToggleShowBibliography,
  showOnlyCitedBibliography,
  onToggleShowOnlyCitedBibliography,
  bibliographyTitle,
  onChangeBibliographyTitle,
  pageSize
}: BibliographyDrawerProps) {
  const { language, t } = useLanguage();
  const [successMsg, setSuccessMsg] = useState('');

  const triggerSuccessMsg = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 2500);
  };

  // Real-time parsed bibliography items to list keys
  const parsedItems = useMemo(() => {
    return parseBibtex(bibtex);
  }, [bibtex]);

  const yearSuffixMap = useMemo(() => assignYearSuffixes(parsedItems), [parsedItems]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    triggerSuccessMsg(language === 'es' ? `Copiado: ${text}` : `Copied: ${text}`);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 select-none">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950 shrink-0">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-orange-500" />
          <span className="font-extrabold text-[12px] uppercase tracking-wider text-slate-200">
            {t('navBibliography')}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-800 rounded transition-all text-slate-400 hover:text-slate-200 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Main content scrollable container */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 custom-scrollbar">
        {/* Quick info alert */}
        <div className="p-3 bg-slate-950/60 border border-slate-800 rounded flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5">
            <Info className="w-4 h-4 text-[#004080] shrink-0" />
            <span className="text-[10px] font-bold text-slate-200 uppercase tracking-wider">
              {t('bibSupportTitle')}
            </span>
          </div>
          <p className="text-[9.5px] text-slate-400 leading-relaxed">
            {t('bibSupportDesc')}
          </p>
        </div>

        {/* Global toggles */}
        <div className="p-3 bg-slate-950/40 border border-slate-850 rounded flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                {t('showBibSheet')}
              </span>
              <span className="text-[8.5px] text-slate-500">
                {t('showBibSheetDesc')}
              </span>
            </div>
            <button
              disabled={pageSize === 'continuous'}
              onClick={() => onToggleShowBibliography(!showBibliography)}
              className={`text-xs px-2.5 py-1 rounded border font-bold transition-all ${
                pageSize === 'continuous'
                  ? 'bg-slate-900 border-slate-950 text-slate-600 opacity-40 cursor-not-allowed'
                  : showBibliography
                    ? 'bg-[#004080] border-[#FF6600] text-white cursor-pointer'
                    : 'bg-slate-900 border-slate-800 text-slate-500 cursor-pointer'
              }`}
              title={pageSize === 'continuous' ? (language === 'es' ? "Deshabilitado en Tira Continua" : "Disabled in Continuous Scroll") : ""}
            >
              {showBibliography ? (language === 'es' ? 'SÍ (PÁGINA FINAL)' : 'YES (FINAL PAGE)') : (language === 'es' ? 'NO' : 'NO')}
            </button>
          </div>

          {showBibliography && (
            <>
              <div className="flex items-center justify-between border-t border-slate-905/30 pt-2.5">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">
                    {t('showOnlyCited')}
                  </span>
                  <span className="text-[8.5px] text-slate-500">
                    {t('showOnlyCitedDesc')}
                  </span>
                </div>
                <button
                  onClick={() => onToggleShowOnlyCitedBibliography(!showOnlyCitedBibliography)}
                  className={`text-xs px-2.5 py-1 rounded border font-bold transition-all cursor-pointer ${
                    showOnlyCitedBibliography
                      ? 'bg-[#004080] border-[#FF6600] text-white'
                      : 'bg-slate-900 border-slate-800 text-slate-500'
                  }`}
                >
                  {showOnlyCitedBibliography ? (language === 'es' ? 'SÍ (SOLO CITADAS)' : 'YES (ONLY CITED)') : (language === 'es' ? 'TODAS' : 'ALL')}
                </button>
              </div>

              <div className="flex flex-col gap-1 border-t border-slate-905/30 pt-2.5">
                <label className="text-[8.5px] text-slate-400 font-bold uppercase">
                  {t('bibSectionTitleLabel')}
                </label>
                <input
                  type="text"
                  value={bibliographyTitle}
                  onChange={(e) => onChangeBibliographyTitle(e.target.value)}
                  className="p-1.5 bg-slate-950 border border-slate-800 rounded text-slate-200 text-xs focus:border-[#FF6600] focus:outline-none"
                  placeholder={language === 'es' ? "Ej: Referencias Bibliográficas" : "e.g.: References"}
                />
              </div>
            </>
          )}
        </div>

        {/* BibTeX Editor */}
        <div className="flex flex-col gap-1.5 flex-1 min-h-[300px]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Code className="w-3.5 h-3.5 text-orange-400" />
              {t('bibtexCodeLabel')}
            </span>
            {successMsg && (
              <span className="text-[9px] font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-900/30 px-2 py-0.5 rounded flex items-center gap-1 animate-fade-in">
                <Check className="w-3 h-3" /> {successMsg}
              </span>
            )}
          </div>
          
          <textarea
            value={bibtex}
            onChange={(e) => setBibtex(e.target.value)}
            className="flex-1 w-full p-2.5 bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-[#FF6600]/80 focus:outline-none rounded-lg text-slate-200 font-mono text-[10.5px] leading-relaxed resize-none custom-scrollbar"
            placeholder={`@book{ejemplo2026,
  author    = {Gómez, J. and Pérez, M.},
  year      = {2026},
  title     = {Investigación Científica en Ingeniería},
  publisher = {Editorial Académica}
}`}
          />
        </div>

        {/* Parsed items explorer */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            {t('detectedReferences')} ({parsedItems.length})
          </span>

          <div className="flex flex-col gap-2 max-h-[250px] overflow-y-auto custom-scrollbar pr-0.5">
            {parsedItems.map((item) => (
              <div
                key={item.id}
                className="p-2.5 bg-slate-950/50 hover:bg-slate-950 border border-slate-850 hover:border-slate-800 rounded flex flex-col gap-1 transition-all group"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[9px] text-orange-400 font-bold truncate">
                    @{item.key}
                  </span>
                  <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onInsertHTML(`[@${item.key}]`)}
                      className="py-0.5 px-1.5 rounded bg-slate-800 hover:bg-orange-600 hover:text-white transition-all text-[8px] font-black text-slate-300 cursor-pointer flex items-center gap-0.5"
                      title={language === 'es' ? "Insertar cita [@key] en el editor HTML activo" : "Insert citation [@key] into active editor"}
                    >
                      <Plus className="w-2.5 h-2.5" />
                      {t('insert')}
                    </button>
                    <button
                      onClick={() => copyToClipboard(`[@${item.key}]`)}
                      className="p-0.5 rounded bg-slate-855 hover:bg-slate-750 text-slate-300 hover:text-white cursor-pointer"
                      title={language === 'es' ? "Copiar llave de cita" : "Copy citation key"}
                    >
                      <Copy className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>

                <div className="text-[9.5px] text-slate-400 leading-normal select-text pr-1.5">
                  <span className="text-slate-300">{getAPACitationLabel(item).replace(/<[^>]+>/g, '')} ({extractAPAYear(item.year)}{yearSuffixMap.get(item.key) || ''}).</span>{' '}
                  <span className="italic">{item.title}</span>.
                  {item.publisher && ` ${item.publisher}.`}
                  {item.journal && ` ${item.journal}.`}
                </div>
              </div>
            ))}

            {parsedItems.length === 0 && (
              <div className="py-6 px-3 bg-slate-950/20 border border-slate-850 border-dashed rounded text-center text-slate-500 text-[10px] flex flex-col gap-1 items-center justify-center">
                <FileText className="w-5 h-5 text-slate-650 shrink-0" />
                <span>{t('noValidReferences')}</span>
                <span className="text-[8.5px] text-slate-600">
                  {t('noValidReferencesDesc')}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
