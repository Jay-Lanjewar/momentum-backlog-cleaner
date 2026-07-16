const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

interface ApiResponse<T> {
  data: T;
  error: string | null;
}

async function request<T>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const url = `${API_BASE}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
      },
      ...options,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      return { data: null as T, error: errorBody || response.statusText };
    }

    const data = await response.json();
    return { data, error: null };
  } catch (error) {
    return {
      data: null as T,
      error: error instanceof Error ? error.message : "Unknown error",
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
