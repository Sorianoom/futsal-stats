/**
 * Cliente HTTP de la API. El token de acceso vive solo en memoria; el de refresco, en una cookie
 * httpOnly que gestiona el navegador. Ante un 401 se renueva la sesión una sola vez.
 */

import { queryCache } from "@/lib/query-cache";

const DEV_API_URL = "http://localhost:8000";

/** En producción la URL es obligatoria y https: un export estático con localhost no sirve. */
function resolveApiUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (process.env.NODE_ENV !== "production") return configured || DEV_API_URL;
  if (!configured) throw new Error("Falta NEXT_PUBLIC_API_URL en el build de producción");
  if (!configured.startsWith("https://")) {
    throw new Error("NEXT_PUBLIC_API_URL debe usar https en producción");
  }
  return configured;
}

export const API_URL = resolveApiUrl();

const REFRESH_PATH = "/auth/refresh";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const SERVER_ERROR_FROM = 500;

/** El servidor no se pudo alcanzar o falló por su lado: reintentar o usar lo local tiene sentido. */
export function isUnreachable(failure: unknown): boolean {
  if (!(failure instanceof ApiError)) return false;
  return failure.code === "network" || failure.code === "bad_response" || failure.status >= SERVER_ERROR_FROM;
}

interface Envelope<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
}

interface RawResult<T> {
  status: number;
  envelope: Envelope<T>;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** UUID de la intención: repetir la petición con la misma clave no repite sus efectos. */
  idempotencyKey?: string;
  /** false para login y refresco: no se envía token ni se reintenta ante un 401. */
  auth?: boolean;
}

let accessToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;
let pendingRefresh: Promise<boolean> | null = null;
/** Sube cada vez que se borra el token, para descartar refrescos que empezaron antes. */
let sessionEpoch = 0;

export function setAccessToken(token: string | null): void {
  if (token === null) {
    sessionEpoch += 1;
    queryCache.clear(); // lo cacheado era de la sesión que se cierra
  }
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Se invoca cuando el servidor confirma que la sesión ya no es válida. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

function isEnvelope(value: unknown): value is Envelope<unknown> {
  return typeof value === "object" && value !== null && "success" in value;
}

async function rawRequest<T>(path: string, options: RequestOptions): Promise<RawResult<T>> {
  const { method = "GET", body, auth = true, idempotencyKey } = options;
  const headers = new Headers();
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (auth && accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "include",
    });
  } catch {
    throw new ApiError(0, "network", "Sin conexión con el servidor");
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new ApiError(response.status, "bad_response", "Respuesta no válida del servidor");
  }
  if (!isEnvelope(parsed)) {
    throw new ApiError(response.status, "bad_response", "Respuesta no válida del servidor");
  }
  return { status: response.status, envelope: parsed as Envelope<T> };
}

function toApiError<T>(result: RawResult<T>): ApiError {
  const { error } = result.envelope;
  return new ApiError(
    result.status,
    error?.code ?? "error",
    error?.message ?? "Error inesperado del servidor",
  );
}

async function requestRefresh(): Promise<boolean> {
  const epochAtStart = sessionEpoch;
  const result = await rawRequest<{ access_token: string }>(REFRESH_PATH, {
    method: "POST",
    auth: false,
  });
  // Solo un 401 es un rechazo de la sesión; un 429 o un 500 no significan que haya caducado.
  if (result.status === 401) return false;
  const data = result.envelope.data;
  if (!result.envelope.success || !data) throw toApiError(result);
  if (epochAtStart !== sessionEpoch) return false;
  accessToken = data.access_token;
  return true;
}

/**
 * Renueva el token de acceso con la cookie de refresco. Las llamadas simultáneas comparten una
 * sola petición. Devuelve false si el servidor rechaza la sesión (401); con cualquier otro fallo,
 * sin red incluido, lanza ApiError.
 */
export function refreshAccessToken(): Promise<boolean> {
  pendingRefresh ??= requestRefresh().finally(() => {
    pendingRefresh = null;
  });
  return pendingRefresh;
}

async function retryAfterUnauthorized<T>(
  path: string,
  options: RequestOptions,
  failed: RawResult<T>,
  tokenUsed: string | null,
): Promise<RawResult<T>> {
  const alreadyRenewed = accessToken !== null && accessToken !== tokenUsed;
  if (!alreadyRenewed && !(await refreshAccessToken())) {
    expireSession();
    throw toApiError(failed);
  }
  const retried = await rawRequest<T>(path, options);
  if (retried.status === 401) expireSession();
  return retried;
}

function expireSession(): void {
  setAccessToken(null);
  unauthorizedHandler?.();
}

export async function apiData<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const tokenUsed = accessToken;
  let result = await rawRequest<T>(path, options);
  const canRenew = options.auth !== false && path !== REFRESH_PATH;
  if (result.status === 401 && canRenew) {
    result = await retryAfterUnauthorized(path, options, result, tokenUsed);
  }
  if (!result.envelope.success) throw toApiError(result);
  return result.envelope.data as T;
}
