const textValue = (value) => {
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "";
};

function appendTextElement(parent, tagName, className, value) {
  const text = textValue(value);
  if (!text.trim()) return null;
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

function safeUrl(value, { relative = false } = {}) {
  const input = textValue(value).trim();
  if (!input) return null;
  try {
    const url = new URL(input, document.baseURI);
    if (url.protocol === "https:" || url.protocol === "http:") {
      if (!relative && !/^https?:\/\//i.test(input)) return null;
      return url.href;
    }
    if (!relative && url.protocol === "mailto:") return url.href;
  } catch {
    return null;
  }
  return null;
}

function safeLogoSrc(value) {
  const input = textValue(value).trim();
  if (/^data:image\/png;base64,[a-z0-9+/]+={0,2}$/i.test(input)) return input;
  return safeUrl(input, { relative: true });
}

function addBrand(parent, config) {
  const lockup = document.createElement("div");
  lockup.className = "slide-brand-lockup";

  const src = safeLogoSrc(config.logo?.src);
  if (src) {
    const image = document.createElement("img");
    image.className = "slide-brand-mark";
    image.src = src;
    image.alt = textValue(config.logo?.alt);
    image.decoding = "async";
    lockup.append(image);
  }

  const identity = document.createElement("div");
  identity.className = "slide-brand-identity";
  appendTextElement(identity, "h1", "slide-brand-title", config.title);
  appendTextElement(identity, "p", "slide-brand-sub", config.sub);
  lockup.append(identity);
  parent.append(lockup);
}

function addList(parent, className, values, limit = Infinity) {
  if (!Array.isArray(values)) return;
  const items = values.slice(0, limit).filter((item) => textValue(item).trim());
  if (!items.length) return;
  const list = document.createElement("ul");
  list.className = className;
  items.forEach((item) => appendTextElement(list, "li", "", item));
  parent.append(list);
}

function addInlineIndicator(parent, kind, index) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", `content-indicator content-indicator--${kind}`);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const shapes = {
    question: ["M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Z", "M9.6 9a2.5 2.5 0 1 1 4.2 1.8c-1.1 1-1.8 1.2-1.8 2.7", "M12 16.8v.1"],
    // Problem cards: the patient, their doctor, and a new doctor taking over the case.
    persona: [
      ["M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z", "M5 20c.6-4 3.2-6 7-6s6.4 2 7 6"],
      ["M7 4h10v17H7z", "M10 3h4v3h-4z", "M10 11h4", "M12 9v4", "M10 17h4"],
      ["M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z", "M3 20c.4-3.2 2.2-5 5-5", "M13 12h8", "M18 9l3 3-3 3", "M21 18h-8", "M16 15l-3 3 3 3"]
    ][index % 3],
    impact: [
      ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "M12 7v5l3 2"],
      ["M5 4h10v13H5z", "M9 8h10v13H9", "M8 8h4", "M12 12h4"],
      ["M12 3 22 20H2Z", "M12 9v5", "M12 17v.1"]
    ][index % 3],
    feature: [
      ["M4 6h16v15H4z", "M4 10h16", "M8 3v5", "M16 3v5", "M8 14h3", "M13 17h3"],
      ["M2 5h8v14H2z", "M14 5h8v14h-8z", "M10 12h4", "M11 10l2 2-2 2"],
      ["M5 3h10l4 4v14H5z", "M15 3v5h4", "M8 12h8", "M8 16h6"]
    ][index % 3],
    market: ["M4 6.5h16", "M4 12h16", "M4 17.5h16"],
    business: ["M5 6h14v12H5z", "M8 9.5h8", "M8 14.5h5"],
    partner: ["M8 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z", "M16 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z", "M3.5 19c.4-3 2-4.5 4.5-4.5s4.1 1.5 4.5 4.5", "M11.5 19c.4-3 2-4.5 4.5-4.5s4.1 1.5 4.5 4.5"],
  };
  const lines = shapes[kind] || ["M5 12h14"];
  lines.forEach((d) => {
    const segment = document.createElementNS("http://www.w3.org/2000/svg", "path");
    segment.setAttribute("d", d);
    svg.append(segment);
  });
  parent.append(svg);
}

