// Email template registry. Each template is a pure function from params to
// rendered subject/text/html — no I/O, no globals, no clocks.

import { magicLinkTemplate, type MagicLinkParams } from './magic-link.js';
import { passwordResetTemplate, type PasswordResetParams } from './password-reset.js';
import { applicationDecisionTemplate, type ApplicationDecisionParams } from './application-decision.js';
import { hoursDecisionTemplate, type HoursDecisionParams } from './hours-decision.js';
import { evaluationReminderTemplate, type EvaluationReminderParams } from './evaluation-reminder.js';
import { certificateIssuedTemplate, type CertificateIssuedParams } from './certificate-issued.js';

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export interface TemplateParams {
  'magic-link': MagicLinkParams;
  'password-reset': PasswordResetParams;
  'application-decision': ApplicationDecisionParams;
  'hours-decision': HoursDecisionParams;
  'evaluation-reminder': EvaluationReminderParams;
  'certificate-issued': CertificateIssuedParams;
}

export type TemplateName = keyof TemplateParams;

export function renderTemplate<T extends TemplateName>(
  name: T,
  params: TemplateParams[T],
): RenderedEmail {
  switch (name) {
    case 'magic-link':
      return magicLinkTemplate(params as MagicLinkParams);
    case 'password-reset':
      return passwordResetTemplate(params as PasswordResetParams);
    case 'application-decision':
      return applicationDecisionTemplate(params as ApplicationDecisionParams);
    case 'hours-decision':
      return hoursDecisionTemplate(params as HoursDecisionParams);
    case 'evaluation-reminder':
      return evaluationReminderTemplate(params as EvaluationReminderParams);
    case 'certificate-issued':
      return certificateIssuedTemplate(params as CertificateIssuedParams);
    default: {
      const _exhaustive: never = name;
      throw new Error(`Unknown template: ${_exhaustive as string}`);
    }
  }
}
