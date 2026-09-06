/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { CoverConfig, PageSize, MarginElement } from '../types';
import { shouldShowOnPage } from '../utils/pageSyntaxEvaluator';

interface CoverPageProps {
  config: CoverConfig;
  pageSize: PageSize;
  orientation?: 'portrait' | 'landscape';
  marginElements?: MarginElement[];
  totalPages?: number;
  uploadedFiles?: any[];
}

function formatCoordinate(val: string | undefined): string {
  if (val === undefined || val === null) return 'auto';
  const trimmed = String(val).trim();
  if (trimmed === '') return 'auto';
  if (/^\d+$/.test(trimmed)) {
    return `${trimmed}px`;
  }
  return trimmed;
}

export default function CoverPage({ 
  config, 
  pageSize, 
  orientation = 'portrait',
  marginElements,
  totalPages = 1,
  uploadedFiles
}: CoverPageProps) {
  const isLetter = pageSize === 'letter';
  const isA4 = pageSize === 'a4';
  const isPortrait = orientation === 'portrait';

  // Estado para forzar re-renderización
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [imageKey, setImageKey] = useState(Date.now()); // Fuerza recarga de imagen

  // Calcular dimensiones dinámicamente
  const width = isPortrait
    ? (isLetter ? 816 : isA4 ? 794 : 630)
    : (isLetter ? 1056 : isA4 ? 1123 : 1120);

  const height = isPortrait
    ? (isLetter ? 1056 : isA4 ? 1123 : 1120)
    : (isLetter ? 816 : isA4 ? 794 : 630);

  // Actualizar dimensiones cuando cambien las props
  useEffect(() => {
    setDimensions({ width, height });
    setImageKey(Date.now()); // FORZAR recarga de la imagen
    console.log(`📐 Portada redimensionada a: ${width}x${height} (${pageSize} - ${orientation})`);
  }, [pageSize, orientation, width, height]);

  // Renderizar únicamente el diseño de Fondo + Capa (Overlay)
  const currentWidth = dimensions.width || width;
  const currentHeight = dimensions.height || height;
  const bgImage = config.backgroundImage || '';

  // Plantilla de fallback por defecto para el overlay si está vacío
  const defaultOverlayHtml = '';

  const resolveUploadedImages = (htmlStr: string): string => {
    let processed = htmlStr;
    if (uploadedFiles && uploadedFiles.length > 0) {
      uploadedFiles.forEach((file) => {
        const escapedName = file.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`src=["'](?:[^"']*/)?${escapedName}["']`, 'gi');
        processed = processed.replace(regex, `src="${file.dataUrl}"`);
      });
    }
    return processed;
  };

  const resolvePageVariables = (htmlStr: string, pageNum: number, totalPagesNum: number): string => {
    let processed = htmlStr;
    
    // Page with arithmetic (e.g. {page + 1}, {page - 2}, {page})
    processed = processed.replace(/\{\s*page\s*(?:([+-])\s*(\d+))?\s*\}/gi, (match, op, num) => {
      if (!op) return String(pageNum);
      const value = parseInt(num, 10);
      if (op === '+') return String(pageNum + value);
      if (op === '-') return String(pageNum - value);
      return String(pageNum);
    });

    // Hoja or sheet with arithmetic (e.g. {hoja + 1}, {sheet - 1}, etc.)
    processed = processed.replace(/\{\s*(?:hoja|sheet)\s*(?:([+-])\s*(\d+))?\s*\}/gi, (match, op, num) => {
      if (!op) return String(pageNum);
      const value = parseInt(num, 10);
      if (op === '+') return String(pageNum + value);
      if (op === '-') return String(pageNum - value);
      return String(pageNum);
    });

    // Total with arithmetic (e.g. {total - 1}, {total})
    processed = processed.replace(/\{\s*total\s*(?:([+-])\s*(\d+))?\s*\}/gi, (match, op, num) => {
      if (!op) return String(totalPagesNum);
      const value = parseInt(num, 10);
      if (op === '+') return String(totalPagesNum + value);
      if (op === '-') return String(totalPagesNum - value);
      return String(totalPagesNum);
    });

    return processed;
  };

  const finalOverlayHtml = config.overlayHtml !== undefined ? resolveUploadedImages(config.overlayHtml) : defaultOverlayHtml;

  return (
    <div
      id="wp-cover-page"
      className="relative bg-white text-gray-800 shadow-xl border border-gray-100 overflow-hidden shrink-0 select-none break-after-page"
      style={{ 
        boxSizing: 'border-box', 
        width: `${currentWidth}px`, 
        height: `${currentHeight}px`,
        position: 'relative',
        containerType: 'size',
        '--cover-width': `${currentWidth}px`,
        '--cover-height': `${currentHeight}px`,
        '--cover-padding-y': `${Math.round(currentHeight * 0.075)}px`,
        '--cover-padding-x': `${Math.round(currentWidth * 0.08)}px`,
      } as React.CSSProperties}
    >
      {bgImage && (
        <img
          key={imageKey}
          src={bgImage}
          alt="Cover background"
          className="absolute inset-0"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'fill',
            objectPosition: 'center center',
            pointerEvents: 'none',
          }}
          onLoad={() => console.log(`✅ Imagen overlay de la carátula cargada correctamente`)}
          onError={() => console.error('❌ Error cargando imagen de fondo de carátula: ' + bgImage)}
        />
      )}
      <div 
        className="relative z-40 w-full h-full"
        dangerouslySetInnerHTML={{ __html: finalOverlayHtml }}
      />
      {/* Margin-bypassing Elements */}
      {marginElements && marginElements.map((el) => {
        if (el.hidden) return null;
        if (!shouldShowOnPage(el.pagesPattern, 1, totalPages)) return null;
        return (
          <div
            key={el.id}
            className="wp-margin-element"
            style={{
              position: 'absolute',
              top: formatCoordinate(el.top),
              right: formatCoordinate(el.right),
              bottom: formatCoordinate(el.bottom),
              left: formatCoordinate(el.left),
              width: formatCoordinate(el.width),
              height: formatCoordinate(el.height),
              zIndex: 35,
              pointerEvents: 'auto',
            }}
            dangerouslySetInnerHTML={{ __html: resolveUploadedImages(resolvePageVariables(el.code, 1, totalPages)) }}
          />
        );
      })}
    </div>
  );
}