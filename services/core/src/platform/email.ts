import { Logger } from '@nestjs/common';
import type { EmailMessage, EmailProvider } from '@papperdash/contracts';

export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

/** Development adapter: prints emails to the log. Production uses the SES adapter (notifications block). */
export class LogEmailProvider implements EmailProvider {
  private readonly log = new Logger('Email');
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage) {
    this.sent.push(message);
    this.log.log(`To ${message.to}: ${message.subject}\n${message.text}`);
  }
}
