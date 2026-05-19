/** Normalized bot username; prefers explicit value, then NEXT_PUBLIC env fallback. */
export function getTelegramBotUsername(explicit?: string | null): string | null {
  const raw = explicit?.trim() || process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.trim();
  if (!raw) return null;
  return raw.replace(/^@/, '');
}

/** Deep link to open the platform bot in Telegram; optional /start token for linking. */
export function getTelegramBotUrl(startToken?: string, botUsername?: string | null): string | null {
  const username = getTelegramBotUsername(botUsername);
  if (!username) return null;
  const base = `https://t.me/${username}`;
  if (!startToken) return base;
  return `${base}?start=${encodeURIComponent(startToken)}`;
}
