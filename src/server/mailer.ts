import nodemailer from 'nodemailer';

export interface EmailSendResult {
  sent: boolean;
  configured: boolean;
  provider: 'smtp' | 'resend' | 'none';
  messageId?: string;
  errorMessage?: string;
}

/**
 * Checks whether a real transactional email provider (SMTP or Resend API) is configured.
 */
export function isEmailServiceConfigured(): boolean {
  const smtpHost = (process.env.SMTP_HOST || '').trim();
  const resendKey = (process.env.RESEND_API_KEY || '').trim();
  return Boolean(smtpHost.length > 0 || resendKey.length > 0);
}

async function sendTransactionalEmail(params: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<EmailSendResult> {
  const smtpHost = (process.env.SMTP_HOST || '').trim();
  const resendKey = (process.env.RESEND_API_KEY || '').trim();
  const fromAddress = (process.env.SMTP_FROM || 'Darna Immobilier Maroc <no-reply@darna.ma>').trim();

  if (!smtpHost && !resendKey) {
    return {
      sent: false,
      configured: false,
      provider: 'none',
      errorMessage:
        "Aucun service d'envoi d'e-mails (SMTP_HOST ou RESEND_API_KEY) n'est configuré sur le serveur.",
    };
  }

  if (smtpHost) {
    try {
      const port = Number(process.env.SMTP_PORT) || 587;
      const secure =
        process.env.SMTP_SECURE === 'true' || port === 465;
      const smtpUser = (process.env.SMTP_USER || '').trim();
      const smtpPass = process.env.SMTP_PASS || '';

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port,
        secure,
        auth: smtpUser ? { user: smtpUser, pass: smtpPass } : undefined,
        connectionTimeout: 8000,
        greetingTimeout: 8000,
        socketTimeout: 10000,
        tls:
          smtpHost === '127.0.0.1' || smtpHost === 'localhost'
            ? { rejectUnauthorized: false }
            : undefined,
      });

      const info = await transporter.sendMail({
        from: fromAddress,
        to: params.to,
        subject: params.subject,
        text: params.text,
        html: params.html,
      });

      const acceptedCount = Array.isArray(info.accepted) ? info.accepted.length : 0;
      if (acceptedCount === 0) {
        return {
          sent: false,
          configured: true,
          provider: 'smtp',
          errorMessage: 'Le serveur SMTP a refusé le destinataire.',
        };
      }

      return {
        sent: true,
        configured: true,
        provider: 'smtp',
        messageId: info.messageId,
      };
    } catch (err: any) {
      return {
        sent: false,
        configured: true,
        provider: 'smtp',
        errorMessage: err?.message || "Erreur lors de l'envoi SMTP.",
      };
    }
  }

  // Fallback to Resend HTTP API if RESEND_API_KEY is configured
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [params.to],
        subject: params.subject,
        text: params.text,
        html: params.html,
      }),
    });
    const data = (await res.json()) as any;
    if (!res.ok || !data?.id) {
      return {
        sent: false,
        configured: true,
        provider: 'resend',
        errorMessage: data?.message || `Erreur API Resend (HTTP ${res.status}).`,
      };
    }
    return {
      sent: true,
      configured: true,
      provider: 'resend',
      messageId: String(data.id),
    };
  } catch (err: any) {
    return {
      sent: false,
      configured: true,
      provider: 'resend',
      errorMessage: err?.message || "Erreur réseau lors de l'appel à l'API d'e-mail.",
    };
  }
}

