// ==UserScript==
// @name         RedGifs Quick Save
// @namespace    rgqs
// @version      1.1.0
// @description  One click (or keypress) to add a RedGifs post to your collection and like it.
// @match        https://www.redgifs.com/*
// @match        https://redgifs.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

// ==================================================
//             Quick Guide
// ==================================================
// # RedGifs Quick Save
//
// A userscript that turns the six-step "save post to collection + like" dance into **one click**.
//
// ## What it does
//
// Adds a bookmark button to every post's sidebar (right above the LIVE button). One click:
//
// 1. opens the More menu,
// 2. clicks **"Add to a Collection"**,
// 3. clicks your collection (default: `Favorite`),
// 4. likes the post (skipped if it's already liked).
//
// Prefer the keyboard? Hover a post and press `S` — same thing, no clicking (see Configuration below).
//
// It is safe to click repeatedly: it never removes a post from a collection and never un-likes anything.
// Saved posts get a green-filled bookmark that is remembered across page loads.
//
// ## Install
//
// 1. Install [Tampermonkey](https://www.tampermonkey.net/) (or Violentmonkey) in your browser.
// 2. Dashboard → create a new script → paste the contents of `redgifs-quick-save.user.js` → save.
// 3. Reload redgifs.com and hover any post: the bookmark button appears in the sidebar.
//
// ## Configuration
//
// Edit `DEFAULTS` at the top of the script, or set `window.__RGQS_CONFIG` before the script runs (advanced):
//
// ```js
// window.__RGQS_CONFIG = {
//   collectionName: "Favorite", // which collection to save into
//   keybind: "s",               // save the post under your pointer with this key ("" disables)
//   toastMs: 2200,              // how long the toast stays up
//   debug: true,                // console logging
// };
// ```

