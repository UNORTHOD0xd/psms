import { escapeHtml, htmlLayout } from './_layout.js';

export interface CertificateIssuedParams {
  student_name: string;
  organisation_name: string;
  pdf_url: string;
  verify_url: string;
}

export function certificateIssuedTemplate(p: CertificateIssuedParams) {
  const subject = `Your Knox PSMS completion certificate is ready`;
  const text = `Hello ${p.student_name},

Congratulations on completing your placement with ${p.organisation_name}.

Your signed certificate is available here:
${p.pdf_url}

Employers can verify the certificate at:
${p.verify_url}

— Knox PSMS`;
  const html = htmlLayout(
    'Certificate issued',
    `<p>Hello ${escapeHtml(p.student_name)},</p>
<p>Congratulations on completing your placement with <strong>${escapeHtml(p.organisation_name)}</strong>.</p>
<p><a href="${escapeHtml(p.pdf_url)}" style="display:inline-block;background:#0a3d62;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;">Download certificate (PDF)</a></p>
<p>Employers can verify your certificate at <a href="${escapeHtml(p.verify_url)}">${escapeHtml(p.verify_url)}</a>.</p>`,
  );
  return { subject, text, html };
}
