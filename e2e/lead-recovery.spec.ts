import { expect, test, type Page } from "@playwright/test";

const testOrigin = "https://yc-auto.test";
const turnstileScript =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type CapturedSubmission = {
  key: string | undefined;
  body: Record<string, unknown>;
};
type MockWidget = {
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
};
type TestWindow = Window & {
  __verification: {
    renders: number;
    removed: string[];
    widgets: Record<string, MockWidget>;
  };
  __unmountForms: () => void;
};

// Only app modules are fetched from the local dev server. The page has a
// non-local origin so it exercises the production verification path, and all
// API / challenge requests are intercepted: no production leads or emails.
async function harness(page: Page, baseURL: string, forms = 1) {
  const localeModule = await page.request.get(
    new URL("/src/i18n.ts", baseURL).href,
  );
  const routerImport = (await localeModule.text()).match(
    /"(\/node_modules\/\.vite\/deps\/react-router-dom\.js[^"]*)"/,
  )?.[1];
  if (!routerImport)
    throw new Error("Could not resolve the app's router module");
  await page.routeWebSocket(/.*/, () => {});
  await page.route(`${testOrigin}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/lead-harness") {
      await route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html lang="en"><head></head><body><main id="root"></main>
          <script type="module">
            import RefreshRuntime from '/@react-refresh';
            RefreshRuntime.injectIntoGlobalHook(window);
            window.$RefreshReg$ = () => {};
            window.$RefreshSig$ = () => (type) => type;
            window.__vite_plugin_react_preamble_installed__ = true;
            const [{ default: React }, { default: ReactDOM }, { BrowserRouter }, { LeadForm }] = await Promise.all([
              import('/node_modules/.vite/deps/react.js'),
              import('/node_modules/.vite/deps/react-dom_client.js'),
              import(${JSON.stringify(routerImport)}),
              import('/components/LeadForm.tsx'),
              import('/src/styles/global.css')
            ]);
            const root = ReactDOM.createRoot(document.getElementById('root'));
            window.__unmountForms = () => root.unmount();
            root.render(React.createElement(React.StrictMode, null,
              React.createElement(BrowserRouter, null,
                ...Array.from({ length: ${forms} }, (_, key) => React.createElement(LeadForm, { key, type: 'contact' }))
              )
            ));
          </script></body></html>`,
      });
    } else if (url.pathname === "/api/public/config") {
      await route.fulfill({ json: { turnstileSiteKey: "test-site-key" } });
    } else if (url.pathname.startsWith("/api/")) {
      await route.abort();
    } else {
      const localUrl = new URL(url.pathname + url.search, baseURL).href;
      await route.fulfill({ response: await page.request.get(localUrl) });
    }
  });
}

function challengeSource() {
  return `
    window.__verification ??= { renders: 0, removed: [], widgets: {} };
    window.turnstile = {
      render(container, options) {
        const id = 'widget-' + (++window.__verification.renders);
        window.__verification.widgets[id] = options;
        container.dataset.widgetId = id;
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Complete test verification';
        button.onclick = () => options.callback('token-' + id);
        container.append(button);
        return id;
      },
      remove(id) {
        window.__verification.removed.push(id);
        document.querySelector('[data-widget-id="' + id + '"]')?.replaceChildren();
      }
    };
  `;
}

async function fillContact(page: Page) {
  await page.getByLabel("Name *").fill("Verification Test");
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("test@example.invalid");
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Local browser recovery test.");
}

