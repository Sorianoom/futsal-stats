const SW_URL = "/sw.js";

/**
 * Registra el service worker. Devuelve false si el navegador no lo soporta o el registro falla:
 * es una mejora, y la app funciona igual (con red) sin él.
 */
export async function registerServiceWorker(nav: Navigator = navigator): Promise<boolean> {
  if (!("serviceWorker" in nav)) return false;
  try {
    await nav.serviceWorker.register(SW_URL);
    return true;
  } catch {
    return false;
  }
}

/**
 * Pide que el navegador no borre los datos del sitio (IndexedDB con las anotaciones sin enviar)
 * cuando le falte espacio. Safari solo lo concede a la app instalada en la pantalla de inicio.
 */
export async function requestPersistentStorage(nav: Navigator = navigator): Promise<boolean> {
  const storage = nav.storage;
  if (!storage || typeof storage.persist !== "function") return false;
  try {
    if (await storage.persisted()) return true;
    return await storage.persist();
  } catch {
    return false;
  }
}
