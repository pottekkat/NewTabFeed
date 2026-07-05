import { useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Download,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { Feed } from '@/lib/types';
import type { ImportOpmlResult } from '@/lib/opml';
import { getFeed, upsertFeed } from '@/lib/db';
import { requestHostAccess } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Favicon } from './Favicon';
import { ensureHostAccess, isPermissionError, send } from '../lib/messaging';

interface ManageFeedsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feeds: Feed[];
  unread: Map<string, number>;
  /** Refresh the caller's feed/unread state after a mutation. */
  onChanged: () => Promise<void>;
}

const TITLE_ID = 'manage-feeds-title';

export function ManageFeedsDialog({
  open,
  onOpenChange,
  feeds,
  unread,
  onChanged,
}: ManageFeedsDialogProps) {
  const [addUrl, setAddUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<ImportOpmlResult | null>(
    null,
  );
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function addFeed() {
    const url = addUrl.trim();
    if (!url || adding) return;
    setAdding(true);
    setAddError(null);
    try {
      // First await of the gesture: prompt for host access if we don't have it.
      const granted = await ensureHostAccess();
      if (!granted) {
        setAddError('Host access is required to fetch feeds.');
        return;
      }
      let res = await send({ type: 'subscribe', url });
      if (isPermissionError(res) && (await requestHostAccess())) {
        res = await send({ type: 'subscribe', url });
      }
      if (res.ok) {
        setAddUrl('');
        await onChanged();
      } else {
        setAddError(res.error);
      }
    } finally {
      setAdding(false);
    }
  }

  async function beginImport() {
    // Ensure access from this click before the file picker steals the gesture.
    await ensureHostAccess();
    fileInputRef.current?.click();
  }

  async function onFileSelected(file: File | undefined) {
    if (!file) return;
    setImportError(null);
    setImportSummary(null);
    const xml = await file.text();
    const res = await send({ type: 'import-opml', xml });
    if (res.ok) {
      setImportSummary(res.data);
      await onChanged();
    } else {
      setImportError(res.error);
    }
  }

  async function exportFeeds() {
    const res = await send({ type: 'export-opml' });
    if (!res.ok) return;
    const blob = new Blob([res.data.xml], { type: 'text/x-opml' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'newtabfeed-subscriptions.opml';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} labelledBy={TITLE_ID}>
      <DialogHeader>
        <DialogTitle id={TITLE_ID}>Manage feeds</DialogTitle>
        <DialogDescription>
          {feeds.length} {feeds.length === 1 ? 'feed' : 'feeds'} · add, rename,
          or remove.
        </DialogDescription>
      </DialogHeader>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void addFeed();
        }}
      >
        <Input
          type="text"
          inputMode="url"
          placeholder="Add a feed or site URL"
          value={addUrl}
          disabled={adding}
          aria-label="Feed or site URL"
          aria-invalid={addError ? true : undefined}
          onChange={(e) => {
            setAddUrl(e.target.value);
            setAddError(null);
          }}
        />
        <Button
          type="submit"
          disabled={adding || !addUrl.trim()}
          className="bg-orange-500 text-white hover:bg-orange-600"
        >
          {adding ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          Add
        </Button>
      </form>
      {addError && <p className="text-destructive -mt-2 text-sm">{addError}</p>}

      <div className="-mx-2 max-h-[45vh] overflow-y-auto px-2">
        {feeds.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No feeds yet. Add one above or import an OPML file.
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {feeds.map((feed) => (
              <FeedRow
                key={feed.id}
                feed={feed}
                unread={unread.get(feed.id) ?? 0}
                onChanged={onChanged}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t pt-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">OPML</span>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".opml,.xml,text/xml,application/xml"
              className="hidden"
              onChange={(e) => {
                void onFileSelected(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void beginImport()}
            >
              <Upload className="size-4" />
              Import
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void exportFeeds()}
              disabled={feeds.length === 0}
            >
              <Download className="size-4" />
              Export
            </Button>
          </div>
        </div>
        {importError && (
          <p className="text-destructive text-sm">{importError}</p>
        )}
        {importSummary && (
          <p className="text-muted-foreground text-sm">
            Imported {importSummary.added.length} · skipped{' '}
            {importSummary.skippedDuplicates.length} duplicate
            {importSummary.skippedDuplicates.length === 1 ? '' : 's'} · failed{' '}
            {importSummary.failed.length}.
          </p>
        )}
      </div>
    </Dialog>
  );
}

interface FeedRowProps {
  feed: Feed;
  unread: number;
  onChanged: () => Promise<void>;
}

function FeedRow({ feed, unread, onChanged }: FeedRowProps) {
  const displayTitle = feed.customTitle?.trim() || feed.title;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayTitle);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function saveTitle() {
    setEditing(false);
    const next = draft.trim();
    if (next === displayTitle) return;
    // Read the freshest copy to avoid clobbering a concurrent refresh.
    const current = (await getFeed(feed.id)) ?? feed;
    await upsertFeed({
      ...current,
      customTitle: next && next !== feed.title ? next : undefined,
    });
    await onChanged();
  }

  async function remove() {
    setRemoving(true);
    const res = await send({ type: 'unsubscribe', feedId: feed.id });
    if (res.ok) await onChanged();
    else setRemoving(false);
  }

  return (
    <li className="flex items-center gap-3 py-2.5">
      <Favicon siteUrl={feed.siteUrl} fallback={displayTitle} />
      <div className="min-w-0 flex-1">
        {editing ? (
          <Input
            // Focus on mount without the discouraged autoFocus prop.
            ref={(el) => el?.focus()}
            value={draft}
            className="h-7"
            aria-label="Feed title"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void saveTitle()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveTitle();
              if (e.key === 'Escape') {
                setDraft(displayTitle);
                setEditing(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(displayTitle);
              setEditing(true);
            }}
            title="Click to rename"
            className="block max-w-full truncate text-left text-sm font-medium hover:text-orange-600"
          >
            {displayTitle}
          </button>
        )}
        <div className="text-muted-foreground truncate text-xs">{feed.url}</div>
        {feed.error && (
          <div className="mt-0.5 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-500">
            <AlertTriangle className="size-3 shrink-0" />
            <span className="truncate">
              {feed.error.message} (failed {feed.error.failCount}×)
            </span>
          </div>
        )}
      </div>

      {unread > 0 && (
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {unread}
        </span>
      )}

      {confirming ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="destructive"
            size="sm"
            disabled={removing}
            onClick={() => void remove()}
          >
            {removing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            Remove
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="Cancel"
            onClick={() => setConfirming(false)}
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className={cn('size-8 shrink-0')}
          aria-label={`Remove ${displayTitle}`}
          onClick={() => setConfirming(true)}
        >
          <Trash2 className="size-4" />
        </Button>
      )}
    </li>
  );
}
