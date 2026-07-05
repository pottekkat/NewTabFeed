// Curated starter feeds for first-run onboarding.
//
// A small, high-quality, low-churn set spanning tech and general interest, so
// the first new tab is never empty. The onboarding UI (Phase 2) shows these as
// a checklist; unchecked ones are simply not subscribed. Every URL was verified
// live (HTTP 200, parses) when this list was authored.

export interface StarterFeed {
  name: string;
  description: string;
  feedUrl: string;
  siteUrl: string;
  category: 'Technology' | 'General';
}

export const STARTER_FEEDS: readonly StarterFeed[] = [
  {
    name: 'Hacker News',
    description: 'Front-page stories from the Hacker News community.',
    feedUrl: 'https://hnrss.org/frontpage',
    siteUrl: 'https://news.ycombinator.com',
    category: 'Technology',
  },
  {
    name: 'Lobsters',
    description: 'Computing-focused link aggregation and discussion.',
    feedUrl: 'https://lobste.rs/rss',
    siteUrl: 'https://lobste.rs',
    category: 'Technology',
  },
  {
    name: 'Ars Technica',
    description: 'In-depth technology, science, and policy news.',
    feedUrl: 'https://feeds.arstechnica.com/arstechnica/index',
    siteUrl: 'https://arstechnica.com',
    category: 'Technology',
  },
  {
    name: 'The Verge',
    description: 'Technology, science, art, and culture.',
    feedUrl: 'https://www.theverge.com/rss/index.xml',
    siteUrl: 'https://www.theverge.com',
    category: 'Technology',
  },
  {
    name: 'Simon Willison',
    description: 'Notes on software, data, and AI from Simon Willison.',
    feedUrl: 'https://simonwillison.net/atom/everything/',
    siteUrl: 'https://simonwillison.net',
    category: 'Technology',
  },
  {
    name: 'Julia Evans',
    description: 'Friendly deep dives into how computers actually work.',
    feedUrl: 'https://jvns.ca/atom.xml',
    siteUrl: 'https://jvns.ca',
    category: 'Technology',
  },
  {
    name: 'kottke.org',
    description: 'Jason Kottke on the liberal arts of the web.',
    feedUrl: 'https://kottke.org/index.xml',
    siteUrl: 'https://kottke.org',
    category: 'General',
  },
  {
    name: 'NASA',
    description: 'News and updates from NASA.',
    feedUrl: 'https://www.nasa.gov/feed/',
    siteUrl: 'https://www.nasa.gov',
    category: 'General',
  },
  {
    name: 'The Marginalian',
    description: 'Maria Popova on books, ideas, and the examined life.',
    feedUrl: 'https://www.themarginalian.org/feed/',
    siteUrl: 'https://www.themarginalian.org',
    category: 'General',
  },
  {
    name: 'xkcd',
    description: 'A webcomic of romance, sarcasm, math, and language.',
    feedUrl: 'https://xkcd.com/rss.xml',
    siteUrl: 'https://xkcd.com',
    category: 'General',
  },
];
