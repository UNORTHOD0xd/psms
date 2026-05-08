import { escapeHtml, htmlLayout } from './_layout.js';

export interface ApplicationDecisionParams {
  student_name: string;
  opportunity_title: string;
  organisation_name: string;
  decision: 'APPROVE' | 'DECLINE';
  decline_reason?: string;
  next_steps_url: string;
}

export function applicationDecisionTemplate(p: ApplicationDecisionParams) {
  const approved = p.decision === 'APPROVE';
  const subject = approved
    ? `Application approved — ${p.opportunity_title}`
    : `Application update — ${p.opportunity_title}`;
  const headline = approved
    ? `Your application for "${p.opportunity_title}" with ${p.organisation_name} has been approved.`
    : `Your application for "${p.opportunity_title}" has not been approved at this time.`;
  const text = `Hello ${p.student_name},

${headline}
${approved ? '\nThe placement has been created. Your supervisor will be in touch shortly.' : p.decline_reason ? `\nReason from the coordinator: ${p.decline_reason}` : ''}

${p.next_steps_url}

— Knox PSMS`;
  const html = htmlLayout(
    approved ? 'Application approved' : 'Application update',
    `<p>Hello ${escapeHtml(p.student_name)},</p>
<p>${escapeHtml(headline)}</p>
${approved ? '<p>The placement has been created. Your supervisor will be in touch shortly.</p>' : p.decline_reason ? `<p style="background:#fff5f5;border-left:3px solid #c0392b;padding:8px 12px;">${escapeHtml(p.decline_reason)}</p>` : ''}
<p><a href="${escapeHtml(p.next_steps_url)}" style="color:#0a3d62;">View in PSMS</a></p>`,
  );
  return { subject, text, html };
}
