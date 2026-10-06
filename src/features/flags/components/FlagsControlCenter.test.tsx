// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeBucket } from "../utils/bucket";
import { FlagsControlCenter } from "./FlagsControlCenter";

const fetchMock = vi.fn();

function createJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

vi.stubGlobal("fetch", fetchMock);

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    createJsonResponse({
      ok: true,
      flags: [],
    }),
  );
});

function flagRow(
  id: string,
  name: string,
  options: Partial<{
    description: string;
    enabled: boolean;
    rollout_pct: number;
    created_at: string;
    updated_at: string;
  }> = {},
) {
  const timestamp = "2026-01-01T12:00:00.000Z";
  return {
    id,
    name,
    description: options.description ?? `${name} description`,
    enabled: options.enabled ?? false,
    rollout_pct: options.rollout_pct ?? 25,
    rules: [],
    created_at: options.created_at ?? timestamp,
    updated_at: options.updated_at ?? timestamp,
  };
}

function resolveFetchCall(
  input: RequestInfo | URL,
  init?: RequestInit,
): {
  url: string;
  method: string;
  body: string;
} {
  if (typeof input === "string") {
    return {
      url: input,
      method: (init?.method ?? "GET").toUpperCase(),
      body: typeof init?.body === "string" ? init.body : "",
    };
  }

  if (input instanceof URL) {
    return {
      url: input.toString(),
      method: (init?.method ?? "GET").toUpperCase(),
      body: typeof init?.body === "string" ? init.body : "",
    };
  }

  return {
    url: input.url,
    method: (init?.method ?? input.method ?? "GET").toUpperCase(),
    body: typeof init?.body === "string" ? init.body : "",
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("FlagsControlCenter", () => {
  it("renders concise heading and full-stack status", async () => {
    render(<FlagsControlCenter />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(
      screen.getByRole("heading", { name: "Feature Flag Control Center" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/full-stack mode:/i)).toBeInTheDocument();
  });

  it("shows field-level create validation errors", async () => {
    fetchMock.mockResolvedValueOnce(createJsonResponse({ flags: [] }));
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid input",
            details: {
              fieldErrors: { name: ["Name must be lowercase alphanumeric with underscores"] },
            },
          },
        },
        400,
      ),
    );

    render(<FlagsControlCenter />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("Flag key"), {
      target: { value: "Bad Key!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(
      screen.getByText("Name must be lowercase alphanumeric with underscores"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Flag key")).toHaveAttribute("aria-invalid", "true");
  });

  it("maps duplicate-key conflicts to a field error", async () => {
    fetchMock.mockResolvedValueOnce(createJsonResponse({ flags: [] }));
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(
        {
          error: {
            code: "CONFLICT",
            message: "Flag key already exists.",
            details: { fieldErrors: { name: ["Use a different flag key."] } },
          },
        },
        409,
      ),
    );

    render(<FlagsControlCenter />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("Flag key"), {
      target: { value: "beta_dashboard" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Use a different flag key.")).toBeInTheDocument();
    expect(screen.getByText(/flag key already exists\./i)).toBeInTheDocument();
  });

  it("renders deterministic bucket explanation after evaluation", async () => {
    fetchMock.mockImplementation(async (input, init) => {
      const { url, method } = resolveFetchCall(input, init);

      if (url.endsWith("/api/projects/flags") && method === "GET") {
        return createJsonResponse({
          flags: [
            flagRow("flag-1", "beta_dashboard", {
              enabled: true,
              rollout_pct: 25,
              description: "Beta dashboard for early adopters",
            }),
          ],
        });
      }

      if (url.includes("/api/projects/flags/flag-1/evaluate") && method === "POST") {
        return createJsonResponse({
          evaluation: {
            enabled: true,
            bucket: 18,
            rule_matched: null,
            persistedBucket: 18,
          },
        });
      }

      return createJsonResponse({ flags: [] }, 404);
    });

    render(<FlagsControlCenter />);
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "Disable beta_dashboard" })).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText("Subject key"), {
      target: { value: "alice" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Evaluate subject" }));

    await waitFor(() =>
      expect(screen.getByText(/alice → bucket 18 → rollout 25% → enabled/i)).toBeInTheDocument(),
    );
    expect(
      screen.getByText(
        /bucket 18 → rollout 25% → enabled because the bucket falls below the threshold/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/deterministic rollout behavior/i)).toBeInTheDocument();
  });

  it("keeps card order stable after toggle update and refetch", async () => {
    const sameCreatedAt = new Date("2026-01-01T12:00:00.000Z").toISOString();
    let alphaEnabled = false;

    fetchMock.mockImplementation(async (input, init) => {
      const { url, method } = resolveFetchCall(input, init);

      if (url.endsWith("/api/projects/flags") && method === "GET") {
        return createJsonResponse({
          flags: [
            flagRow("b-flag", "beta_dashboard", {
              description: "beta",
              enabled: false,
              rollout_pct: 25,
              created_at: sameCreatedAt,
              updated_at: sameCreatedAt,
            }),
            flagRow("a-flag", "alpha_dashboard", {
              description: "alpha",
              enabled: alphaEnabled,
              rollout_pct: 25,
              created_at: sameCreatedAt,
              updated_at: sameCreatedAt,
            }),
          ],
        });
      }

      if (url.endsWith("/api/projects/flags/a-flag") && method === "PATCH") {
        alphaEnabled = true;
        return createJsonResponse({ flag: { id: "a-flag" } });
      }

      if (url.includes("/api/projects/flags/") && url.endsWith("/evaluate") && method === "POST") {
        return createJsonResponse({
          evaluation: {
            enabled: false,
            bucket: 50,
            rule_matched: null,
            persistedBucket: 50,
          },
        });
      }

      return createJsonResponse({ flags: [] }, 404);
    });

    render(<FlagsControlCenter />);

    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "Enable alpha_dashboard" })).toBeInTheDocument(),
    );
    const persistedSection = screen
      .getByRole("heading", { name: "Persisted flags" })
      .closest("section");
    expect(persistedSection).not.toBeNull();

    const initialOrder = within(persistedSection as HTMLElement)
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent?.trim());
    expect(initialOrder).toEqual(["alpha_dashboard", "beta_dashboard"]);

    fireEvent.click(screen.getByRole("switch", { name: "Enable alpha_dashboard" }));
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "Disable alpha_dashboard" })).toBeInTheDocument(),
    );

    const nextOrder = within(persistedSection as HTMLElement)
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent?.trim());
    expect(nextOrder).toEqual(["alpha_dashboard", "beta_dashboard"]);
  });

  it("renders product preview cards from persisted flags", async () => {
    const defaultSubject = "user_demo_001";
    const checkoutBucket = computeBucket("checkout_v2", defaultSubject);
    const aiBucket = computeBucket("ai_suggestions", defaultSubject);

    fetchMock.mockImplementation(async (input, init) => {
      const { url, method } = resolveFetchCall(input, init);

      if (url.endsWith("/api/projects/flags") && method === "GET") {
        return createJsonResponse({
          flags: [
            flagRow("1", "checkout_v2", { enabled: true, rollout_pct: 100 }),
            flagRow("2", "ai_suggestions", { enabled: true, rollout_pct: 25 }),
          ],
        });
      }

      return createJsonResponse({ flags: [] }, 404);
    });

    render(<FlagsControlCenter />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Product preview" })).toBeInTheDocument(),
    );
    expect(screen.getByText("New checkout experience")).toBeInTheDocument();
    expect(screen.getByText("AI suggestions")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByText(
          new RegExp(`Visible because bucket ${checkoutBucket} is inside rollout 100%\\.`, "i"),
        ),
      ).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(
        screen.getByText(
          aiBucket < 25
            ? new RegExp(`Visible because bucket ${aiBucket} is inside rollout 25%\\.`, "i")
            : new RegExp(`Hidden because bucket ${aiBucket} is outside rollout 25%\\.`, "i"),
        ),
      ).toBeInTheDocument(),
    );
  });

  it("updates preview availability when a flag is toggled", async () => {
    const defaultSubject = "user_demo_001";
    const teamBucket = computeBucket("team_dashboard", defaultSubject);
    let enabled = false;

    fetchMock.mockImplementation(async (input, init) => {
      const { url, method } = resolveFetchCall(input, init);

      if (url.endsWith("/api/projects/flags") && method === "GET") {
        return createJsonResponse({
          flags: [flagRow("team-1", "team_dashboard", { enabled, rollout_pct: 100 })],
        });
      }

      if (url.endsWith("/api/projects/flags/team-1") && method === "PATCH") {
        enabled = true;
        return createJsonResponse({ flag: { id: "team-1" } });
      }

      return createJsonResponse({ flags: [] }, 404);
    });

    render(<FlagsControlCenter />);

    await waitFor(() => expect(screen.getByText("Team dashboard")).toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByText(/Hidden because team_dashboard is disabled\./i)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("switch", { name: "Enable team_dashboard" }));

    await waitFor(() =>
      expect(
        screen.getByText(
          new RegExp(`Visible because bucket ${teamBucket} is inside rollout 100%\\.`, "i"),
        ),
      ).toBeInTheDocument(),
    );
  });

  it("updates preview immediately from the same flags state during toggle and rollout changes", async () => {
    let enabled = true;
    let rollout = 100;
    let patchResponse = deferred<Response>();

    fetchMock.mockImplementation(async (input, init) => {
      const { url, method, body } = resolveFetchCall(input, init);

      if (url.endsWith("/api/projects/flags") && method === "GET") {
        return createJsonResponse({
          flags: [flagRow("ai-live-1", "ai_suggestions", { enabled, rollout_pct: rollout })],
        });
      }

      if (url.endsWith("/api/projects/flags/ai-live-1") && method === "PATCH") {
        const payload = JSON.parse(body || "{}") as { enabled?: boolean; rollout_pct?: number };
        if (typeof payload.enabled === "boolean") enabled = payload.enabled;
        if (typeof payload.rollout_pct === "number") rollout = payload.rollout_pct;
        return patchResponse.promise;
      }

      return createJsonResponse({ flags: [] }, 404);
    });

    render(<FlagsControlCenter />);

    await waitFor(() => expect(screen.getByText("AI suggestions")).toBeInTheDocument());
    await waitFor(() =>
      expect(
        screen.getByText(/Visible because bucket .* is inside rollout 100%\./i),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("switch", { name: "Disable ai_suggestions" }));
    expect(screen.getByText(/Hidden because ai_suggestions is disabled\./i)).toBeInTheDocument();

    patchResponse.resolve(
      createJsonResponse({
        flag: flagRow("ai-live-1", "ai_suggestions", { enabled: false, rollout_pct: 100 }),
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "Enable ai_suggestions" })).toBeInTheDocument(),
    );

    patchResponse = deferred<Response>();
    fireEvent.click(screen.getByRole("switch", { name: "Enable ai_suggestions" }));
    expect(
      screen.queryByText(/Hidden because ai_suggestions is disabled\./i),
    ).not.toBeInTheDocument();
    patchResponse.resolve(
      createJsonResponse({
        flag: flagRow("ai-live-1", "ai_suggestions", { enabled: true, rollout_pct: 100 }),
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(/Visible because bucket .* is inside rollout 100%\./i),
      ).toBeInTheDocument(),
    );

    const slider = screen.getByRole("slider") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "0" } });
    patchResponse = deferred<Response>();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      screen.getByText(/Hidden because bucket .* is outside rollout 0%\./i),
    ).toBeInTheDocument();
    patchResponse.resolve(
      createJsonResponse({
        flag: flagRow("ai-live-1", "ai_suggestions", { enabled: true, rollout_pct: 0 }),
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(/Hidden because bucket .* is outside rollout 0%\./i),
      ).toBeInTheDocument(),
    );

    fireEvent.change(slider, { target: { value: "100" } });
    patchResponse = deferred<Response>();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(
      screen.getByText(/Visible because bucket .* is inside rollout 100%\./i),
    ).toBeInTheDocument();
    patchResponse.resolve(
      createJsonResponse({
        flag: flagRow("ai-live-1", "ai_suggestions", { enabled: true, rollout_pct: 100 }),
      }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(/Visible because bucket .* is inside rollout 100%\./i),
      ).toBeInTheDocument(),
    );

    const listGets = fetchMock.mock.calls.filter(([input, init]) => {
      const { url, method } = resolveFetchCall(
        input as RequestInfo | URL,
        init as RequestInit | undefined,
      );
      return url.endsWith("/api/projects/flags") && method === "GET";
    });
    expect(listGets).toHaveLength(1);
  });

  it("can change preview rollout result by subject key", async () => {
    const findSubjectByBucket = (predicate: (bucket: number) => boolean): string => {
      for (let idx = 0; idx < 5_000; idx += 1) {
        const candidate = `preview-subject-${idx}`;
        if (predicate(computeBucket("ai_suggestions", candidate))) {
          return candidate;
        }
      }
      throw new Error("Could not find subject for bucket predicate");
    };

    const hiddenSubject = findSubjectByBucket((bucket) => bucket >= 25);
    const visibleSubject = findSubjectByBucket((bucket) => bucket < 25);
    const hiddenBucket = computeBucket("ai_suggestions", hiddenSubject);
    const visibleBucket = computeBucket("ai_suggestions", visibleSubject);

    fetchMock.mockImplementation(async (input, init) => {
      const { url, method, body } = resolveFetchCall(input, init);

      if (url.endsWith("/api/projects/flags") && method === "GET") {
        return createJsonResponse({
          flags: [flagRow("ai-1", "ai_suggestions", { enabled: true, rollout_pct: 25 })],
        });
      }

      void body;

      return createJsonResponse({ flags: [] }, 404);
    });

    render(<FlagsControlCenter />);

    fireEvent.change(screen.getByLabelText("Subject key"), {
      target: { value: hiddenSubject },
    });

    await waitFor(() =>
      expect(
        screen.getByText(
          new RegExp(`Hidden because bucket ${hiddenBucket} is outside rollout 25%\\.`, "i"),
        ),
      ).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText("Subject key"), {
      target: { value: visibleSubject },
    });

    await waitFor(() =>
      expect(
        screen.getByText(
          new RegExp(`Visible because bucket ${visibleBucket} is inside rollout 25%\\.`, "i"),
        ),
      ).toBeInTheDocument(),
    );
  });

  it("shows a generic banner for server failures without leaking internals", async () => {
    fetchMock.mockResolvedValueOnce(createJsonResponse({ flags: [] }));
    fetchMock.mockResolvedValueOnce(
      createJsonResponse(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Internal server error",
            requestId: "test-request",
          },
        },
        500,
      ),
    );

    render(<FlagsControlCenter />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("Flag key"), {
      target: { value: "server_failure" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/internal server error/i)).toBeInTheDocument();
    expect(screen.queryByText(/stack trace|requestId|detail:|sqlstate|23505/i)).toBeNull();
  });
});
