/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { PageSettings, MarginElement } from '../types';
import {
  X,
  Layout,
  Trash2,
  Plus,
  Code,
  Layers,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface MarginsDrawerProps {
  settings: PageSettings;
  setSettings: React.Dispatch<React.SetStateAction<PageSettings>>;
  onClose: () => void;
}

export function MarginsDrawer({
  settings,
  setSettings,
  onClose
}: MarginsDrawerProps) {
  const { language, t } = useLanguage();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const elements = settings.marginElements || [];

  const handleAddElement = () => {
    const nextNum = elements.length + 1;
    const newId = 'margin_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    const newElement: MarginElement = {
      id: newId,
      name: language === 'es' ? `Elemento de Hoja ${nextNum}` : `Page Element ${nextNum}`,
      code: `<div style="font-family: sans-serif; font-size: 11px; font-weight: bold; color: #ffffff; background-color: #004080; border: 1.5px solid #FF6600; padding: 6px 12px; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.15); text-align: center;">\n  Elemento de hoja\n</div>`,
      top: '20px',
      right: '20px',
      bottom: '',
      left: '',
      width: '180px',
      height: 'auto',
      pagesPattern: '!first()'
    };

    setSettings((prev) => ({
      ...prev,
      marginElements: [...(prev.marginElements || []), newElement]
    }));
    setExpandedId(newId);
  };

  const handleUpdateElement = (id: string, field: keyof MarginElement, value: string) => {
    setSettings((prev) => ({
      ...prev,
      marginElements: (prev.marginElements || []).map((el) =>
        el.id === id ? { ...el, [field]: value } : el
      )
    }));
  };

  const handleToggleHideElement = (id: string) => {
    setSettings((prev) => ({
      ...prev,
      marginElements: (prev.marginElements || []).map((el) =>
        el.id === id ? { ...el, hidden: !el.hidden } : el
      )
    }));
  };

  const handleDeleteElement = (id: string) => {
    setSettings((prev) => ({
      ...prev,
      marginElements: (prev.marginElements || []).filter((el) => el.id !== id)
    }));
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 select-none animate-fade-in">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950 shrink-0">
        <div className="flex items-center gap-2">
          <Layout className="w-4 h-4 text-orange-500" />
          <span className="font-extrabold text-[12px] uppercase tracking-wider text-slate-200">
            {t('navGraphics')}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-800 rounded transition-all text-slate-400 hover:text-slate-200 cursor-pointer"
          title={language === 'es' ? "Cerrar panel de Elementos de Hoja" : "Close Page Elements panel"}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 custom-scrollbar">
        {/* Action Bar */}
        <div className="flex items-center justify-between pb-1 border-b border-slate-800">
          <span className="text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">
            {t('navGraphics')} ({elements.length})
          </span>
          <button
            onClick={handleAddElement}
            className="px-2.5 py-1 text-[10px] font-bold bg-[#004080] text-white border border-[#FF6600]/80 rounded hover:bg-[#003060] transition-all flex items-center gap-1 active:scale-95 cursor-pointer shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('addElement')}
          </button>
        </div>

        {/* Editors List */}
        <div className="flex flex-col gap-3.5">
          {elements.length === 0 ? (
            <div className="p-8 border-2 border-dashed border-slate-800 rounded bg-slate-950/20 text-center flex flex-col items-center gap-2">
              <Layers className="w-8 h-8 text-slate-700" />
              <span className="text-slate-400 text-xs font-bold">{t('noPageElements')}</span>
              <p className="text-slate-500 text-[10px] max-w-[200px] leading-relaxed">
                {t('noPageElementsDesc')}
              </p>
            </div>
          ) : (
            elements.map((el, index) => {
              const isExpanded = expandedId === el.id;

              return (
                <div
                  key={el.id}
                  className={`border rounded-lg bg-slate-950/60 overflow-hidden transition-all duration-150 ${
                    el.hidden
                      ? 'opacity-60 border-slate-850 bg-slate-950/30'
                      : isExpanded
                        ? 'border-orange-500 shadow-lg'
                        : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Collapsible header */}
                  <div
                    className="p-3 bg-slate-950 flex justify-between items-center gap-2 cursor-pointer select-none"
                    onClick={() => toggleExpand(el.id)}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Code className={`w-4 h-4 shrink-0 ${el.hidden ? 'text-slate-600' : 'text-orange-500'}`} />
                      <input
                        type="text"
                        value={el.name}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handleUpdateElement(el.id, 'name', e.target.value)}
                        className={`bg-transparent border-b border-transparent hover:border-slate-700 focus:border-orange-500 text-[11px] font-bold focus:outline-none focus:ring-0 py-0.5 px-1 rounded-sm w-full truncate ${
                          el.hidden ? 'text-slate-400 line-through' : 'text-slate-200'
                        }`}
                        title={language === 'es' ? "Haz clic para renombrar" : "Click to rename"}
                      />
                      {/* When hidden, show Borrar button on the left side, away from the right-side toggle button */}
                      {el.hidden && (
                        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => handleDeleteElement(el.id)}
                            className="px-2 py-0.5 rounded bg-red-950/80 hover:bg-red-900 border border-red-800/80 text-red-300 hover:text-red-100 text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm active:scale-95"
                            title={language === 'es' ? "Eliminar elemento definitivamente" : "Delete element permanently"}
                          >
                            <Trash2 className="w-3 h-3 text-red-400" />
                            <span>{t('delete')}</span>
                          </button>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {/* Eye button for toggling visibility - Position is fixed and completely safe */}
                      <button
                        type="button"
                        onClick={() => handleToggleHideElement(el.id)}
                        className={`p-1.5 rounded transition-all cursor-pointer ${
                          el.hidden
                            ? 'text-amber-400 hover:text-amber-300 hover:bg-slate-900'
                            : 'text-slate-400 hover:text-white hover:bg-slate-900'
                        }`}
                        title={el.hidden ? (language === 'es' ? "Mostrar elemento en el documento" : "Show element in document") : (language === 'es' ? "Ocultar elemento (será ignorado por el documento)" : "Hide element (ignored by document)")}
                      >
                        {el.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleExpand(el.id)}
                        className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-900 transition-all cursor-pointer"
                        title={isExpanded ? t('collapse') : t('expand')}
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Body (only visible when expanded) */}
                  {isExpanded && (
                    <div className="p-3.5 border-t border-slate-900 bg-slate-900/40 flex flex-col gap-3.5 select-text">
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-stretch">
                        
                        {/* HTML code textarea - spans left */}
                        <div className="md:col-span-7 flex flex-col gap-1.5 h-full">
                          <label className="text-[9.5px] text-slate-400 font-bold uppercase tracking-wider block">
                            {t('htmlCssCodeLabel')}
                          </label>
                          <textarea
                            value={el.code}
                            onChange={(e) => handleUpdateElement(el.id, 'code', e.target.value)}
                            className="flex-1 w-full p-2.5 bg-slate-950 border border-slate-850 focus:border-orange-500 rounded text-green-400 font-mono text-xs focus:outline-none focus:ring-0 leading-relaxed custom-scrollbar min-h-[300px]"
                            placeholder="<div>...</div>"
                          />
                        </div>

                        {/* Positioning / dimensions / pages panel - spans right */}
                        <div className="md:col-span-5 flex flex-col justify-between gap-3 bg-slate-950/70 p-3 rounded-md border border-slate-850">
                          
                          {/* Top/Right/Bottom/Left positional inputs */}
                          <div>
                            <span className="text-[9.5px] text-slate-350 font-bold uppercase tracking-wider block mb-1.5">
                              {t('sheetPositionLabel')}
                            </span>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[8.5px] text-slate-500 font-bold uppercase">{t('posTop')}</label>
                                <input
                                  type="text"
                                  value={el.top || ''}
                                  onChange={(e) => handleUpdateElement(el.id, 'top', e.target.value)}
                                  className="w-full p-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 text-xs font-mono focus:border-orange-500 focus:outline-none"
                                  placeholder="ej. 20px"
                                />
                              </div>
                              <div>
                                <label className="text-[8.5px] text-slate-500 font-bold uppercase">{t('posRight')}</label>
                                <input
                                  type="text"
                                  value={el.right || ''}
                                  onChange={(e) => handleUpdateElement(el.id, 'right', e.target.value)}
                                  className="w-full p-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 text-xs font-mono focus:border-orange-500 focus:outline-none"
                                  placeholder="ej. 20px"
                                />
                              </div>
                              <div>
                                <label className="text-[8.5px] text-slate-500 font-bold uppercase">{t('posBottom')}</label>
                                <input
                                  type="text"
                                  value={el.bottom || ''}
                                  onChange={(e) => handleUpdateElement(el.id, 'bottom', e.target.value)}
                                  className="w-full p-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 text-xs font-mono focus:border-orange-500 focus:outline-none"
                                  placeholder="ej. 0"
                                />
                              </div>
                              <div>
                                <label className="text-[8.5px] text-slate-500 font-bold uppercase">{t('posLeft')}</label>
                                <input
                                  type="text"
                                  value={el.left || ''}
                                  onChange={(e) => handleUpdateElement(el.id, 'left', e.target.value)}
                                  className="w-full p-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 text-xs font-mono focus:border-orange-500 focus:outline-none"
                                  placeholder="ej. 10px"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Width / Height inputs */}
                          <div>
                            <span className="text-[9.5px] text-slate-350 font-bold uppercase tracking-wider block mb-1.5">
                              {t('dimensionsLabel')}
                            </span>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[8.5px] text-slate-500 font-bold uppercase font-sans">{t('dimWidth')}</label>
                                <input
                                  type="text"
                                  value={el.width || ''}
                                  onChange={(e) => handleUpdateElement(el.id, 'width', e.target.value)}
                                  className="w-full p-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 text-xs font-mono focus:border-orange-500 focus:outline-none"
                                  placeholder="ej. 100% o 180px"
                                />
                              </div>
                              <div>
                                <label className="text-[8.5px] text-slate-500 font-bold uppercase font-sans">{t('dimHeight')}</label>
                                <input
                                  type="text"
                                  value={el.height || ''}
                                  onChange={(e) => handleUpdateElement(el.id, 'height', e.target.value)}
                                  className="w-full p-1.5 bg-slate-900 border border-slate-800 rounded text-slate-200 text-xs font-mono focus:border-orange-500 focus:outline-none"
                                  placeholder="ej. auto o 120px"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Pages patterns input placed within the same right-hand panel */}
                          <div className="pt-2 border-t border-slate-800">
                            <label className="text-[9.5px] text-slate-350 font-bold uppercase tracking-wider block mb-1">
                              {t('pagesPatternLabel')}
                            </label>
                            {settings.pageSize === 'continuous' ? (
                              <div className="text-[10px] text-slate-400 italic bg-slate-950 p-2 rounded border border-slate-850">
                                {t('continuousScrollPatternDesc')}
                              </div>
                            ) : (
                              <input
                                type="text"
                                value={el.pagesPattern}
                                onChange={(e) => handleUpdateElement(el.id, 'pagesPattern', e.target.value)}
                                className="w-full p-1.5 bg-slate-900 border border-slate-800 rounded text-orange-400 text-xs font-mono font-bold focus:border-orange-500 focus:outline-none"
                                placeholder="ej. !first()"
                              />
                            )}
                          </div>

                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>


      </div>
    </div>
  );
}
