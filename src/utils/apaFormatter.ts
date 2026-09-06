/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BibliographyItem } from '../types';

export function cleanBraces(str: string | undefined): string {
  if (!str) return '';
  return str.replace(/[\{\}]/g, '').trim();
}

export function formatPages(pagesStr: string | undefined): string {
  if (!pagesStr) return '';
  return pagesStr.replace(/\-{2,}/g, '–').replace(/\-/g, '–').trim();
}

export function isInstitutional(authorStr: string): boolean {
  const clean = authorStr.trim().toLowerCase().replace(/[\{\}]/g, '');
  
  const institutionalKeywords = [
    'universidad', 'university', 'asociación', 'association', 'instituto', 'institute',
    'organización', 'organization', 'editorial', 'wp', 'gobierno', 'government',
    'ministerio', 'ministry', 'corporación', 'corporation', 'sociedad', 'society',
    'grupo', 'group', 'fundación', 'foundation', 'banco', 'bank', 'comisión', 'commission',
    'consejo', 'council', 'centre', 'centro', 'laboratory', 'laboratorio', 'academy', 'academia',
    'college', 'colegio', 'research', 'investigación', 'department', 'departamento', 'facultad', 'faculty',
    'school', 'escuela', 'inst.', 'univ.', 'assoc.', 'org.'
  ];
  
  const hasKeyword = institutionalKeywords.some(keyword => clean.includes(keyword));
  if (hasKeyword) return true;

  if (clean.includes(',')) {
    return false; // Structured as Lastname, Firstname
  }
  
  const wordCount = clean.split(/\s+/).length;
  // If it has no comma and more than 3 words, it's likely an institution
  return wordCount > 3;
}

export function extractAPAYear(yearStr: string): string {
  const clean = yearStr.trim();
  if (!clean) return 's.f.';
  // Look for 4-digit year like 2024
  const match = clean.match(/\b(19|20)\d{2}\b/);
  if (match) {
    return match[0];
  }
  return clean;
}

export function parseAuthors(authorsStr: string): string[] {
  let clean = authorsStr.trim();
  if (!clean) return [];

  // Strip outermost curly braces of the entire author field if present
  while (clean.startsWith('{') && clean.endsWith('}')) {
    clean = clean.substring(1, clean.length - 1).trim();
  }

  let authors: string[] = [];

  // Check if separated by " and " (standard BibTeX)
  if (/\s+and\s+/i.test(clean)) {
    authors = clean.split(/\s+and\s+/i).map(s => s.trim()).filter(Boolean);
  } else if (clean.includes(';')) {
    // Check if separated by semicolons
    authors = clean.split(/;\s*/).map(s => s.trim()).filter(Boolean);
  } else if (clean.includes(' & ')) {
    // Check if separated by " & "
    authors = clean.split(/\s*&\s*/).map(s => s.trim()).filter(Boolean);
  } else if (clean.includes(',')) {
    // If there are commas, determine if commas are separating authors or LastName/FirstName
    const parts = clean.split(/,\s*/).map(s => s.trim()).filter(Boolean);
    if (parts.length === 2) {
      authors = [clean];
    } else if (parts.length > 2) {
      const paired: string[] = [];
      for (let i = 0; i < parts.length; i += 2) {
        if (i + 1 < parts.length) {
          paired.push(`${parts[i]}, ${parts[i+1]}`);
        } else {
          paired.push(parts[i]);
        }
      }
      authors = paired;
    } else {
      authors = [clean];
    }
  } else {
    // Otherwise, treat as a single author
    authors = [clean];
  }

  // Clean individual author tokens of ANY internal braces completely!
  authors = authors.map(a => a.replace(/[\{\}]/g, '').trim()).filter(Boolean);

  // Filter out institutional authors (affiliations wrongly placed in author field) if we have at least one individual author
  const hasRealPerson = authors.some(a => !isInstitutional(a));
  if (hasRealPerson) {
    authors = authors.filter(a => !isInstitutional(a));
  }

  return authors;
}

