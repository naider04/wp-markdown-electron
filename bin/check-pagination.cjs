#!/usr/bin/env node
// Run the real paginator in Chromium without the app's network/export lifecycle.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const puppeteer = require('puppeteer-core');
const ts = require('typescript');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');

async function main() {
  const source = fs.readFileSync(path.join(root, 'src/components/DocumentPreview.tsx'), 'utf8');
  const start = source.indexOf('    const handlePagination = async () => {');
  const end = source.indexOf('    // Run pagination', start);
  assert(start >= 0 && end > start, 'Could not locate the pagination routine');
  const handlerJS = ts.transpileModule(source.slice(start, end), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const cssStart = source.indexOf('  const getGraphicalAndCustomCSS = () => {');
  const cssEnd = source.indexOf('\n  return (', cssStart);
  assert(cssStart >= 0 && cssEnd > cssStart, 'Could not locate preview CSS generator');
  const cssJS = ts.transpileModule(source.slice(cssStart, cssEnd), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const formatFontSize = (value, fallback) => !value || !value.trim() ? fallback :
    /^\d+(\.\d+)?$/.test(value.trim()) ? value.trim() + 'px' : value.trim();
  const previewStyles = new Function('settings', 'formatFontSize', cssJS + '; return getGraphicalAndCustomCSS();');
  const assets = path.join(root, 'dist/assets');
  const cssName = fs.readdirSync(assets).find(name => /^index-.*\.css$/.test(name));
  assert(cssName, 'Run npm run build:renderer before this check');
  const baseCSS = fs.readFileSync(path.join(assets, cssName), 'utf8');
  const bundle = await esbuild.build({
    entryPoints: [path.join(root, 'src/lib/standaloneHtml.ts')],
    bundle: true, platform: 'node', format: 'cjs', write: false,
  });
  const standalone = new Module(path.join(root, 'pagination-test.cjs'));
  standalone._compile(bundle.outputFiles[0].text, path.join(root, 'pagination-test.cjs'));

  const settings = {
    pageSize: 'letter', orientation: 'portrait', showTOC: false,
    blockStyleTitles: '.wp-document-content h1 { margin-top:24px; margin-bottom:12px; }',
    blockStyleLists: '',
  };
  const fixtures = [{
    name: 'second-heading margin at the page boundary', settings,
    html: '<h1>First heading</h1><p style="height:660px">Body</p><h1>Second heading</h1>' +
      '<ol><li style="height:80px">Final list item</li></ol>',
  }, {
    name: 'contextual headings and paragraph splitting', settings,
    html: '<h1>First heading</h1><p>' + 'Body text for measuring complete lines. '.repeat(100) +
      '</p><h1>Second heading</h1><p>' + 'Following paragraph text. '.repeat(50) + '</p>',
  }, {
    name: 'lists, code and composite blocks', settings,
    html: '<h1>Content</h1><ol>' + Array.from({ length: 20 }, (_, i) =>
      '<li>Item ' + i + ': ' + 'List text with wrapping. '.repeat(12) + '</li>').join('') +
      '</ol><pre><code>' + Array.from({ length: 80 }, (_, i) => 'line ' + i).join('\n') +
      '</code></pre><section>' + Array.from({ length: 20 }, (_, i) => '<div>Block ' + i +
      ' ' + 'Composite text. '.repeat(10) + '</div>').join('') + '</section>',
  }, {
    name: 'table fragments after preceding content', settings,
    html: '<p>' + 'Preceding text. '.repeat(140) + '</p><table><thead><tr><th>Header</th></tr></thead><tbody>' +
      Array.from({ length: 70 }, (_, i) => '<tr><td>Row ' + i + '</td></tr>').join('') + '</tbody></table>',
  }];
  const project = process.argv[2];
  if (project) {
    fixtures.push({
      name: 'reported page 3 clipping',
      settings: JSON.parse(fs.readFileSync(path.join(project, '.mdwp/configuracion_metadatos.json'), 'utf8')).settings,
      exportedHTML: fs.readFileSync(path.join(project, 'documento_formateado.html'), 'utf8'),
    });
  }

  const browser = await puppeteer.launch({
    executablePath: process.env.WP_CHROME || '/opt/google/chrome/chrome',
    headless: true, args: ['--no-sandbox', '--disable-gpu'],
  });
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', request => request.abort());
    for (const fixture of fixtures) {
      const css = baseCSS + previewStyles(fixture.settings, formatFontSize) +
        (fixture.settings.blockStyleTitles || '') + (fixture.settings.blockStyleLists || '');
      await page.setContent('<!DOCTYPE html><style>' + css + '</style>');
      const result = await page.evaluate(async ({ fixture, handlerJS }) => {
        const settings = { ...fixture.settings, showTOC: false, showTemplatePages: false };
        let html = fixture.html;
        if (fixture.exportedHTML) {
          const parsed = new DOMParser().parseFromString(fixture.exportedHTML, 'text/html');
          const body = parsed.querySelector('[name="document-page-3"] .wp-document-body');
          const reportedItem = Array.from(parsed.querySelectorAll('.wp-document-body li')).find(item =>
            item.textContent.includes('tracking developmental trajectories, or research.'));
          // Recreate the overflowing candidate even after a successful rebuild
          // has correctly moved the fourth item out of page 3.
          if (reportedItem && !body.contains(reportedItem)) {
            body.querySelector('ol').appendChild(reportedItem.cloneNode(true));
          }
          html = body.innerHTML;
        }
        const hidden = document.createElement('div');
        hidden.className = 'wp-document-content';
        Object.assign(hidden.style, { position: 'absolute', width: '624px', top: '-9999px' });
        hidden.innerHTML = html;
        document.body.appendChild(hidden);
        let pages;
        const env = {
          hiddenMeasureRef: { current: hidden }, settings,
          paginationTokenRef: { current: 1 }, token: 1,
          tocEngine: {}, contentWidth: 624, pageHeight: 1056,
          topMargin: 96, bottomMargin: 96,
          resolvedCover: { enabled: false }, isLetter: true,
          resolvedHtmlContent: html, PAGINATION_MEASURE_BATCH: 24,
          PaginationCancelled: class extends Error {},
          setTocMetrics() {}, setRecalculating() {}, setPaginatedTOCPages() {},
          setDynamicHeadings() {}, setPageCount() {},
          setPaginatedPages(value) { pages = value; },
          getCompileServerBase() { return null; },
          async renderMermaidBlocksInText(value) { return value; },
          async waitForContainerImages() {}, async yieldToMain() {},
        };
        await new Function('env', 'with(env) { ' + handlerJS + '; return handlePagination(); }')(env);
        const measurements = pages.map(blocks => {
          hidden.innerHTML = '<div class="wp-document-body">' + blocks.join('') + '</div>';
          return hidden.getBoundingClientRect().height;
        });
        const parser = document.createElement('div');
        parser.innerHTML = pages.flat().join('');
        const original = document.createElement('div');
        original.innerHTML = html;
        const normalize = text => text.replace(/\s+/g, '');
        const textPreserved = normalize(parser.textContent) === normalize(original.textContent);
        hidden.remove();
        return { pages, measurements, textPreserved };
      }, { fixture, handlerJS });
      assert(result.pages.length > 1, fixture.name + ': expected a page break');
      assert(result.measurements.every(height => height <= 859), fixture.name + ': overflow ' + result.measurements);
      // Repeated table headers intentionally add text at each continuation.
      if (!fixture.name.startsWith('table')) assert(result.textPreserved, fixture.name + ': lost text');
      if (fixture.exportedHTML) {
        assert(!result.pages[0].join('').includes('tracking developmental trajectories'), 'Item 4 stayed on page 3');
        assert(result.pages[1].join('').includes('tracking developmental trajectories'), 'Item 4 did not move to the next page');
      }
      const pagesHTML = result.pages.map((blocks, i) =>
        '<div name="document-page-' + (i + 1) + '"><div class="wp-document-content"><div class="wp-document-body">' +
        blocks.join('') + '</div></div></div>').join('');
      const exported = standalone.exports.buildStandaloneHtml({
        settings: fixture.settings, cover: {}, pagesHTML, exportFileName: 'Regression test', previewCss: css,
      });
      await page.setContent(exported.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''));
      const exportedMeasurements = await page.evaluate(() => Array.from(document.querySelectorAll('.wp-document-body')).map(body => {
        const content = body.parentElement;
        Object.assign(content.style, { position: 'absolute', width: '624px', height: 'auto', top: '-9999px' });
        const rect = content.getBoundingClientRect();
        const style = getComputedStyle(body.firstElementChild);
        return { height: rect.height, marginTop: style.marginTop };
      }));
      exportedMeasurements.forEach((measurement, i) => {
        assert(Math.abs(measurement.height - result.measurements[i]) < 0.1,
          fixture.name + ': export height differs: ' + measurement.height + ' vs ' + result.measurements[i]);
      });
      console.log('PASS ' + fixture.name + ' (' + result.pages.length + ' pages; heights: ' + result.measurements.join(', ') + ')');
    }
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
