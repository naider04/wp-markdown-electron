// Shared loader for the project-owned TOC engine (toc-engine.cjs).
//
// The renderer (browser) cannot `require()` the engine, so both Node hosts —
// the build server (bin/wp.cjs) and Electron's main process — call this helper
// to expose the engine to the app:
//
//   * `metrics`    optional layout hints the engine declares itself, so the
//                  paginator knows how tall each TOC row will be.
//   * `sampleHtml` the engine's own rendered output for a synthetic one-page
//                  TOC (header + one row per level). The app measures this to
//                  derive exact heights when no metrics are declared.
//
// Heights are CSS pixels and include each block's bottom margin.

const fs = require('fs');
const path = require('path');

const TOC_ENGINE_NAME = 'toc-engine.cjs';
const SAMPLE_TITLE = '__mdwp_toc_sample__';

function sampleTitles() {
  const titles = [];
  for (let level = 1; level <= 6; level++) {
    titles.push({ title: `Muestra nivel ${level}`, page: 1, level });
  }
  return titles;
}

// Run the project engine for a synthetic page so the renderer can measure real
// row/header heights without duplicating the engine's own CSS.
function loadTocEngineInfo(project) {
  const info = { available: false, metrics: null, sampleHtml: null, error: null };
  if (!project) {
    info.error = 'no project';
    return info;
  }
  const enginePath = path.join(project, TOC_ENGINE_NAME);
  if (!fs.existsSync(enginePath)) return info;

  try {
    // Always re-require so edits to the engine take effect immediately.
    delete require.cache[require.resolve(enginePath)];
    const mod = require(enginePath);
    const renderTOC = typeof mod === 'function' ? mod : mod && mod.renderTOC;
    if (typeof renderTOC !== 'function') {
      info.error = `${TOC_ENGINE_NAME} must export a function or { renderTOC(data) }`;
      return info;
    }
    info.available = true;

    const declared = (mod && mod.metrics) || renderTOC.metrics || null;
    if (declared && typeof declared === 'object') {
      // Only JSON-safe primitive values survive the bridge/HTTP hop.
      try {
        info.metrics = JSON.parse(JSON.stringify(declared));
      } catch (e) {
        info.metrics = null;
      }
    }

    const rendered = renderTOC({ title: SAMPLE_TITLE, pages: [{ page: 1, titles: sampleTitles() }] });
    const firstPage = Array.isArray(rendered) ? rendered[0] : rendered;
    info.sampleHtml = typeof firstPage === 'string' ? firstPage : null;
  } catch (e) {
    info.error = String((e && e.message) || e);
  }
  return info;
}

module.exports = { loadTocEngineInfo, TOC_ENGINE_NAME, SAMPLE_TITLE };
