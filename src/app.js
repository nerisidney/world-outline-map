import { config } from "./config.js";
import { renderWorldOutline } from "./mapRenderer.js";
import { createMapState } from "./mapState.js";

function bindMapEvents({ svgEl, state, render }) {
  void svgEl;
  const palette = Array.isArray(config.highlightPalette) && config.highlightPalette.length > 0 ? config.highlightPalette : [config.highlightFillColor];

  window.addEventListener("keydown", (event) => {
    if (event.code === "Space") {
      event.preventDefault();
      if (Object.keys(state.initialColors || {}).length > 0) {
        state.activeInitial = null;
        state.initialColors = {};
        state.colorCursor = 0;
        render();
      }
      return;
    }

    const key = String(event.key || "").toLowerCase();
    if (/^[a-z]$/.test(key) && !state.initialColors[key]) {
      const nextColor = palette[state.colorCursor % palette.length];
      state.initialColors[key] = nextColor;
      state.colorCursor += 1;
      state.activeInitial = key;
      render();
    }
  });
}

export async function initApp(containerEl) {
  if (!containerEl) {
    throw new Error("initApp requires a valid SVG container element.");
  }

  const state = createMapState();
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

  const render = () => {
    renderWorldOutline({
      svgEl: containerEl,
      topoJson,
      populationByCountryId,
      state,
      config,
    });
  };

  bindMapEvents({ svgEl: containerEl, state, render });
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
