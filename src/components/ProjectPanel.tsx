import React from 'react';
import {
  FolderOpen,
  FileText,
  Save,
  Eye,
  EyeOff,
  Play,
  CheckCircle2,
  X,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface ProjectPanelProps {
  projectFolder: string | null;
  contentPath: string | null;
  contentText: string;
  showContentInPreview: boolean;
  onPickFolder: () => void;
  onPickFile: () => void;
  onToggleShowContent: () => void;
  onSaveProject: () => void;
  onLoadContentText: (text: string) => void;
  toastMsg: string | null;
  onDismissToast: () => void;
  buildNotice: string | null;
  isDirty: boolean;
}

export function ProjectPanel({
  projectFolder,
  contentPath,
  contentText,
  showContentInPreview,
  onPickFolder,
  onPickFile,
  onToggleShowContent,
  onSaveProject,
  toastMsg,
  onDismissToast,
  buildNotice,
  isDirty,
}: ProjectPanelProps) {
  const { language } = useLanguage();
  const es = language === 'es';

  const fileName = contentPath ? contentPath.split(/[\\/]/).pop() : null;
  const contentChars = contentText ? contentText.length : 0;

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200 overflow-y-auto">
      <div className="p-4 flex flex-col gap-4">
        <div>
          <h2 className="text-[13px] font-extrabold uppercase tracking-wide text-[#FF6600]">
            {es ? 'Proyecto' : 'Project'}
          </h2>
          <p className="text-[10.5px] text-slate-400 leading-snug mt-1">
            {es
              ? 'El proyecto vive en una carpeta de tu disco. Aquí eliges la carpeta, el archivo de contenido y guardas la configuración.'
              : 'The project lives in a folder on disk. Choose the folder, the content file and save the configuration here.'}
          </p>
        </div>

        {/* Project folder */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400">
            {es ? 'Carpeta del proyecto' : 'Project folder'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onPickFolder}
              className="flex-1 flex items-center gap-2 p-2.5 rounded bg-slate-950 border border-slate-800 hover:border-[#FF6600]/60 transition-all cursor-pointer text-left min-w-0"
              title={projectFolder || (es ? 'Elegir carpeta' : 'Choose folder')}
            >
              <FolderOpen className="w-4 h-4 text-[#FF6600] shrink-0" />
              <span className="text-[11px] truncate text-slate-300">
                {projectFolder || (es ? 'Elegir carpeta…' : 'Choose folder…')}
              </span>
            </button>
          </div>
        </div>

        {/* Content file */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400">
            {es ? 'Archivo de contenido' : 'Content file'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onPickFile}
              disabled={!projectFolder}
              className={`flex-1 flex items-center gap-2 p-2.5 rounded bg-slate-950 border border-slate-800 text-left min-w-0 transition-all ${
                projectFolder
                  ? 'hover:border-[#FF6600]/60 cursor-pointer'
                  : 'opacity-40 cursor-not-allowed'
              }`}
              title={fileName || (es ? 'Elegir archivo de contenido' : 'Choose content file')}
            >
              <FileText className="w-4 h-4 text-sky-400 shrink-0" />
              <span className="text-[11px] truncate text-slate-300">
                {fileName || (es ? 'Elegir archivo (.md/.txt)…' : 'Choose file (.md/.txt)…')}
              </span>
            </button>
            {fileName && (
              <span className="text-[9.5px] text-slate-500 font-mono shrink-0">
                {contentChars} {es ? 'caract.' : 'chars'}
              </span>
            )}
          </div>
          {!projectFolder && (
            <p className="text-[9.5px] text-slate-500">
              {es ? 'Primero elige una carpeta de proyecto.' : 'Choose a project folder first.'}
            </p>
          )}
        </div>

        {/* Show content toggle */}
        <div className="flex items-center justify-between p-2.5 bg-slate-950 rounded border border-slate-800">
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-[10px] uppercase tracking-wider text-slate-300">
              {es ? 'Vista previa con contenido' : 'Preview with content'}
            </span>
            <span className="text-[9px] text-slate-500">
              {es
                ? 'Al apagarlo verás portada y formato sin el cuerpo.'
                : 'Turn off to preview cover and format without the body.'}
            </span>
          </div>
          <button
            onClick={onToggleShowContent}
            className={`p-1 flex items-center transition-all cursor-pointer ${
              showContentInPreview ? 'text-orange-400' : 'text-slate-500'
            }`}
            title={es ? 'Alternar contenido en vista previa' : 'Toggle content in preview'}
          >
            {showContentInPreview ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5 opacity-40" />}
          </button>
        </div>

        {/* Save project */}
        <button
          onClick={onSaveProject}
          disabled={!projectFolder}
          title={!projectFolder
            ? ''
            : isDirty
              ? (es ? 'Guardar cambios (Ctrl+S)' : 'Save changes (Ctrl+S)')
              : (es ? 'Cambios guardados' : 'All changes saved')}
          className={`w-full p-2.5 rounded flex items-center justify-center gap-2 text-[11px] font-bold transition-all ${
            !projectFolder
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
              : isDirty
                ? 'bg-[#004080] hover:bg-[#00509e] text-white border border-[#FF6600]/60 shadow cursor-pointer'
                : 'bg-slate-800 text-emerald-300 border border-emerald-600/40 cursor-pointer'
          }`}
        >
          {isDirty ? <Save className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          {isDirty ? (es ? 'Guardar' : 'Save') : (es ? 'Guardado' : 'Saved')}
        </button>

        {buildNotice && (
          <div className="flex items-start gap-2 p-2.5 rounded bg-slate-950 border border-slate-800 text-[10px] text-slate-300 leading-relaxed">
            <Play className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
            <span className="flex-1">{buildNotice}</span>
          </div>
        )}

        {toastMsg && (
          <div className="flex items-start gap-2 p-2.5 rounded bg-emerald-950/60 border border-emerald-700/60 text-[10px] text-emerald-200 leading-relaxed">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
            <span className="flex-1">{toastMsg}</span>
            <button
              onClick={onDismissToast}
              className="text-emerald-300 hover:text-white p-0.5 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        <div className="mt-2 p-3 rounded bg-slate-950/70 border border-slate-800/70 text-[9.5px] text-slate-400 leading-relaxed">
          <span className="font-bold text-slate-300 block mb-1">
            {es ? '¿Qué guarda?' : 'What gets saved?'}
          </span>
          {es ? (
            <p>Cada vez que pulses Guardar se escribe <code className="text-sky-300">.mdwp/configuracion_metadatos.json</code> y la bibliografía en la carpeta del proyecto. El archivo <code className="text-sky-300">contenido_fuente.md</code> se edita externamente y no se toca.</p>
          ) : (
            <p>Whenever you press Save, <code className="text-sky-300">.mdwp/configuracion_metadatos.json</code> and the bibliography are written to the project folder. <code className="text-sky-300">contenido_fuente.md</code> is edited externally and is never modified.</p>
          )}
        </div>
      </div>
    </div>
  );
}
