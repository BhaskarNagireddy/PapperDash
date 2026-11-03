import { notFound } from 'next/navigation';

// Any path under /sv or /en that no page matches: render [lang]/not-found.tsx, in the visitor's language.
export const dynamicParams = true;

export default function Missing(): never {
  notFound();
}
