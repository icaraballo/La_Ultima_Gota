// La app de Android (Capacitor, app-android/): la web es el único original y en la app solo se usan
// dos plugins, que se llaman por `window.Capacitor.Plugins` (sin importarlos, igual que en La Colmena
// y Chromalchemy). Sin `window.Capacitor`, la web va exactamente igual que antes.

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  Plugins?: Record<string, unknown>;
}
const cap = (): CapacitorGlobal | undefined =>
  typeof window === 'undefined' ? undefined : (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;

/** ¿Está corriendo dentro de la app de Android? */
export const enApp = (): boolean => {
  try { return !!cap()?.isNativePlatform?.(); } catch { return false; }
};

/** Un plugin de Capacitor, o null si no es la app (o no está el plugin). */
export function plugin<T>(nombre: string): T | null {
  try { return enApp() ? ((cap()?.Plugins?.[nombre] as T | undefined) ?? null) : null; } catch { return null; }
}

export interface PluginApp {
  addListener(evento: 'backButton', f: () => void): unknown;
  exitApp(): unknown;
}
export interface PluginHaptics { vibrate(o: { duration: number }): Promise<unknown> }