(function () {
  "use strict";

  const DEFAULTS = {
    collectionName: "Favorite",
    keybind: "s",
    timeouts: { menu: 2500, popup: 6000, collection: 3000, like: 1000 },
    toastMs: 2200,
    debug: false,
  };

  const SEL = {
    sidebar: "ul.sideBar",
    sidebarItem: "li.sideBarItem",
    card: ".GifPreview",
    more: "button.MoreButton",
    like: "button.LikeButton",
    menuItem: 'button.PopOverMenuItem[aria-label="Add to a Collection"]',
    collectionPopup: ".AddToCollectionPopup",
    collectionItem: ".CollectionItem",
    collectionTitle: ".CollectionItem-Title",
  };

  const ICON_STYLE =
    'stroke="#EFEEF0" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
  const BOOKMARK_PATH =
    "M7.5 9.17h2.5m0 0h2.5m-2.5 0v-2.5m0 2.5v2.5M16.67 18.33V8.33c0-2.33 0-3.5-.45-4.39a4.17 4.17 0 0 0-1.82-1.82c-.89-.45-2.06-.45-4.4-.45s-3.5 0-4.39.45a4.17 4.17 0 0 0-1.82 1.82c-.45.89-.45 2.06-.45 4.39v10l1.9-.95c1.75-.87 2.62-1.31 3.54-1.48a8.33 8.33 0 0 1 2.46 0c.92.17 1.79.61 3.54 1.48l1.9.95Z";

  const BOOKMARK_ICON =
    `<svg width="30" height="30" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">` +
    `<path d="${BOOKMARK_PATH}" ${ICON_STYLE}/></svg>`;

  const BOOKMARK_SAVED_ICON =
    `<svg width="30" height="30" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">` +
    `<path fill="url(#rgqs-saved-fill)" d="${BOOKMARK_PATH}"/>` +
    `<defs><linearGradient id="rgqs-saved-fill" x1="10" y1="4" x2="10" y2="16" gradientUnits="userSpaceOnUse">` +
    `<stop stop-color="#EBFA63"/><stop offset="1" stop-color="#DAF02B"/>` +
    `</linearGradient></defs></svg>`;

  const CSS = `
.rgqs-save{display:flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border:0;background:none;color:#EFEEF0;cursor:pointer;opacity:.9;transition:opacity .15s}
.rgqs-save:hover{opacity:1}
.rgqs-save .rgqs-icon-saved{display:none}
.rgqs-save.rgqs-saved .rgqs-icon-default{display:none}
.rgqs-save.rgqs-saved .rgqs-icon-saved{display:block}
.rgqs-save.rgqs-busy{cursor:progress;opacity:.5}
.rgqs-toast{position:fixed;right:16px;bottom:16px;z-index:99999;background:#161617;border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:10px 14px;font:13px/1.4 system-ui,sans-serif;color:#EFEEF0;box-shadow:0 6px 24px rgba(0,0,0,.4)}
.rgqs-toast-success{border-color:rgba(218,240,43,.55)}
.rgqs-toast-error{border-color:rgba(229,25,77,.65)}
.rgqs-toast-info{border-color:rgba(255,255,255,.38)}
`;

  function createQuickSave({ window, cfg }) {
    const doc = window.document;

    const log = (...args) => {
      if (cfg.debug) console.debug("[rgqs]", ...args);
    };

    const injectStyles = () => {
      if (doc.getElementById("rgqs-styles")) return;
      const style = doc.createElement("style");
      style.id = "rgqs-styles";
      style.textContent = CSS;
      doc.head.append(style);
    };

    const makeButtonItem = () => {
      const item = doc.createElement("li");
      item.className = "sideBarItem";
      item.setAttribute("data-rgqs", "");
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "rgqs-save";
      button.title = `Add to "${cfg.collectionName}" & like${cfg.keybind ? ` (${cfg.keybind.toUpperCase()})` : ""}`;
      button.setAttribute("aria-label", `${button.title} (quick save)`);
      button.innerHTML =
        `<span class="rgqs-icon rgqs-icon-default">${BOOKMARK_ICON}</span>` +
        `<span class="rgqs-icon rgqs-icon-saved">${BOOKMARK_SAVED_ICON}</span>`;
      item.append(button);
      return item;
    };

    const inflight = new Set();
    let queueTail = Promise.resolve();

    // Runs one save at a time; repeated clicks on a post already queued are ignored.
    const requestSave = (button) => {
      const gifId = gifIdFor(button);
      const key = gifId || button;
      if (inflight.has(key)) return;
      inflight.add(key);
      button.classList.add("rgqs-busy");
      queueTail = queueTail.then(async () => {
        try {
          await runSave(button, gifId);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          try {
            console.error("[rgqs]", message);
            if (!error.noCleanup) closeStrays();
            showToast(`Quick save failed: ${message}`, "error");
          } catch (reportError) {
            console.error("[rgqs] error reporting failed", reportError);
          }
        } finally {
          inflight.delete(key);
          button.classList.remove("rgqs-busy");
        }
      });
    };

    const injectInto = (sidebar) => {
      const item = makeButtonItem();
      const button = item.querySelector("button");
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        requestSave(button);
      });
      const moreItem = sidebar
        .querySelector(SEL.more)
        ?.closest(SEL.sidebarItem);
      if (moreItem) {
        moreItem.insertAdjacentElement("afterend", item);
      } else {
        sidebar.append(item);
      }
      const gifId = gifIdFor(sidebar);
      if (gifId && savedIds.has(gifId)) button.classList.add("rgqs-saved");
      log("injected quick-save button");
    };

    const waitUntil = (getter, timeout, label) =>
      new Promise((resolve, reject) => {
        const started = Date.now();
        const poll = () => {
          let value = null;
          try {
            value = getter();
          } catch {
            value = null;
          }
          if (value) return resolve(value);
          if (Date.now() - started >= timeout) {
            return reject(new Error(`timed out waiting for ${label}`));
          }
          window.setTimeout(poll, 50);
        };
        poll();
      });

    const findCollectionItem = () => {
      const popup = doc.querySelector(SEL.collectionPopup);
      if (!popup) return null;
      return (
        [...popup.querySelectorAll(SEL.collectionItem)].find(
          (item) =>
            item.querySelector(SEL.collectionTitle)?.textContent.trim() ===
            cfg.collectionName,
        ) || null
      );
    };

    // The site renders the gradient heart (liked-gradient) only for liked gifs;
    // the unliked icon is a different SVG without that gradient.
    const isLiked = (likeButton) =>
      !!likeButton.querySelector('linearGradient[id$="liked-gradient"]');

    const STORAGE_KEY = "rgqs:saved";
    const loadSavedIds = () => {
      try {
        const parsed = JSON.parse(
          window.localStorage.getItem(STORAGE_KEY) || "[]",
        );
        return new Set(Array.isArray(parsed) ? parsed : []);
      } catch {
        return new Set();
      }
    };
    const savedIds = loadSavedIds();

    const gifIdFor = (element) =>
      element.closest(SEL.card)?.getAttribute("data-feed-item-id") || null;

    const cardForGif = (gifId) =>
      gifId
        ? [...doc.querySelectorAll(SEL.card)].find(
            (card) => card.getAttribute("data-feed-item-id") === gifId,
          ) || null
        : null;

    // Thrown for aborts that must NOT trigger stray-popup cleanup (we touched nothing).
    const abortNoCleanup = (message) => {
      const error = new Error(message);
      error.noCleanup = true;
      throw error;
    };

    const markSaved = (button, gifId) => {
      button.classList.add("rgqs-saved");
      if (!gifId) return;
      if (!savedIds.has(gifId)) {
        savedIds.add(gifId);
        try {
          window.localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify([...savedIds].slice(-500)),
          );
        } catch {
          // storage unavailable (private mode etc.) - visual state still applies
        }
      }
      // a re-rendered card may hold a fresh button for the same post - keep it green
      for (const other of doc.querySelectorAll("[data-rgqs] button")) {
        if (gifIdFor(other) === gifId) other.classList.add("rgqs-saved");
      }
    };

    let toastTimer = 0;
    const showToast = (message, variant) => {
      let toast = doc.querySelector(".rgqs-toast");
      if (!toast) {
        toast = doc.createElement("div");
        doc.body.append(toast);
      }
      toast.className = `rgqs-toast rgqs-toast-${variant}`;
      toast.textContent = message;
      if (toastTimer) window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toast.remove(), cfg.toastMs);
    };

    // Closes popups the site left open when a save was aborted mid-flow.
    const closeStrays = () => {
      const popup = doc.querySelector(SEL.collectionPopup);
      if (popup) {
        const cancel = [...popup.querySelectorAll("button")].find(
          (button) => button.textContent.trim() === "Cancel",
        );
        if (cancel) cancel.click();
      }
      const menu = doc.querySelector(".PopOverMenu");
      if (menu) menu.querySelector(".PopoverMenuCanvas-Backdrop")?.click();
    };

    // RedGifs keeps ONE menu and ONE collection popup (keyed by name, re-opening replaces
    // them). If the user's own menu/popup is open, our clicks could target their post:
    // wait briefly for leftovers to clear, then refuse to run while something stays open.
    const waitForClearDeck = async () => {
      try {
        await waitUntil(
          () =>
            !doc.querySelector(".PopOverMenu") &&
            !doc.querySelector(SEL.collectionPopup),
          500,
          "open menus to close",
        );
      } catch {
        abortNoCleanup("a menu or popup is open - close it and try again");
      }
    };

    const runSave = async (button, gifId) => {
      const card = cardForGif(gifId);
      const sidebar =
        card?.querySelector(SEL.sidebar) || button.closest(SEL.sidebar);
      const moreButton = sidebar?.querySelector(SEL.more);
      if (!moreButton || !moreButton.isConnected) {
        abortNoCleanup("the post scrolled away - nothing was saved, try again");
      }

      await waitForClearDeck();

      moreButton.click();
      const menuItem = await waitUntil(
        () => doc.querySelector(SEL.menuItem),
        cfg.timeouts.menu,
        '"Add to a Collection" menu item (are you logged in?)',
      );
      menuItem.click();

      await waitUntil(
        () => doc.querySelector(SEL.collectionPopup),
        cfg.timeouts.popup,
        "collection popup",
      );
      const collectionItem = await waitUntil(
        findCollectionItem,
        cfg.timeouts.collection,
        `collection "${cfg.collectionName}"`,
      );
      collectionItem.click();

      // The portal popup survives the card unmounting, so re-resolve the live card.
      const liveSidebar =
        cardForGif(gifId)?.querySelector(SEL.sidebar) ||
        (sidebar.isConnected ? sidebar : null);
      const likeButton = liveSidebar?.querySelector(SEL.like) || null;

      let likeOutcome;
      if (!likeButton) {
        likeOutcome = "skipped";
      } else if (isLiked(likeButton)) {
        likeOutcome = "already";
      } else {
        likeButton.click();
        try {
          await waitUntil(
            () => isLiked(likeButton),
            cfg.timeouts.like,
            "the like to register",
          );
          likeOutcome = "liked";
        } catch {
          likeOutcome = "failed";
        }
      }

      markSaved(button, gifId);
      const likeNote = {
        liked: " and liked",
        already: "",
        skipped: " (like skipped - post scrolled away)",
        failed: " (the like did not register)",
      }[likeOutcome];
      showToast(`Saved to "${cfg.collectionName}"${likeNote}`, "success");
      log(`saved to "${cfg.collectionName}"`, likeOutcome);
    };

    const scan = () => {
      for (const sidebar of doc.querySelectorAll(SEL.sidebar)) {
        if (!sidebar.querySelector("[data-rgqs]")) injectInto(sidebar);
      }
    };

    let scanScheduled = false;
    const scheduleScan = () => {
      if (scanScheduled) return;
      scanScheduled = true;
      window.setTimeout(() => {
        scanScheduled = false;
        try {
          scan();
        } catch (error) {
          log("scan failed", error);
        }
      }, 0);
    };

    let lastHoveredCard = null;
    const trackHover = (event) => {
      const card =
        event.target instanceof window.Element
          ? event.target.closest(SEL.card)
          : null;
      if (card) lastHoveredCard = card;
    };

    const watchGifId = () => {
      const match = window.location.pathname.match(/^\/watch\/([^/?#]+)/);
      if (!match) return null;
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1]; // malformed escape - use it verbatim, the id match will simply fail
      }
    };

    // Which post the keybind acts on: the card under the pointer; on a post's own page,
    // the post being viewed; otherwise none (never guess).
    const resolveKeybindCard = () => {
      if (
        lastHoveredCard?.isConnected &&
        lastHoveredCard.querySelector(SEL.sidebar)
      ) {
        return lastHoveredCard;
      }
      const watchedId = watchGifId();
      if (watchedId) {
        const card = cardForGif(watchedId);
        if (card?.querySelector(SEL.sidebar)) return card;
      }
      return null;
    };

    const handleKeydown = (event) => {
      if (!cfg.keybind) return;
      if (event.key.toLowerCase() !== cfg.keybind.toLowerCase()) return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.repeat)
        return;
      if (event.isComposing) return;
      const target = event.target;
      if (
        target instanceof window.Element &&
        target.closest(
          'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
        )
      ) {
        return;
      }

      const card = resolveKeybindCard();
      if (!card) {
        showToast(
          `Point at a post first, then press ${cfg.keybind.toUpperCase()}`,
          "info",
        );
        return;
      }
      let button = card.querySelector("[data-rgqs] button");
      if (!button) {
        try {
          scan(); // the card may have appeared a moment ago - inject right away
        } catch (error) {
          log("scan failed", error);
        }
        button = card.querySelector("[data-rgqs] button");
      }
      if (!button) return;

      event.preventDefault();
      requestSave(button);
    };

    const init = () => {
      injectStyles();
      scan();
      new window.MutationObserver(scheduleScan).observe(doc.documentElement, {
        childList: true,
        subtree: true,
      });
      if (cfg.keybind) {
        doc.addEventListener("mouseover", trackHover, true);
        doc.addEventListener("keydown", handleKeydown, true);
      }
    };

    return { init };
  }

  if (typeof window !== "undefined" && window.document) {
    const userCfg = window.__RGQS_CONFIG || {};
    const cfg = {
      ...DEFAULTS,
      ...userCfg,
      timeouts: { ...DEFAULTS.timeouts, ...(userCfg.timeouts || {}) },
    };
    const start = () => createQuickSave({ window, cfg }).init();
    if (window.document.readyState === "loading") {
      window.document.addEventListener("DOMContentLoaded", start, {
        once: true,
      });
    } else {
      start();
    }
  }
})();
