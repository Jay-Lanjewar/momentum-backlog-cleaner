const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

interface ApiResponse<T> {
  data: T;
  error: string | null;
}

function getSessionToken(): string | null {
  try {
    const url = import.meta.env.VITE_SUPABASE_URL || "";
    const ref = url.replace("https://", "").split(".")[0];
    if (!ref) return null;
    const raw = localStorage.getItem(`sb-${ref}-auth-token`);
    if (raw) {
      const session = JSON.parse(raw);
      return session?.access_token || null;
    }
  } catch {
    // ignore
  }
  return null;
}

async function request<T>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const url = `${API_BASE}${endpoint}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const token = getSessionToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      headers,
      ...options,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let detail = errorBody || response.statusText;
      try {
        const parsed = JSON.parse(errorBody);
        detail = parsed.detail || detail;
      } catch {
        // use raw text
      }
      return { data: null as T, error: detail };
    }

    const data = await response.json();
    return { data, error: null };
  } catch (error) {
    return {
      data: null as T,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint),
  post: <T>(endpoint: string, body: unknown) =>
    request<T>(endpoint, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  put: <T>(endpoint: string, body: unknown) =>
    request<T>(endpoint, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  delete: <T>(endpoint: string) =>
    request<T>(endpoint, {
      method: "DELETE",
    }),
};
