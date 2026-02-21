import { config } from "./config.js";
import { renderWorldOutline } from "./mapRenderer.js";
import { createMapState } from "./mapState.js";

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

  let syncMobileControls = () => {};
  const render = () => {
    renderWorldOutline({
      svgEl: containerEl,
      topoJson,
      populationByCountryId,
      state,
      config,
    });
    syncMobileControls();
  };

  syncMobileControls = setupMobileControls({ state, render, actions });
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
