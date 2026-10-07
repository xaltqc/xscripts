// ==UserScript==
// @name         Simpcity Gallery
// @namespace    simpcity-gallery
// @version      1.1.0
// @description  Redesigns watched-thread and forum thread lists into a responsive, theme-adaptive image-card gallery.
// @match        *://simpcity.cr/watched/threads*
// @match        *://simpcity.cr/forums/*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

/*
 * CSS-first redesign: the page keeps its original DOM, so bulk actions,
 * checkboxes, tooltips, page-jump links, filters and ajax submit all keep
 * working. The stylesheet only re-lays out thread rows as cards. The small JS
 * pass adds a placeholder for rows whose thumbnail is missing or broken, and
 * watches for rows XenForo adds dynamically.
 *
 * Covered: watched threads (/watched/threads*) and forum thread lists
 * (/forums/*). The inline "post new thread" form and the pinned/sticky group
 * on forum pages are left with their normal theme styling.
 *
 * Knobs:
 *   - card width / columns:  --sg-grid-min
 *   - corner radius:         --sg-radius
 *   - accent (unread, hover): --sg-accent
 */

(function () {
  "use strict";

  const ITEM_SELECTOR = ".structItem--thread";
  const THUMB_CELL_SELECTOR =
    ".structItem-cell--icon:not(.structItem-cell--iconEnd)";
  const NO_THUMB_CLASS = "sg-no-thumb";
  const STYLE_ID = "sg-gallery-styles";

  const css = `
html.sg-gallery {
  --sg-radius: 12px;
  --sg-grid-min: 240px;
  --sg-card-bg: var(--xf-contentBg, rgba(127, 127, 127, 0.07));
  --sg-border: var(--xf-borderColor, rgba(127, 127, 127, 0.28));
  --sg-text: var(--xf-textColor, inherit);
  --sg-muted: var(--xf-textColorMuted, rgba(127, 127, 127, 0.95));
  --sg-accent: var(--xf-linkColor, #4a9eff);
  --sg-chip-bg: rgba(127, 127, 127, 0.14);

  /* let the block that holds the thread list recede so the cards read as content */
  .block-container:has(> .block-body > .structItemContainer) {
    background: transparent;
    border: 0;
    box-shadow: none;
    overflow: visible;
  }

  .block-container:has(> .block-body > .structItemContainer) > .block-body {
    padding: 12px;
    overflow: visible;
  }

  /* ---------- grids ----------
     Watched page: the container itself is the grid.
     Forum page: only the normal thread list becomes a grid; the pinned group
     keeps its stock layout. */
  .structItemContainer:not(:has(> .structItemContainer-group)) {
    display: grid !important;
    grid-template-columns: repeat(auto-fill, minmax(var(--sg-grid-min), 1fr));
    gap: 16px;
  }

  .structItemContainer-group:not(.structItemContainer-group--sticky) {
    display: grid !important;
    grid-template-columns: repeat(auto-fill, minmax(var(--sg-grid-min), 1fr));
    gap: 16px;
  }

  /* safety net for the watched grid: any non-card child spans the full row */
  .structItemContainer > :not(.structItem--thread) {
    grid-column: 1 / -1;
  }

  /* note: the pinned (.structItemContainer-group--sticky) group is deliberately
     left with its stock theme styling — no grid, no cards, no placeholder pass. */

  /* keep XF's client-side filter menu able to hide cards */
  .structItem--thread:not(.structItemContainer-group--sticky *).filter-hidden,
  .structItem--thread:not(.structItemContainer-group--sticky *)[hidden],
  .structItem--thread:not(.structItemContainer-group--sticky *)[style*="display: none"],
  .structItem--thread:not(.structItemContainer-group--sticky *)[style*="display:none"] {
    display: none !important;
  }

  /* ---------- card ---------- */
  .structItem--thread:not(.structItemContainer-group--sticky *) {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: auto 1fr auto auto;
    grid-template-areas:
      "thumb  thumb"
      "main   main"
      "meta   meta"
      "latest iconEnd";
    position: relative;
    min-width: 0;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden;
    background: var(--sg-card-bg) !important;
    border: 1px solid var(--sg-border) !important;
    border-radius: var(--sg-radius);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
    transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
  }

  .structItem--thread:not(.structItemContainer-group--sticky *) > .structItem-cell {
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }

  /* ---------- thumbnail ---------- */
  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-cell--icon {
    grid-area: thumb;
    position: relative;
    width: auto !important;
    height: auto !important;
    overflow: hidden;
  }

  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-cell--icon .structItem-iconContainer {
    width: 100%;
    height: 100%;
    padding: 0;
  }

  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-cell--icon .dcThumbnail {
    display: block !important;
    width: 100% !important;
    height: auto !important;
    aspect-ratio: 3 / 2;
    border-radius: 0 !important;
    overflow: hidden;
  }

  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-cell--icon .dcThumbnail img {
    display: block;
    width: 100%;
    height: 100%;
    transition: transform 0.35s ease;
  }

  /* unread indicator */
  .structItem--thread:not(.structItemContainer-group--sticky *).is-unread .structItem-cell--icon:not(.structItem-cell--iconEnd)::after {
    content: "";
    position: absolute;
    top: 10px;
    right: 10px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--sg-accent);
    box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.35);
    z-index: 4;
  }

  /* missing / broken thumbnail fallback */
  .structItem--thread:not(.structItemContainer-group--sticky *).sg-no-thumb .structItem-cell--icon:not(.structItem-cell--iconEnd) {
    display: grid;
    place-items: center;
    aspect-ratio: 3 / 2;
    background: linear-gradient(135deg, rgba(127, 127, 127, 0.3), rgba(127, 127, 127, 0.06));
  }

  .structItem--thread:not(.structItemContainer-group--sticky *).sg-no-thumb .structItem-cell--icon:not(.structItem-cell--iconEnd) .structItem-iconContainer {
    display: none;
  }

  .structItem--thread:not(.structItemContainer-group--sticky *).sg-no-thumb .structItem-cell--icon:not(.structItem-cell--iconEnd)::before {
    content: attr(data-sg-initial);
    font-size: 2.2rem;
    font-weight: 700;
    opacity: 0.45;
    user-select: none;
  }

  /* ---------- title, tags, byline ---------- */
  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-cell--main {
    grid-area: main;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 14px;
  }

  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-title {
    display: flex !important;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    font-size: 1.02rem;
    line-height: 1.35;
  }

  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-title > a:not(.labelLink) {
    order: -1;
    flex: 0 0 100%;
    min-width: 0;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
    overflow-wrap: break-word;
    color: var(--sg-text);
    font-weight: 600;
    text-decoration: none;
  }

  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-title > a:not(.labelLink):hover {
    color: var(--sg-accent);
  }

  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-title > a:not(.labelLink):focus-visible {
    outline: 2px solid var(--sg-accent);
    outline-offset: 2px;
    border-radius: 4px;
  }

  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-title .labelLink {
    display: inline-flex;
    align-items: center;
    text-decoration: none;
  }

  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-title .label {
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 11px;
    line-height: 1.6;
  }

  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-title .label-append {
    display: none;
  }

  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-cell--main .structItem-minor {
    margin: 0;
    font-size: 0.8rem;
    color: var(--sg-muted);
  }

  /* locked / sticky badges */
  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-statuses {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-statuses > li {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin: 0;
  }

  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-status {
    font-size: 0.85rem;
    opacity: 0.7;
  }

  /* ---------- bulk-select checkbox, floating over the thumbnail ---------- */
  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-extraInfo {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 6;
    display: block;
    margin: 0;
    padding: 0;
    list-style: none;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-extraInfo > li {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .structItem--thread:not(.structItemContainer-group--sticky *):hover .structItem-extraInfo,
  .structItem--thread:not(.structItemContainer-group--sticky *):focus-within .structItem-extraInfo,
  .structItem--thread:not(.structItemContainer-group--sticky *):has(input:checked) .structItem-extraInfo {
    opacity: 1;
  }

  @media (hover: none) {
    .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-extraInfo {
      opacity: 1;
    }
  }

  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-extraInfo .iconic {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 9px;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    cursor: pointer;
  }

  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-extraInfo .iconic:focus-within {
    outline: 2px solid var(--sg-accent);
    outline-offset: 2px;
  }

  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-extraInfo .iconic input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-extraInfo .iconic i {
    font-size: 15px;
    line-height: 1;
    color: inherit;
  }

  /* ---------- byline: author, start date, forum, page jumps ---------- */
  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-parts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-parts > li {
    margin: 0;
  }

  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-startDate,
  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-startDate a {
    color: var(--sg-muted);
  }

  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-parts a[href*="/forums/"] {
    display: inline-block;
    padding: 1px 8px;
    border-radius: 6px;
    background: var(--sg-chip-bg);
    font-size: 0.74rem;
    line-height: 1.5;
    text-decoration: none;
  }

  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-pageJump {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
  }

  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-pageJump a {
    display: inline-block;
    min-width: 20px;
    padding: 1px 6px;
    border-radius: 6px;
    background: var(--sg-chip-bg);
    font-size: 0.72rem;
    line-height: 1.5;
    text-align: center;
    text-decoration: none;
  }

  /* ---------- stats strip ---------- */
  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-cell--meta {
    grid-area: meta;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 16px;
    padding: 8px 14px !important;
    border-top: 1px solid var(--sg-border);
    font-size: 0.78rem;
    color: var(--sg-muted);
  }

  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-cell--meta .pairs {
    display: inline-flex;
    align-items: baseline;
    gap: 5px;
    margin: 0;
  }

  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-cell--meta dt {
    margin: 0;
    color: var(--sg-muted);
    font-weight: 400;
  }

  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-cell--meta dd {
    margin: 0;
    color: var(--sg-text);
    font-weight: 600;
  }

  /* ---------- latest activity ---------- */
  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-cell--latest {
    grid-area: latest;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 8px 4px 12px 14px !important;
    font-size: 0.78rem;
    color: var(--sg-muted);
  }

  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-cell--latest .uix_mobileNodeTitle {
    display: none !important;
  }

  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-cell--latest .structItem-minor {
    order: -1;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0;
  }

  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-cell--latest .structItem-minor::after {
    content: "·";
    opacity: 0.55;
  }

  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-latestDate {
    color: var(--sg-muted);
  }

  /* ---------- latest poster avatar ---------- */
  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-cell--iconEnd {
    grid-area: iconEnd;
    width: auto !important;
    height: auto !important;
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
    padding: 8px 12px 12px 4px !important;
    overflow: visible !important;
  }

  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-cell--iconEnd .avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    overflow: hidden;
  }

  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-cell--iconEnd .avatar img {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }

  .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-cell--iconEnd .avatar > span {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    font-size: 0.8rem;
    font-weight: 600;
  }

  /* ---------- bulk-actions bar (watched page; normal flow, not sticky) ---------- */
  .block-container:has(> .block-body > .structItemContainer) > .block-footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin-top: 16px;
    padding: 10px 14px;
    background: var(--sg-card-bg);
    border: 1px solid var(--sg-border);
    border-radius: var(--sg-radius);
  }

  .block-container:has(> .block-body > .structItemContainer) > .block-footer .block-footer-select {
    display: inline-flex;
    align-items: center;
  }

  .block-container:has(> .block-body > .structItemContainer) > .block-footer .block-footer-controls {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  }

  /* ---------- hover polish ---------- */
  @media (hover: hover) {
    .structItem--thread:not(.structItemContainer-group--sticky *):hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 26px rgba(0, 0, 0, 0.16);
      border-color: color-mix(in srgb, var(--sg-accent) 40%, var(--sg-border)) !important;
    }

    .structItem--thread:not(.structItemContainer-group--sticky *):hover .dcThumbnail img {
      transform: scale(1.06);
    }
  }

  /* keep the unread accent visible on hover */
  .structItem--thread:not(.structItemContainer-group--sticky *).is-unread {
    border-color: color-mix(in srgb, var(--sg-accent) 55%, var(--sg-border)) !important;
  }

  /* ---------- responsive ---------- */
  @media (max-width: 700px) {
    .block-container:has(> .block-body > .structItemContainer) > .block-body {
      padding: 8px;
    }

    .structItemContainer:not(:has(> .structItemContainer-group)),
    .structItemContainer-group:not(.structItemContainer-group--sticky) {
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
    }

    .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-cell--main {
      padding: 10px 12px;
    }

    .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-cell--meta,
    .structItem--thread:not(.structItemContainer-group--sticky *) .structItem-cell--latest {
      padding-left: 12px !important;
    }
  }

  @media (max-width: 480px) {
    .structItemContainer:not(:has(> .structItemContainer-group)),
    .structItemContainer-group:not(.structItemContainer-group--sticky) {
      grid-template-columns: 1fr;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .structItem--thread:not(.structItemContainer-group--sticky *),
    .structItem--thread:not(.structItemContainer-group--sticky *) .dcThumbnail img {
      transition: none !important;
    }
  }
}
`;

  function injectEarly() {
    if (!document.documentElement) return false;

    document.documentElement.classList.add("sg-gallery");

    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = css;
      (document.head || document.documentElement).appendChild(style);
    }

    return true;
  }

  if (!injectEarly()) {
    document.addEventListener("readystatechange", function onReadyState() {
      if (injectEarly()) {
        document.removeEventListener("readystatechange", onReadyState);
      }
    });
  }

  function titleOf(item) {
    const link = item.querySelector(".structItem-title a:not(.labelLink)");
    return link ? link.textContent.trim() : "";
  }

  function thumbUrl(item) {
    const img = item.querySelector(`${THUMB_CELL_SELECTOR} .dcThumbnail img`);
    if (!img) return "";

    const bg = getComputedStyle(img).backgroundImage || "";
    const match = bg.match(/url\((['"]?)(.*?)\1\)/);
    if (match) return match[2];

    // Some styles put the real image in src instead of a CSS background.
    const src = img.getAttribute("src") || "";
    return src && !src.startsWith("data:") ? src : "";
  }

  function showPlaceholder(item) {
    item.classList.add(NO_THUMB_CLASS);

    const cell = item.querySelector(THUMB_CELL_SELECTOR);
    if (cell) {
      const title = titleOf(item);
      cell.dataset.sgInitial = title ? title.charAt(0).toUpperCase() : "?";
    }
  }

  function hidePlaceholder(item) {
    item.classList.remove(NO_THUMB_CLASS);
  }

  function enhanceItem(item) {
    if (!(item instanceof HTMLElement)) return;

    // Pinned/sticky rows keep their stock theme styling.
    if (item.closest(".structItemContainer-group--sticky")) return;

    const url = thumbUrl(item);
    if (!url) {
      showPlaceholder(item);
      return;
    }

    const probe = new Image();
    probe.onload = () => hidePlaceholder(item);
    probe.onerror = () => showPlaceholder(item);
    probe.src = url;
  }

  function enhanceWithin(root) {
    root.querySelectorAll(ITEM_SELECTOR).forEach(enhanceItem);
  }

  function init() {
    const containers = document.querySelectorAll(".structItemContainer");
    if (!containers.length) return;

    document.querySelectorAll(ITEM_SELECTOR).forEach(enhanceItem);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;

          if (node.matches(ITEM_SELECTOR)) {
            enhanceItem(node);
          } else {
            enhanceWithin(node);
          }
        }
      }
    });

    containers.forEach((container) => {
      observer.observe(container, { childList: true, subtree: true });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
