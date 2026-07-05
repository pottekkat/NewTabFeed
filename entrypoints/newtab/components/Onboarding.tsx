import { useMemo, useState } from 'react';
import { AlertCircle, Check, Loader2, Plus, X } from 'lucide-react';
import { STARTER_FEEDS } from '@/lib/starter-feeds';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Favicon } from './Favicon';
import { ensureHostAccess, send } from '../lib/messaging';
import { settings } from '../lib/use-settings';

/** Starter feeds pre-checked on first run. */
const DEFAULT_SELECTED = new Set([
  'https://hnrss.org/frontpage',
  'https://lobste.rs/rss',
  'https://feeds.arstechnica.com/arstechnica/index',
  'https://simonwillison.net/atom/everything/',
]);

type Phase = 'choose' | 'requesting' | 'subscribing' | 'denied';
type ItemState = { state: 'pending' | 'ok' | 'error'; message?: string };

interface OnboardingProps {
  /** Called once onboarding is finished (feeds added or skipped). */
  onComplete: () => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(DEFAULT_SELECTED),
  );
  const [customFeeds, setCustomFeeds] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState('');
  const [phase, setPhase] = useState<Phase>('choose');
  const [progress, setProgress] = useState<Map<string, ItemState>>(new Map());

  const chosenUrls = useMemo(
    () => [...selected, ...customFeeds],
    [selected, customFeeds],
  );
  const nothingChosen = chosenUrls.length === 0;
  const busy = phase === 'requesting' || phase === 'subscribing';
  const hadFailures = [...progress.values()].some((s) => s.state === 'error');

  function toggle(url: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }

  function addCustom() {
    const url = customInput.trim();
    if (!url) return;
    setCustomFeeds((prev) => (prev.includes(url) ? prev : [...prev, url]));
    setCustomInput('');
  }

  async function skip() {
    await settings.onboardingComplete.setValue(true);
    onComplete();
  }

  async function start() {
    if (nothingChosen) return;
    // Request host access FIRST, within this click's gesture, so the single
    // permission prompt is user-initiated.
    setPhase('requesting');
    const granted = await ensureHostAccess();
    if (!granted) {
      setPhase('denied');
      return;
    }

    setPhase('subscribing');
    // Only retry feeds not already succeeded (supports the retry button).
    const targets = chosenUrls.filter(
      (url) => progress.get(url)?.state !== 'ok',
    );
    let anyError = false;
    for (const url of targets) {
      setProgress((prev) => new Map(prev).set(url, { state: 'pending' }));
      const res = await send({ type: 'subscribe', url });
      if (res.ok) {
        setProgress((prev) => new Map(prev).set(url, { state: 'ok' }));
      } else {
        anyError = true;
        setProgress((prev) =>
          new Map(prev).set(url, { state: 'error', message: res.error }),
        );
      }
    }

    if (anyError) {
      // Leave failures visible so the user can retry or continue anyway.
      setPhase('choose');
    } else {
      await settings.onboardingComplete.setValue(true);
      onComplete();
    }
  }

  return (
    <main className="bg-background text-foreground min-h-screen">
      <div className="mx-auto flex max-w-xl flex-col items-center px-6 py-16 sm:py-24">
        <div className="mb-1 flex items-center gap-2">
          <span
            className="size-2.5 rounded-full bg-orange-500"
            aria-hidden="true"
          />
          <h1 className="text-2xl font-semibold tracking-tight">NewTabFeed</h1>
        </div>
        <p className="text-muted-foreground text-lg">
          Your feeds. Your tab. Nothing else.
        </p>
        <p className="text-muted-foreground/80 mt-2 text-sm">
          Everything stays on your device — no accounts, no cloud, no tracking.
        </p>

        {phase === 'denied' && (
          <div className="border-destructive/30 bg-destructive/5 text-destructive mt-8 w-full rounded-lg border p-4 text-sm">
            <p className="font-medium">Host access is needed to fetch feeds.</p>
            <p className="mt-1 opacity-90">
              NewTabFeed reads the feeds you pick directly from their sites.
              Grant access to continue, or start empty and add feeds later.
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                className="bg-orange-500 text-white hover:bg-orange-600"
                onClick={start}
              >
                Grant access & continue
              </Button>
              <Button size="sm" variant="ghost" onClick={skip}>
                Start empty
              </Button>
            </div>
          </div>
        )}

        <div className="mt-10 w-full">
          <h2 className="mb-3 text-sm font-medium">
            Pick a few feeds to get started
          </h2>
          <ul className="flex flex-col gap-1.5">
            {STARTER_FEEDS.map((feed) => {
              const checked = selected.has(feed.feedUrl);
              const status = progress.get(feed.feedUrl);
              return (
                <li key={feed.feedUrl}>
                  <label
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                      checked
                        ? 'border-orange-500/40 bg-orange-500/5'
                        : 'hover:bg-accent/50',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 shrink-0 accent-orange-500"
                      checked={checked}
                      disabled={busy}
                      onChange={() => toggle(feed.feedUrl)}
                    />
                    <Favicon
                      siteUrl={feed.siteUrl}
                      fallback={feed.name}
                      className="mt-0.5 size-4"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {feed.name}
                        <StatusIcon status={status} />
                      </span>
                      <span className="text-muted-foreground block text-xs">
                        {status?.state === 'error'
                          ? status.message
                          : feed.description}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          {customFeeds.length > 0 && (
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {customFeeds.map((url) => {
                const status = progress.get(url);
                return (
                  <li
                    key={url}
                    className="flex items-center gap-2 rounded-lg border border-orange-500/40 bg-orange-500/5 p-3 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">{url}</span>
                    <StatusIcon status={status} />
                    {status?.state === 'error' && (
                      <span className="text-destructive truncate text-xs">
                        {status.message}
                      </span>
                    )}
                    {!busy && (
                      <button
                        type="button"
                        aria-label={`Remove ${url}`}
                        onClick={() =>
                          setCustomFeeds((prev) =>
                            prev.filter((u) => u !== url),
                          )
                        }
                        className="text-muted-foreground hover:text-foreground shrink-0"
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addCustom();
            }}
          >
            <Input
              type="text"
              inputMode="url"
              placeholder="Add your own feed or site URL"
              value={customInput}
              disabled={busy}
              onChange={(e) => setCustomInput(e.target.value)}
              aria-label="Add your own feed URL"
            />
            <Button
              type="submit"
              variant="outline"
              disabled={busy || !customInput.trim()}
            >
              <Plus className="size-4" />
              Add
            </Button>
          </form>
        </div>

        <div className="mt-8 flex w-full flex-col items-center gap-3">
          <Button
            size="lg"
            className="w-full bg-orange-500 text-white hover:bg-orange-600"
            disabled={nothingChosen || busy}
            onClick={start}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {phase === 'requesting'
              ? 'Requesting access…'
              : phase === 'subscribing'
                ? 'Adding feeds…'
                : hadFailures
                  ? 'Retry & start reading'
                  : 'Start reading'}
          </Button>
          <button
            type="button"
            onClick={skip}
            disabled={busy}
            className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline disabled:opacity-50"
          >
            Start empty
          </button>
        </div>
      </div>
    </main>
  );
}

function StatusIcon({ status }: { status: ItemState | undefined }) {
  if (!status) return null;
  if (status.state === 'pending')
    return <Loader2 className="text-muted-foreground size-3.5 animate-spin" />;
  if (status.state === 'ok')
    return <Check className="size-3.5 text-orange-500" />;
  return <AlertCircle className="text-destructive size-3.5" />;
}
