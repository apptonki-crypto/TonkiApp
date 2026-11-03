import { readJsonSafely } from "src/lib/api/readJsonSafely";

export type SessionFetchError = {
  ok: false;
  error: string;
  unauthorized?: true;
};

export type SessionFetchResult<T> =
  | { ok: true; data: T }
  | SessionFetchError;

/**
 * Cookie-authenticated JSON fetch used by admin/feed clients.
 * Handles 401, invalid JSON, HTTP errors, and network failures in one place.
 */
export async function fetchSessionJson<T>(
  url: string,
  opts: {
    networkErrorMessage: string;
    method?: string;
    headers?: HeadersInit;
    body?: BodyInit | null;
    parse: (body: unknown) => T | null;
    invalidFormatMessage?: string;
  }
): Promise<SessionFetchResult<T>> {
  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      credentials: "include",
      cache: "no-store",
      headers: opts.headers,
      body: opts.body,
    });

    if (res.status === 401) {
      return { ok: false, error: "No autenticado", unauthorized: true };
    }

    const body = await readJsonSafely(res);
    if (body === null) {
      return { ok: false, error: "Respuesta inválida del servidor" };
    }

    if (!res.ok) {
      const err = body as { error?: string };
      return { ok: false, error: err.error || `Error ${res.status}` };
    }

    const data = opts.parse(body);
    if (data === null) {
      return {
        ok: false,
        error: opts.invalidFormatMessage ?? "Formato de datos inesperado",
      };
    }

    return { ok: true, data };
  } catch {
    return { ok: false, error: opts.networkErrorMessage };
  }
}
