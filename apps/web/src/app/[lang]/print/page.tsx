import { PrintFlow } from '@/components/print/PrintFlow';
import { currentLocale, getMessages } from '@/i18n/dictionaries';
import { pageMetadata } from '@/i18n/metadata';

export const generateMetadata = () => pageMetadata('print', (t) => t.print.title, { index: false });

export default async function Page() {
  const [locale, t] = await Promise.all([currentLocale(), getMessages()]);
  return (
    <div className="page">
      <div style={{ display: 'grid', gap: 'var(--space-4)', maxWidth: '44rem', marginInline: 'auto', paddingBlock: 'var(--space-8)' }}>
        <h1 className="title">{t.print.title}</h1>
        <p>{t.print.intro}</p>
        <PrintFlow locale={locale} t={{ print: t.print, rejections: t.rejections, errors: t.errors, form: t.form }} />
      </div>
    </div>
  );
}
