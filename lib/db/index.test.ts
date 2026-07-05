import { describe, it, expect, beforeEach } from 'vitest';
import { resetIndexedDB } from '@/tests/idb';
import type { Feed, FeedItem } from '@/lib/types';
import {
  upsertFeed,
  getFeed,
  listFeeds,
  deleteFeed,
  upsertItems,
  listItems,
  markRead,
  markUnread,
  markAllRead,
  unreadCounts,
  countItems,
  pruneFeed,
} from '@/lib/db';

function feed(id: string, addedAt = 1000): Feed {
  return {
    id,
    url: id,
    title: `Feed ${id}`,
    addedAt,
    error: null,
  };
}

function item(
  id: string,
  feedId: string,
  publishedAt: number,
  read = false,
): FeedItem {
  return {
    id,
    feedId,
    title: `Item ${id}`,
    url: `https://x/${id}`,
    publishedAt,
    read,
    fetchedAt: publishedAt,
  };
}

beforeEach(async () => {
  await resetIndexedDB();
});

describe('feeds store', () => {
  it('round-trips a feed', async () => {
    await upsertFeed(feed('a'));
    expect(await getFeed('a')).toMatchObject({ id: 'a', title: 'Feed a' });
  });

  it('lists feeds oldest subscription first', async () => {
    await upsertFeed(feed('b', 2000));
    await upsertFeed(feed('a', 1000));
    const ids = (await listFeeds()).map((f) => f.id);
    expect(ids).toEqual(['a', 'b']);
  });

  it('deleteFeed cascades to its items only', async () => {
    await upsertFeed(feed('a'));
    await upsertFeed(feed('b'));
    await upsertItems([
      item('a1', 'a', 1),
      item('a2', 'a', 2),
      item('b1', 'b', 3),
    ]);
    await deleteFeed('a');
    expect(await getFeed('a')).toBeUndefined();
    expect(await countItems()).toBe(1);
    expect((await listItems()).map((i) => i.id)).toEqual(['b1']);
  });
});

describe('upsertItems', () => {
  it('returns the count of genuinely new items', async () => {
    expect(await upsertItems([item('1', 'a', 1), item('2', 'a', 2)])).toBe(2);
    expect(await upsertItems([item('2', 'a', 2), item('3', 'a', 3)])).toBe(1);
  });

  it('preserves the existing read flag and fetchedAt on re-fetch', async () => {
    await upsertItems([item('1', 'a', 100)]);
    await markRead('1');
    // Re-fetch the same item (read: false in the incoming record, new fetchedAt).
    const refetched = {
      ...item('1', 'a', 100),
      fetchedAt: 999,
      title: 'Updated',
    };
    await upsertItems([refetched]);
    const stored = (await listItems())[0];
    expect(stored.read).toBe(true); // preserved
    expect(stored.fetchedAt).toBe(100); // original fetchedAt preserved
    expect(stored.title).toBe('Updated'); // content still updated
  });
});

describe('listItems', () => {
  beforeEach(async () => {
    await upsertFeed(feed('a'));
    await upsertFeed(feed('b'));
    await upsertItems([
      item('a1', 'a', 10),
      item('a2', 'a', 30),
      item('b1', 'b', 20, true),
      item('b2', 'b', 40),
    ]);
  });

  it('returns items newest-first', async () => {
    expect((await listItems()).map((i) => i.id)).toEqual([
      'b2',
      'a2',
      'b1',
      'a1',
    ]);
  });

  it('filters by feed', async () => {
    expect((await listItems({ feedIds: ['a'] })).map((i) => i.id)).toEqual([
      'a2',
      'a1',
    ]);
  });

  it('filters unread only', async () => {
    expect((await listItems({ unreadOnly: true })).map((i) => i.id)).toEqual([
      'b2',
      'a2',
      'a1',
    ]);
  });

  it('paginates with limit + before', async () => {
    const page1 = await listItems({ limit: 2 });
    expect(page1.map((i) => i.id)).toEqual(['b2', 'a2']);
    const page2 = await listItems({ limit: 2, before: page1[1].publishedAt });
    expect(page2.map((i) => i.id)).toEqual(['b1', 'a1']);
  });
});

describe('read-state mutations', () => {
  beforeEach(async () => {
    await upsertFeed(feed('a'));
    await upsertFeed(feed('b'));
    await upsertItems([
      item('a1', 'a', 1),
      item('a2', 'a', 2),
      item('b1', 'b', 3),
    ]);
  });

  it('markRead / markUnread toggle a single item', async () => {
    await markRead('a1');
    expect(
      (await listItems({ feedIds: ['a'], unreadOnly: true })).map((i) => i.id),
    ).toEqual(['a2']);
    await markUnread('a1');
    expect(await listItems({ unreadOnly: true })).toHaveLength(3);
  });

  it('markAllRead(feedId) only affects that feed', async () => {
    await markAllRead('a');
    const counts = await unreadCounts();
    expect(counts.get('a')).toBe(0);
    expect(counts.get('b')).toBe(1);
  });

  it('markAllRead() affects everything', async () => {
    await markAllRead();
    expect(await listItems({ unreadOnly: true })).toHaveLength(0);
  });
});

describe('unreadCounts', () => {
  it('reports zero for feeds with no unread items', async () => {
    await upsertFeed(feed('a'));
    await upsertFeed(feed('empty'));
    await upsertItems([item('a1', 'a', 1, true)]);
    const counts = await unreadCounts();
    expect(counts.get('a')).toBe(0);
    expect(counts.get('empty')).toBe(0);
  });
});

describe('pruneFeed', () => {
  it('keeps the newest N and deletes only read items beyond N', async () => {
    await upsertFeed(feed('a'));
    // 5 items; publishedAt 1..5. The two oldest (1, 2) are read.
    await upsertItems([
      item('a1', 'a', 1, true),
      item('a2', 'a', 2, true),
      item('a3', 'a', 3),
      item('a4', 'a', 4),
      item('a5', 'a', 5),
    ]);
    const deleted = await pruneFeed('a', 3); // keep newest 3: a5,a4,a3
    expect(deleted).toBe(2); // a1,a2 were read → deleted
    expect((await listItems()).map((i) => i.id)).toEqual(['a5', 'a4', 'a3']);
  });

  it('never prunes unread items even beyond N', async () => {
    await upsertFeed(feed('a'));
    await upsertItems([
      item('a1', 'a', 1), // unread, oldest, beyond the cap
      item('a2', 'a', 2, true), // read, beyond the cap → deletable
      item('a3', 'a', 3),
      item('a4', 'a', 4),
    ]);
    const deleted = await pruneFeed('a', 2); // keep newest 2: a4,a3
    expect(deleted).toBe(1); // only a2 (read) deleted; a1 (unread) kept
    expect((await listItems()).map((i) => i.id).sort()).toEqual([
      'a1',
      'a3',
      'a4',
    ]);
  });
});
