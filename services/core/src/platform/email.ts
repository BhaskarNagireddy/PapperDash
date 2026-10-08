import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { Logger } from '@nestjs/common';
import type { EmailMessage, EmailProvider } from '@papperdash/contracts';

export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

/**
 * Development adapter: prints emails, links included, to the log so they can be clicked locally.
 * Never used in production: loadConfig refuses to start there without SES.
 */
export class LogEmailProvider implements EmailProvider {
  private readonly log = new Logger('Email');
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage) {
    this.sent.push(message);
    this.log.log(`To ${message.to}: ${message.subject}\n${message.text}`);
  }
}

/** Amazon SES (eu-north-1). Sends plain-text account emails; the notifications block will add HTML templates. */
export class SesEmailProvider implements EmailProvider {
  constructor(
    private readonly from: string,
    private readonly client: Pick<SESv2Client, 'send'>,
  ) {}

  static create(settings: { from: string; region: string }): SesEmailProvider {
    return new SesEmailProvider(settings.from, new SESv2Client({ region: settings.region }));
  }

  async send(message: EmailMessage) {
    await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.from,
        Destination: { ToAddresses: [message.to] },
        Content: {
          Simple: {
            Subject: { Data: message.subject, Charset: 'UTF-8' },
            Body: { Text: { Data: message.text, Charset: 'UTF-8' }, ...(message.html ? { Html: { Data: message.html, Charset: 'UTF-8' } } : {}) },
          },
        },
      }),
    );
  }
}
