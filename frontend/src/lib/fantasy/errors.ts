import { ApiError } from "@/lib/api/client";

const CLIENT_ERROR_FROM = 400;
const SERVER_ERROR_FROM = 500;

/**
 * Mensaje para una acción del Fantasy que falló. Un rechazo del servidor (4xx: puja baja, sin
 * saldo, plantilla llena…) trae su propio mensaje en español; un corte o un fallo del servidor, no.
 */
export function actionErrorMessage(failure: unknown, fallback: string): string {
  if (!(failure instanceof ApiError)) return fallback;
  const rejected = failure.status >= CLIENT_ERROR_FROM && failure.status < SERVER_ERROR_FROM;
  return rejected && failure.message ? failure.message : fallback;
}
