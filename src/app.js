import { config } from "./config.js";
import { renderWorldOutline } from "./mapRenderer.js";
import { createMapState } from "./mapState.js";

function normalizeCountryId(countryId) {
  const raw = String(countryId ?? "").trim();
  if (/^\d+$/.test(raw)) {
    return raw.padStart(3, "0");
  }
  return raw;
}

function formatLeaderRole(role) {
  if (!role) {
    return "";
  }
  const normalized = String(role).trim().replace(/_/g, " ");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function sanitizeLeaderImageUrl(imageUrl, allowedHosts = []) {
  const raw = String(imageUrl || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw, window.location.href);
    if (url.protocol !== "https:") {
      return "";
    }
    if (Array.isArray(allowedHosts) && allowedHosts.length > 0 && !allowedHosts.includes(url.hostname)) {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

function setupCountryPopup({ svgEl, populationByCountryId, locale, allowedImageHosts }) {
  const popup = document.querySelector("#country-popup");
  const closeBtn = document.querySelector("#country-popup-close");
  const nameEl = document.querySelector("#country-popup-name");
  const popEl = document.querySelector("#country-popup-population");
  const leaderEl = document.querySelector("#country-popup-leader");
  const leaderImg = document.querySelector("#country-popup-leader-image");

  if (!popup || !closeBtn || !nameEl || !popEl || !leaderEl || !leaderImg) {
    return;
  }

  const numberFormatter = new Intl.NumberFormat(locale || "en-US");

  const closePopup = () => {
    popup.hidden = true;
    popup.setAttribute("aria-hidden", "true");
  };

  const openPopup = ({ countryId, countryName }) => {
    const record = populationByCountryId[countryId] || {};
    const flag = record.flagEmoji ? ` ${record.flagEmoji}` : "";
    const displayName = countryName || record.name || "Unknown country";
    nameEl.textContent = `${displayName}${flag}`;

    const populationValue = Number(record.population);
    if (Number.isFinite(populationValue) && populationValue > 0) {
      popEl.textContent = `Population: ${numberFormatter.format(populationValue)}${record.year ? ` (${record.year})` : ""}`;
    } else {
      popEl.textContent = "Population: N/A";
    }

    if (record.leaderName) {
      const roleLabel = formatLeaderRole(record.leaderRole);
      leaderEl.textContent = roleLabel ? `Leader: ${record.leaderName} (${roleLabel})` : `Leader: ${record.leaderName}`;
    } else {
      leaderEl.textContent = "Leader: N/A";
    }

    const imageUrl = sanitizeLeaderImageUrl(record.leaderImageUrl, allowedImageHosts);
    if (imageUrl) {
      leaderImg.src = imageUrl;
      leaderImg.alt = record.leaderName ? `${record.leaderName} portrait` : `${displayName} leader portrait`;
      leaderImg.hidden = false;
    } else {
      leaderImg.hidden = true;
      leaderImg.removeAttribute("src");
      leaderImg.alt = "";
    }

    popup.hidden = false;
    popup.setAttribute("aria-hidden", "false");
  };

  const getPopupCountryFromTarget = (target) => {
    const suppressedUntil = Number(svgEl.dataset.suppressCountryClickUntil || "0");
    if (Date.now() < suppressedUntil) {
      return null;
    }

    const mapPath = target?.closest?.("path[data-country-id]");
    if (mapPath && svgEl.contains(mapPath)) {
      return {
        countryId: normalizeCountryId(mapPath.getAttribute("data-country-id")),
        countryName: String(mapPath.getAttribute("data-country-name") || "").trim(),
      };
    }

    const sidePanelItem = target?.closest?.(".country-list-item[data-country-id]");
    if (sidePanelItem) {
      return {
        countryId: normalizeCountryId(sidePanelItem.getAttribute("data-country-id")),
        countryName: String(sidePanelItem.getAttribute("data-country-name") || "").trim(),
      };
    }

    return null;
  };

  closeBtn.addEventListener("click", closePopup);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePopup();
    }
  });

  document.addEventListener("click", (event) => {
    const countryDetails = getPopupCountryFromTarget(event.target);
    if (!countryDetails?.countryId) {
      return;
    }
    openPopup(countryDetails);
  });

  document.addEventListener("keydown", (event) => {
    const listItem = event.target?.closest?.(".country-list-item[data-country-id]");
    if (!listItem) {
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const countryId = normalizeCountryId(listItem.getAttribute("data-country-id"));
    const countryName = String(listItem.getAttribute("data-country-name") || "").trim();
    if (!countryId) {
      return;
    }
    openPopup({ countryId, countryName });
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getViewportSize(svgEl) {
  return {
    width: Math.max(320, svgEl.clientWidth || 0),
    height: Math.max(200, svgEl.clientHeight || 0),
  };
}

function getSvgPoint(svgEl, clientX, clientY) {
  const rect = svgEl.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

function clampPan({ pan, zoom, width, height, panPadding }) {
  if (zoom <= 1) {
    return { x: 0, y: 0 };
  }

  const minX = width * (1 - zoom) - panPadding;
  const maxX = panPadding;
  const minY = height * (1 - zoom) - panPadding;
  const maxY = panPadding;

  return {
    x: clamp(pan.x, minX, maxX),
    y: clamp(pan.y, minY, maxY),
  };
}

function setupMapNavigation({ svgEl, state, config, render }) {
  const zoomInBtn = document.querySelector("#zoom-in-btn");
  const zoomOutBtn = document.querySelector("#zoom-out-btn");
  const zoomResetBtn = document.querySelector("#zoom-reset-btn");
  const zoomReadout = document.querySelector("#zoom-readout");

  const minZoom = Number(config.minZoom) || 1;
  const maxZoom = Math.max(minZoom, Number(config.maxZoom) || 8);
  const zoomStep = Math.max(1.01, Number(config.zoomStep) || 1.2);
  const wheelZoomStep = Math.max(0.01, Number(config.wheelZoomStep) || 0.15);
  const panPadding = Math.max(0, Number(config.panPadding) || 0);

  state.zoom = clamp(Number(state.zoom) || 1, minZoom, maxZoom);
  if (!state.pan || !Number.isFinite(state.pan.x) || !Number.isFinite(state.pan.y)) {
    state.pan = { x: 0, y: 0 };
  }

  const updateZoomUi = () => {
    const zoom = Number(state.zoom) || 1;
    if (zoomReadout) {
      zoomReadout.textContent = `${Math.round(zoom * 100)}%`;
    }
    if (zoomInBtn) {
      zoomInBtn.disabled = zoom >= maxZoom;
    }
    if (zoomOutBtn) {
      zoomOutBtn.disabled = zoom <= minZoom;
    }
    if (zoomResetBtn) {
      const isDefault = Math.abs(zoom - 1) < 0.001 && Math.abs(state.pan.x) < 0.001 && Math.abs(state.pan.y) < 0.001;
      zoomResetBtn.disabled = isDefault;
    }
  };

  const zoomAroundPoint = (nextZoom, point) => {
    const currentZoom = Number(state.zoom) || 1;
    const clampedZoom = clamp(nextZoom, minZoom, maxZoom);
    if (Math.abs(clampedZoom - currentZoom) < 0.0001) {
      return false;
    }

    const ratio = clampedZoom / currentZoom;
    const currentPan = state.pan || { x: 0, y: 0 };
    const rawPan = {
      x: point.x - ratio * (point.x - currentPan.x),
      y: point.y - ratio * (point.y - currentPan.y),
    };

    const { width, height } = getViewportSize(svgEl);
    state.zoom = clampedZoom;
    state.pan = clampPan({
      pan: rawPan,
      zoom: clampedZoom,
      width,
      height,
      panPadding,
    });
    return true;
  };

  const panBy = (dx, dy) => {
    const zoom = Number(state.zoom) || 1;
    if (zoom <= 1) {
      return false;
    }
    const { width, height } = getViewportSize(svgEl);
    const currentPan = state.pan || { x: 0, y: 0 };
    state.pan = clampPan({
      pan: {
        x: currentPan.x + dx,
        y: currentPan.y + dy,
      },
      zoom,
      width,
      height,
      panPadding,
    });
    return true;
  };

  const zoomByFactor = (factor, point) => {
    if (zoomAroundPoint((Number(state.zoom) || 1) * factor, point)) {
      render();
    }
  };

  if (zoomInBtn) {
    zoomInBtn.addEventListener("click", () => {
      const { width, height } = getViewportSize(svgEl);
      zoomByFactor(zoomStep, { x: width / 2, y: height / 2 });
    });
  }

  if (zoomOutBtn) {
    zoomOutBtn.addEventListener("click", () => {
      const { width, height } = getViewportSize(svgEl);
      zoomByFactor(1 / zoomStep, { x: width / 2, y: height / 2 });
    });
  }

  if (zoomResetBtn) {
    zoomResetBtn.addEventListener("click", () => {
      state.zoom = 1;
      state.pan = { x: 0, y: 0 };
      render();
    });
  }

  svgEl.style.touchAction = "none";

  svgEl.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const point = getSvgPoint(svgEl, event.clientX, event.clientY);
      const factor = event.deltaY < 0 ? 1 + wheelZoomStep : 1 / (1 + wheelZoomStep);
      zoomByFactor(factor, point);
    },
    { passive: false },
  );

  let dragState = null;

  svgEl.addEventListener("pointerdown", (event) => {
    if ((Number(state.zoom) || 1) <= 1) {
      return;
    }
    if (event.button !== 0) {
      return;
    }
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      dragging: false,
      moved: false,
    };
  });

  svgEl.addEventListener("pointermove", (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const totalDx = event.clientX - dragState.startX;
    const totalDy = event.clientY - dragState.startY;
    if (!dragState.dragging && Math.abs(totalDx) + Math.abs(totalDy) > 3) {
      dragState.dragging = true;
      dragState.moved = true;
      svgEl.setPointerCapture(event.pointerId);
      svgEl.style.cursor = "grabbing";
    }

    if (!dragState.dragging) {
      return;
    }

    const dx = event.clientX - dragState.lastX;
    const dy = event.clientY - dragState.lastY;
    dragState.lastX = event.clientX;
    dragState.lastY = event.clientY;
    if (panBy(dx, dy)) {
      render();
    }
  });

  const endDrag = (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    if (dragState.moved) {
      svgEl.dataset.suppressCountryClickUntil = String(Date.now() + 220);
    }
    dragState = null;
    svgEl.style.cursor = "";
    if (svgEl.hasPointerCapture(event.pointerId)) {
      svgEl.releasePointerCapture(event.pointerId);
    }
  };

  svgEl.addEventListener("pointerup", endDrag);
  svgEl.addEventListener("pointercancel", endDrag);

  return updateZoomUi;
}

function createHighlightActions(state, palette) {
  function addInitial(initial) {
    const letter = String(initial || "").toLowerCase();
    if (!/^[a-z]$/.test(letter)) {
      return false;
    }
    if (state.initialColors[letter]) {
      return false;
    }

    const nextColor = palette[state.colorCursor % palette.length];
    state.initialColors[letter] = nextColor;
    state.colorCursor += 1;
    state.activeInitial = letter;
    return true;
  }

  function removeInitial(initial) {
    const letter = String(initial || "").toLowerCase();
    if (!state.initialColors[letter]) {
      return false;
    }

    delete state.initialColors[letter];
    if (state.activeInitial === letter) {
      state.activeInitial = null;
    }
    return true;
  }

  function toggleInitial(initial) {
    const letter = String(initial || "").toLowerCase();
    if (state.initialColors[letter]) {
      return removeInitial(letter);
    }
    return addInitial(letter);
  }

  function clearHighlights() {
    if (Object.keys(state.initialColors || {}).length === 0) {
      return false;
    }
    state.activeInitial = null;
    state.initialColors = {};
    state.colorCursor = 0;
    return true;
  }

  return { addInitial, removeInitial, toggleInitial, clearHighlights };
}

function bindKeyboardEvents({ state, render, actions }) {
  void state;

  window.addEventListener("keydown", (event) => {
    const interactiveTarget = event.target?.closest?.("input, textarea, select, button, [contenteditable='true']");
    if (interactiveTarget) {
      return;
    }

    if (event.code === "Space") {
      event.preventDefault();
      if (actions.clearHighlights()) {
        render();
      }
      return;
    }

    const key = String(event.key || "").toLowerCase();
    if (/^[a-z]$/.test(key) && actions.addInitial(key)) {
      render();
    }
  });
}

function setupMobileControls({ state, render, actions }) {
  const lettersContainer = document.querySelector("#mobile-letter-buttons");
  const clearBtn = document.querySelector("#mobile-clear-btn");
  const listToggleBtn = document.querySelector("#mobile-list-toggle");
  const bottomSheet = document.querySelector("#mobile-bottom-sheet");
  const bottomSheetToggle = document.querySelector("#mobile-bottom-sheet-toggle");

  const hasMobileUi = lettersContainer && clearBtn && listToggleBtn && bottomSheet && bottomSheetToggle;
  if (!hasMobileUi) {
    return () => {};
  }

  const letters = "abcdefghijklmnopqrstuvwxyz".split("");
  if (!lettersContainer.dataset.initialized) {
    for (const letter of letters) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mobile-letter-btn";
      btn.textContent = letter.toUpperCase();
      btn.dataset.letter = letter;
      btn.setAttribute("aria-pressed", "false");
      btn.addEventListener("click", () => {
        if (actions.toggleInitial(letter)) {
          render();
        }
      });
      lettersContainer.appendChild(btn);
    }
    lettersContainer.dataset.initialized = "true";
  }

  const setSheetOpen = (open) => {
    bottomSheet.classList.toggle("is-open", open);
    listToggleBtn.setAttribute("aria-expanded", String(open));
    bottomSheetToggle.setAttribute("aria-expanded", String(open));
    bottomSheet.setAttribute("aria-expanded", String(open));
  };

  setSheetOpen(false);

  listToggleBtn.addEventListener("click", () => {
    setSheetOpen(!bottomSheet.classList.contains("is-open"));
  });

  bottomSheetToggle.addEventListener("click", () => {
    setSheetOpen(!bottomSheet.classList.contains("is-open"));
  });

  clearBtn.addEventListener("click", () => {
    if (actions.clearHighlights()) {
      render();
    }
  });

  return () => {
    const active = state.initialColors || {};
    const buttons = lettersContainer.querySelectorAll(".mobile-letter-btn");
    for (const btn of buttons) {
      const letter = btn.dataset.letter || "";
      const isActive = Boolean(active[letter]);
      btn.classList.toggle("is-active", isActive);
      btn.style.setProperty("--chip-color", active[letter] || "#1f2a37");
      btn.setAttribute("aria-pressed", String(isActive));
    }

    const activeCount = Object.keys(active).length;
    clearBtn.disabled = activeCount === 0;
    listToggleBtn.textContent = activeCount > 0 ? `List (${activeCount})` : "List";
  };
}

export async function initApp(containerEl) {
  if (!containerEl) {
    throw new Error("initApp requires a valid SVG container element.");
  }

  const state = createMapState();
  const palette =
    Array.isArray(config.highlightPalette) && config.highlightPalette.length > 0
      ? config.highlightPalette
      : [config.highlightFillColor];

  const [topologyResponse, populationResponse] = await Promise.all([
    fetch("./data/world-110m.topo.json"),
    fetch("./data/country-population.json"),
  ]);

  if (!topologyResponse.ok) {
    throw new Error(`Failed to load map data: ${topologyResponse.status} ${topologyResponse.statusText}`);
  }
  if (!populationResponse.ok) {
    throw new Error(`Failed to load population data: ${populationResponse.status} ${populationResponse.statusText}`);
  }

  const [topoJson, populationByCountryId] = await Promise.all([topologyResponse.json(), populationResponse.json()]);
  const actions = createHighlightActions(state, palette);
  setupCountryPopup({
    svgEl: containerEl,
    populationByCountryId,
    locale: config.populationNumberLocale,
    allowedImageHosts: config.allowedLeaderImageHosts,
  });

  let syncMobileControls = () => {};
  let syncMapNavigation = () => {};
  const render = () => {
    renderWorldOutline({
      svgEl: containerEl,
      topoJson,
      populationByCountryId,
      state,
      config,
    });
    syncMobileControls();
    syncMapNavigation();
  };

  syncMobileControls = setupMobileControls({ state, render, actions });
  syncMapNavigation = setupMapNavigation({ svgEl: containerEl, state, config, render });
  bindKeyboardEvents({ state, render, actions });

  render();
  window.addEventListener("resize", render);

  return { state, render };
}

const svgEl = document.querySelector("#world-map");

if (svgEl) {
  initApp(svgEl).catch((error) => {
    console.error(error);
  });
}
