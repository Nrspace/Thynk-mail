// Detects markup that is already a complete HTML document (has its own
// <html>/<!DOCTYPE> wrapper) rather than a fragment meant to be dropped into
// one of the template builder's blocks.
export function isFullHtmlDocument(html: string): boolean {
  return /<!doctype\s+html|<html[\s>]/i.test(html);
}

// Heals templates that got corrupted by the bug where re-opening a saved
// template for editing collapsed it into a single "html" block containing
// the ALREADY-complete saved document, and saving it then wrapped that
// whole document in a fresh copy of the standard
// <table><td style="padding:32px..."> shell again — nesting one full
// document inside another, inside another, with every edit-save cycle.
// That's what produced the growing blank space at the top/bottom of sent
// emails.
//
// This walks in from the outside and keeps only the innermost complete
// document — the one that actually contains the real content — discarding
// every redundant wrapper layer stacked around it. A template with only
// one layer (the normal, healthy case, including everything saved AFTER
// this fix) is returned completely unchanged.
export function unwrapNestedDocuments(html: string): string {
  if (!html) return html;
  const DOCTYPE = '<!DOCTYPE html>';
  const firstIdx = html.indexOf(DOCTYPE);
  const lastIdx = html.lastIndexOf(DOCTYPE);
  if (firstIdx === -1 || firstIdx === lastIdx) return html; // 0 or 1 layer — nothing to unwrap

  const closeTag = '</html>';
  const closeIdx = html.toLowerCase().indexOf(closeTag, lastIdx);
  if (closeIdx === -1) return html; // malformed — bail out safely rather than mangle it

  return html.slice(lastIdx, closeIdx + closeTag.length);
}
