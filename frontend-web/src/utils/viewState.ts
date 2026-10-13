export function readScrollPosition(key: string): number {
  try {
    const value = Number(window.sessionStorage.getItem(key));
    return Number.isFinite(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function writeScrollPosition(key: string, position: number) {
  try {
    window.sessionStorage.setItem(key, String(Math.max(0, position)));
  } catch {
    /* Remembering a view must never prevent using the app. */
  }
}