function addStructuredList(parent, className, values, kind) {
  if (!Array.isArray(values)) return;
  const items = values.filter((item) => textValue(item).trim());
  if (!items.length) return;
  const list = document.createElement("ul");
  list.className = className;
  items.forEach((item, index) => {
    const original = textValue(item);
    const entry = document.createElement("li");
    entry.className = "content-item";
    addInlineIndicator(entry, kind, index);
    // Comparisons retain two columns. Elsewhere, keep each heading and its
    // detail in one text group beside the icon, avoiding empty grid rows.
    const textGroup = kind === "market" ? entry : document.createElement("div");
    if (textGroup !== entry) textGroup.className = "content-item-copy";
    const colon = original.indexOf(":");
    if (colon >= 0) {
      const heading = document.createElement("span");
      heading.className = "content-item-heading";
      heading.textContent = original.slice(0, colon + 1);
      const detail = document.createElement("span");
      detail.className = "content-item-detail";
      detail.textContent = original.slice(colon + 1);
      textGroup.append(heading, detail);
    } else {
      // Keep complete question prompts and meaningful noun phrases together.
      // Only emphasis boundaries change; both spans retain the source verbatim.
      const leadWords = { impact: [2, 5, 1], feature: [2, 2, 3], business: [2, 3, 6] };
      const words = [...original.matchAll(/\S+/g)];
      const lastLeadWord = words[Math.min((leadWords[kind]?.[index] || 2) - 1, words.length - 1)];
      const leadEnd = kind === "question" ? original.length :
        lastLeadWord ? lastLeadWord.index + lastLeadWord[0].length : original.length;
      const lead = document.createElement("span");
      lead.className = "content-item-heading";
      lead.textContent = leadEnd > 0 ? original.slice(0, leadEnd) : original;
      const detail = document.createElement("span");
      detail.className = "content-item-detail";
      detail.textContent = leadEnd > 0 ? original.slice(leadEnd) : "";
      textGroup.append(lead, detail);
    }
    if (textGroup !== entry) entry.append(textGroup);
    list.append(entry);
  });
  parent.append(list);
}

function addStat(parent, stat) {
  if (!stat || typeof stat !== "object") return;
  const value = textValue(stat.value);
  const label = textValue(stat.label);
  const unit = textValue(stat.unit);
  if (!value && !label && !unit) return;
  const row = document.createElement("div");
  row.className = "slide-stat";
  if (value) appendTextElement(row, "span", "stat-value", value);
  if (unit) appendTextElement(row, "span", "stat-unit", unit);
  if (label) appendTextElement(row, "span", "stat-label", label);
  parent.append(row);
}

function addChips(parent, chips) {
  if (!Array.isArray(chips)) return;
  const values = chips.map(textValue).filter((value) => value.trim());
  if (!values.length) return;
  const row = document.createElement("div");
  row.className = "slide-chips";
  values.forEach((value) => appendTextElement(row, "span", "slide-chip", value));
  parent.append(row);
}

function addLegend(parent, legend) {
  if (!Array.isArray(legend)) return;
  const entries = legend.filter((entry) => entry && typeof entry === "object" && textValue(entry.label).trim());
  if (!entries.length) return;
  const list = document.createElement("ul");
  list.className = "slide-legend";
  entries.forEach((entry) => {
    const item = document.createElement("li");
    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    const color = textValue(entry.color).trim();
    if (color && globalThis.CSS?.supports?.("color", color)) swatch.style.backgroundColor = color;
    item.append(swatch, document.createTextNode(textValue(entry.label)));
    list.append(item);
  });
  parent.append(list);
}

