// Tiny shared HTML wrapper. Production should swap this for a templating
// engine, but for the pilot's six emails it's overkill.

export function htmlLayout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en-JM">
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#111;max-width:600px;margin:0 auto;padding:24px;">
<h1 style="font-size:20px;color:#0a3d62;border-bottom:2px solid #0a3d62;padding-bottom:8px;">${escapeHtml(title)}</h1>
${body}
<hr style="margin-top:32px;border:none;border-top:1px solid #ddd;">
<p style="font-size:12px;color:#666;">Knox Community College — Placement &amp; Service Management System.</p>
</body></html>`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
