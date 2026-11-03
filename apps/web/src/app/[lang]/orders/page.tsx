import { OrdersList } from '@/components/orders/OrdersList';
import { AccountPage } from '@/components/site/AccountPage';
import { currentLocale, getMessages } from '@/i18n/dictionaries';
import { pageMetadata } from '@/i18n/metadata';

export const generateMetadata = () => pageMetadata('orders', (t) => t.orders.title, { index: false });

export default async function Page() {
  const [locale, t] = await Promise.all([currentLocale(), getMessages()]);
  return (
    <AccountPage title={t.orders.title}>
      <OrdersList locale={locale} t={{ orders: t.orders, account: t.account, errors: t.errors }} />
    </AccountPage>
  );
}
