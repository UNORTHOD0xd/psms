// PRC-06 — QR code for the public verification page.

import QRCode from 'qrcode';

import { loadEnv } from '../../lib/env.js';

export function verifyUrl(certificate_id: string): string {
  const env = loadEnv();
  return `${env.PUBLIC_WEB_ORIGIN.replace(/\/$/, '')}/verify/${certificate_id}`;
}

export async function qrPng(certificate_id: string): Promise<Buffer> {
  return QRCode.toBuffer(verifyUrl(certificate_id), {
    errorCorrectionLevel: 'M',
    type: 'png',
    margin: 1,
    width: 240,
  });
}
