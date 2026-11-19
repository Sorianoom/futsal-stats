import { vi } from "vitest";

const NO_CONTENT = 204;

export interface MockRequest {
  method: string;
  path: string;
  body: unknown;
  headers: Headers;
}

export interface MockReply {
  status?: number;
  data?: unknown;
  error?: { code: string; message: string };
  meta?: unknown;
}

export type MockHandler = MockReply | ((request: MockRequest) => MockReply);

export interface MockApi {
  calls: MockRequest[];
  count(method: string, path: string): number;
}

function envelope(reply: MockReply) {
  const failed = reply.error !== undefined;
  return {
    success: !failed,
    data: failed ? null : (reply.data ?? null),
    error: reply.error ?? null,
    meta: reply.meta ?? null,
  };
}

function pathOf(url: string): string {
  const { pathname, search } = new URL(url);
  return pathname + search;
}

/** Sustituye `fetch` por un servidor simulado. Las rutas son "MÉTODO /ruta" (sin la consulta). */
export function mockApi(routes: Record<string, MockHandler>): MockApi {
  const calls: MockRequest[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();
      const fullPath = pathOf(String(input));
      const path = fullPath.split("?")[0];
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      const request: MockRequest = {
        method,
        path: fullPath,
        body,
        headers: new Headers(init?.headers),
      };
      calls.push(request);

      const handler = routes[`${method} ${path}`] ?? routes[`${method} ${fullPath}`];
      const reply: MockReply = handler
        ? typeof handler === "function"
          ? handler(request)
          : handler
        : { status: 404, error: { code: "not_found", message: "Ruta no simulada" } };
      const status = reply.status ?? (reply.error ? 400 : 200);
      if (status === NO_CONTENT) return new Response(null, { status });
      return new Response(JSON.stringify(envelope(reply)), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );

  return {
    calls,
    count: (method, path) =>
      calls.filter((c) => c.method === method.toUpperCase() && c.path.split("?")[0] === path)
        .length,
  };
}
