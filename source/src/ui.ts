import type { AppData } from './model';
export type Page = 'dashboard' | 'planner' | 'notes' | 'progress' | 'groups' | 'premium' | 'settings';
export const LOCALES = { en: 'en-GB', sk: 'sk-SK', cs: 'cs-CZ', de: 'de-DE', es: 'es-ES' };
export const kgToDisplay = (kg: number, data: AppData) =>
  data.settings.units === 'lb' ? kg * 2.2046226218 : kg;
export const displayToKg = (value: number, data: AppData) =>
  data.settings.units === 'lb' ? value / 2.2046226218 : value;
