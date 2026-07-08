import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browser } from 'wxt/browser';
import {
  syncDiscoveryRegistration,
  registerDiscoveryScript,
  unregisterDiscoveryScript,
  isDiscoveryRegistered,
  DISCOVERY_SCRIPT_ID,
  DISCOVERY_SCRIPT_FILE,
} from '@/lib/discovery/registration';

// Control host access through the mocked permissions module.
const hasAccess = vi.fn<() => Promise<boolean>>();
vi.mock('@/lib/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/permissions')>();
  return { ...actual, hasHostAccess: () => hasAccess() };
});

// In-memory fake for the scripting registration API (fakeBrowser throws).
interface RegisteredScript {
  id: string;
  matches?: string[];
  js?: string[];
}
let registry: RegisteredScript[];
let failNextRegisterAsDuplicate = false;

beforeEach(() => {
  fakeBrowser.reset();
  registry = [];
  failNextRegisterAsDuplicate = false;
  hasAccess.mockResolvedValue(true);

  vi.spyOn(browser.scripting, 'getRegisteredContentScripts').mockImplementation(
    async (filter?: { ids?: string[] }) => {
      const ids = filter?.ids;
      return registry.filter((s) => !ids || ids.includes(s.id));
    },
  );
  vi.spyOn(browser.scripting, 'registerContentScripts').mockImplementation(
    async (scripts: RegisteredScript[]) => {
      for (const s of scripts) {
        if (
          failNextRegisterAsDuplicate ||
          registry.some((r) => r.id === s.id)
        ) {
          throw new Error(`Duplicate script ID '${s.id}'`);
        }
        registry.push(s);
      }
    },
  );
  vi.spyOn(browser.scripting, 'unregisterContentScripts').mockImplementation(
    async (filter?: { ids?: string[] }) => {
      const ids = filter?.ids;
      registry = registry.filter((s) => ids && !ids.includes(s.id));
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('registerDiscoveryScript', () => {
  it('registers the discovery script with the expected id, matches, and file', async () => {
    await registerDiscoveryScript();
    expect(registry).toHaveLength(1);
    expect(registry[0]).toMatchObject({
      id: DISCOVERY_SCRIPT_ID,
      matches: ['<all_urls>'],
      js: [DISCOVERY_SCRIPT_FILE],
    });
  });

  it('is idempotent—a second call does not double-register', async () => {
    await registerDiscoveryScript();
    await registerDiscoveryScript();
    expect(registry).toHaveLength(1);
  });

  it('swallows a duplicate-id error from a concurrent registration race', async () => {
    // isDiscoveryRegistered sees nothing, but the register call still throws
    // "duplicate" (another context won the race). Must not reject.
    failNextRegisterAsDuplicate = true;
    await expect(registerDiscoveryScript()).resolves.toBeUndefined();
  });
});

describe('syncDiscoveryRegistration', () => {
  it('registers when host access is present', async () => {
    hasAccess.mockResolvedValue(true);
    await syncDiscoveryRegistration();
    expect(await isDiscoveryRegistered()).toBe(true);
  });

  it('unregisters when host access is absent', async () => {
    await registerDiscoveryScript();
    expect(registry).toHaveLength(1);

    hasAccess.mockResolvedValue(false);
    await syncDiscoveryRegistration();
    expect(registry).toHaveLength(0);
    expect(await isDiscoveryRegistered()).toBe(false);
  });
});

describe('unregisterDiscoveryScript', () => {
  it('is a no-op when nothing is registered', async () => {
    await expect(unregisterDiscoveryScript()).resolves.toBeUndefined();
    expect(registry).toHaveLength(0);
  });
});
