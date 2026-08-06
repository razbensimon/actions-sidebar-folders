/**
 * Search box above the folder tree: filter + highlight painted workflows.
 */
(function (root, factory) {
  const api = factory();
  root.ASF = Object.assign(root.ASF || {}, api);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const BOX_CLASS = "asf-search";
  const INPUT_CLASS = "asf-search-input";
  const HIDDEN_CLASS = "asf-search-hidden";
  const EMPTY_CLASS = "asf-search-empty";
  const MARK_CLASS = "asf-search-mark";
  const PREV_OPEN_ATTR = "data-asf-prev-open";
  const FOLDER_GROUP = "asf-folder-group";
  const FOLDER_OPEN = "asf-folder-group--open";
  const NEST_CLASS = "asf-folder-children";
  const ROOT_SELECTOR = "ul[data-asf-rooted]";

  const SEARCH_ICON_SVG = `
    <svg class="asf-search-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z" fill="currentColor"></path>
    </svg>
  `.trim();

  /** Module-level so the query survives repaints and Turbo navigations. */
  let currentQuery = "";
  let rafId = 0;

  /**
   * @param {string} raw
   * @returns {string[]} lowercased whitespace-separated terms
   */
  function parseQuery(raw) {
    return String(raw || "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
  }

  /**
   * Every term must appear somewhere in the text (case-insensitive AND).
   * @param {string} text
   * @param {string[]} terms
   */
  function matchesTerms(text, terms) {
    const lower = String(text || "").toLowerCase();
    return terms.every((term) => lower.includes(term));
  }

  /**
   * Merged [start, end) ranges where any term occurs in text.
   * @param {string} text
   * @param {string[]} terms
   * @returns {Array<[number, number]>}
   */
  function highlightRanges(text, terms) {
    const lower = String(text || "").toLowerCase();
    /** @type {Array<[number, number]>} */
    const ranges = [];
    for (const term of terms) {
      if (!term) continue;
      let idx = lower.indexOf(term);
      while (idx !== -1) {
        ranges.push([idx, idx + term.length]);
        idx = lower.indexOf(term, idx + 1);
      }
    }
    ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    /** @type {Array<[number, number]>} */
    const merged = [];
    for (const [start, end] of ranges) {
      const last = merged[merged.length - 1];
      if (last && start <= last[1]) {
        last[1] = Math.max(last[1], end);
      } else {
        merged.push([start, end]);
      }
    }
    return merged;
  }

  /** Rebuild label children as text + <mark> spans for the given terms. */
  function paintLabel(labelEl, terms) {
    if (!labelEl) return;
    // textContent flattens any previous marks back to the original string.
    const text = labelEl.textContent || "";
    const ranges = terms.length ? highlightRanges(text, terms) : [];
    if (ranges.length === 0) {
      if (labelEl.querySelector("mark")) labelEl.textContent = text;
      return;
    }
    const doc = labelEl.ownerDocument;
    const frag = doc.createDocumentFragment();
    let cursor = 0;
    for (const [start, end] of ranges) {
      if (start > cursor) {
        frag.appendChild(doc.createTextNode(text.slice(cursor, start)));
      }
      const mark = doc.createElement("mark");
      mark.className = MARK_CLASS;
      mark.textContent = text.slice(start, end);
      frag.appendChild(mark);
      cursor = end;
    }
    if (cursor < text.length) {
      frag.appendChild(doc.createTextNode(text.slice(cursor)));
    }
    labelEl.replaceChildren(frag);
  }

  function setGroupOpen(group, open) {
    const setFolderOpen = globalThis.ASF?.setFolderOpen;
    if (setFolderOpen) {
      setFolderOpen(group, open);
      return;
    }
    group.classList.toggle(FOLDER_OPEN, open);
    const button = group.querySelector(":scope > .asf-folder button");
    if (button) button.setAttribute("aria-expanded", open ? "true" : "false");
    const childList = group.querySelector(":scope > ." + NEST_CLASS);
    if (childList) childList.hidden = !open;
  }

  /**
   * Filter one tree node in place. Returns the number of visible leaves.
   * @param {Element} el folder group or leaf <li>
   * @param {string[]} terms
   * @param {boolean} forceShow ancestor folder matched — show whole subtree
   */
  function filterNode(el, terms, forceShow) {
    const filtering = terms.length > 0;

    if (el.hasAttribute("data-asf-leaf")) {
      const fullName =
        el.getAttribute("data-asf-full-name") ||
        el.querySelector(".ActionListItem-label")?.textContent ||
        "";
      const visible =
        !filtering || forceShow || matchesTerms(fullName, terms);
      el.classList.toggle(HIDDEN_CLASS, !visible);
      paintLabel(
        el.querySelector(".ActionListItem-label"),
        filtering && visible ? terms : []
      );
      return visible ? 1 : 0;
    }

    if (!el.classList.contains(FOLDER_GROUP)) return 0;

    const label = el.querySelector(
      ":scope > .asf-folder .ActionListItem-label"
    );
    const selfMatch =
      filtering && matchesTerms(label?.textContent || "", terms);

    let visibleLeaves = 0;
    const childList = el.querySelector(":scope > ." + NEST_CLASS);
    if (childList) {
      for (const child of childList.children) {
        visibleLeaves += filterNode(child, terms, forceShow || selfMatch);
      }
    }

    const visible = !filtering || visibleLeaves > 0;
    el.classList.toggle(HIDDEN_CLASS, !visible);
    paintLabel(label, filtering && selfMatch ? terms : []);

    const count = el.querySelector(":scope > .asf-folder .asf-folder-count");
    if (count) count.textContent = String(visibleLeaves);

    if (filtering && visible) {
      // Remember pre-search collapse state once, then expand to show matches.
      if (!el.hasAttribute(PREV_OPEN_ATTR)) {
        el.setAttribute(
          PREV_OPEN_ATTR,
          el.classList.contains(FOLDER_OPEN) ? "1" : "0"
        );
      }
      setGroupOpen(el, true);
    } else if (!filtering && el.hasAttribute(PREV_OPEN_ATTR)) {
      setGroupOpen(el, el.getAttribute(PREV_OPEN_ATTR) === "1");
      el.removeAttribute(PREV_OPEN_ATTR);
    }

    return visible ? visibleLeaves : 0;
  }

  /** Apply the current query to the painted tree inside nav. */
  function applySearchFilter(nav) {
    if (!nav) return;
    const listEl = nav.querySelector(ROOT_SELECTOR);
    if (!listEl) return;

    const terms = parseQuery(currentQuery);
    listEl.querySelectorAll(":scope > ." + EMPTY_CLASS).forEach((el) =>
      el.remove()
    );

    let visibleLeaves = 0;
    for (const child of [...listEl.children]) {
      if (
        child.classList.contains(FOLDER_GROUP) ||
        child.hasAttribute("data-asf-leaf")
      ) {
        visibleLeaves += filterNode(child, terms, false);
      }
    }

    if (terms.length > 0 && visibleLeaves === 0) {
      const empty = document.createElement("li");
      empty.className = EMPTY_CLASS;
      empty.setAttribute("role", "presentation");
      empty.textContent = "No workflows match";
      listEl.appendChild(empty);
    }
  }

  function scheduleFilter(nav) {
    if (typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => applySearchFilter(nav));
    } else {
      applySearchFilter(nav);
    }
  }

  /**
   * Create (or keep) the search box directly above the workflow list.
   * @param {Element} nav
   * @param {Element} listEl the rooted workflow <ul>
   */
  function ensureSearchBox(nav, listEl) {
    if (!nav || !listEl || !listEl.parentElement) return null;

    let box = nav.querySelector("." + BOX_CLASS);
    if (box && box.nextElementSibling !== listEl) {
      box.remove();
      box = null;
    }
    if (box) return box;

    const parentTag = listEl.parentElement.tagName;
    box = document.createElement(
      parentTag === "UL" || parentTag === "OL" ? "li" : "div"
    );
    box.className = BOX_CLASS;
    box.setAttribute("role", "presentation");

    const wrap = document.createElement("div");
    wrap.className = "asf-search-wrap";
    wrap.innerHTML = SEARCH_ICON_SVG;

    const input = document.createElement("input");
    input.type = "search";
    input.className = INPUT_CLASS;
    input.placeholder = "Filter workflows";
    input.setAttribute("aria-label", "Filter workflows");
    input.autocomplete = "off";
    input.spellcheck = false;
    input.value = currentQuery;

    input.addEventListener("input", () => {
      currentQuery = input.value;
      scheduleFilter(nav);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (input.value) {
          event.preventDefault();
          event.stopPropagation();
          input.value = "";
          currentQuery = "";
          scheduleFilter(nav);
        } else {
          input.blur();
        }
      }
    });

    wrap.appendChild(input);
    box.appendChild(wrap);
    listEl.before(box);
    return box;
  }

  function getSearchQuery() {
    return currentQuery;
  }

  return {
    parseQuery,
    matchesTerms,
    highlightRanges,
    ensureSearchBox,
    applySearchFilter,
    getSearchQuery,
  };
});
