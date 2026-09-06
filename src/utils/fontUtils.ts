export const formatFontSize = (size: string | undefined, defaultSize: string): string => {
  if (size === undefined || size === null || size.trim() === '') {
    return defaultSize;
  }
  const trimmed = size.trim();
  // Check if it is a pure number or decimal (e.g. 12, 12.5) and append 'px'
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return `${trimmed}px`;
  }
  return trimmed;
};
