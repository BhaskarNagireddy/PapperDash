import { LeaveWaitlist } from '@/components/forms/LeaveWaitlist';
import { AccountPage } from '@/components/site/AccountPage';
import { getMessages } from '@/i18n/dictionaries';
import { pageMetadata } from '@/i18n/metadata';

export const generateMetadata = () => pageMetadata('waitlist/leave', (t) => t.waitlistLeave.title, { index: false });

export default async function Page() {
  const t = await getMessages();
  return (
    <AccountPage title={t.waitlistLeave.title}>
      <LeaveWaitlist t={{ waitlistLeave: t.waitlistLeave, form: t.form, errors: t.errors }} />
    </AccountPage>
  );
}
