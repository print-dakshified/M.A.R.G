(() => {
  if (globalThis.__MARG_CONTENT_SCRIPT_LOADED__) return;
  globalThis.__MARG_CONTENT_SCRIPT_LOADED__ = true;

  const FIELD_SELECTOR =
    "input, textarea, select, [role='combobox'], [role='checkbox'], [role='radio']";
  const BLOCKED_TYPES = new Set([
    "hidden", "password", "file", "submit", "reset", "button", "image"
  ]);
  let lastFieldKey = "";
  let lastFieldAt = 0;

  const cleanText = value =>
    (value || "").replace(/\s+/g, " ").trim();

  function isVisible(element) {
    if (!element || !element.getClientRects().length) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0";
  }

  function getFieldLabel(field) {
    const labels = [];
    if (field.labels) {
      for (const label of field.labels) labels.push(cleanText(label.innerText));
    }
    const aria = field.getAttribute("aria-label");
    if (aria) labels.push(aria);
    const labelledBy = field.getAttribute("aria-labelledby");
    if (labelledBy) {
      labelledBy.split(/\s+/).forEach(id => {
        const node = document.getElementById(id);
        if (node) labels.push(cleanText(node.innerText));
      });
    }
    const parentLabel = field.closest("label");
    if (parentLabel) labels.push(cleanText(parentLabel.innerText));
    const fieldset = field.closest("fieldset");
    const legend = fieldset?.querySelector("legend");
    if (legend) labels.push(cleanText(legend.innerText));

    const nearby = field.closest(".form-group, .form-field, .field, .question") ||
      field.parentElement;
    if (nearby) {
      const text = cleanText(nearby.innerText);
      if (text && text.length < 500) labels.push(text);
    }

    return [...new Set(labels.filter(Boolean))].join(" | ") ||
      field.getAttribute("placeholder") || "Label not available";
  }

  function getFieldDetails(field) {
    const type = (field.getAttribute("type") || field.tagName).toLowerCase();
    const describedBy = field.getAttribute("aria-describedby");
    const helpText = describedBy
      ? describedBy.split(/\s+/)
          .map(id => document.getElementById(id))
          .filter(Boolean)
          .map(node => cleanText(node.innerText))
          .filter(Boolean).join(" ")
      : "";

    let options = [];
    if (field.tagName === "SELECT") {
      options = Array.from(field.options)
        .map(option => cleanText(option.textContent))
        .filter(Boolean).slice(0, 40);
    } else if (field.getAttribute("role") === "combobox") {
      const listId = field.getAttribute("aria-controls");
      const list = listId && document.getElementById(listId);
      if (list) options = Array.from(list.querySelectorAll(
        "[role='option'], option"
      )).map(node => cleanText(node.innerText || node.textContent))
        .filter(Boolean).slice(0, 40);
    }

    return {
      label: getFieldLabel(field),
      type,
      required: field.required || field.getAttribute("aria-required") === "true"
        ? "Yes" : "Not indicated",
      placeholder: field.getAttribute("placeholder") || "",
      helpText,
      options,
      pageTitle: document.title,
      pageUrl: location.href
    };
  }

  function eligibleField(field) {
    if (!field || !isVisible(field)) return false;
    const type = (field.getAttribute("type") || "").toLowerCase();
    return !BLOCKED_TYPES.has(type) &&
      !field.disabled &&
      !field.readOnly;
  }

  function notifyField(field) {
    if (!eligibleField(field)) return;
    const details = getFieldDetails(field);
    const key = [details.label, details.type, details.pageUrl].join("|");
    const now = Date.now();
    if (key === lastFieldKey && now - lastFieldAt < 900) return;
    lastFieldKey = key;
    lastFieldAt = now;

    chrome.runtime.sendMessage({
      type: "MARG_FIELD_SELECTED",
      field: details
    }, () => {
      // Reading lastError prevents an unhandled runtime message warning
      // when the side panel is closed.
      void chrome.runtime.lastError;
    });
  }

  function getPageContent() {
    const fields = Array.from(document.querySelectorAll(FIELD_SELECTOR))
      .filter(eligibleField)
      .slice(0, 120)
      .map((field, index) => ({
        index: index + 1,
        ...getFieldDetails(field)
      }));

    const pageText = cleanText(document.body?.innerText).slice(0, 16000);
    return {
      success: true,
      pageTitle: document.title,
      pageUrl: location.href,
      pageText,
      fields,
      fieldCount: fields.length,
      capturedAt: new Date().toISOString()
    };
  }

  // Covers mouse/touch clicks and keyboard navigation.
  document.addEventListener("click", event => {
    const field = event.target.closest?.(FIELD_SELECTOR);
    if (field) notifyField(field);
  }, true);

  document.addEventListener("focusin", event => {
    const field = event.target.closest?.(FIELD_SELECTOR);
    if (field) notifyField(field);
  }, true);

  // Notify the side panel when a single-page application changes its form.
  let mutationTimer;
  const observer = new MutationObserver(() => {
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(() => {
      chrome.runtime.sendMessage({ type: "MARG_PAGE_CHANGED" }, () => {
        void chrome.runtime.lastError;
      });
    }, 700);
  });
  if (document.documentElement) {
    observer.observe(document.documentElement, {
      childList: true, subtree: true
    });
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      if (message?.type === "GET_SELECTED_TEXT") {
        sendResponse({
          success: true,
          selectedText: window.getSelection()?.toString().trim() || ""
        });
      } else if (message?.type === "GET_PAGE_CONTENT") {
        sendResponse(getPageContent());
      }
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
    return false;
  });
})();
