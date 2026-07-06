// Minimal ambient types for the `chrome` extension globals referenced inside
// `background.evaluate(...)` callbacks. Those run in the service worker, where
// `chrome` is a global — but the app uses `wxt/browser`, so there's no
// project-wide `@types/chrome`. This declares only what the e2e helpers touch.
declare const chrome: {
  tabs: {
    query(
      info: Record<string, unknown>,
    ): Promise<Array<{ id?: number; url?: string }>>;
  };
  action: {
    getBadgeText(details: { tabId: number }): Promise<string>;
  };
  scripting: {
    getRegisteredContentScripts(): Promise<Array<{ id: string }>>;
  };
};
