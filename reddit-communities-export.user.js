// ==UserScript==
// @name         Reddit My Communities Exporter
// @namespace    reddit-userscripts
// @version      1.0.0
// @description  Export the names or URLs of your joined communities from Reddit's /subreddits/ page
// @match        https://www.reddit.com/subreddits
// @match        https://www.reddit.com/subreddits/*
// @match        https://old.reddit.com/subreddits
// @match        https://old.reddit.com/subreddits/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

(function () {
  "use strict";

  /**
   * Collect the communities listed under .subscription-box.
   * Each <li> holds a subscribe toggle with data-sr_name and a link to the community.
   * The "multireddit of your subscriptions" link sits outside any <li>, so it is skipped.
   */
  function extractCommunities(root) {
    const seen = new Set();
    const entries = [];

    for (const item of root.querySelectorAll(".subscription-box li")) {
      const link = item.querySelector("a.title[href]");
      if (!link) continue;

      const toggle = item.querySelector("span.subscribe-button[data-sr_name]");
      const name =
        (toggle && toggle.getAttribute("data-sr_name")) ||
        link.textContent.trim();
      if (!name || seen.has(name)) continue;

      seen.add(name);
      entries.push({ name, url: link.href });
    }

    return entries;
  }

  /** Render the entries as plain text, one per line. */
  function buildText(entries, mode) {
    if (entries.length === 0) return "";
    const lines = entries.map((entry) =>
      mode === "urls" ? entry.url : entry.name,
    );
    return lines.join("\n") + "\n";
  }

  /** File name to save under, per export mode. */
  function fileNameFor(mode) {
    return mode === "urls"
      ? "reddit-communities-urls.txt"
      : "reddit-communities-names.txt";
  }

  const SAVE_MESSAGE_MS = 3000;

  /** Apply inline styles, keeping the panel self-contained so Reddit's CSS can't hide it. */
  function setStyles(element, styles) {
    Object.assign(element.style, styles);
  }

  /** Build the floating export panel: a community count plus "Names" and "URLs" buttons. */
  function createPanel(document, entries, onExport) {
    const panel = document.createElement("div");
    panel.className = "rce-panel";
    setStyles(panel, {
      position: "fixed",
      right: "16px",
      bottom: "16px",
      zIndex: "2147483647",
      width: "230px",
      padding: "10px 12px",
      background: "#1a1a1b",
      color: "#d7dadc",
      border: "1px solid #343536",
      borderRadius: "8px",
      fontFamily: '-apple-system, "Segoe UI", Roboto, Arial, sans-serif',
      fontSize: "12px",
      lineHeight: "1.4",
      textAlign: "left",
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
    });

    const title = document.createElement("div");
    title.textContent = "My Communities Export";
    setStyles(title, {
      fontWeight: "700",
      fontSize: "13px",
      marginBottom: "4px",
    });
    panel.appendChild(title);

    const status = document.createElement("div");
    setStyles(status, { color: "#a8aaab" });
    panel.appendChild(status);

    if (entries.length === 0) {
      status.textContent = "No communities found on this page.";
      return panel;
    }

    const countText = `${entries.length} ${entries.length === 1 ? "community" : "communities"} found`;
    status.textContent = countText;

    const actions = document.createElement("div");
    setStyles(actions, { display: "flex", gap: "8px", marginTop: "8px" });
    panel.appendChild(actions);

    let statusTimer;
    for (const mode of ["names", "urls"]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = mode === "names" ? "Names" : "URLs";
      setStyles(button, {
        flex: "1",
        padding: "5px 0",
        border: "1px solid #0079d3",
        borderRadius: "9999px",
        background: "#0079d3",
        color: "#ffffff",
        fontSize: "12px",
        fontWeight: "600",
        fontFamily: "inherit",
        cursor: "pointer",
      });
      button.addEventListener("click", () => {
        const filename = fileNameFor(mode);
        onExport(filename, buildText(entries, mode));
        status.textContent = `Saved ${filename} \u2713`;
        clearTimeout(statusTimer);
        statusTimer = setTimeout(() => {
          status.textContent = countText;
        }, SAVE_MESSAGE_MS);
      });
      actions.appendChild(button);
    }

    return panel;
  }

  /** Trigger a browser download of the given text as a plain-text file. */
  function downloadTextFile(filename, text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function main() {
    const entries = extractCommunities(document);
    document.body.appendChild(createPanel(document, entries, downloadTextFile));
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      extractCommunities,
      buildText,
      fileNameFor,
      createPanel,
    };
  } else if (typeof document !== "undefined" && document.body) {
    main();
  }
})();