function addMedia(parent, media) {
  if (!media || typeof media !== "object") return;
  const type = media.type === "video" ? "video" : media.type === "image" ? "image" : "";
  const src = safeUrl(media.src, { relative: true });
  if (!type || !src) return;
  const element = document.createElement(type === "video" ? "video" : "img");
  element.className = "slide-media";
  element.src = src;
  if (type === "video") {
    element.controls = true;
    element.playsInline = true;
    element.preload = "metadata";
    element.setAttribute("aria-label", textValue(media.alt) || "Presentation video");
  } else {
    element.alt = textValue(media.alt);
    element.loading = "lazy";
  }
  parent.append(element);
}

function addTeam(parent, team) {
  if (!Array.isArray(team)) return;
  const members = team.filter((member) => member && typeof member === "object" &&
    (textValue(member.name).trim() || textValue(member.role).trim()));
  if (!members.length) return;
  const list = document.createElement("ul");
  list.className = "slide-team";
  members.forEach((member) => {
    const item = document.createElement("li");
    const initials = textValue(member.name).split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2);
    const monogram = document.createElement("span");
    monogram.className = "team-monogram";
    monogram.setAttribute("aria-hidden", "true");
    monogram.textContent = initials;
    item.append(monogram);
    appendTextElement(item, "span", "team-name", member.name);
    appendTextElement(item, "span", "team-role", member.role);
    list.append(item);
  });
  parent.append(list);
}

function addLinks(parent, links) {
  if (!Array.isArray(links)) return;
  const configured = links.map((link) => {
    if (!link || typeof link !== "object") return null;
    const label = textValue(link.label).trim();
    const href = safeUrl(link.href);
    return label && href ? { label, href } : null;
  }).filter(Boolean);
  if (!configured.length) return;
  const row = document.createElement("div");
  row.className = "slide-links";
  configured.forEach(({ label, href }) => {
    const anchor = document.createElement("a");
    anchor.className = "slide-link";
    anchor.href = href;
    anchor.textContent = label;
    if (new URL(href).origin !== window.location.origin) {
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
    }
    row.append(anchor);
  });
  parent.append(row);
}

function addBlock(parent, className, build) {
  const block = document.createElement("div");
  block.className = className;
  build(block);
  if (block.childNodes.length) parent.append(block);
  return block;
}

function appendHeader(copy, config) {
  appendTextElement(copy, "p", "eyebrow", config.eyebrow);
  appendTextElement(copy, "h1", "slide-title", config.title);
  appendTextElement(copy, "p", "slide-sub", config.sub);
}

function appendOptional(copy, config) {
  addStat(copy, config.stat);
  addChips(copy, config.chips);
  addLegend(copy, config.legend);
  addMedia(copy, config.media);
  addTeam(copy, config.team);
  appendTextElement(copy, "p", "slide-note", config.note);
  addLinks(copy, config.links);
}

