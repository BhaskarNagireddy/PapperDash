import type { Metadata } from 'next';
import { OrderDetails } from '@/components/orders/OrderDetails';
import { currentLocale, getMessages } from '@/i18n/dictionaries';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getMessages();
  return { title: `${t.order.status} — PapperDash`, robots: { index: false, follow: false } };
}

/** Rendered per request: order IDs are not known at build time. The order itself is fetched by the browser. */
export default async function Page({ params }: PageProps<'/[lang]/orders/[id]'>) {
  const [{ id }, locale, t] = await Promise.all([params, currentLocale(), getMessages()]);
  return (
    <div className="page">
      <OrderDetails locale={locale} id={id} t={{ order: t.order, print: t.print, errors: t.errors }} />
    </div>
  );
}
