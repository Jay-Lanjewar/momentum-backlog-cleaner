import { supabase } from "./supabase";
import { API_BASE_URL } from "./constants";

interface ApiResponse<T> {
  data: T;
  error: string | null;
  errorCode: string | null;
}

async function getSessionToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  try {
    const token = await getSessionToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) ?? {}),
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorBody: string | null = null;
      let errorCode: string | null = null;
      try {
        const body = await response.json();
        if (typeof body === "string") {
          errorBody = body;
        } else if (body.detail) {
          if (typeof body.detail === "string") {
            errorBody = body.detail;
          } else if (body.detail.message) {
            errorBody = body.detail.message;
            errorCode = body.detail.code ?? null;
          }
        } else if (body.message) {
          errorBody = body.message;
        }
      } catch {
        errorBody = `HTTP ${response.status}`;
      }
      return { data: null as unknown as T, error: errorBody, errorCode };
    }

    const data = await response.json();
    return { data, error: null, errorCode: null };
  } catch {
    return { data: null as unknown as T, error: "Network error", errorCode: null };
  }
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint),
  post: <T>(endpoint: string, body: unknown) =>
    request<T>(endpoint, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(endpoint: string, body: unknown) =>
    request<T>(endpoint, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(endpoint: string) =>
    request<T>(endpoint, { method: "DELETE" }),
};