function formatInitials(nameStr: string): string {
  return nameStr
    .split(/\s+/)
    .filter(Boolean)
    .map(word => {
      const parts = word.replace(/\./g, '').split('-').filter(Boolean);
      if (parts.length > 1) {
        return parts.map(p => `${p[0].toUpperCase()}.`).join('-');
      }
      return `${word[0].toUpperCase()}.`;
    })
    .join(' ');
}

export function formatSingleAuthorAPA(author: string): string {
  const cleanAuthor = author.replace(/[\{\}]/g, '').trim();
  if (isInstitutional(cleanAuthor)) {
    return cleanAuthor;
  }
  
  const commaIdx = cleanAuthor.indexOf(',');
  
  if (commaIdx !== -1) {
    const lastName = cleanAuthor.substring(0, commaIdx).trim();
    const firstName = cleanAuthor.substring(commaIdx + 1).trim();
    
    return `${lastName}, ${formatInitials(firstName)}`;
  } else {
    const words = cleanAuthor.split(/\s+/).filter(Boolean);
    if (words.length === 0) return '';
    if (words.length === 1) return words[0];
    
    const lastName = words[words.length - 1];
    const firstNames = words.slice(0, words.length - 1).join(' ');
    return `${lastName}, ${formatInitials(firstNames)}`;
  }
}

export function formatAPAAuthorList(authorsStr: string): string {
  const authors = parseAuthors(authorsStr);
  if (authors.length === 0) return 'Sin autor';
  
  const formattedAuthors = authors.map(author => formatSingleAuthorAPA(author)).filter(Boolean);
  if (formattedAuthors.length === 0) return 'Sin autor';

  if (formattedAuthors.length === 1) {
    return formattedAuthors[0];
  }
  
  if (formattedAuthors.length === 2) {
    return `${formattedAuthors[0]}, & ${formattedAuthors[1]}`;
  }
  
  if (formattedAuthors.length <= 20) {
    const allButLast = formattedAuthors.slice(0, -1).join(', ');
    return `${allButLast}, & ${formattedAuthors[formattedAuthors.length - 1]}`;
  } else {
    // APA 7th rule for more than 20 authors: first 19, then ellipsis, then last
    const first19 = formattedAuthors.slice(0, 19).join(', ');
    const lastAuthor = formattedAuthors[formattedAuthors.length - 1];
    return `${first19}, ... ${lastAuthor}`;
  }
}

export function formatSingleEditorAPA(editor: string): string {
  const cleanEditor = editor.replace(/[\{\}]/g, '').trim();
  if (isInstitutional(cleanEditor)) {
    return cleanEditor;
  }
  
  const commaIdx = cleanEditor.indexOf(',');
  
  if (commaIdx !== -1) {
    const lastName = cleanEditor.substring(0, commaIdx).trim();
    const firstName = cleanEditor.substring(commaIdx + 1).trim();
    
    return `${formatInitials(firstName)} ${lastName}`;
  } else {
    const words = cleanEditor.split(/\s+/).filter(Boolean);
    if (words.length === 0) return '';
    if (words.length === 1) return words[0];
    
    const lastName = words[words.length - 1];
    const firstNames = words.slice(0, words.length - 1).join(' ');
    return `${formatInitials(firstNames)} ${lastName}`;
  }
}

export function formatAPAEditorList(editorsStr: string): string {
  const editors = parseAuthors(editorsStr);
  if (editors.length === 0) return '';
  
  const formatted = editors.map(e => formatSingleEditorAPA(e)).filter(Boolean);
  if (formatted.length === 0) return '';
  
  if (formatted.length === 1) {
    return `${formatted[0]} (Ed.),`;
  }
  if (formatted.length === 2) {
    return `${formatted[0]} & ${formatted[1]} (Eds.),`;
  }
  const allButLast = formatted.slice(0, -1).join(', ');
  return `${allButLast}, & ${formatted[formatted.length - 1]} (Eds.),`;
}

