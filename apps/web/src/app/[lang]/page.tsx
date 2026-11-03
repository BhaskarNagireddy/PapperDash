import { Card } from '@/components/ui/Card';
import { getMessages } from '@/i18n/dictionaries';
import styles from './home.module.css';

const STEPS = ['upload', 'configure', 'pay', 'collect'] as const;

export default async function HomePage() {
  const t = await getMessages();
  return (
    <div className="page">
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.dashLine} aria-hidden="true" />
        <h1 id="hero-title" className="display">
          {t.home.heroTitle}
        </h1>
        <p>{t.home.heroBody}</p>
        <p className={styles.soon}>{t.home.comingSoon}</p>
      </section>

      <section className={styles.how} aria-labelledby="how-title">
        <h2 id="how-title" className="title">
          {t.home.howTitle}
        </h2>
        <ol className={styles.steps}>
          {STEPS.map((key, i) => (
            <li key={key}>
              <Card className={styles.step}>
                <span className={`${styles.stepNumber} ${i === 0 ? styles.stepNumberCurrent : ''}`} aria-hidden="true">
                  {i + 1}
                </span>
                <h3 className="heading">{t.home.steps[key].title}</h3>
                <p className="muted">{t.home.steps[key].body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <p className={`${styles.privacy} small muted`}>{t.home.privacyNote}</p>
    </div>
  );
}
