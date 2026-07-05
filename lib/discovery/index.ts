// Public surface of the discovery domain module.
export type {
  DiscoveredFeed,
  FeedKind,
  FeedSource,
} from '@/lib/discovery/types';
export {
  scanForFeeds,
  type DocumentLike,
  type LinkLike,
} from '@/lib/discovery/scan';
export {
  probeOrigin,
  WELL_KNOWN_PATHS,
  type ProbeOptions,
} from '@/lib/discovery/probe';
export {
  recordDiscoveredFeeds,
  getDiscoveredFeeds,
  clearDiscovered,
} from '@/lib/discovery/session';
export {
  syncDiscoveryRegistration,
  registerDiscoveryScript,
  unregisterDiscoveryScript,
  isDiscoveryRegistered,
  DISCOVERY_SCRIPT_ID,
  DISCOVERY_SCRIPT_FILE,
} from '@/lib/discovery/registration';