export function getAPALastNames(authorsStr: string): string {
  const parsed = parseAuthors(authorsStr);
  if (parsed.length === 0) return 'Sin autor';
  
  const getLastName = (author: string) => {
    if (isInstitutional(author)) return author.trim();
    
    const cleanAuthor = author.replace(/[\{\}]/g, '').trim();
    const commaIdx = cleanAuthor.indexOf(',');
    if (commaIdx !== -1) {
      return cleanAuthor.substring(0, commaIdx).trim();
    } else {
      const words = cleanAuthor.split(/\s+/).filter(Boolean);
      return words[words.length - 1] || cleanAuthor;
    }
  };

  if (parsed.length === 1) {
    return getLastName(parsed[0]);
  }
  if (parsed.length === 2) {
    return `${getLastName(parsed[0])} & ${getLastName(parsed[1])}`;
  }
  // 3 or more authors
  return `${getLastName(parsed[0])} et al.`;
}

export function hasRealAuthor(item: BibliographyItem): boolean {
  const a = (item.authors || '').trim();
  if (!a || a === 'Sin autor') return false;
  return parseAuthors(a).length > 0;
}

function ordinalNumeral(n: string): string {
  const last = n.slice(-1);
  const lastTwo = n.slice(-2);
  let suffix = 'th';
  if (lastTwo !== '11' && lastTwo !== '12' && lastTwo !== '13') {
    if (last === '1') suffix = 'st';
    else if (last === '2') suffix = 'nd';
    else if (last === '3') suffix = 'rd';
  }
  return n + suffix;
}

const ORDINAL_WORDS: Record<string, string> = {
  first: '1', second: '2', third: '3', fourth: '4', fifth: '5',
  sixth: '6', seventh: '7', eighth: '8', ninth: '9', tenth: '10',
  eleventh: '11', twelfth: '12', thirteenth: '13', fourteenth: '14',
  fifteenth: '15', sixteenth: '16', seventeenth: '17', eighteenth: '18',
  nineteenth: '19', twentieth: '20',
};

export function formatAPAOrdinal(edition: string): string {
  let e = cleanBraces(edition).toLowerCase().trim().replace(/\.$/, '');
  e = e.replace(/\s+(edition|ed)\.?$/i, '').trim();
  const numMatch = e.match(/^\d+/);
  if (numMatch) {
    return `${ordinalNumeral(numMatch[0])} ed.`;
  }
  const word = ORDINAL_WORDS[e];
  if (word) return `${ordinalNumeral(word)} ed.`;
  return cleanBraces(edition).trim();
}

export function toAPASentenceCase(title: string): string {
  if (!title) return '';
  const tokens = title.match(/\{([^{}]*)\}|[^{}\s]+|\s+/g) || [];
  let out = '';
  for (const tok of tokens) {
    if (tok.charAt(0) === '{' && tok.charAt(tok.length - 1) === '}') {
      out += tok.slice(1, -1);
    } else if (/\s+/.test(tok)) {
      out += tok;
    } else {
      const letters = tok.replace(/[^a-zA-Z]/g, '');
      if (letters.length > 0 && letters === letters.toUpperCase()) {
        out += tok;
      } else {
        out += tok.toLowerCase();
      }
    }
  }
  let final = '';
  let capitalizeNext = true;
  for (let i = 0; i < out.length; i++) {
    const ch = out[i];
    if (/[a-zA-Z]/.test(ch) && capitalizeNext) {
      final += ch.toUpperCase();
      capitalizeNext = false;
    } else {
      final += ch;
    }
    if (ch === ':' || ch === '\u2014') capitalizeNext = true;
  }
  return final;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function formatRetrievedDate(dateStr: string): string {
  const d = cleanBraces(dateStr).trim();
  const m = d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const month = parseInt(m[2], 10);
    if (month >= 1 && month <= 12) {
      return `${MONTH_NAMES[month - 1]} ${parseInt(m[3], 10)}, ${m[1]}`;
    }
  }
  return d;
}

