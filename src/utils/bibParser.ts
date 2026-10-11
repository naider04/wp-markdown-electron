/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BibliographyItem } from '../types';

export function parseBibtex(bibtex: string): BibliographyItem[] {
  const items: BibliographyItem[] = [];
  
  // Normalize and split by entries starting with @
  const rawEntries = bibtex.split(/(?=^@)/m);
  
  for (let entry of rawEntries) {
    entry = entry.trim();
    if (!entry.startsWith('@')) continue;
    
    // Match the type and key: @type{key,
    const headerMatch = entry.match(/^@([a-zA-Z0-9_\-]+)\s*\{\s*([a-zA-Z0-9_\-:\.]+)\s*,/);
    if (!headerMatch) continue;
    
    const bibType = headerMatch[1].toLowerCase();
    const key = headerMatch[2];
    
    // Parse key-value pairs inside the entry
    const body = entry.substring(headerMatch[0].length);
    const fields: { [key: string]: string } = {};
    
    let i = 0;
    while (i < body.length) {
      // Find '='
      const eqIdx = body.indexOf('=', i);
      if (eqIdx === -1) break;
      
      // Get the field name before the '=' sign
      const fieldNamePart = body.substring(i, eqIdx).trim();
      const fieldNameMatch = fieldNamePart.match(/([a-zA-Z0-9_\-]+)$/);
      if (!fieldNameMatch) {
        i = eqIdx + 1;
        continue;
      }
      const fieldName = fieldNameMatch[1].toLowerCase();
      
      // Get the value starting after '='
      let startIdx = eqIdx + 1;
      // Skip whitespace
      while (startIdx < body.length && /\s/.test(body[startIdx])) {
        startIdx++;
      }
      
      let val = "";
      let endIdx = startIdx;
      
      if (body[startIdx] === '{') {
        // Find matching closing brace (handling nested braces)
        let braceCount = 1;
        endIdx = startIdx + 1;
        while (endIdx < body.length && braceCount > 0) {
          if (body[endIdx] === '{') braceCount++;
          else if (body[endIdx] === '}') braceCount--;
          endIdx++;
        }
        val = body.substring(startIdx + 1, endIdx - 1);
        i = endIdx;
      } else if (body[startIdx] === '"') {
        // Find closing double quote (handling escaped quotes)
        endIdx = startIdx + 1;
        while (endIdx < body.length && body[endIdx] !== '"') {
          if (body[endIdx] === '\\' && body[endIdx + 1] === '"') {
            endIdx += 2;
          } else {
            endIdx++;
          }
        }
        val = body.substring(startIdx + 1, endIdx);
        i = endIdx + 1;
      } else {
        // No braces or quotes, parse until comma, newline, or final closing brace of entry
        endIdx = startIdx;
        while (endIdx < body.length && body[endIdx] !== ',' && body[endIdx] !== '\n' && body[endIdx] !== '}') {
          endIdx++;
        }
        val = body.substring(startIdx, endIdx).trim();
        i = endIdx;
      }
      
      fields[fieldName] = val.trim();
    }
    
    // Map BibTeX fields to BibliographyItem
    let type: 'book' | 'article' | 'web' | 'thesis' | 'inproceedings' | 'report' = 'book';
    if (bibType === 'article') {
      type = 'article';
    } else if (bibType === 'web' || bibType === 'online' || bibType === 'misc') {
      type = 'web';
    } else if (bibType === 'phdthesis' || bibType === 'mastersthesis' || bibType === 'thesis') {
      type = 'thesis';
    } else if (bibType === 'inproceedings' || bibType === 'incollection' || bibType === 'conference' || bibType === 'inbook') {
      type = 'inproceedings';
    } else if (bibType === 'report' || bibType === 'techreport') {
      type = 'report';
    }

    const isReport = bibType === 'report' || bibType === 'techreport';
    const isManual = bibType === 'manual' || bibType === 'booklet';

    items.push({
      id: `bib_${key}_${Math.random().toString(36).substr(2, 5)}`,
      key: key,
      type: type,
      authors: fields['author'] || fields['authors'] || 'Sin autor',
      year: fields['year'] || fields['date'] || 's.f.',
      title: fields['title'] || 'Sin título',
      publisher: fields['publisher'] || (isManual ? (fields['organization'] || fields['address']) : undefined),
      journal: fields['journal'] || fields['journaltitle'] || fields['shortjournal'],
      volume: fields['volume'],
      issue: fields['number'] !== undefined && !isReport ? fields['number'] || fields['issue'] : fields['issue'],
      pages: fields['pages'],
      url: fields['url'] || fields['howpublished'],
      retrievedDate: fields['urldate'] || fields['retrieved'],
      school: fields['school'] || fields['institution'],
      thesisType: fields['type'] || (bibType === 'phdthesis' ? 'Doctoral dissertation' : bibType === 'mastersthesis' ? "Master's thesis" : undefined),
      address: fields['address'] || fields['location'],
      booktitle: fields['booktitle'] || fields['series'],
      editor: fields['editor'],
      doi: fields['doi'],
      edition: fields['edition'],
      institution: fields['institution'] || fields['school'] || fields['organization'],
      reportNumber: isReport ? fields['number'] : fields['reportnumber'] || undefined,
    });
  }
  
  return items;
}

export function generateBibtexFromItems(items: BibliographyItem[]): string {
  return items.map(item => {
    let type = 'book';
    if (item.type === 'article') type = 'article';
    else if (item.type === 'web') type = 'web';
    else if (item.type === 'thesis') type = 'phdthesis';
    else if (item.type === 'inproceedings') type = 'inproceedings';
    
    let fields = `  author    = {${item.authors}},
  year      = {${item.year}},
  title     = {${item.title}}`;
    
    if (item.publisher) fields += `,\n  publisher = {${item.publisher}}`;
    if (item.journal) fields += `,\n  journal   = {${item.journal}}`;
    if (item.volume) fields += `,\n  volume    = {${item.volume}}`;
    if (item.issue) fields += `,\n  number    = {${item.issue}}`;
    if (item.pages) fields += `,\n  pages     = {${item.pages}}`;
    if (item.url) fields += `,\n  url       = {${item.url}}`;
    if (item.retrievedDate) fields += `,\n  urldate   = {${item.retrievedDate}}`;
    if (item.school) fields += `,\n  school    = {${item.school}}`;
    if (item.thesisType) fields += `,\n  type      = {${item.thesisType}}`;
    if (item.address) fields += `,\n  address   = {${item.address}}`;
    if (item.booktitle) fields += `,\n  booktitle = {${item.booktitle}}`;
    if (item.editor) fields += `,\n  editor    = {${item.editor}}`;
    if (item.doi) fields += `,\n  doi       = {${item.doi}}`;
    if (item.edition) fields += `,\n  edition   = {${item.edition}}`;
    if (item.institution) fields += `,\n  institution = {${item.institution}}`;
    if (item.reportNumber) fields += `,\n  number    = {${item.reportNumber}}`;
    
    return `@${type}{${item.key},
${fields}
}`;
  }).join('\n\n');
}

