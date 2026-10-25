/** Un nombre de host sin esquema, puerto ni ruta (lo que entrega Vercel en `VERCEL_URL`). */
const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

type BuildEnv = Readonly<Record<string, string | undefined>>;

/**
 * URL de la API para una vista previa de Vercel. Cada vista previa tiene su propia dirección y el
 * backend va en el mismo dominio bajo `/api` (vercel.json); la CSP solo permite llamar al propio
 * origen, así que una URL fija apuntando a otro sitio no serviría. Solo se propone un valor si no
 * hay uno configurado a mano y el despliegue es una vista previa; en producción sigue siendo
 * obligatorio configurarla.
 */
export function previewApiUrl(env: BuildEnv): string | undefined {
  if (env.NEXT_PUBLIC_API_URL) return undefined;
  if (env.VERCEL_ENV !== "preview") return undefined;
  const host = env.VERCEL_URL?.trim();
  if (!host || !HOSTNAME.test(host)) return undefined;
  return `https://${host}/api`;
}