function appendStructuredContent(copy, config) {
  const id = textValue(config.id);
  const layoutKey = id.replace(/[^a-zA-Z0-9_-]/g, "") || "standard";
  copy.classList.add(`slide-layout--${layoutKey}`);
  appendHeader(copy, config);

  if (id === "problem") {
    // A big number (or a short intro) on the left, the three problem cards on the right.
    addBlock(copy, "content-composition problem-composition", (composition) => {
      if (config.stat) addStat(composition, config.stat);
      else appendTextElement(composition, "p", "slide-body story-intro", config.body);
      addBlock(composition, "question-grid", (grid) => addStructuredList(grid, "slide-bullets card-list", config.bullets, config.stat ? "persona" : "question"));
    });
    appendOptional(copy, { ...config, stat: null });
    return;
  }
  if (config.rings) {
    // Market size: three big numbers, from what we can reach first to the whole market.
    addBlock(copy, "market-rings", (row) => {
      config.rings.forEach((ring, index) => {
        const card = document.createElement("div");
        card.className = `market-ring market-ring--${index + 1}`;
        appendTextElement(card, "span", "ring-tag", ring.tag);
        appendTextElement(card, "span", "ring-value", ring.value);
        appendTextElement(card, "span", "ring-label", ring.label);
        row.append(card);
      });
    });
    appendOptional(copy, config);
    return;
  }
  if (id === "product-demo") {
    addBlock(copy, "solution-composition", (composition) => addStructuredList(composition, "slide-bullets feature-grid", config.bullets, "feature"));
    appendOptional(copy, config);
    return;
  }
  if (id === "impact") {
    appendTextElement(copy, "p", "slide-body impact-intro", config.body);
    addBlock(copy, "impact-composition", (composition) => addStructuredList(composition, "slide-bullets impact-list", config.bullets, "impact"));
    appendOptional(copy, config);
    return;
  }
  if (id === "solution") {
    appendTextElement(copy, "p", "slide-body solution-intro", config.body);
    addBlock(copy, "solution-composition", (composition) => addStructuredList(composition, "slide-bullets feature-grid", config.bullets, "feature"));
    appendOptional(copy, config);
    return;
  }
  if (id === "market-competitors") {
    appendTextElement(copy, "p", "slide-body market-intro", config.body);
    addBlock(copy, "market-composition", (composition) => addStructuredList(composition, "slide-bullets market-grid", config.bullets, "market"));
    appendOptional(copy, config);
    return;
  }
  if (id === "business-model") {
    appendTextElement(copy, "p", "slide-body business-intro", config.body);
    addBlock(copy, "business-composition", (composition) => addStructuredList(composition, "slide-bullets business-grid", config.bullets, "business"));
    appendOptional(copy, config);
    return;
  }
  if (id === "potential-collaboration") {
    appendTextElement(copy, "p", "slide-body collaboration-intro", config.body);
    addBlock(copy, "collaboration-composition", (composition) => addStructuredList(composition, "slide-bullets collaboration-grid", config.bullets, "partner"));
    appendOptional(copy, config);
    return;
  }
  if (id === "team") {
    appendTextElement(copy, "p", "slide-body team-intro", config.body);
    addBlock(copy, "team-composition", (composition) => addTeam(composition, config.team));
    addList(copy, "slide-bullets", config.bullets);
    appendOptional(copy, { ...config, team: null });
    return;
  }
  if (id === "the-ask") {
    addBlock(copy, "ask-composition", (composition) => {
      appendTextElement(composition, "p", "slide-body ask-intro", config.body);
      addStat(composition, config.stat);
    });
    addList(copy, "slide-bullets", config.bullets);
    appendOptional(copy, { ...config, stat: null });
    return;
  }

  appendTextElement(copy, "p", "slide-body", config.body);
  addList(copy, "slide-bullets", config.bullets);
  appendOptional(copy, config);
}

/**
 * Render one configured chapter into the persistent slide panel.
 * All visible copy and optional media are read from the supplied slide object.
 */
export function renderSlide(slide, { index = 0, total = 1 } = {}) {
  const config = slide && typeof slide === "object" ? slide : {};
  const panel = document.querySelector("#slide-panel");
  const content = document.querySelector("#slide-content");
  if (!panel || !content) return null;

  const presentation = document.querySelector("#presentation");
  const layout = ["hero", "brand", "blank"].includes(config.layout) ? config.layout : "panel";
  if (presentation) presentation.dataset.layout = layout;
  const counter = document.querySelector("#slide-counter");
  if (counter) {
    const safeTotal = Math.max(1, Number.isFinite(Number(total)) ? Number(total) : 1);
    const safeIndex = Math.max(0, Number.isFinite(Number(index)) ? Number(index) : 0);
    counter.textContent = `${String(safeIndex + 1).padStart(2, "0")} / ${String(safeTotal).padStart(2, "0")}`;
  }

  let renderedCopy = null;
  if (layout === "blank") {
    content.replaceChildren();
  } else {
    const copy = document.createElement("div");
    copy.className = `slide-copy slide-enter${layout === "brand" ? " slide-brand" : ""}`;
    if (layout === "brand") {
      addBrand(copy, config);
    } else {
      appendStructuredContent(copy, config);
    }
    content.replaceChildren(copy);
    renderedCopy = copy;
  }
  panel.setAttribute("aria-label", textValue(config.title) || "Presentation chapter");
  observeCopy(renderedCopy);
  scheduleSlideFit();
  return renderedCopy;
}

