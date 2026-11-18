import { Capacitor, registerPlugin } from '@capacitor/core';

type Appearance = 'dark' | 'light';
const GymAppearance = registerPlugin<{
  setAppearance(options: { appearance: Appearance }): Promise<void>;
}>('GymAppearance');

declare global {
  interface Window {
    gymAppearance?: { set(appearance: Appearance): Promise<void> };
  }
}

/** Keep native window and system bars in sync with the app's saved preference. */
export async function applyNativeAppearance(appearance: Appearance): Promise<void> {
  if (Capacitor.isNativePlatform()) await GymAppearance.setAppearance({ appearance });
  else if (window.gymAppearance) await window.gymAppearance.set(appearance);
}
