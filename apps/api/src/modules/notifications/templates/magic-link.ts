import { escapeHtml, htmlLayout } from './_layout.js';

export interface MagicLinkParams {
  full_name: string;
  purpose: 'ONBOARDING' | 'HOURS_APPROVAL' | 'EVALUATION_MIDTERM' | 'EVALUATION_FINAL';
  link: string;
  ttl_hours: number;
}

const PURPOSE_TEXT: Record<MagicLinkParams['purpose'], string> = {
  ONBOARDING: 'complete your supervisor onboarding',
  HOURS_APPROVAL: 'approve weekly service hours',
  EVALUATION_MIDTERM: 'submit a midterm evaluation',
  EVALUATION_FINAL: 'submit the final evaluation',
};

export function magicLinkTemplate(p: MagicLinkParams) {
  const action = PURPOSE_TEXT[p.purpose];
  const subject = `Knox PSMS — secure access link to ${action}`;
  const text = `Hello ${p.full_name},

You have been invited to ${action}. Use the secure link below within
${p.ttl_hours} hours. The link can only be used once.

${p.link}

If you did not expect this email, please disregard it.

— Knox PSMS`;
  const html = htmlLayout(
    'Secure access link',
    `<p>Hello ${escapeHtml(p.full_name)},</p>
<p>You have been invited to <strong>${escapeHtml(action)}</strong>.</p>
<p><a href="${escapeHtml(p.link)}" style="display:inline-block;background:#0a3d62;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;">Open the secure link</a></p>
<p style="font-size:14px;color:#444;">This link expires in ${p.ttl_hours} hours and can only be used once.</p>
<p style="font-size:12px;word-break:break-all;color:#888;">${escapeHtml(p.link)}</p>`,
  );
  return { subject, text, html };
}
