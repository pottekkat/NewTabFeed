import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import {
  Check,
  ExternalLink,
  Loader2,
  Radar,
  Rss,
  ShieldCheck,
} from 'lucide-react';
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

interface TabInfo {
  id?: number;
  origin?: string;
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
    const [active] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    const origin = originOf(active?.url);
    setTab({ id: active?.id, origin });

    await loadSubscribed();

    if (active?.id !== undefined) {
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
        <Rss className="text-primary size-4" />
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
            canProbe={Boolean(tab.origin)}
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
  canProbe,
  onProbe,
  onSubscribed,
}: {
  feeds: DiscoveredFeed[];
  subscribed: Set<string>;
  probed: boolean;
  probing: boolean;
  probeError: string | null;
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

  // No feeds — either the page advertised none, or a probe came back empty.
  return (
    <div className="flex flex-col items-start gap-3 py-1">
      <p className="text-muted-foreground text-sm">
        {probed
          ? 'No feeds found at common locations for this site.'
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
          Check common locations
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
