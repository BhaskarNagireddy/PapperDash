import { ButtonLink } from '@/components/ui/Button';
import { currentLocale, getMessages } from '@/i18n/dictionaries';

export default async function NotFound() {
  const [locale, t] = await Promise.all([currentLocale(), getMessages()]);
  return (
    <div className="page" style={{ display: 'grid', gap: 'var(--space-4)', paddingBlock: 'var(--space-8)' }}>
      <h1 className="title">{t.notFound.title}</h1>
      <p>{t.notFound.body}</p>
      <div>
        <ButtonLink href={`/${locale}`}>{t.notFound.back}</ButtonLink>
      </div>
    </div>
  );
}
