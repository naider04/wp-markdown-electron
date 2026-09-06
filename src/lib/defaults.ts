export const DEFAULT_BLOCK_LISTS = `/* Estilo de Listas Académicas */
.wp-document-content ul:not(.toc-list),
.wp-document-content ol {
  padding-left: 24px !important;
  margin-top: 0px !important;
  margin-bottom: 12px !important;
  text-indent: 0px !important;
}

.wp-document-content ul:not(.toc-list) {
  list-style-type: disc !important;
}

.wp-document-content ol {
  list-style-type: decimal !important;
}

.wp-document-content ul:not(.toc-list) li,
.wp-document-content ol li {
  text-indent: 0px !important;
  margin-bottom: 6px !important;
  padding-left: 0px !important;
  position: relative !important;
}

/* Evitar que párrafos y elementos directos de listas hereden indentación de texto (Compatible con Ecuaciones) */
.wp-document-content ul:not(.toc-list) li p,
.wp-document-content ol li p,
.wp-document-content ul:not(.toc-list) li > span:not(.math-expr):not([class*="mjx"]):not([class*="katex"]),
.wp-document-content ul:not(.toc-list) li > div:not(.math-expr):not([class*="mjx"]):not([class*="katex"]),
.wp-document-content ol li > span:not(.math-expr):not([class*="mjx"]):not([class*="katex"]),
.wp-document-content ol li > div:not(.math-expr):not([class*="mjx"]):not([class*="katex"]) {
  text-indent: 0px !important;
  margin: 0 !important;
  display: inline !important;
}`;
