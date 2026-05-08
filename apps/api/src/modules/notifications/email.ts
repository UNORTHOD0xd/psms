// Pluggable mailer.
//
// Dev: SMTP via nodemailer pointed at Mailpit (docker-compose).
// Prod: SendGrid Web API (SENDGRID_API_KEY set).
//
// Templates are resolved by name to ./templates/*.ts and rendered with
// the params object. Each template exports a (params) → { subject, html, text }
// function. Templates are deliberately tiny — full styling lives in the
// transactional-email service if and when we move there.

import sgMail from '@sendgrid/mail';
import nodemailer from 'nodemailer';

import { loadEnv } from '../../lib/env.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';

import { renderTemplate, type TemplateName, type TemplateParams } from './templates/index.js';

export interface EmailOptions<T extends TemplateName> {
  to: string;
  subject: string;
  template: T;
  params: TemplateParams[T];
  // The recipient — set when we can map to a Knox or supervisor user.
  // When unset, we still send the email but skip the Notification row
  // (e.g. password-reset request when the email is unknown — see
  // auth/router.ts).
  user_id?: string;
  event_type?: string;
}

let smtpTransport: nodemailer.Transporter | null = null;
function getSmtp(): nodemailer.Transporter {
  if (smtpTransport) return smtpTransport;
  const env = loadEnv();
  smtpTransport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: false,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return smtpTransport;
}

export async function sendEmail<T extends TemplateName>(opts: EmailOptions<T>): Promise<void> {
  const env = loadEnv();
  const rendered = renderTemplate(opts.template, opts.params);
  const subject = opts.subject || rendered.subject;
  const from = `"${env.EMAIL_FROM_NAME}" <${env.EMAIL_FROM_ADDRESS}>`;

  // Persist a Notification row up front so delivery events can attach
  // to it later (PRC-07). The row is keyed only when we know the user;
  // emails to unknown recipients still send but bypass the inbox.
  let notification_id: string | null = null;
  if (opts.user_id) {
    const created = await prisma.notification.create({
      data: {
        user_id: opts.user_id,
        channel: 'EMAIL',
        event_type: opts.event_type ?? `email.${opts.template}`,
        subject,
        body_template: opts.template,
        body_params: opts.params as never,
        status: 'QUEUED',
      },
    });
    notification_id = created.notification_id;
  }

  try {
    let sendgrid_id: string | undefined;
    if (env.SENDGRID_API_KEY) {
      sgMail.setApiKey(env.SENDGRID_API_KEY);
      const [resp] = await sgMail.send({
        to: opts.to,
        from,
        subject,
        text: rendered.text,
        html: rendered.html,
      });
      sendgrid_id = resp.headers['x-message-id'] as string | undefined;
    } else {
      await getSmtp().sendMail({
        from,
        to: opts.to,
        subject,
        text: rendered.text,
        html: rendered.html,
      });
    }
    if (notification_id) {
      await prisma.notification.update({
        where: { notification_id },
        data: {
          status: 'SENT',
          sent_at: new Date(),
          ...(sendgrid_id ? { sendgrid_message_id: sendgrid_id } : {}),
        },
      });
    }
    logger.info({ template: opts.template, notification_id }, 'email sent');
  } catch (err) {
    logger.error({ err, template: opts.template, notification_id }, 'email send failed');
    if (notification_id) {
      await prisma.notification.update({
        where: { notification_id },
        data: {
          status: 'FAILED',
          failure_reason: err instanceof Error ? err.message.slice(0, 500) : String(err),
        },
      });
    }
    throw err;
  }
}
