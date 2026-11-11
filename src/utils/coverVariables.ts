/** Resolve date tokens only when compiling the cover, leaving the source reusable. */
export function resolveCoverVariables(markdown: string, date = new Date()): string {
  return markdown.replace(/\[(DATE|FECHA)\]/g, (_, token: string) =>
    new Intl.DateTimeFormat(token === 'FECHA' ? 'es-EC' : 'en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date),
  );
}
