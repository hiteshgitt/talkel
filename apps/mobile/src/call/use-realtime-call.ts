import { useEffect, useState, useSyncExternalStore } from 'react';
import { type CallState, RealtimeCall } from './realtime-call';

interface Snapshot {
  call: RealtimeCall | null;
  state: CallState | null;
}

/**
 * Holds the current call for a screen. A new RealtimeCall is created per mount (inside the
 * effect), so a dev-mode double mount tears the first call down cleanly instead of reusing it.
 */
class CallHolder {
  private snapshot: Snapshot = { call: null, state: null };
  private readonly listeners = new Set<() => void>();
  private unsubscribeCall: (() => void) | null = null;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  open(conversationId: string): RealtimeCall {
    const call = new RealtimeCall(conversationId);
    this.unsubscribeCall = call.subscribe((state) => this.emit({ call, state }));
    this.emit({ call, state: call.getState() });
    return call;
  }

  close(call: RealtimeCall): void {
    this.unsubscribeCall?.();
    this.unsubscribeCall = null;
    void call.hangUp();
  }

  private emit(next: Snapshot): void {
    this.snapshot = next;
    for (const l of this.listeners) l();
  }
}

/** Starts a call on mount, hangs up on unmount, and exposes live call state. */
export function useRealtimeCall(conversationId: string): Snapshot {
  const [holder] = useState(() => new CallHolder());
  const snapshot = useSyncExternalStore(holder.subscribe, holder.getSnapshot);

  useEffect(() => {
    const call = holder.open(conversationId);
    void call.start();
    return () => holder.close(call);
  }, [holder, conversationId]);

  return snapshot;
}
