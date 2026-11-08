import test from "node:test";
import assert from "node:assert/strict";
import {
  checkOrigin,
  cookieValue,
  setCookie,
} from "../src/modules/accounts/security";

test("HTTPS cookies and origin checks reject cross-site and missing-origin writes", () => {
  const previous = process.env.APP_ORIGINS;
  process.env.APP_ORIGINS = "https://activehub.example";
  try {
    const response = new Response();
    setCookie(response, "activehub_session", "a".repeat(64), 604800);
    assert.match(
      response.headers.get("set-cookie") ?? "",
      /; HttpOnly; SameSite=Lax; Max-Age=604800; Secure$/,
    );
    checkOrigin(
      new Request("https://activehub.example/api/me", {
        headers: { Origin: "https://activehub.example" },
      }),
    );
    const rejected: Record<string,string>[] = [
      {},
      { Origin: "https://hostile.example" },
      { Origin: "null" },
      { Origin: "https://activehub.example", "Sec-Fetch-Site": "cross-site" },
    ];
    for (const headers of rejected)
      assert.throws(
        () =>
          checkOrigin(
            new Request("https://activehub.example/api/me", { headers }),
          ),
        /origin is not permitted/,
      );
    const duplicate = new Request("https://activehub.example", {
      headers: {
        Cookie: `activehub_session=${"a".repeat(64)}; activehub_session=${"b".repeat(64)}`,
      },
    });
    assert.equal(cookieValue(duplicate, "activehub_session"), undefined);
  } finally {
    if (previous === undefined) delete process.env.APP_ORIGINS;
    else process.env.APP_ORIGINS = previous;
  }
});
