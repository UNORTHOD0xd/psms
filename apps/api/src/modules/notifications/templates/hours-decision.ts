import { escapeHtml, htmlLayout } from './_layout.js';

export interface HoursDecisionParams {
  student_name: string;
  week_number: number;
  hours: number;
  decision: 'APPROVE' | 'REJECT';
  rejection_comment?: string;
  next_steps_url: string;
}

export function hoursDecisionTemplate(p: HoursDecisionParams) {
  const approved = p.decision === 'APPROVE';
  const subject = approved
    ? `Week ${p.week_number} hours approved (${p.hours}h)`
    : `Week ${p.week_number} hours need attention`;
  const headline = approved
    ? `Your supervisor approved ${p.hours} hours for week ${p.week_number}.`
    : `Your supervisor returned your week ${p.week_number} hours log for revision.`;
  const text = `Hello ${p.student_name},

${headline}
${!approved && p.rejection_comment ? `\nComment: ${p.rejection_comment}` : ''}

${p.next_steps_url}

— Knox PSMS`;
  const html = htmlLayout(
    approved ? 'Hours approved' : 'Hours need revision',
    `<p>Hello ${escapeHtml(p.student_name)},</p>
<p>${escapeHtml(headline)}</p>
${!approved && p.rejection_comment ? `<p style="background:#fff5f5;border-left:3px solid #c0392b;padding:8px 12px;">${escapeHtml(p.rejection_comment)}</p>` : ''}
<p><a href="${escapeHtml(p.next_steps_url)}" style="color:#0a3d62;">View ledger</a></p>`,
  );
  return { subject, text, html };
}
