/**
 * The pull-to-refresh gesture, as numbers.
 *
 * Installed on a phone's home screen, RetireWise runs without browser
 * chrome: no reload button and no native pull-to-refresh, so a figure on
 * screen stayed as it was until the app was closed and opened again.
 */

/** How far, in pixels, the content must be pulled before letting go refreshes. */
export const PULL_THRESHOLD = 72;
/** The furthest the indicator travels, however far the finger goes. */
export const PULL_MAX = 112;

/**
 * Where the indicator sits for a finger moved `distance` pixels down, and
 * whether letting go now would refresh. The pull is damped to half the
 * finger's travel, as native pulls are, so it reads as resisting.
 */
export function pullState(distance: number): { offset: number; progress: number; ready: boolean } {
  const travelled = Math.max(0, distance) / 2;
  const offset = Math.min(PULL_MAX, travelled);
  const progress = Math.min(1, travelled / PULL_THRESHOLD);
  return { offset, progress, ready: travelled >= PULL_THRESHOLD };
}
