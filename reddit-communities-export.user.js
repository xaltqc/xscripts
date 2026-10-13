// ==UserScript==
// @name         Reddit My Communities Exporter
// @namespace    reddit-userscripts
// @version      1.1.0
// @description  Export your joined communities from Reddit's /subreddits/ page: a names list, or a zip tree of sorted URLs (one folder per community)
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

  const NAMES_FILE = "reddit-communities-names.txt";
  const TREE_FILE = "subreddits-urls.zip";
  const TREE_ROOT = "subreddits-urls";
  const SAVE_MESSAGE_MS = 3000;

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

  /** Render the community names as plain text, one per line. */
  function namesText(entries) {
    if (entries.length === 0) return "";
    return entries.map((entry) => entry.name).join("\n") + "\n";
  }

  const SORT_VIEWS = [
    { label: "best", path: "best/" },
    { label: "hot", path: "hot/" },
    { label: "new", path: "new/" },
    { label: "top-today", path: "top/" },
    { label: "top-this-week", path: "top/?t=week" },
    { label: "top-this-month", path: "top/?t=month" },
    { label: "top-this-year", path: "top/?t=year" },
    { label: "top-all-time", path: "top/?t=all" },
  ];

  /**
   * Map communities to the "one folder per community, one file per sort" tree:
   * subreddits-urls/<name>/<name>-<sort>.url -> { path, url }.
   */
  function treeEntries(communities) {
    const files = [];
    for (const community of communities) {
      const base = community.url.endsWith("/")
        ? community.url
        : `${community.url}/`;
      for (const view of SORT_VIEWS) {
        files.push({
          path: `${TREE_ROOT}/${community.name}/${community.name}-${view.label}.url`,
          url: `${base}${view.path}`,
        });
      }
    }
    return files;
  }

  let crcTable;

  /** CRC-32 checksum (the variant used by zip), over a Uint8Array. */
  function crc32(bytes) {
    if (!crcTable) {
      crcTable = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let value = i;
        for (let bit = 0; bit < 8; bit++) {
          value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
        }
        crcTable[i] = value >>> 0;
      }
    }

    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  /** Build a zip archive (stored, no compression) from { path, content } files. */
  function buildZip(files) {
    const encoder = new TextEncoder();
    const now = new Date();
    const dosTime =
      (now.getHours() << 11) |
      (now.getMinutes() << 5) |
      (now.getSeconds() >> 1);
    const dosDate =
      ((now.getFullYear() - 1980) << 9) |
      ((now.getMonth() + 1) << 5) |
      now.getDate();

    const parts = [];
    const centralParts = [];
    let offset = 0;

    for (const file of files) {
      const nameBytes = encoder.encode(file.path);
      const data = encoder.encode(file.content);
      const crc = crc32(data);

      const local = new Uint8Array(30 + nameBytes.length);
      const localView = new DataView(local.buffer);
      localView.setUint32(0, 0x04034b50, true); // local file header
      localView.setUint16(4, 20, true); // version needed
      localView.setUint16(6, 0x0800, true); // UTF-8 file names
      localView.setUint16(8, 0, true); // stored (no compression)
      localView.setUint16(10, dosTime, true);
      localView.setUint16(12, dosDate, true);
      localView.setUint32(14, crc, true);
      localView.setUint32(18, data.length, true); // compressed size
      localView.setUint32(22, data.length, true); // uncompressed size
      localView.setUint16(26, nameBytes.length, true);
      localView.setUint16(28, 0, true); // extra field length
      local.set(nameBytes, 30);
      parts.push(local, data);

      const central = new Uint8Array(46 + nameBytes.length);
      const centralView = new DataView(central.buffer);
      centralView.setUint32(0, 0x02014b50, true); // central directory header
      centralView.setUint16(4, 20, true); // version made by
      centralView.setUint16(6, 20, true); // version needed
      centralView.setUint16(8, 0x0800, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint16(12, dosTime, true);
      centralView.setUint16(14, dosDate, true);
      centralView.setUint32(16, crc, true);
      centralView.setUint32(20, data.length, true); // compressed size
      centralView.setUint32(24, data.length, true); // uncompressed size
      centralView.setUint16(28, nameBytes.length, true);
      centralView.setUint16(30, 0, true); // extra field length
      centralView.setUint16(32, 0, true); // comment length
      centralView.setUint16(34, 0, true); // disk number
      centralView.setUint16(36, 0, true); // internal attributes
      centralView.setUint32(38, 0, true); // external attributes
      centralView.setUint32(42, offset, true); // local header offset
      central.set(nameBytes, 46);
      centralParts.push(central);

      offset += local.length + data.length;
    }

    const centralSize = centralParts.reduce(
      (sum, part) => sum + part.length,
      0,
    );

    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true); // end of central directory
    endView.setUint16(4, 0, true); // disk number
    endView.setUint16(6, 0, true); // central directory disk
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, offset, true);
    endView.setUint16(20, 0, true); // comment length

    const zip = new Uint8Array(offset + centralSize + end.length);
    let cursor = 0;
    for (const part of parts.concat(centralParts, end)) {
      zip.set(part, cursor);
      cursor += part.length;
    }
    return zip;
  }

  /** Build the { filename, blob, fileCount } payload for an export mode. */
  function buildExport(mode, entries) {
    if (mode === "tree") {
      const files = treeEntries(entries).map((file) => ({
        path: file.path,
        content: file.url + "\n",
      }));
      return {
        filename: TREE_FILE,
        blob: new Blob([buildZip(files)], { type: "application/zip" }),
        fileCount: files.length,
      };
    }

    return {
      filename: NAMES_FILE,
      blob: new Blob([namesText(entries)], {
        type: "text/plain;charset=utf-8",
      }),
      fileCount: entries.length,
    };
  }

  /** Apply inline styles, keeping the panel self-contained so Reddit's CSS can't hide it. */
  function setStyles(element, styles) {
    Object.assign(element.style, styles);
  }

  const EXPORT_BUTTONS = [
    { mode: "names", label: "Names" },
    { mode: "tree", label: "URL tree (.zip)" },
  ];

  /** Build the floating export panel: a community count plus one button per export mode. */
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
    for (const { mode, label } of EXPORT_BUTTONS) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
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
        const { filename, blob, fileCount } = buildExport(mode, entries);
        onExport(filename, blob);
        const detail = mode === "tree" ? ` (${fileCount} files)` : "";
        status.textContent = `Saved ${filename} \u2713${detail}`;
        clearTimeout(statusTimer);
        statusTimer = setTimeout(() => {
          status.textContent = countText;
        }, SAVE_MESSAGE_MS);
      });
      actions.appendChild(button);
    }

    return panel;
  }

  /** Trigger a browser download of the given blob. */
  function downloadBlob(filename, blob) {
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
    document.body.appendChild(createPanel(document, entries, downloadBlob));
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      extractCommunities,
      namesText,
      treeEntries,
      crc32,
      buildZip,
      buildExport,
      createPanel,
    };
  } else if (typeof document !== "undefined" && document.body) {
    main();
  }
})();
