import { expect, type Page } from "@playwright/test";

/** Every route reachable in demo mode, by the path a person would visit. */
export const PUBLIC_ROUTES = ["/", "/sign-in", "/sign-up"] as const;

export const DASHBOARD_ROUTES = [
  "/dashboard",
  "/accounts",
  "/holdings",
  "/transactions",
  "/net-worth",
  "/projections",
  "/analytics",
  "/analysis",
  "/settings",
  "/import",
  "/help",
  "/account",
] as const;

/**
 * Enter demo mode.
 *
 * Demo mode is the only way this suite can reach the signed-in screens without
 * standing up an auth provider, and it reads the same seeded household on every
 * run, so the geometry under test is stable.
 */
export async function enterDemoMode(page: Page) {
  await page.goto("/?demo=true");
  await page.waitForURL("**/dashboard", { timeout: 30_000 });
}

/**
 * Elements whose right edge is past the viewport with nothing able to scroll
 * to them.
 *
 * A wide table inside `overflow-x-auto` is fine and common — the container
 * scrolls. What is never fine is content that pushes the page itself sideways,
 * because the reader has to pan the whole layout to read one number.
 */
export async function findHorizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    const offenders: { tag: string; cls: string; right: number; text: string }[] = [];

    const scrollsHorizontally = (el: Element) => {
      const o = getComputedStyle(el).overflowX;
      return o === "auto" || o === "scroll" || o === "hidden";
    };

    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      // A tolerance of 1px absorbs sub-pixel rounding, which is not a bug.
      if (rect.right <= limit + 1 && rect.left >= -1) continue;

      let clipped = false;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        if (scrollsHorizontally(a)) {
          clipped = true;
          break;
        }
      }
      if (clipped) continue;

      offenders.push({
        tag: el.tagName.toLowerCase(),
        cls: String((el as HTMLElement).className ?? "").slice(0, 80),
        right: Math.round(rect.right),
        text: (el.textContent ?? "").trim().slice(0, 40),
      });
    }
    return { limit, offenders: offenders.slice(0, 8) };
  });
}

/**
 * Form controls small enough that iOS Safari zooms the page when they are
 * focused — and never zooms back out, leaving the layout stranded mid-pan.
 * 16px is the threshold Safari uses.
 */
export async function findZoomTriggeringInputs(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("input, select, textarea"))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        // Only controls that raise a keyboard can trigger the zoom. A slider,
        // a checkbox or a colour swatch never does, whatever its font size.
        const NO_KEYBOARD = new Set([
          "hidden", "range", "checkbox", "radio", "color",
          "button", "submit", "reset", "file", "image",
        ]);
        if (el instanceof HTMLInputElement && NO_KEYBOARD.has(el.type)) return false;
        // A control nobody can tap cannot be focused, so it cannot zoom. This
        // skips the hidden inputs component libraries render to carry a form
        // value while a styled button does the interacting.
        const cs = getComputedStyle(el);
        if (cs.pointerEvents === "none" || cs.opacity === "0") return false;
        if (el.getAttribute("aria-hidden") === "true") return false;
        if (el.getAttribute("tabindex") === "-1") return false;
        return parseFloat(cs.fontSize) < 16;
      })
      .map((el) => {
        const e = el as HTMLInputElement;
        return `${el.tagName.toLowerCase()}[${e.name || e.type || "?"}] ${getComputedStyle(el).fontSize}`;
      })
      .slice(0, 8)
  );
}

/** Assert a page fits its screen and will not zoom on focus. */
export async function expectFitsViewport(page: Page, label: string) {
  const { limit, offenders } = await findHorizontalOverflow(page);
  expect(
    offenders,
    `${label}: content runs past the ${limit}px viewport with no way to scroll to it — ` +
      JSON.stringify(offenders, null, 2)
  ).toEqual([]);

  const scrollsSideways = await page.evaluate(() => {
    const de = document.documentElement;
    return de.scrollWidth > de.clientWidth + 1;
  });
  expect(scrollsSideways, `${label}: the page scrolls horizontally`).toBe(false);

  const small = await findZoomTriggeringInputs(page);
  expect(
    small,
    `${label}: form controls under 16px make iOS zoom on focus — ${small.join(", ")}`
  ).toEqual([]);
}

/**
 * Assert an open overlay fits on screen and every control in it can be reached.
 *
 * This is the shape of the bug that prompted the suite: a centred, fixed panel
 * taller than the screen overflows in both directions at once, and because it
 * is fixed, the page cannot scroll to what is off-screen. Checking only the
 * bottom edge would have missed it — the top has to be checked too.
 */
export async function expectOverlayUsable(page: Page, selector: string, label: string) {
  const panel = page.locator(selector).first();
  await expect(panel, `${label}: overlay never appeared`).toBeVisible();

  // Overlays fade, zoom and slide in. Measuring mid-flight reports the
  // animation's geometry rather than the layout's, so wait for every running
  // animation on the panel to settle before taking a number seriously.
  await panel.evaluate(async (el) => {
    await Promise.all(
      el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {}))
    );
  });
  await page.waitForTimeout(150);

  const box = await panel.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      left: Math.round(r.left),
      right: Math.round(r.right),
      viewportH: window.innerHeight,
      viewportW: window.innerWidth,
      scrollable: el.scrollHeight > el.clientHeight,
      overflowY: getComputedStyle(el).overflowY,
    };
  });

  expect(
    box.top,
    `${label}: overlay starts ${-box.top}px above the screen, where nothing can scroll it back`
  ).toBeGreaterThanOrEqual(0);
  expect(
    box.bottom,
    `${label}: overlay ends ${box.bottom - box.viewportH}px below the screen`
  ).toBeLessThanOrEqual(box.viewportH);
  expect(box.left, `${label}: overlay starts off the left edge`).toBeGreaterThanOrEqual(0);
  expect(
    box.right,
    `${label}: overlay ends past the right edge`
  ).toBeLessThanOrEqual(box.viewportW);

  // A panel that fits but clips its own content is the same bug wearing a
  // different hat, so anything taller than its box has to scroll.
  if (!box.scrollable) return;
  expect(
    ["auto", "scroll"],
    `${label}: content is taller than the panel but the panel does not scroll (overflow-y: ${box.overflowY})`
  ).toContain(box.overflowY);

  // The submit button is the one that matters: a form you cannot save is a
  // form you cannot use. Checked by hit-testing, not just by position, so an
  // overlapping element counts as unreachable.
  const submit = panel.locator('button[type="submit"]');
  if ((await submit.count()) === 0) return;

  const target = submit.first();
  await target.scrollIntoViewIfNeeded();
  const reachable = await target.evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) return false;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (el === hit || el.contains(hit) || hit.contains(el));
  });
  expect(
    reachable,
    `${label}: the submit button cannot be scrolled to and tapped`
  ).toBe(true);
}
