import { escapeHtml, htmlLayout } from './_layout.js';

export interface EvaluationReminderParams {
  full_name: string;
  student_name: string;
  evaluation_type: 'MIDTERM' | 'FINAL';
  due_date: string; // ISO date
  link: string;
  ttl_hours: number;
}

export function evaluationReminderTemplate(p: EvaluationReminderParams) {
  const which = p.evaluation_type === 'MIDTERM' ? 'midterm' : 'final';
  const subject = `Action required: ${which} evaluation for ${p.student_name}`;
  const text = `Hello ${p.full_name},

A ${which} evaluation for ${p.student_name} is due ${p.due_date}.

${p.link}

The link expires in ${p.ttl_hours} hours.

— Knox PSMS`;
  const html = htmlLayout(
    `${which.charAt(0).toUpperCase() + which.slice(1)} evaluation due`,
    `<p>Hello ${escapeHtml(p.full_name)},</p>
<p>A <strong>${escapeHtml(which)} evaluation</strong> for ${escapeHtml(p.student_name)} is due ${escapeHtml(p.due_date)}.</p>
<p><a href="${escapeHtml(p.link)}" style="display:inline-block;background:#0a3d62;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;">Submit evaluation</a></p>
<p style="font-size:14px;color:#444;">Link expires in ${p.ttl_hours} hours.</p>`,
  );
  return { subject, text, html };
}
