import { SendEmailCommand } from '@aws-sdk/client-sesv2';
import { describe, expect, it } from 'vitest';
import { SesEmailProvider } from './email.js';

describe('SesEmailProvider', () => {
  it('sends one plain-text UTF-8 email from the configured sender', async () => {
    const sent: SendEmailCommand[] = [];
    const ses = new SesEmailProvider('PapperDash <no-reply@papperdash.se>', { send: async (cmd: unknown) => void sent.push(cmd as SendEmailCommand) } as never);
    await ses.send({ to: 'anna@example.se', subject: 'Bekräfta din e-post', text: 'Hej!' });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.input).toEqual({
      FromEmailAddress: 'PapperDash <no-reply@papperdash.se>',
      Destination: { ToAddresses: ['anna@example.se'] },
      Content: { Simple: { Subject: { Data: 'Bekräfta din e-post', Charset: 'UTF-8' }, Body: { Text: { Data: 'Hej!', Charset: 'UTF-8' } } } },
    });
  });
});