export function shortTitleForInText(item: BibliographyItem): string {
  let t = cleanBraces(item.title).replace(/\s+/g, ' ').trim();
  t = t.replace(/[.,;:!?]+$/, '');
  const words = t.split(' ').filter(Boolean);
  let short = words.slice(0, 4).join(' ');
  if (!short) short = item.title || 'título';
  if (item.type === 'book' || item.type === 'report' || item.type === 'thesis') {
    return `<em>${short}</em>`;
  }
  return `\u201C${short}\u201D`;
}

export function getAPACitationLabel(item: BibliographyItem): string {
  if (!hasRealAuthor(item)) return shortTitleForInText(item);
  return getAPALastNames(item.authors);
}

const LOCATOR_LABELS: Record<string, string> = {
  'p.': 'p.',
  'pp.': 'pp.',
  'page': 'p.',
  'pages': 'pp.',
  'para.': 'para.',
  'sec.': 'Section',
  'sec': 'Section',
  'section': 'Section',
  'chap.': 'Chapter',
  'chap': 'Chapter',
  'chapter': 'Chapter',
  'fig.': 'Figure',
  'fig': 'Figure',
  'figure': 'Figure',
  'tbl.': 'Table',
  'tbl': 'Table',
  'table': 'Table',
  'app.': 'Appendix',
  'appendix': 'Appendix',
  'eq.': 'Equation',
  'eqn': 'Equation',
  'vol.': 'Vol.',
  'vol': 'Vol.',
  'part': 'Part',
  'book': 'Book',
  'line': 'Line',
};

export function formatLocator(rawLocator: string): string {
  const loc = cleanBraces(rawLocator).trim();
  if (!loc) return '';
  const match = loc.match(/^([a-zA-Z.]+)\s+(.+)$/);
  if (!match) {
    return `p. ${normalizeLocatorRange(loc)}`;
  }
  const label = LOCATOR_LABELS[match[1].toLowerCase()];
  if (!label) return `${match[1]} ${match[2]}`;
  return `${label} ${normalizeLocatorRange(match[2])}`;
}

function normalizeLocatorRange(value: string): string {
  return value.trim().replace(/(\d)\s*[-–]\s*(\d)/g, '$1\u2013$2');
}

export function assignYearSuffixes(items: BibliographyItem[]): Map<string, string> {
  const letters = new Map<string, string>();
  const groups = new Map<string, BibliographyItem[]>();
  for (const item of items) {
    const label = getAPACitationLabel(item).replace(/<[^>]+>/g, '').toLowerCase();
    const yr = extractAPAYear(item.year);
    const key = `${label}|${yr}`;
    const list = groups.get(key) || [];
    list.push(item);
    groups.set(key, list);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) =>
      cleanBraces(a.title).toLowerCase().localeCompare(cleanBraces(b.title).toLowerCase())
    );
    sorted.forEach((item, idx) => {
      letters.set(item.key, String.fromCharCode(97 + idx));
    });
  }
  return letters;
}

function endPunctFor(element: string): string {
  return /[.?!]$/.test(element.replace(/<[^>]*>/g, '').trim()) ? '' : '.';
}

