/** All heights are CSS pixels, including the block's bottom margin. */
export interface TocMetrics {
  headerHeight: number;
  entryHeight: number;
  entryHeightPerLevel?: Record<number, number>;
  /** Legacy metadata only: already included in entryHeight; never add it again. */
  entryGap?: number;
}

export interface TocEngineInfo {
  available: boolean;
  metrics: TocMetrics | null;
  sampleHtml: string | null;
  error: string | null;
}

export interface TocMeasureContext {
  contentElement: HTMLElement;
  width: number;
}

function finiteHeight(value: unknown, allowZero = false): value is number {
  return typeof value === 'number' && Number.isFinite(value) && (allowZero ? value >= 0 : value > 0);
}

function validateMetrics(value: unknown): TocMetrics | null {
  if (!value || typeof value !== 'object') return null;
  const metrics = value as TocMetrics;
  if (!finiteHeight(metrics.headerHeight, true) || !finiteHeight(metrics.entryHeight)) return null;
  if (metrics.entryGap !== undefined && !finiteHeight(metrics.entryGap, true)) return null;

  let entryHeightPerLevel: Record<number, number> | undefined;
  if (metrics.entryHeightPerLevel !== undefined) {
    if (!metrics.entryHeightPerLevel || typeof metrics.entryHeightPerLevel !== 'object' || Array.isArray(metrics.entryHeightPerLevel)) return null;
    entryHeightPerLevel = {};
    for (const [level, height] of Object.entries(metrics.entryHeightPerLevel)) {
      if (!/^[1-6]$/.test(level) || !finiteHeight(height)) return null;
      entryHeightPerLevel[Number(level)] = height;
    }
  }
  // Normalize away entryGap so callers cannot accidentally double-count it.
  return { headerHeight: metrics.headerHeight, entryHeight: metrics.entryHeight, entryHeightPerLevel };
}

async function measureHtml(html: string, { contentElement, width }: TocMeasureContext): Promise<TocMetrics | null> {
  if (!finiteHeight(width)) return null;
  const host = document.createElement('div');
  const inherited = getComputedStyle(contentElement);
  // Shadow DOM isolates the engine's <style> from the document, while these
  // inherited properties preserve the pagination content's typography.
  for (const property of [
    'font-family', 'font-size', 'font-weight', 'font-style', 'font-stretch',
    'font-variant', 'font-feature-settings', 'font-variation-settings',
    'line-height', 'letter-spacing', 'word-spacing', 'color', 'text-align',
    'text-indent', 'text-transform', 'white-space', 'direction', 'writing-mode',
  ]) {
    host.style.setProperty(property, inherited.getPropertyValue(property));
  }
  for (const property of Array.from(inherited)) {
    if (property.startsWith('--')) host.style.setProperty(property, inherited.getPropertyValue(property));
  }
  Object.assign(host.style, {
    position: 'absolute', visibility: 'hidden', pointerEvents: 'none',
    left: '-9999px', top: '0', width: `${width}px`, boxSizing: 'border-box',
    margin: '0', padding: '0', border: '0',
  });
  const shadow = host.attachShadow({ mode: 'closed' });
  const container = document.createElement('div');
  container.className = 'wp-document-content';
  container.style.display = 'flow-root';
  container.innerHTML = html;
  // Samples are for layout only, not executable project content.
  container.querySelectorAll('script').forEach((script) => script.remove());
  shadow.appendChild(container);
  document.body.appendChild(host);

  try {
    // Force layout first so fonts used only by the sample are requested too.
    container.getBoundingClientRect();
    await document.fonts.ready;
    const header = container.querySelector<HTMLElement>('.toc-engine-header');
    const entries = Array.from(container.querySelectorAll<HTMLElement>('.toc-engine-entry'));
    if (!entries.length) return null;
    const inclusiveHeight = (element: HTMLElement): number => {
      const margin = Number.parseFloat(getComputedStyle(element).marginBottom);
      return element.getBoundingClientRect().height + margin;
    };
    const entryHeightPerLevel: Record<number, number> = {};
    for (const entry of entries) {
      const height = inclusiveHeight(entry);
      if (!finiteHeight(height)) return null;
      const levelClass = Array.from(entry.classList).find((name) => /^toc-level-[1-6]$/.test(name));
      if (levelClass) {
        const level = Number(levelClass.slice('toc-level-'.length));
        entryHeightPerLevel[level] = Math.max(entryHeightPerLevel[level] || 0, height);
      }
    }
    return validateMetrics({
      headerHeight: header ? inclusiveHeight(header) : 0,
      entryHeight: inclusiveHeight(entries[0]),
      entryHeightPerLevel,
    });
  } finally {
    host.remove();
  }
}

/** Prefer valid declarations; otherwise measure the engine's synthetic sample. */
export async function deriveMetrics(info: TocEngineInfo, context: TocMeasureContext): Promise<TocMetrics | null> {
  if (!info?.available) return null;
  const declared = validateMetrics(info.metrics);
  if (declared) return declared;
  if (typeof info.sampleHtml !== 'string' || !info.sampleHtml.trim()) return null;
  try {
    return await measureHtml(info.sampleHtml, context);
  } catch (error) {
    console.warn('Could not measure TOC engine sample; using renderer DOM measurements.', error);
    return null;
  }
}

/** Exports must not capture old pages while engine loading/pagination is pending. */
export async function waitForPreviewPagination(): Promise<void> {
  const started = Date.now();
  while ((window as any).__wpTocEnginePending || (window as any).__wpRecalculating) {
    if (Date.now() - started >= 90000) throw new Error('Timed out waiting for TOC metrics and preview pagination.');
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  }
}
