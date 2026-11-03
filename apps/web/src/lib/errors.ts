import type { Messages } from '@/i18n/en';
import { ApiError } from './api';

export type FieldErrors = Partial<Record<string, string>>;
export interface FormError {
  /** One message for the whole form, shown above the button. */
  form?: string;
  /** Messages per field name. */
  fields: FieldErrors;
}

type Errors = Messages['errors'];

/** Field messages in the visitor's language. The server's zod messages are English and technical. */
const FIELD_MESSAGES: Record<string, keyof Errors> = {
  email: 'invalidEmail',
  password: 'passwordTooShort',
  consent: 'consentRequired',
  postcode: 'invalidPostcode',
  'settings.pageRange': 'invalidPageRange',
  pageRange: 'invalidPageRange',
};

export function fieldErrors(issues: ReadonlyArray<{ path: string }>, t: Errors): FieldErrors {
  const out: FieldErrors = {};
  for (const { path } of issues) {
    const key = FIELD_MESSAGES[path];
    out[path] ??= key ? t[key] : t.generic;
  }
  return out;
}

/** Checks a form with the same contract the server uses, so both sides always agree on what is valid. */
/** The part of a zod schema used here; keeps the website from needing its own copy of zod. */
interface Schema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }> } };
}

export function validate<T>(schema: Schema<T>, value: unknown, t: Errors): { ok: true; data: T } | { ok: false; error: FormError } {
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, error: { form: t.formHasErrors, fields: fieldErrors(result.error.issues.map((i) => ({ path: i.path.map(String).join('.') })), t) } };
}

/** Turns any failure into a message the customer can act on, in their language. */
export function toFormError(err: unknown, t: Errors): FormError {
  if (!(err instanceof ApiError)) return { form: t.generic, fields: {} };
  switch (err.code) {
    case 'network':
      return { form: t.network, fields: {} };
    case 'email_taken':
      return { form: t.emailTaken, fields: {} };
    case 'invalid_credentials':
      return { form: t.invalidCredentials, fields: {} };
    case 'too_many_attempts':
      return { form: t.tooManyAttempts, fields: {} };
    case 'rate_limited':
      return { form: t.rateLimited, fields: {} };
    case 'link_expired':
      return { form: t.linkExpired, fields: {} };
    case 'too_large':
      return { form: fill(t.tooLarge, { mb: String(err.details.maxFileMb ?? 50) }), fields: {} };
    case 'too_many_pages':
      return { form: fill(t.tooManyPages, { max: String(err.details.maxPages ?? 50) }), fields: {} };
    case 'invalid_page_range':
      return { form: t.invalidPageRange, fields: { pageRange: t.invalidPageRange } };
    case 'colour_unavailable':
      return { form: t.colourUnavailable, fields: {} };
    case 'station_unavailable':
      return { form: t.stationUnavailable, fields: {} };
    case 'no_lockers':
      return { form: t.noLockers, fields: {} };
    case 'upload_missing':
    case 'upload_failed':
      return { form: t.uploadFailed, fields: {} };
    case 'processing_slow':
      return { form: t.processingSlow, fields: {} };
    case 'document_not_found':
      return { form: t.documentGone, fields: {} };
    case 'email_not_verified':
      return { form: t.emailNotVerified, fields: {} };
    case 'ordering_closed':
      return { form: t.orderingClosed, fields: {} };
    case 'validation_failed':
      return { form: t.formHasErrors, fields: fieldErrors(err.issues ?? [], t) };
    default:
      return { form: t.generic, fields: {} };
  }
}

/** "{email}" placeholders in messages. */
export const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);