/**
 * Fit the complete slide into the fixed content region. The fit is implemented
 * through typography and spacing variables, so the boxes reflow in normal layout
 * rather than leaving a transformed, overflowing layout behind.
 */
export function fitSlideContent() {
  const panel = document.querySelector("#slide-panel");
  const content = document.querySelector("#slide-content");
  const copy = content?.querySelector(".slide-copy");
  if (!panel || !content || !copy || panel.hidden) return 1;

  const measure = () => {
    const style = getComputedStyle(content);
    const availableWidth = Math.max(1, content.clientWidth -
      parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
    const availableHeight = Math.max(1, content.clientHeight -
      parseFloat(style.paddingTop) - parseFloat(style.paddingBottom));
    return {
      width: Math.max(copy.scrollWidth, copy.getBoundingClientRect().width),
      height: Math.max(copy.scrollHeight, copy.getBoundingClientRect().height),
      availableWidth,
      availableHeight
    };
  };
  const fits = (result) => result.width <= result.availableWidth + 1 &&
    result.height <= result.availableHeight + 1;

  // Start at the intended type scale, then use a bounded binary search for the
  // largest readable size that fits. No transform or fixed-height clipping.
  panel.style.setProperty("--fit-scale", "1");
  let result = measure();
  let scale = 1;
  if (!fits(result)) {
    let low = 0.42;
    let high = 1;
    panel.style.setProperty("--fit-scale", String(low));
    result = measure();
    if (!fits(result)) {
      scale = low;
    } else {
      for (let i = 0; i < 11; i += 1) {
        const mid = (low + high) / 2;
        panel.style.setProperty("--fit-scale", String(mid));
        if (fits(measure())) low = mid;
        else high = mid;
      }
      scale = low;
    }
    panel.style.setProperty("--fit-scale", scale.toFixed(4));
  }
  panel.dataset.scale = scale.toFixed(3);
  return scale;
}

let fitFrame = 0;
let observedCopy = null;
const copyObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleSlideFit);
function observeCopy(copy) {
  if (observedCopy) copyObserver?.unobserve(observedCopy);
  observedCopy = copy;
  if (copy) copyObserver?.observe(copy);
}
function scheduleSlideFit() {
  if (fitFrame) cancelAnimationFrame(fitFrame);
  fitFrame = requestAnimationFrame(() => {
    fitSlideContent();
    // A layout switch can change both the pane and its available content height.
    // Recheck after that layout has painted, not just against the previous pane.
    fitFrame = requestAnimationFrame(() => {
      fitFrame = 0;
      fitSlideContent();
    });
  });
}

if (typeof document !== "undefined") {
  document.fonts?.ready?.then(scheduleSlideFit);
  document.fonts?.addEventListener?.("loadingdone", scheduleSlideFit);
  if (typeof ResizeObserver !== "undefined") {
    const stage = document.querySelector("#presentation");
    if (stage) {
      const fitObserver = new ResizeObserver(scheduleSlideFit);
      fitObserver.observe(stage);
      const panel = document.querySelector("#slide-panel");
      if (panel) fitObserver.observe(panel);
      window.addEventListener("resize", scheduleSlideFit, { passive: true });
      window.visualViewport?.addEventListener?.("resize", scheduleSlideFit, { passive: true });
    }
  }
}