export async function sendEmailVerificationMessage(params: {
  toEmail: string;
  userName: string;
  verificationToken: string;
  magicLinkUrl?: string;
}): Promise<EmailSendResult> {
  const baseUrl = (
    process.env.APP_URL ||
    'https://ais-dev-y46ket62kvdjqfadnsiutg-79125794117.europe-west3.run.app'
  ).replace(/\/$/, '');
  const magicLink =
    params.magicLinkUrl ||
    `${baseUrl}/?verify_email=${encodeURIComponent(params.toEmail)}&code=${encodeURIComponent(
      params.verificationToken
    )}`;

  const subject = `Darna.ma — Votre code de vérification : ${params.verificationToken}`;
  const text = [
    `Bonjour ${params.userName},`,
    '',
    'Bienvenue sur Darna.ma ! Voici votre code de vérification à 6 chiffres (valable 15 minutes) :',
    '',
    `CODE_VERIFICATION: ${params.verificationToken}`,
    `JETON_VERIFICATION: ${params.verificationToken}`,
    '',
    'Vous pouvez également vérifier votre adresse e-mail en un clic grâce à ce lien magique :',
    `LIEN_MAGIQUE: ${magicLink}`,
    '',
    "Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet e-mail.",
  ].join('\n');

  const html = `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e7e5e4; border-radius: 16px;">
      <h2 style="color: #1E3D34; margin-top: 0;">Vérification de votre adresse e-mail Darna</h2>
      <p>Bonjour <strong>${params.userName}</strong>,</p>
      <p>Saisissez ce code à 6 chiffres dans les 6 cases de l'application (valable 15 minutes) :</p>
      <div style="background: #FAF7F2; border: 2px solid #C15C3D; padding: 18px; border-radius: 12px; font-family: monospace; font-size: 28px; font-weight: bold; letter-spacing: 8px; text-align: center; color: #1c1917;">
        ${params.verificationToken}
      </div>
      <p style="margin-top: 20px; margin-bottom: 12px;">Ou cliquez directement sur ce lien magique pour vérifier votre adresse instantanément :</p>
      <div style="text-align: center; margin: 16px 0;">
        <a href="${magicLink}" style="display: inline-block; background: #1E3D34; color: #ffffff; text-decoration: none; font-weight: bold; font-size: 14px; padding: 12px 24px; border-radius: 10px;">
          Vérifier mon adresse e-mail en 1 clic
        </a>
      </div>
      <p style="font-size: 12px; color: #57534e; margin-top: 16px;">
        Ce code à 6 chiffres et ce lien magique sont strictement personnels et à usage unique.
      </p>
    </div>
  `;

  return sendTransactionalEmail({
    to: params.toEmail,
    subject,
    text,
    html,
  });
}

export async function sendPasswordResetMessage(params: {
  toEmail: string;
  userName: string;
  resetToken: string;
}): Promise<EmailSendResult> {
  const subject = 'Darna.ma — Code de réinitialisation de votre mot de passe';
  const text = [
    `Bonjour ${params.userName},`,
    '',
    'Vous avez demandé la réinitialisation de votre mot de passe sur Darna.ma.',
    'Voici votre jeton de sécurité à usage unique (valable 15 minutes) :',
    '',
    `JETON_RESET: ${params.resetToken}`,
    '',
    "Si vous n'êtes pas à l'origine de cette demande, aucune modification ne sera effectuée sur votre compte.",
  ].join('\n');

  const html = `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e7e5e4; border-radius: 16px;">
      <h2 style="color: #C15C3D; margin-top: 0;">Réinitialisation de votre mot de passe Darna</h2>
      <p>Bonjour <strong>${params.userName}</strong>,</p>
      <p>Voici votre jeton de sécurité à usage unique (valable 15 minutes) pour choisir un nouveau mot de passe :</p>
      <div style="background: #FAF7F2; border: 1px solid #C15C3D; padding: 14px; border-radius: 10px; font-family: monospace; font-size: 15px; font-weight: bold; color: #1c1917; word-break: break-all;">
        ${params.resetToken}
      </div>
      <p style="font-size: 12px; color: #57534e; margin-top: 16px;">
        Si vous n'avez pas demandé cette réinitialisation, vous pouvez ignorer cet e-mail en toute sécurité.
      </p>
    </div>
  `;

  return sendTransactionalEmail({
    to: params.toEmail,
    subject,
    text,
    html,
  });
}
