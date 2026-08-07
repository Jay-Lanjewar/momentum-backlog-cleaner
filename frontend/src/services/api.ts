const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

interface ApiResponse<T> {
  data: T;
  error: string | null;
  errorCode: string | null;
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
      let detail: string = errorBody || response.statusText;
      let errorCode: string | null = null;
      try {
        const parsed = JSON.parse(errorBody);
        const d = parsed?.detail;
        if (typeof d === "string") {
          detail = d;
        } else if (d && typeof d === "object") {
          detail = typeof d.message === "string" ? d.message : detail;
          errorCode = typeof d.code === "string" ? d.code : errorCode;
        } else if (parsed && typeof parsed.message === "string") {
          detail = parsed.message;
        }
      } catch {
        // use raw text
      }
      return { data: null as T, error: detail, errorCode };
    }

    const data = await response.json();
    return { data, error: null, errorCode: null };
  } catch (error) {
    return {
      data: null as T,
      error: error instanceof Error ? error.message : "Network error",
      errorCode: null,
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
