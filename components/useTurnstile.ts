import { useCallback, useEffect, useRef, useState } from "react";
import { getPublicConfig } from "../src/api";

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => boolean;
      "timeout-callback": () => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const scriptUrl =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptLoad: Promise<TurnstileApi> | undefined;

/** All forms share one script, including React StrictMode's mount replay. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptLoad) return scriptLoad;
  scriptLoad = new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${scriptUrl}"]`,
    );
    const script = existing ?? document.createElement("script");
    const cleanup = () => {
      clearTimeout(timeout);
      script.removeEventListener("load", loaded);
      script.removeEventListener("error", failed);
    };
    const failed = () => {
      cleanup();
      script.remove();
      reject(new Error("Verification could not load"));
    };
    const loaded = () => {
      if (!window.turnstile) return failed();
      cleanup();
      resolve(window.turnstile);
    };
    const timeout = window.setTimeout(failed, 15_000);
    script.addEventListener("load", loaded);
    script.addEventListener("error", failed);
    if (!existing) {
      script.src = scriptUrl;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }).catch((error: unknown) => {
    scriptLoad = undefined;
    throw error;
  });
  return scriptLoad;
}

export function useTurnstile(active: boolean) {
  const [container, containerRef] = useState<HTMLDivElement | null>(null);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const [verification, setVerification] = useState<{
    token: string;
    status: "loading" | "ready" | "error";
  }>({ token: "", status: "loading" });

  const refresh = useCallback(() => {
    // Invalidate callbacks immediately, before React runs the next cleanup.
    generation.current += 1;
    setVerification({ token: "", status: "loading" });
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    const currentGeneration = ++generation.current;
    if (!active || !container) return;
    const isCurrent = () => generation.current === currentGeneration;
    const abort = new AbortController();
    let api: TurnstileApi | undefined;
    let widget: string | undefined;
    setVerification({ token: "", status: "loading" });

    if (["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)) {
      setVerification({ token: "local-form-token", status: "ready" });
    } else {
      void Promise.all([
        getPublicConfig({ signal: abort.signal }),
        loadTurnstile(),
      ])
        .then(([config, loadedApi]) => {
          if (!isCurrent()) return;
          api = loadedApi;
          const failed = () => {
            if (isCurrent()) setVerification({ token: "", status: "error" });
          };
          widget = api.render(container, {
            sitekey: config.turnstileSiteKey,
            action: "lead",
            callback: (token) => {
              if (isCurrent())
                setVerification({ token, status: token ? "ready" : "error" });
            },
            "expired-callback": () => {
              if (isCurrent()) refresh();
            },
            "error-callback": () => {
              failed();
              return true;
            },
            "timeout-callback": failed,
          });
        })
        .catch(() => {
          if (isCurrent()) setVerification({ token: "", status: "error" });
        });
    }

    return () => {
      generation.current += 1;
      abort.abort();
      if (api && widget !== undefined) {
        try {
          api.remove(widget);
        } catch {
          // A failed third-party cleanup must not prevent the form unmounting.
          container.replaceChildren();
        }
      }
    };
  }, [active, container, revision, refresh]);

  return { ...verification, containerRef, refresh };
}
