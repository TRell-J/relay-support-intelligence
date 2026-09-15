'use client';

/**
 * Session-scoped persistence.
 *
 * A reviewer who refreshes mid-demo should not lose their place, but state that
 * outlived the browser session would make "Reset Demo restores a known state"
 * confusing rather than reassuring. sessionStorage is exactly that trade
 * (ADR D-004).
 *
 * Every read is defensive. A corrupt or stale payload resets silently rather
 * than breaking the page — the cost of a bad restore is one lost demo run, and
 * the cost of a crash is the whole artifact.
 */
import { SCHEMA_VERSION, type RelayState } from '@/data/buildInitialState';

const STORAGE_KEY = `relay.state.v${SCHEMA_VERSION}`;

/**
 * The open conversation is kept under its own key rather than inside
 * `RelayState`.
 *
 * It is a UI pointer, not part of the demo record: folding it into the state
 * object would put it inside the hash that the Reset-Demo guarantee is asserted
 * against, for something that is not really state at all. Keeping it separate
 * means a refresh restores your place without weakening that guarantee.
 */
const UI_KEY = `relay.ui.v${SCHEMA_VERSION}`;

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    // Private modes and embedded contexts can throw on access, not just on use.
    return null;
  }
}

export function loadPersisted(): RelayState | null {
  const store = storage();
  if (!store) return null;

  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as RelayState;
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      store.removeItem(STORAGE_KEY);
      return null;
    }
    if (!Array.isArray(parsed.events) || typeof parsed.cases !== 'object') return null;

    return parsed;
  } catch {
    return null;
  }
}

export function persist(state: RelayState): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota exhaustion is survivable: the demo keeps working in memory.
  }
}

export function loadActiveConversation(): string | null {
  const store = storage();
  if (!store) return null;
  try {
    return store.getItem(UI_KEY);
  } catch {
    return null;
  }
}

export function persistActiveConversation(id: string | null): void {
  const store = storage();
  if (!store) return;
  try {
    if (id === null) store.removeItem(UI_KEY);
    else store.setItem(UI_KEY, id);
  } catch {
    /* quota or private mode; the demo keeps working in memory */
  }
}

export function clearPersisted(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(STORAGE_KEY);
    store.removeItem(UI_KEY);
  } catch {
    /* nothing to do */
  }
}
