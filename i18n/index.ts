import ro from './ro.json';

const translations: Record<string, string> = ro;

export function t(key: string): string {
  return translations[key] ?? key;
}

export function useTranslation() {
  return { t };
}
