import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { Check, ExternalLink, Loader2, Radar, ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { hasHostAccess, requestHostAccess } from '@/lib/permissions';
import { listFeeds } from '@/lib/db';
import { canonicalizeUrl, originOf } from '@/lib/url';
import type { DiscoveredFeed } from '@/lib/discovery/types';
import { sendRequest } from './messaging.ts';

/** Best-effort canonical key for comparing feed URLs; falls back to the raw URL. */
function canonicalKey(url: string): string {
  try {
    return canonicalizeUrl(url);
  } catch {
    return url;
  }
}

type Phase = 'loading' | 'no-access' | 'ready';

/**
 * What kind of page the active tab is:
 * - `web`   — a regular http(s) site we can look for feeds on.
 * - `own`   — NewTabFeed's own page (the new tab / reader). Probing it is
 *   meaningless — it's the reader, not a source — so we say so instead.
 * - `other` — a browser-internal page (chrome://, about:, other extensions,
 *   the web store…) where feed detection can't run.
 */
type PageKind = 'web' | 'own' | 'other';

interface TabInfo {
  id?: number;
  origin?: string;
  kind?: PageKind;
}

/** Classify a tab URL. Our own pages are matched by the extension origin. */
function pageKindOf(url: string | undefined): PageKind {
  if (!url) return 'other';
  if (url.startsWith(browser.runtime.getURL('/'))) return 'own';
  return /^https?:\/\//i.test(url) ? 'web' : 'other';
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [tab, setTab] = useState<TabInfo>({});
  const [feeds, setFeeds] = useState<DiscoveredFeed[]>([]);
  const [subscribed, setSubscribed] = useState<Set<string>>(new Set());
  const [probed, setProbed] = useState(false);
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);

  const loadSubscribed = useCallback(async () => {
    const existing = await listFeeds();
    setSubscribed(new Set(existing.map((f) => canonicalKey(f.url))));
  }, []);

  const load = useCallback(async () => {
    setPhase('loading');
    if (!(await hasHostAccess())) {
      setPhase('no-access');
      return;
    }
    // Test seam: e2e opens this popup as a regular tab (`popup.html?tabId=<n>`),
    // where the "active tab" is the popup itself. When `tabId` is present we look
    // that tab up directly instead of querying the active tab. Real popup use
    // never sets this param and takes the query path below.
    const overrideTabId = new URLSearchParams(window.location.search).get(
      'tabId',
    );
    const active =
      overrideTabId !== null
        ? await browser.tabs.get(Number(overrideTabId))
        : (await browser.tabs.query({ active: true, currentWindow: true }))[0];
    const kind = pageKindOf(active?.url);
    const origin = originOf(active?.url);
    setTab({ id: active?.id, origin, kind });

    await loadSubscribed();

    // Feed detection only means anything on a real web page — not the reader's
    // own page or a browser-internal one.
    if (kind === 'web' && active?.id !== undefined) {
      const res = await sendRequest({
        type: 'get-discovered',
        tabId: active.id,
      });
      setFeeds(res.ok ? res.data.feeds : []);
    } else {
      setFeeds([]);
    }
    setProbed(false);
    setProbeError(null);
    setPhase('ready');
  }, [loadSubscribed]);

  useEffect(() => {
    void load();
  }, [load]);

  const grant = useCallback(async () => {
    const granted = await requestHostAccess();
    if (granted) {
      await load();
    }
  }, [load]);

  const probe = useCallback(async () => {
    if (!tab.origin) return;
    setProbing(true);
    setProbeError(null);
    const res = await sendRequest({ type: 'probe-origin', origin: tab.origin });
    if (res.ok) {
      setFeeds(res.data.feeds);
    } else {
      setProbeError(res.error);
    }
    setProbed(true);
    setProbing(false);
  }, [tab.origin]);

  const onSubscribed = useCallback((url: string) => {
    setSubscribed((prev) => new Set(prev).add(canonicalKey(url)));
  }, []);

  return (
    <div className="bg-background text-foreground flex w-[360px] flex-col">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <Logo size={18} />
        <h1 className="text-sm font-semibold">NewTabFeed</h1>
      </header>

      <main className="px-4 py-3">
        {phase === 'loading' && <LoadingView />}
        {phase === 'no-access' && <NoAccessView onGrant={grant} />}
        {phase === 'ready' && (
          <ReadyView
            feeds={feeds}
            subscribed={subscribed}
            probed={probed}
            probing={probing}
            probeError={probeError}
            kind={tab.kind ?? 'other'}
            canProbe={tab.kind === 'web' && Boolean(tab.origin)}
            onProbe={probe}
            onSubscribed={onSubscribed}
          />
        )}
      </main>

      <footer className="border-t px-4 py-2">
        <button
          type="button"
          onClick={() => void browser.tabs.create({})}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs transition-colors"
        >
          <ExternalLink className="size-3" />
          Open NewTabFeed
        </button>
      </footer>
    </div>
  );
}

