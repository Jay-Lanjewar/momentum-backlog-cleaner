import { api, DEVICE_TIMEZONE_HEADER } from "../lib/api";

// Mock fetch globally
const mockFetch = jest.fn() as jest.Mock;
(globalThis as Record<string, unknown>).fetch = mockFetch;

// Mock supabase
jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { access_token: "test-token" } },
      }),
    },
  },
}));

beforeEach(() => {
  mockFetch.mockReset();
});

describe("api client", () => {
  it("sends GET request with auth header", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { test: true } }),
    });

    const result = await api.get("/api/v1/test");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v1/test");
    expect(opts.headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      }),
    );
    expect(result.data).toEqual({ data: { test: true } });
    expect(result.error).toBeNull();
  });

  it("sends POST request with body and method", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { id: 1 } }),
    });

    const result = await api.post("/api/v1/test", { name: "hello" });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("/api/v1/test");
    expect(opts.method).toBe("POST");
    expect(opts.body).toBe(JSON.stringify({ name: "hello" }));
    expect(result.data).toEqual({ data: { id: 1 } });
  });

  it("returns error on non-ok response with detail string", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ detail: "Unauthorized" }),
    });

    const result = await api.get("/api/v1/protected");

    expect(result.error).toBe("Unauthorized");
    expect(result.data).toBeNull();
  });

  it("returns error on non-ok response with detail object", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({
        detail: { message: "Forbidden", code: "forbidden" },
      }),
    });

    const result = await api.get("/api/v1/protected");

    expect(result.error).toBe("Forbidden");
    expect(result.errorCode).toBe("forbidden");
  });

  it("returns network error on fetch failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network failure"));

    const result = await api.get("/api/v1/test");

    expect(result.error).toBe("Network error");
  });

  it("omits auth header when no session", async () => {
    const { supabase } = require("../lib/supabase");
    supabase.auth.getSession.mockResolvedValueOnce({
      data: { session: null },
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: "ok" }),
    });

    await api.get("/api/v1/test");

    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers).not.toHaveProperty("Authorization");
  });
});

describe("device timezone header", () => {
  let resolvedOptionsSpy: jest.SpyInstance | null = null;

  afterEach(() => {
    resolvedOptionsSpy?.mockRestore();
    resolvedOptionsSpy = null;
  });

  function mockResolvedTimeZone(timeZone?: string): void {
    resolvedOptionsSpy = jest
      .spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions")
      .mockReturnValue(
        { timeZone } as unknown as Intl.ResolvedDateTimeFormatOptions,
      );
  }

  it("sends X-Device-Timezone with the device zone", async () => {
    mockResolvedTimeZone("Asia/Kolkata");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: "ok" }),
    });

    await api.get("/api/v1/dashboard");

    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers).toEqual(
      expect.objectContaining({
        [DEVICE_TIMEZONE_HEADER]: "Asia/Kolkata",
        "Content-Type": "application/json",
      }),
    );
  });

  it("omits the header when the runtime reports no timezone", async () => {
    mockResolvedTimeZone(undefined);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: "ok" }),
    });

    await api.get("/api/v1/dashboard");

    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers).not.toHaveProperty(DEVICE_TIMEZONE_HEADER);
  });

  it("omits the header when timezone lookup throws", async () => {
    resolvedOptionsSpy = jest
      .spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions")
      .mockImplementation(() => {
        throw new Error("Intl unavailable");
      });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: "ok" }),
    });

    const result = await api.get("/api/v1/dashboard");

    expect(result.error).toBeNull();
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers).not.toHaveProperty(DEVICE_TIMEZONE_HEADER);
  });

  it("header value matches the runtime IANA zone when available", async () => {
    const runtimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!runtimeZone) {
      return;
    }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: "ok" }),
    });

    await api.get("/api/v1/dashboard");

    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers).toEqual(
      expect.objectContaining({ [DEVICE_TIMEZONE_HEADER]: runtimeZone }),
    );
  });
});
