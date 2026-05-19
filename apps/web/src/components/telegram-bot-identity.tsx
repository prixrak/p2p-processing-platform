import { ExternalLink } from 'lucide-react';
import { getTelegramBotUrl, getTelegramBotUsername } from '@/lib/telegram-bot';
import { cn } from '@/lib/utils';

interface TelegramBotIdentityProps {
  label: string;
  notConfiguredHint: string;
  /** From API settings when available; falls back to NEXT_PUBLIC env. */
  username?: string | null;
  className?: string;
}

/** Shows which Telegram bot this deployment uses (public username + link). */
export function TelegramBotIdentity({
  label,
  notConfiguredHint,
  username,
  className,
}: TelegramBotIdentityProps) {
  const resolvedUsername = getTelegramBotUsername(username);
  const url = getTelegramBotUrl(undefined, resolvedUsername);

  if (!resolvedUsername || !url) {
    return <p className={cn('text-xs text-accent-yellow', className)}>{notConfiguredHint}</p>;
  }

  return (
    <div className={cn('space-y-0.5', className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-blue hover:underline"
      >
        t.me/{resolvedUsername}
        <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
      </a>
    </div>
  );
}