test.describe("lead form recovery", () => {
  test("rebuilds verification after success and sends a new logical request", async ({
    page,
    baseURL,
  }) => {
    await harness(page, baseURL!);
    let scripts = 0;
    await page.route(turnstileScript, async (route) => {
      scripts += 1;
      await route.fulfill({
        contentType: "application/javascript",
        body: challengeSource(),
      });
    });
    const submitted: CapturedSubmission[] = [];
    await page.route(`${testOrigin}/api/leads`, async (route) => {
      submitted.push({
        key: route.request().headers()["idempotency-key"],
        body: route.request().postDataJSON(),
      });
      await route.fulfill({ json: { ok: true, leadId: "local-test" } });
    });
    await page.goto(`${testOrigin}/lead-harness`);
    await fillContact(page);
    await page
      .getByRole("button", { name: "Complete test verification" })
      .click();
    await page.getByRole("button", { name: /Send message/i }).click();
    await expect(
      page.getByRole("heading", { name: /Message received/i }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as TestWindow).__verification.removed.length,
        ),
      )
      .toBe(1);
    await page.getByRole("button", { name: /Send another/i }).click();
    await fillContact(page);
    await page
      .getByRole("button", { name: "Complete test verification" })
      .click();
    await page.getByRole("button", { name: /Send message/i }).click();
    await expect(
      page.getByRole("heading", { name: /Message received/i }),
    ).toBeVisible();
    expect(submitted).toHaveLength(2);
    expect(submitted[0].key).toMatch(/^[a-f0-9-]{36}$/i);
    expect(submitted[1].key).not.toBe(submitted[0].key);
    expect(submitted[1].body.turnstileToken).not.toBe(
      submitted[0].body.turnstileToken,
    );
    expect(scripts).toBe(1);
  });

  test("keeps details and the key after a lost response, refreshes the token, and rejects double submission", async ({
    page,
    baseURL,
  }) => {
    await harness(page, baseURL!);
    await page.route(turnstileScript, (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: challengeSource(),
      }),
    );
    const submitted: CapturedSubmission[] = [];
    let releaseFirst: (() => void) | undefined;
    await page.route(`${testOrigin}/api/leads`, async (route) => {
      submitted.push({
        key: route.request().headers()["idempotency-key"],
        body: route.request().postDataJSON(),
      });
      if (submitted.length === 1) {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
        await route.abort("failed");
      } else
        await route.fulfill({
          json: { ok: true, leadId: "original-local-test" },
        });
    });
    await page.goto(`${testOrigin}/lead-harness`);
    await fillContact(page);
    await page
      .getByRole("button", { name: "Complete test verification" })
      .click();
    await page.locator("form").evaluate((form: HTMLFormElement) => {
      form.requestSubmit();
      form.requestSubmit();
    });
    await expect.poll(() => submitted.length).toBe(1);
    await expect(page.getByRole("button", { name: /Sending/i })).toBeDisabled();
    releaseFirst!();
    await expect(page.locator(".form-error")).toBeVisible();
    await expect(page.getByLabel("Name *")).toHaveValue("Verification Test");
    await expect(
      page.getByRole("textbox", { name: "Message", exact: true }),
    ).toHaveValue("Local browser recovery test.");
    await expect(page.locator('input[name="turnstileToken"]')).toHaveValue("");
    await page
      .getByRole("button", { name: "Complete test verification" })
      .click();
    await page.getByRole("button", { name: /Send message/i }).click();
    await expect(
      page.getByRole("heading", { name: /Message received/i }),
    ).toBeVisible();
    expect(submitted).toHaveLength(2);
    expect(submitted[1].key).toBe(submitted[0].key);
    expect(submitted[1].body.turnstileToken).not.toBe(
      submitted[0].body.turnstileToken,
    );
  });

  test("refreshes an expired token and changes the key after editing a failed request", async ({
    page,
    baseURL,
  }) => {
    await harness(page, baseURL!);
    await page.route(turnstileScript, (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: challengeSource(),
      }),
    );
    const submitted: CapturedSubmission[] = [];
    await page.route(`${testOrigin}/api/leads`, async (route) => {
      submitted.push({
        key: route.request().headers()["idempotency-key"],
        body: route.request().postDataJSON(),
      });
      await route.fulfill({ status: 503, json: { error: "Unavailable" } });
    });
    await page.goto(`${testOrigin}/lead-harness`);
    await fillContact(page);
    await page
      .getByRole("button", { name: "Complete test verification" })
      .click();
    await page.evaluate(() => {
      const first = (window as unknown as TestWindow).__verification.widgets[
        "widget-1"
      ];
      first["expired-callback"]();
      first.callback("stale-token");
    });
    await expect(page.locator('input[name="turnstileToken"]')).toHaveValue("");
    await expect(page.locator(".turnstile-widget")).toHaveAttribute(
      "data-widget-id",
      "widget-2",
    );
    await page
      .getByRole("button", { name: "Complete test verification" })
      .click();
    await page.getByRole("button", { name: /Send message/i }).click();
    await expect(page.locator(".form-error")).toBeVisible();
    await page
      .getByRole("textbox", { name: "Message", exact: true })
      .fill("Changed request.");
    await page
      .getByRole("button", { name: "Complete test verification" })
      .click();
    await page.getByRole("button", { name: /Send message/i }).click();
    await expect.poll(() => submitted.length).toBe(2);
    expect(submitted[0].body.turnstileToken).toBe("token-widget-2");
    expect(submitted[1].key).not.toBe(submitted[0].key);
  });

  test("recovers a failed script without losing input, and shares it between StrictMode forms", async ({
    page,
    baseURL,
  }) => {
    await harness(page, baseURL!, 2);
    let scripts = 0;
    await page.route(turnstileScript, async (route) => {
      scripts += 1;
      if (scripts === 1) await route.abort();
      else
        await route.fulfill({
          contentType: "application/javascript",
          body: challengeSource(),
        });
    });
    await page.goto(`${testOrigin}/lead-harness`);
    await page.getByLabel("Name *").first().fill("Keep this name");
    await expect(
      page.getByRole("button", { name: "Retry verification" }),
    ).toHaveCount(2);
    expect(scripts).toBe(1);
    await page
      .getByRole("button", { name: "Retry verification" })
      .first()
      .click();
    await expect(
      page.getByRole("button", { name: "Complete test verification" }),
    ).toHaveCount(1);
    await page.getByRole("button", { name: "Retry verification" }).click();
    await expect(
      page.getByRole("button", { name: "Complete test verification" }),
    ).toHaveCount(2);
    expect(scripts).toBe(2);
    await expect(page.getByLabel("Name *").first()).toHaveValue(
      "Keep this name",
    );
    await expect(
      page.locator('script[src*="challenges.cloudflare.com/turnstile"]'),
    ).toHaveCount(1);
    await page.evaluate(() =>
      (window as unknown as TestWindow).__unmountForms(),
    );
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as TestWindow).__verification.removed.length,
        ),
      )
      .toBe(2);
  });
});
