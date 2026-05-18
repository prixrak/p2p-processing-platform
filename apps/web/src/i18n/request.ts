import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import en from '../../messages/en.json';
import uk from '../../messages/uk.json';
import { routing } from './routing';

const messagesByLocale = {
  en,
  uk,
} as const;

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: messagesByLocale[locale as keyof typeof messagesByLocale],
  };
});
