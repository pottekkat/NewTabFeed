// Typed request/response helper for the popup → service-worker channel.
// Mirrors the envelope in lib/messages.ts so callers get a discriminated result.

import { browser } from 'wxt/browser';
import type { RequestMessage, Response } from '@/lib/messages';

/** Send a typed request to the worker and return its typed response envelope. */
export async function sendRequest<M extends RequestMessage>(
  message: M,
): Promise<Response<M['type']>> {
  return (await browser.runtime.sendMessage(message)) as Response<M['type']>;
}
