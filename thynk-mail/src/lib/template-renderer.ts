export function interpolateVariables(
  html: string,
  variables: Record<string, string>
): string {
  return html.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] ?? match;
  });
}

export function extractVariables(html: string): string[] {
  const matches = html.match(/\{\{(\w+)\}\}/g) || [];
  return Array.from(new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, ''))));
}

export function addTrackingPixel(html: string, sendLogId: string, appUrl: string): string {
  const pixel = `<img src="${appUrl}/api/send/track?id=${sendLogId}&event=open" width="1" height="1" style="display:none" alt="" />`;
  return html.replace('</body>', `${pixel}</body>`);
}

export function addClickTracking(html: string, sendLogId: string, appUrl: string): string {
  return html.replace(
    /href="(https?:\/\/[^"]+)"/g,
    (_, url) => {
      const encoded = encodeURIComponent(url);
      return `href="${appUrl}/api/send/track?id=${sendLogId}&event=click&url=${encoded}"`;
    }
  );
}

export function addUnsubscribeFooter(
  html: string,
  sendLogId: string,
  appUrl: string
): string {
  const footer = `
<div style="text-align:center;padding:24px 0;font-family:sans-serif;font-size:12px;color:#888888;">
  <p>You received this email because you subscribed to our list.</p>
  <p><a href="${appUrl}/unsubscribe?id=${sendLogId}" style="color:#888888;">Unsubscribe</a></p>
</div>`;
  return html.replace('</body>', `${footer}</body>`);
}

export function buildFinalHtml(
  html: string,
  sendLogId: string,
  appUrl: string,
  variables: Record<string, string>
): string {
  let out = interpolateVariables(html, variables);
  out = addTrackingPixel(out, sendLogId, appUrl);
  out = addClickTracking(out, sendLogId, appUrl);
  out = addUnsubscribeFooter(out, sendLogId, appUrl);
  return out;
}
