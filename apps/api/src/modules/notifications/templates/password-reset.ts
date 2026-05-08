import { escapeHtml, htmlLayout } from './_layout.js';

export interface PasswordResetParams {
  full_name: string;
  reset_url: string;
  ttl_hours: number;
}

export function passwordResetTemplate(p: PasswordResetParams) {
  const subject = 'Reset your Knox PSMS password';
  const text = `Hello ${p.full_name},

We received a request to reset your Knox PSMS password. Open the link below
within ${p.ttl_hours} hour(s) to set a new one.

${p.reset_url}

If you did not request this reset, you can safely ignore this email — your
password will not change.

— Knox PSMS`;
  const html = htmlLayout(
    'Reset your password',
    `<p>Hello ${escapeHtml(p.full_name)},</p>
<p>We received a request to reset your Knox PSMS password.</p>
<p><a href="${escapeHtml(p.reset_url)}" style="display:inline-block;background:#0a3d62;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;">Reset password</a></p>
<p style="font-size:14px;color:#444;">This link expires in ${p.ttl_hours} hour(s).</p>`,
  );
  return { subject, text, html };
}
