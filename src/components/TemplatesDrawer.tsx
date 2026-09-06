/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { PageSettings } from '../types';
import { X, RefreshCw, CheckCircle, AlertTriangle, FileCode } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface TemplatesDrawerProps {
  settings: PageSettings;
  setSettings: React.Dispatch<React.SetStateAction<PageSettings>>;
  onClose: () => void;
}

export function TemplatesDrawer({ settings, setSettings, onClose }: TemplatesDrawerProps) {
  const { language, t } = useLanguage();
  const [htmlInput, setHtmlInput] = useState(settings.templateHtml || '');
  const [jsonInput, setJsonInput] = useState(settings.templateJson || '');
  const [startPageInput, setStartPageInput] = useState<number>(settings.templateStartPage || 2);
  const [showPages, setShowPages] = useState<boolean>(settings.showTemplatePages !== false);
  
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Validate JSON on change
  useEffect(() => {
    if (!jsonInput.trim()) {
      setJsonError(t('jsonEmptyError'));
      return;
    }
    try {
      const parsed = JSON.parse(jsonInput);
      if (!Array.isArray(parsed)) {
        setJsonError(t('jsonArrayError'));
      } else {
        setJsonError(null);
      }
    } catch (e: any) {
      setJsonError(`${t('jsonSyntaxError')}: ${e.message}`);
    }
  }, [jsonInput, language]);

  // Sync inputs with settings
  const handleSave = (
    newHtml: string,
    newJson: string,
    newStartPage: number,
    newShow: boolean
  ) => {
    setSettings((prev) => ({
      ...prev,
      templateHtml: newHtml,
      templateJson: newJson,
      templateStartPage: newStartPage,
      showTemplatePages: newShow,
    }));
  };

  const handleHtmlChange = (val: string) => {
    setHtmlInput(val);
    handleSave(val, jsonInput, startPageInput, showPages);
  };

  const handleJsonChange = (val: string) => {
    setJsonInput(val);
    handleSave(htmlInput, val, startPageInput, showPages);
  };

  const handleStartPageChange = (val: number) => {
    const pageNum = isNaN(val) || val < 1 ? 1 : val;
    setStartPageInput(pageNum);
    handleSave(htmlInput, jsonInput, pageNum, showPages);
  };

  const handleToggleShow = () => {
    const nextShow = !showPages;
    setShowPages(nextShow);
    handleSave(htmlInput, jsonInput, startPageInput, nextShow);
  };

  const handleRestoreDefault = () => {
    const defaultHtml = `<style>
.a4-template-card {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  min-height: 931px; /* alto aproximado neto entre márgenes de 96px */
  padding: 60px;
  background: transparent;
  border: 4px double #004080;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  font-family: 'Arial', sans-serif;
  box-shadow: none;
  margin: 0 auto;
}

.template-header {
  border-bottom: 2px solid #004080;
  padding-bottom: 20px;
  text-align: center;
}

.template-header h2 {
  margin: 0;
  font-size: 16px;
  color: #FF6600;
  text-transform: uppercase;
  letter-spacing: 2px;
  font-weight: 800;
}

.template-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 40px 0;
}

.template-word {
  font-size: 56px;
  color: #004080;
  font-weight: 800;
  letter-spacing: -1px;
  margin-bottom: 24px;
  text-transform: capitalize;
}

.template-definition {
  font-size: 24px;
  color: #334155;
  line-height: 1.6;
  max-width: 600px;
  margin-bottom: 30px;
  font-weight: 500;
}

.template-example {
  font-size: 20px;
  font-style: italic;
  color: #64748b;
  max-width: 500px;
  line-height: 1.5;
  background: #f8fafc;
  padding: 20px 30px;
  border-left: 4px solid #FF6600;
  border-radius: 0 8px 8px 0;
}

.template-footer {
  border-top: 1px solid #e2e8f0;
  padding-top: 20px;
  text-align: center;
  font-size: 12px;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 1px;
}
</style>

<div class="a4-template-card">
  <div class="template-header">
    <h2>Ficha de Vocabulario Académico</h2>
  </div>
  <div class="template-body">
    <h1 class="template-word">{{word}}</h1>
    <p class="template-definition">{{definition}}</p>
    <p class="template-example">"{{example}}"</p>
  </div>
  <div class="template-footer">
    WP Academic Documents
  </div>
</div>`;

    const defaultJson = `[
  {
    "word": "abandon",
    "definition": "To leave behind; to give up completely or forever.",
    "example": "He had to abandon the car because it had run out of fuel."
  },
  {
    "word": "ability",
    "definition": "The physical or mental power, skill, or means to do something.",
    "example": "She possesses a remarkable ability to learn complex concepts quickly."
  },
  {
    "word": "challenge",
    "definition": "A task or situation that tests someone's abilities or resources.",
    "example": "Overcoming this difficulty will be a great challenge for the team."
  }
]`;

    setHtmlInput(defaultHtml);
    setJsonInput(defaultJson);
    setStartPageInput(2);
    setShowPages(true);
    
    setSettings((prev) => ({
      ...prev,
      templateHtml: defaultHtml,
      templateJson: defaultJson,
      templateStartPage: 2,
      showTemplatePages: true,
    }));
  };

  return (
    <div id="wp-templates-drawer" className="flex flex-col h-full bg-slate-900 text-slate-100 font-sans select-none overflow-hidden">
      {/* Drawer Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950 shrink-0">
        <div className="flex items-center gap-2">
          <FileCode className="w-4 h-4 text-[#FF6600]" />
          <h2 className="text-xs font-black tracking-wider uppercase text-white">
            {t('navTemplates')}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-all cursor-pointer"
          title={language === 'es' ? "Cerrar panel" : "Close panel"}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Drawer Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar select-text text-xs">
        
        {/* Toggle Option */}
        <div className="bg-slate-950/60 p-3 rounded border border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider block">{t('enableTemplates')}</span>
              <span className="text-[9.5px] text-slate-500 mt-0.5 block leading-normal">
                {t('enableTemplatesDesc')}
              </span>
            </div>
            <button
              onClick={handleToggleShow}
              className={`text-[10px] px-3 py-1.5 rounded border font-bold transition-all cursor-pointer ${
                showPages
                  ? 'bg-[#004080] border-[#FF6600] text-white shadow-[0_0_8px_rgba(255,102,0,0.1)]'
                  : 'bg-slate-900 border-slate-800 text-slate-500'
              }`}
            >
              {showPages ? (language === 'es' ? 'ACTIVADO' : 'ENABLED') : (language === 'es' ? 'DESACTIVADO' : 'DISABLED')}
            </button>
          </div>

          {/* Insert start page input */}
          {showPages && (
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-3 animate-fade-in">
              <div>
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider block">{t('insertAtPage')}</span>
                <span className="text-[9.5px] text-slate-500 mt-0.5 block leading-normal">
                  {t('insertAtPageDesc')}
                </span>
              </div>
              <input
                type="number"
                min="1"
                value={startPageInput}
                onChange={(e) => handleStartPageChange(parseInt(e.target.value, 10))}
                className="w-16 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-center font-bold text-white focus:outline-none focus:border-[#FF6600]"
              />
            </div>
          )}
        </div>

        {/* HTML Template editor */}
        <div className="space-y-1.5 flex flex-col">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-350 uppercase tracking-wider">
              {t('templateHtmlCode')}
            </span>
            <span className="text-[9px] text-[#FF6600] font-semibold">
              {t('useKeyVariables')}
            </span>
          </div>
          <textarea
            value={htmlInput}
            onChange={(e) => handleHtmlChange(e.target.value)}
            className="w-full h-52 bg-slate-950 border border-slate-800 rounded p-2.5 font-mono text-[10.5px] leading-normal text-slate-200 focus:outline-none focus:border-[#004080] custom-scrollbar resize-y select-text"
            placeholder={language === 'es' ? "Escribe el código HTML de tu plantilla..." : "Enter your template HTML code..."}
            spellCheck="false"
          />
        </div>

        {/* JSON Data editor */}
        <div className="space-y-1.5 flex flex-col">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-350 uppercase tracking-wider">
              {t('templateJsonData')}
            </span>
            {jsonError ? (
              <span className="flex items-center gap-1 text-orange-400 font-bold text-[9px] uppercase">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                {t('invalid')}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-emerald-400 font-bold text-[9px] uppercase">
                <CheckCircle className="w-3 h-3 shrink-0" />
                {t('valid')}
              </span>
            )}
          </div>
          <textarea
            value={jsonInput}
            onChange={(e) => handleJsonChange(e.target.value)}
            className={`w-full h-40 bg-slate-950 border rounded p-2.5 font-mono text-[10.5px] leading-normal text-slate-200 focus:outline-none custom-scrollbar resize-y select-text ${
              jsonError ? 'border-orange-500/50 focus:border-orange-500' : 'border-slate-800 focus:border-[#004080]'
            }`}
            placeholder="[ { 'word': 'abandon', 'definition': '...' } ]"
            spellCheck="false"
          />
          {jsonError && (
            <p className="text-[9.5px] text-orange-400/90 leading-normal bg-orange-950/20 p-2 rounded border border-orange-500/20 font-mono">
              {jsonError}
            </p>
          )}
        </div>

        {/* Restore defaults button */}
        <button
          onClick={handleRestoreDefault}
          className="w-full py-2 bg-slate-950 hover:bg-slate-800 text-slate-300 font-bold uppercase tracking-wider text-[9px] border border-slate-800 rounded flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-all"
        >
          <RefreshCw className="w-3 h-3 shrink-0" />
          {t('restoreSampleTemplate')}
        </button>

        {/* Explanatory notes */}
        <div className="bg-slate-950/30 p-3 rounded border border-slate-850 text-slate-400 text-[10px] leading-relaxed space-y-1.5">
          <h4 className="font-bold text-slate-300 uppercase tracking-wider">{t('instructionsTitle')}</h4>
          <p>
            • {t('instructionsP1')}
          </p>
          <p>
            • {t('instructionsP2')}
          </p>
          <p>
            • {t('instructionsP3')}
          </p>
        </div>

      </div>
    </div>
  );
}