export function formatAPABibliographyItem(item: BibliographyItem, yearSuffix = ''): string {
  const year = extractAPAYear(item.year) + yearSuffix;
  const title = toAPASentenceCase(cleanBraces(item.title));
  const hasAuth = hasRealAuthor(item);
  const authorsLabel = formatAPAAuthorList(item.authors);
  const editionHtml = item.edition ? ` (${formatAPAOrdinal(item.edition)})` : '';

  let linkHtml = '';
  if (item.doi) {
    const cleanDoi = cleanBraces(item.doi);
    const doiUrl = cleanDoi.startsWith('http') ? cleanDoi : `https://doi.org/${cleanDoi}`;
    linkHtml = `<a href="${doiUrl}" target="_blank" style="color: inherit; text-decoration: none; overflow-wrap: anywhere;">${doiUrl}</a>`;
  } else if (item.url) {
    const cleanUrl = cleanBraces(item.url);
    linkHtml = `<a href="${cleanUrl}" target="_blank" style="color: inherit; text-decoration: none; overflow-wrap: anywhere;">${cleanUrl}</a>`;
  }
  const retrievedHtml = item.retrievedDate && item.type === 'web'
    ? `(Retrieved ${formatRetrievedDate(item.retrievedDate)}, from ${linkHtml})`
    : '';

  let formatted: string;

  if (item.type === 'book') {
    const publisherPart = item.publisher ? ` ${cleanBraces(item.publisher)}.` : '';
    const titleElement = `<em>${title}</em>${editionHtml}`;
    formatted = hasAuth
      ? `${authorsLabel} (${year}). ${titleElement}${endPunctFor(titleElement)}${publisherPart}`
      : `${titleElement}${endPunctFor(titleElement)} (${year}).${publisherPart}`;
  } else if (item.type === 'article') {
    let journalPart = '';
    if (item.journal) {
      let j = `<em>${cleanBraces(item.journal)}</em>`;
      if (item.volume) j += `, <em>${cleanBraces(item.volume)}</em>`;
      if (item.issue) j += `(${cleanBraces(item.issue)})`;
      if (item.pages) j += `, ${formatPages(item.pages)}`;
      journalPart = ` ${j}.`;
    }
    formatted = hasAuth
      ? `${authorsLabel} (${year}). ${title}${endPunctFor(title)}${journalPart}`
      : `${title}${endPunctFor(title)} (${year}).${journalPart}`;
  } else if (item.type === 'thesis') {
    const details: string[] = [];
    if (item.thesisType) details.push(cleanBraces(item.thesisType));
    const schoolName = cleanBraces(item.school || item.institution || '');
    if (schoolName) details.push(schoolName);
    const bracket = details.length > 0 ? ` [${details.join(', ')}]` : '';
    const titleElement = `<em>${title}</em>${editionHtml}${bracket}`;
    formatted = hasAuth
      ? `${authorsLabel} (${year}). ${titleElement}${endPunctFor(titleElement)}`
      : `${titleElement}${endPunctFor(titleElement)} (${year}).`;
    if (item.address) formatted += ` ${cleanBraces(item.address)}.`;
  } else if (item.type === 'inproceedings') {
    let inPart = 'In ';
    const editorFormatted = item.editor ? formatAPAEditorList(item.editor) : '';
    if (editorFormatted) inPart += `${editorFormatted} `;
    if (item.booktitle) inPart += `<em>${toAPASentenceCase(cleanBraces(item.booktitle))}</em>`;
    if (item.pages) inPart += ` (pp. ${formatPages(item.pages)})`;
    if (inPart !== 'In ') inPart += '.';
    const publisherPart = item.publisher ? ` ${cleanBraces(item.publisher)}.` : '';
    formatted = `${hasAuth ? `${authorsLabel} (${year}).` : `(${year}).`} ${title}${endPunctFor(title)} ${inPart}${publisherPart}`.replace(/\s+/g, ' ').trim();
  } else if (item.type === 'report') {
    const numberPart = item.reportNumber ? ` (Report No. ${cleanBraces(item.reportNumber)})` : '';
    const orgName = cleanBraces(item.publisher || item.institution || item.school || '');
    const orgPart = orgName ? ` ${orgName}.` : '';
    const titleElement = `<em>${title}</em>${numberPart}`;
    formatted = hasAuth
      ? `${authorsLabel} (${year}). ${titleElement}${endPunctFor(titleElement)}${orgPart}`
      : `${titleElement}${endPunctFor(titleElement)} (${year}).${orgPart}`;
  } else { // web
    const sitePart = item.publisher || item.institution ? ` ${cleanBraces(item.publisher || item.institution || '')}.` : '';
    const titleElement = `<em>${title}</em>`;
    formatted = hasAuth
      ? `${authorsLabel} (${year}). ${titleElement}${endPunctFor(titleElement)}${sitePart}`
      : `${titleElement}${endPunctFor(titleElement)} (${year}).${sitePart}`;
  }

  if (retrievedHtml) {
    formatted += ` ${retrievedHtml}`;
  } else if (linkHtml) {
    formatted += ` ${linkHtml}`;
  }

  return formatted;
}
