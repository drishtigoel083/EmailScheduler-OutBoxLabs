import nodemailer, { Transporter } from 'nodemailer';
import { config } from '../config/index.js';

let transporterPromise: Promise<Transporter> | null = null;

export async function getEmailTransporter(): Promise<Transporter> {
  if (transporterPromise) {
    return transporterPromise;
  }

  transporterPromise = (async () => {
    // If credentials are present in env, use them
    if (config.ethereal.email && config.ethereal.password) {
      return nodemailer.createTransport({
        host: config.ethereal.host,
        port: config.ethereal.port,
        secure: false,
        auth: {
          user: config.ethereal.email,
          pass: config.ethereal.password,
        },
      });
    }

    // Auto-generate test account on Ethereal Email
    console.log('✉️  No Ethereal credentials provided in env. Generating automatic Ethereal test account...');
    const testAccount = await nodemailer.createTestAccount();
    console.log(`✅ Ethereal Test Account generated: User=${testAccount.user}`);

    return nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
  })();

  return transporterPromise;
}

export interface SendEmailPayload {
  from: string;
  to: string;
  subject: string;
  html: string;
}

export interface SendEmailResult {
  messageId: string;
  previewUrl: string | false;
}

export async function sendEmailViaEthereal(payload: SendEmailPayload): Promise<SendEmailResult> {

  const transporter = await getEmailTransporter();

  await transporter.verify();
  console.log('✅ SMTP connection verified');
  
  const info = await transporter.sendMail({
    from: payload.from,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) {
    console.log(`🔗 Ethereal Email Preview URL: ${previewUrl}`);
  }

  return {
    messageId: info.messageId,
    previewUrl,
  };
}
