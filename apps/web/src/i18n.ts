export type UiLanguage = "ko" | "en";

export function languageText<T>(language: UiLanguage, copy: { en: T; ko: T }): T {
  return copy[language];
}
