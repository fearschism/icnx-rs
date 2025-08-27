export const listen = async (eventName: string, handler: (e: any) => void) => {
  // Listen to 'tauri://event' CustomEvents in tests and dispatch to handler when event matches
  const listener = (e: Event) => {
    const anyE = e as CustomEvent;
    if (anyE?.detail?.event === eventName) {
      try { handler({ payload: anyE.detail.payload }); } catch (err) { console.error('mock listen handler error', err); }
    }
  };
  window.addEventListener('tauri://event', listener as EventListener);
  return () => { window.removeEventListener('tauri://event', listener as EventListener); };
};

// mock removed to save disk space

// minimal unlisten signature placeholder
export type UnlistenFn = () => void;
