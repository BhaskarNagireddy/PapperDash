import ui from '@/components/ui/ui.module.css';

/**
 * The screen's one primary button. It stays focusable while sending (aria-disabled, not disabled), so keyboard
 * and screen-reader users keep their place; useSubmit ignores repeat presses.
 */
export function SubmitButton({ pending, label, sending }: { pending: boolean; label: string; sending: string }) {
  return (
    <button type="submit" className={`${ui.button} ${ui.primary}`} aria-disabled={pending || undefined}>
      {pending ? sending : label}
    </button>
  );
}