function LoadingView() {
  return (
    <div className="text-muted-foreground flex items-center justify-center gap-2 py-6 text-sm">
      <Loader2 className="size-4 animate-spin" />
      Checking this page…
    </div>
  );
}

function NoAccessView({ onGrant }: { onGrant: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 py-2">
      <p className="text-muted-foreground text-sm">
        NewTabFeed needs permission to check sites for feeds.
      </p>
      <Button size="sm" onClick={onGrant} className="gap-1.5">
        <ShieldCheck className="size-4" />
        Grant permission
      </Button>
    </div>
  );
}

function ReadyView({
  feeds,
  subscribed,
  probed,
  probing,
  probeError,
  kind,
  canProbe,
  onProbe,
  onSubscribed,
}: {
  feeds: DiscoveredFeed[];
  subscribed: Set<string>;
  probed: boolean;
  probing: boolean;
  probeError: string | null;
  kind: PageKind;
  canProbe: boolean;
  onProbe: () => void;
  onSubscribed: (url: string) => void;
}) {
  if (feeds.length > 0) {
    return (
      <ul className="flex flex-col gap-2">
        {feeds.map((feed) => (
          <FeedRow
            key={feed.url}
            feed={feed}
            isSubscribed={subscribed.has(canonicalKey(feed.url))}
            onSubscribed={onSubscribed}
          />
        ))}
      </ul>
    );
  }

  // Not a web page (the reader's own tab, or a browser-internal page): feed
  // detection can't run here, so explain rather than offer a dead probe button.
  if (kind !== 'web') {
    return (
      <p className="text-muted-foreground py-1 text-sm">
        {kind === 'own'
          ? "You're on NewTabFeed. Open a website, then click the NewTabFeed icon to add its feed."
          : 'NewTabFeed can only find feeds on regular web pages.'}
      </p>
    );
  }

  // No feeds — either the page advertised none, or a probe came back empty.
  return (
    <div className="flex flex-col items-start gap-3 py-1">
      <p className="text-muted-foreground text-sm">
        {probed
          ? 'No RSS feeds found for this site.'
          : 'No feed advertised on this page.'}
      </p>
      {probeError && <p className="text-destructive text-xs">{probeError}</p>}
      {!probed && canProbe && (
        <Button
          size="sm"
          variant="outline"
          onClick={onProbe}
          disabled={probing}
          className="gap-1.5"
        >
          {probing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Radar className="size-4" />
          )}
          Check for RSS feeds
        </Button>
      )}
    </div>
  );
}

function FeedRow({
  feed,
  isSubscribed,
  onSubscribed,
}: {
  feed: DiscoveredFeed;
  isSubscribed: boolean;
  onSubscribed: (url: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(isSubscribed);

  const subscribe = useCallback(async () => {
    setPending(true);
    setError(null);
    const res = await sendRequest({ type: 'subscribe', url: feed.url });
    if (res.ok) {
      setDone(true);
      onSubscribed(feed.url);
    } else {
      // An already-subscribed feed is a success from the user's point of view.
      if (res.errorName === 'AlreadySubscribedError') {
        setDone(true);
        onSubscribed(feed.url);
      } else {
        setError(res.error);
      }
    }
    setPending(false);
  }, [feed.url, onSubscribed]);

  const label = feed.title || pathLabel(feed.url);

  return (
    <li className="flex flex-col gap-1 rounded-lg border p-2.5">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">{label}</span>
            <KindBadge kind={feed.kind} />
          </div>
          <p className="text-muted-foreground truncate text-xs">{feed.url}</p>
        </div>
        {done ? (
          <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-xs">
            <Check className="size-3.5" />
            Subscribed
          </span>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={subscribe}
            disabled={pending}
            className="shrink-0"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              'Subscribe'
            )}
          </Button>
        )}
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </li>
  );
}

function KindBadge({ kind }: { kind: DiscoveredFeed['kind'] }) {
  if (kind === 'unknown') return null;
  return (
    <span className="bg-secondary text-secondary-foreground shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase">
      {kind}
    </span>
  );
}

/** A short human label for a feed with no title: its path (or host). */
function pathLabel(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname === '/' || u.pathname === '' ? u.hostname : u.pathname;
  } catch {
    return url;
  }
}
