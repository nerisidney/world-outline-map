import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm";
import { feature, mesh } from "https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm";

function resolveCountryObject(topology) {
  const objectKeys = Object.keys(topology.objects || {});
  const preferredKeys = ["countries", "land"];

  for (const key of preferredKeys) {
    if (topology.objects?.[key]) {
      return topology.objects[key];
    }
  }

  if (objectKeys.length === 0) {
    throw new Error("No topology objects found in map data.");
  }

  return topology.objects[objectKeys[0]];
}

function createProjection(projectionName) {
  if (projectionName === "geoNaturalEarth1") {
    return d3.geoNaturalEarth1();
  }

  return d3.geoNaturalEarth1();
}

function ensureLayers(svgSelection) {
  const defsLayer = svgSelection
    .selectAll("defs[data-layer='map-defs']")
    .data([null])
    .join("defs")
    .attr("data-layer", "map-defs");

  const mapLayer = svgSelection.selectAll("g[data-layer='map']").data([null]).join("g").attr("data-layer", "map");
  const backgroundLayer = mapLayer
    .selectAll("g[data-layer='background']")
    .data([null])
    .join("g")
    .attr("data-layer", "background");
  const countriesLayer = mapLayer
    .selectAll("g[data-layer='countries']")
    .data([null])
    .join("g")
    .attr("id", "countries")
    .attr("data-layer", "countries");
  const lineworkLayer = mapLayer
    .selectAll("g[data-layer='linework']")
    .data([null])
    .join("g")
    .attr("data-layer", "linework");

  const overlayLayer = mapLayer
    .selectAll("g[data-layer='overlay']")
    .data([null])
    .join("g")
    .attr("data-layer", "overlay");

  const circlesLayer = overlayLayer
    .selectAll("g[data-layer='population-circles']")
    .data([null])
    .join("g")
    .attr("data-layer", "population-circles");

  const leaderBadgesLayer = overlayLayer
    .selectAll("g[data-layer='leader-badges']")
    .data([null])
    .join("g")
    .attr("data-layer", "leader-badges");

  const labelsLayer = overlayLayer
    .selectAll("g[data-layer='labels']")
    .data([null])
    .join("g")
    .attr("data-layer", "labels");

  const capitalsLayer = overlayLayer
    .selectAll("g[data-layer='capitals']")
    .data([null])
    .join("g")
    .attr("data-layer", "capitals");

  return { mapLayer, backgroundLayer, lineworkLayer, countriesLayer, circlesLayer, leaderBadgesLayer, labelsLayer, capitalsLayer, defsLayer };
}

function ensureVisualDefs(defsLayer, config, width, height) {
  const oceanGradient = defsLayer
    .selectAll("linearGradient#ocean-gradient")
    .data([null])
    .join("linearGradient")
    .attr("id", "ocean-gradient")
    .attr("gradientUnits", "userSpaceOnUse")
    .attr("x1", 0)
    .attr("y1", 0)
    .attr("x2", 0)
    .attr("y2", height);

  oceanGradient
    .selectAll("stop")
    .data([
      { offset: "0%", color: config.oceanGradientTopColor },
      { offset: "100%", color: config.oceanGradientBottomColor },
    ])
    .join("stop")
    .attr("offset", (d) => d.offset)
    .attr("stop-color", (d) => d.color);

  const landGradient = defsLayer
    .selectAll("linearGradient#land-gradient")
    .data([null])
    .join("linearGradient")
    .attr("id", "land-gradient")
    .attr("gradientUnits", "userSpaceOnUse")
    .attr("x1", 0)
    .attr("y1", 0)
    .attr("x2", 0)
    .attr("y2", height);

  landGradient
    .selectAll("stop")
    .data([
      { offset: "0%", color: config.landGradientTopColor || config.landBaseFillColor },
      { offset: "100%", color: config.landGradientBottomColor || config.landBaseFillColor },
    ])
    .join("stop")
    .attr("offset", (d) => d.offset)
    .attr("stop-color", (d) => d.color);

  const countryShadowFilter = defsLayer
    .selectAll("filter#country-shadow")
    .data([null])
    .join("filter")
    .attr("id", "country-shadow")
    .attr("x", "-25%")
    .attr("y", "-25%")
    .attr("width", "150%")
    .attr("height", "150%");

  countryShadowFilter
    .selectAll("feDropShadow")
    .data([null])
    .join("feDropShadow")
    .attr("dx", 0)
    .attr("dy", config.countryShadowDy)
    .attr("stdDeviation", config.countryShadowStdDeviation)
    .attr("flood-color", config.countryShadowColor)
    .attr("flood-opacity", config.countryShadowOpacity);
}

function getCountryInitial(countryName) {
  if (!countryName) {
    return "";
  }

  const normalizedName = String(countryName).trim().toLowerCase();
  return normalizedName.charAt(0);
}

function normalizeCountryId(countryId) {
  if (countryId === null || countryId === undefined) {
    return "";
  }

  const raw = String(countryId).trim();
  if (/^\d+$/.test(raw)) {
    return raw.padStart(3, "0");
  }

  return raw;
}

function shouldExcludeCountry(feature, config) {
  const countryId = normalizeCountryId(feature?.id);
  const countryName = String(feature?.properties?.name || "")
    .trim()
    .toLowerCase();

  const excludedIds = new Set((config.excludedCountryIds || []).map((id) => normalizeCountryId(id)));
  const excludedNames = new Set((config.excludedCountryNames || []).map((name) => String(name || "").trim().toLowerCase()));

  if (countryId && excludedIds.has(countryId)) {
    return true;
  }
  if (countryName && excludedNames.has(countryName)) {
    return true;
  }
  return false;
}

function shouldExcludeTopologyGeometry(geometry, config) {
  const geometryId = normalizeCountryId(geometry?.id);
  const geometryName = String(geometry?.properties?.name || "")
    .trim()
    .toLowerCase();

  const excludedIds = new Set((config.excludedCountryIds || []).map((id) => normalizeCountryId(id)));
  const excludedNames = new Set((config.excludedCountryNames || []).map((name) => String(name || "").trim().toLowerCase()));

  if (geometryId && excludedIds.has(geometryId)) {
    return true;
  }
  if (geometryName && excludedNames.has(geometryName)) {
    return true;
  }
  return false;
}

const geometryCache = {
  topoRef: null,
  width: 0,
  height: 0,
  configKey: "",
  data: null,
};

const FALLBACK_TERRITORY_FEATURES = [
  {
    type: "Feature",
    id: "239",
    properties: { name: "S. Geo. and the Is." },
    geometry: {
      type: "Polygon",
      coordinates: [[[-39.6, -53.2], [-33.4, -53.2], [-33.4, -55.8], [-39.6, -55.8], [-39.6, -53.2]]],
    },
  },
  {
    type: "Feature",
    id: "260",
    properties: { name: "Fr. S. Antarctic Lands" },
    geometry: {
      type: "Polygon",
      coordinates: [[[66.2, -48.0], [72.8, -48.0], [72.8, -51.2], [66.2, -51.2], [66.2, -48.0]]],
    },
  },
];

function buildGeometryConfigKey(config) {
  return [
    config.projection,
    config.fitPadding,
    (config.excludedCountryIds || []).join(","),
    (config.excludedCountryNames || []).join(","),
  ].join("|");
}

function withFallbackTerritories(countries) {
  const existingIds = new Set(countries.map((country) => normalizeCountryId(country?.id)));
  const existingNames = new Set(countries.map((country) => String(country?.properties?.name || "").trim().toLowerCase()));

  const missingFallbacks = FALLBACK_TERRITORY_FEATURES.filter((territory) => {
    const territoryId = normalizeCountryId(territory.id);
    const territoryName = String(territory.properties?.name || "").trim().toLowerCase();
    if (territoryId && existingIds.has(territoryId)) {
      return false;
    }
    if (territoryName && existingNames.has(territoryName)) {
      return false;
    }
    return true;
  });

  return [...countries, ...missingFallbacks];
}

function getGeometryState({ topoJson, width, height, config }) {
  const configKey = buildGeometryConfigKey(config);
  const geometryChanged =
    geometryCache.topoRef !== topoJson ||
    geometryCache.width !== width ||
    geometryCache.height !== height ||
    geometryCache.configKey !== configKey;

  if (!geometryChanged && geometryCache.data) {
    return {
      ...geometryCache.data,
      geometryChanged: false,
    };
  }

  const topologyObject = resolveCountryObject(topoJson);
  const countriesFeature = feature(topoJson, topologyObject);
  const allCountriesRaw = countriesFeature.type === "FeatureCollection" ? countriesFeature.features : [countriesFeature];
  const allCountries = withFallbackTerritories(allCountriesRaw);
  const countries = allCountries.filter((country) => !shouldExcludeCountry(country, config));
  const visibleCountriesFeature = { type: "FeatureCollection", features: countries };

  const projection = createProjection(config.projection);
  projection.fitExtent(
    [
      [config.fitPadding, config.fitPadding],
      [width - config.fitPadding, height - config.fitPadding],
    ],
    visibleCountriesFeature,
  );

  const path = d3.geoPath(projection);
  const coastlineMesh = mesh(topoJson, topologyObject, (a, b) => a === b && !shouldExcludeTopologyGeometry(a, config));
  const borderMesh = mesh(
    topoJson,
    topologyObject,
    (a, b) => a !== b && !shouldExcludeTopologyGeometry(a, config) && !shouldExcludeTopologyGeometry(b, config),
  );

  const centroidById = new Map();
  countries.forEach((country, i) => {
    const countryId = normalizeCountryId(country?.id ?? `country-${i}`) || `country-${i}`;
    centroidById.set(countryId, path.centroid(country));
  });

  const data = {
    topologyObject,
    countries,
    projection,
    path,
    coastlineMesh,
    borderMesh,
    centroidById,
  };

  geometryCache.topoRef = topoJson;
  geometryCache.width = width;
  geometryCache.height = height;
  geometryCache.configKey = configKey;
  geometryCache.data = data;

  return {
    ...data,
    geometryChanged: true,
  };
}

function clipPathIdForCountry(countryId) {
  return `leader-clip-${String(countryId).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function formatLeaderRole(role) {
  if (!role) {
    return "";
  }

  const normalized = String(role).trim().replace(/_/g, " ");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function composeDisplayName(englishName, nativeName) {
  const baseEnglish = String(englishName || "").trim();
  const baseNative = String(nativeName || "").trim();
  if (!baseEnglish) {
    return baseNative;
  }
  if (!baseNative) {
    return baseEnglish;
  }
  if (baseEnglish.toLowerCase() === baseNative.toLowerCase()) {
    return baseEnglish;
  }
  return `${baseEnglish} / ${baseNative}`;
}

function getCountryDisplayLabel(row) {
  const displayName = row.displayName || row.name;
  return row.flagEmoji ? `${row.flagEmoji} ${displayName}` : displayName;
}

function getSidebarCountryText(row, numberFormatter) {
  const displayName = row.displayName || row.name;
  const countryWithFlag = row.flagEmoji ? `${displayName} ${row.flagEmoji}` : displayName;
  if (row.hasPopulation) {
    return `${countryWithFlag} — ${numberFormatter.format(row.population)}${row.year ? ` (${row.year})` : ""}`;
  }

  return `${countryWithFlag} — N/A`;
}

function getLeaderText(row) {
  if (!row.leaderName) {
    return "Leader: N/A";
  }

  const roleLabel = formatLeaderRole(row.leaderRole);
  return roleLabel ? `Leader: ${row.leaderName} (${roleLabel})` : `Leader: ${row.leaderName}`;
}

function getCountryListElements() {
  return Array.from(document.querySelectorAll("[data-role='highlighted-country-list']"));
}

function resetSidePanel() {
  const listElements = getCountryListElements();
  if (listElements.length === 0) {
    return;
  }

  for (const listEl of listElements) {
    listEl.innerHTML = "";
    const emptyItem = document.createElement("li");
    emptyItem.className = "country-list-empty";
    emptyItem.textContent = "No countries highlighted.";
    listEl.appendChild(emptyItem);
  }
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

function updateSidePanel(countryRows, config) {
  const listElements = getCountryListElements();
  if (listElements.length === 0) {
    return;
  }
  if (countryRows.length === 0) {
    resetSidePanel();
    return;
  }

  const numberFormatter = new Intl.NumberFormat(config.populationNumberLocale || "en-US");

  for (const listEl of listElements) {
    listEl.innerHTML = "";
    for (const row of countryRows) {
      const listItem = document.createElement("li");
      listItem.className = "country-list-item";
      listItem.dataset.countryId = row.id;
      listItem.dataset.countryName = row.name;
      listItem.tabIndex = 0;
      listItem.setAttribute("role", "button");
      listItem.setAttribute("aria-label", `Show details for ${row.displayName || row.name}`);

      const safeLeaderImageUrl = sanitizeLeaderImageUrl(row.leaderImageUrl, config.allowedLeaderImageHosts);
      if (safeLeaderImageUrl) {
        const thumb = document.createElement("img");
        thumb.className = "country-leader-thumb";
        thumb.src = withRequestedImageWidth(safeLeaderImageUrl, config.leaderSidebarThumbImageWidth || 144);
        thumb.alt = row.leaderName ? `${row.leaderName} portrait` : `${row.name} leader portrait`;
        thumb.referrerPolicy = "no-referrer";
        thumb.loading = "lazy";
        thumb.decoding = "async";
        thumb.addEventListener("error", () => {
          thumb.remove();
        });
        listItem.appendChild(thumb);
      }

      const textWrap = document.createElement("div");
      textWrap.className = "country-list-content";

      const mainLine = document.createElement("div");
      mainLine.className = "country-main-line";
      mainLine.style.color = row.color;
      mainLine.textContent = getSidebarCountryText(row, numberFormatter);

      const metaLine = document.createElement("div");
      metaLine.className = "country-meta-line";
      metaLine.textContent = getLeaderText(row);

      textWrap.appendChild(mainLine);
      textWrap.appendChild(metaLine);
      listItem.appendChild(textWrap);
      listEl.appendChild(listItem);
    }
  }
}

function getLeaderBadgeX(row, config) {
  return row.x - (config.leaderBadgeRadius + config.leaderBadgeGap);
}

function withRequestedImageWidth(imageUrl, width) {
  const normalizedUrl = String(imageUrl || "").trim();
  if (!normalizedUrl) {
    return "";
  }

  try {
    const url = new URL(normalizedUrl);
    url.searchParams.set("width", String(Math.max(48, Math.round(width))));
    return url.toString();
  } catch {
    return normalizedUrl;
  }
}

function getCapitalPoint({ record, centroid, projection }) {
  const capitalName = String(record.capital || "").trim();
  if (!capitalName) {
    return null;
  }

  const lat = Number(record.capitalLat);
  const lng = Number(record.capitalLng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    const projected = projection([lng, lat]);
    if (projected && Number.isFinite(projected[0]) && Number.isFinite(projected[1])) {
      return {
        name: capitalName,
        x: projected[0],
        y: projected[1],
      };
    }
  }

  if (Number.isFinite(centroid[0]) && Number.isFinite(centroid[1])) {
    return {
      name: capitalName,
      x: centroid[0],
      y: centroid[1],
    };
  }

  return null;
}

export function renderWorldOutline({ svgEl, topoJson, populationByCountryId = {}, state, config }) {
  if (!svgEl) {
    throw new Error("renderWorldOutline requires a valid svgEl.");
  }

  const width = Math.max(320, svgEl.clientWidth || 0);
  const height = Math.max(200, svgEl.clientHeight || 0);
  const svg = d3.select(svgEl);

  svg.attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "xMidYMid meet").style("background", config.backgroundColor);

  const { countries, projection, path, coastlineMesh, borderMesh, centroidById, geometryChanged } = getGeometryState({
    topoJson,
    width,
    height,
    config,
  });
  const { mapLayer, backgroundLayer, lineworkLayer, countriesLayer, circlesLayer, leaderBadgesLayer, labelsLayer, capitalsLayer, defsLayer } = ensureLayers(svg);
  ensureVisualDefs(defsLayer, config, width, height);

  const tx = state.pan?.x ?? 0;
  const ty = state.pan?.y ?? 0;
  const scale = state.zoom ?? 1;
  const zoomLevel = Math.max(1, Number(state.zoom) || 1);
  const initialColors = state.initialColors || {};
  const gameFoundCountryIds = state.gameFoundCountryIds || {};
  const hasActiveHighlights = Object.keys(initialColors).length > 0;
  mapLayer.attr("transform", `translate(${tx}, ${ty}) scale(${scale})`);

  backgroundLayer
    .selectAll("rect[data-role='map-canvas']")
    .data([null])
    .join("rect")
    .attr("data-role", "map-canvas")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", width)
    .attr("height", height)
    .attr("fill", config.backgroundColor);

  backgroundLayer
    .selectAll("path[data-role='ocean-sphere']")
    .data([{ type: "Sphere" }])
    .join("path")
    .attr("data-role", "ocean-sphere")
    .attr("d", path)
    .attr("fill", "url(#ocean-gradient)")
    .attr("stroke", config.sphereStrokeColor)
    .attr("stroke-width", config.sphereStrokeWidth);

  const coastlineSelection = lineworkLayer
    .selectAll("path[data-role='coastline']")
    .data([coastlineMesh])
    .join("path")
    .attr("data-role", "coastline")
    .attr("fill", "none")
    .attr("stroke", config.coastlineColor)
    .attr("stroke-width", config.coastlineWidth)
    .attr("stroke-opacity", config.coastlineOpacity)
    .attr("stroke-linejoin", "round")
    .attr("stroke-linecap", "round")
    .attr("vector-effect", "non-scaling-stroke")
    .style("pointer-events", "none");
  if (geometryChanged) {
    coastlineSelection.attr("d", path);
  }

  const borderSelection = lineworkLayer
    .selectAll("path[data-role='borders']")
    .data([borderMesh])
    .join("path")
    .attr("data-role", "borders")
    .attr("fill", "none")
    .attr("stroke", config.borderLineColor)
    .attr("stroke-width", config.borderLineWidth)
    .attr("stroke-opacity", config.borderLineOpacity)
    .attr("stroke-linejoin", "round")
    .attr("stroke-linecap", "round")
    .attr("vector-effect", "non-scaling-stroke")
    .style("pointer-events", "none");
  if (geometryChanged) {
    borderSelection.attr("d", path);
  }

  countriesLayer.attr("filter", "url(#country-shadow)");

  const countriesSelection = countriesLayer
    .selectAll("path")
    .data(countries, (d, i) => d?.id ?? d?.properties?.name ?? `country-${i}`)
    .join(
      (enter) => enter.append("path").attr("d", path),
      (update) => (geometryChanged ? update.attr("d", path) : update),
      (exit) => exit.remove(),
    )
    .attr("fill", (d) => {
      const countryId = normalizeCountryId(d?.id);
      if (countryId && gameFoundCountryIds[countryId]) {
        return config.gameFoundFillColor || "#37b24d";
      }
      const countryName = d?.properties?.name || "";
      const color = initialColors[getCountryInitial(countryName)];
      return color || "url(#land-gradient)";
    })
    .attr("stroke", (d) => {
      const countryId = normalizeCountryId(d?.id);
      if (countryId && gameFoundCountryIds[countryId]) {
        return config.gameFoundStrokeColor || "#1f7a34";
      }
      return "none";
    })
    .attr("stroke-width", (d) => {
      const countryId = normalizeCountryId(d?.id);
      if (countryId && gameFoundCountryIds[countryId]) {
        return config.gameFoundStrokeWidth ?? 0.5;
      }
      return 0;
    })
    .attr("data-country-id", (d, i) => String(d?.id ?? `country-${i}`))
    .attr("data-country-name", (d) => d?.properties?.name || "");

  const showCapitals = zoomLevel >= (Number(config.capitalZoomThreshold) || 5);

  if (showCapitals) {
    const capitalsData = countriesSelection
      .data()
      .map((d, i) => {
        const countryId = normalizeCountryId(d?.id ?? `country-${i}`);
        const centroid = centroidById.get(countryId) || path.centroid(d);
        const populationRecord = populationByCountryId[countryId] || {};
        const capitalPoint = getCapitalPoint({
          record: populationRecord,
          centroid,
          projection,
        });
        if (!capitalPoint) {
          return null;
        }

        return {
          id: countryId || `country-${i}`,
          name: capitalPoint.name,
          countryName: d?.properties?.name || "",
          x: capitalPoint.x,
          y: capitalPoint.y,
        };
      })
      .filter(Boolean);

    const capitalFontSize = (Number(config.capitalLabelFontSize) || 11) / zoomLevel;
    const capitalDotRadius = (Number(config.capitalDotRadius) || 2.8) / zoomLevel;
    const capitalHaloWidth = (Number(config.capitalLabelHaloWidth) || 2.2) / zoomLevel;
    const labelDx = 5 / zoomLevel;

    const capitalsGroups = capitalsLayer
      .selectAll("g[data-layer='capital-item']")
      .data(capitalsData, (d) => d.id)
      .join("g")
      .attr("data-layer", "capital-item")
      .attr("data-capital-country-id", (d) => d.id)
      .attr("data-capital-name", (d) => d.name)
      .attr("data-capital-country-name", (d) => d.countryName)
      .attr("transform", (d) => `translate(${d.x}, ${d.y})`)
      .style("pointer-events", "all")
      .style("cursor", "pointer");

    const capitalHitRadius = Math.max(8 / zoomLevel, 3.2 / zoomLevel);
    capitalsGroups
      .selectAll("circle.capital-hit-target")
      .data((d) => [d])
      .join("circle")
      .attr("class", "capital-hit-target")
      .attr("r", capitalHitRadius)
      .attr("fill", "rgba(0, 0, 0, 0)")
      .style("pointer-events", "all");

    capitalsGroups
      .selectAll("circle.capital-dot")
      .data((d) => [d])
      .join("circle")
      .attr("class", "capital-dot")
      .attr("r", capitalDotRadius)
      .attr("fill", config.capitalDotColor)
      .style("pointer-events", "none");

    capitalsGroups
      .selectAll("text")
      .data((d) => [d])
      .join("text")
      .attr("x", labelDx)
      .attr("y", 0)
      .attr("fill", config.capitalLabelColor)
      .attr("font-size", capitalFontSize)
      .attr("font-weight", 600)
      .attr("dominant-baseline", "central")
      .attr("paint-order", "stroke")
      .attr("stroke", config.capitalLabelHaloColor)
      .attr("stroke-width", capitalHaloWidth)
      .style("pointer-events", "none")
      .text((d) => d.name);
  } else {
    capitalsLayer.selectAll("g[data-layer='capital-item']").remove();
  }

  if (!hasActiveHighlights) {
    circlesLayer.selectAll("circle").remove();
    leaderBadgesLayer.selectAll("g[data-layer='leader-badge']").remove();
    defsLayer.selectAll("clipPath[data-layer='leader-badge-clip']").remove();
    labelsLayer.selectAll("text").remove();
    resetSidePanel();
    return;
  }

  const highlightedCountryData = countriesSelection
    .data()
    .filter((d) => {
      const countryName = d?.properties?.name || "";
      return Boolean(initialColors[getCountryInitial(countryName)]);
    })
    .map((d, i) => {
      const countryId = normalizeCountryId(d?.id ?? `country-${i}`);
      const [x, y] = centroidById.get(countryId) || path.centroid(d);
      const populationRecord = populationByCountryId[countryId] || {};
      const populationValue = Number(populationRecord.population);
      const hasPopulation = Number.isFinite(populationValue) && populationValue > 0;
      const leaderImageUrl = sanitizeLeaderImageUrl(populationRecord.leaderImageUrl, config.allowedLeaderImageHosts);
      const nativeName = String(populationRecord.nativeName || "").trim();
      const englishName = d?.properties?.name || "";
      const displayName = composeDisplayName(englishName, nativeName);

      return {
        id: countryId || `country-${i}`,
        name: englishName,
        displayName,
        nativeName,
        color: initialColors[getCountryInitial(d?.properties?.name || "")],
        population: hasPopulation ? populationValue : null,
        year: populationRecord.year ?? null,
        flagEmoji: populationRecord.flagEmoji || "",
        leaderName: populationRecord.leaderName || "",
        leaderRole: populationRecord.leaderRole || "",
        leaderImageUrl,
        hasPopulation,
        x,
        y,
      };
    })
    .filter((d) => d.name);

  const labelData = highlightedCountryData
    .filter((d) => Number.isFinite(d.x) && Number.isFinite(d.y))
    .map((d) => ({
      ...d,
      labelX: d.x + (d.leaderImageUrl ? config.leaderBadgeRadius + config.leaderBadgeGap : 0),
    }));

  labelsLayer
    .selectAll("text")
    .data(labelData, (d) => d.id)
    .join("text")
    .attr("x", (d) => d.labelX)
    .attr("y", (d) => d.y)
    .attr("fill", config.labelColor)
    .attr("font-size", config.labelFontSize)
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "central")
    .style("pointer-events", "none")
    .text((d) => getCountryDisplayLabel(d));

  const circleData = highlightedCountryData.filter((d) => d.hasPopulation && Number.isFinite(d.x) && Number.isFinite(d.y));
  if (circleData.length > 0) {
    const logPopulationValues = circleData.map((d) => Math.log10(d.population));
    const minLog = Math.min(...logPopulationValues);
    const maxLog = Math.max(...logPopulationValues);
    const radiusFor =
      minLog === maxLog
        ? () => (config.circleMinRadius + config.circleMaxRadius) / 2
        : d3.scaleLinear().domain([minLog, maxLog]).range([config.circleMinRadius, config.circleMaxRadius]);

    circlesLayer
      .selectAll("circle")
      .data(circleData, (d) => d.id)
      .join("circle")
      .attr("cx", (d) => d.x)
      .attr("cy", (d) => d.y)
      .attr("r", (d) => radiusFor(Math.log10(d.population)))
      .attr("fill", (d) => d.color)
      .attr("fill-opacity", config.circleOpacity)
      .attr("stroke", config.circleStrokeColor)
      .attr("stroke-width", config.circleStrokeWidth)
      .style("pointer-events", "none");
  } else {
    circlesLayer.selectAll("circle").remove();
  }

  const badgeData = highlightedCountryData.filter((d) => d.leaderImageUrl && Number.isFinite(d.x) && Number.isFinite(d.y));
  const badgeImageWidth = (config.leaderBadgeImageBaseWidth || 192) * zoomLevel;

  const clipPaths = defsLayer
    .selectAll("clipPath[data-layer='leader-badge-clip']")
    .data(badgeData, (d) => d.id)
    .join("clipPath")
    .attr("data-layer", "leader-badge-clip")
    .attr("id", (d) => clipPathIdForCountry(d.id));

  clipPaths
    .selectAll("circle")
    .data((d) => [d])
    .join("circle")
    .attr("cx", (d) => getLeaderBadgeX(d, config))
    .attr("cy", (d) => d.y)
    .attr("r", config.leaderBadgeRadius);

  const badgeGroups = leaderBadgesLayer
    .selectAll("g[data-layer='leader-badge']")
    .data(badgeData, (d) => d.id)
    .join("g")
    .attr("data-layer", "leader-badge");

  badgeGroups
    .selectAll("image")
    .data((d) => [d])
    .join("image")
    .attr("x", (d) => getLeaderBadgeX(d, config) - config.leaderBadgeRadius)
    .attr("y", (d) => d.y - config.leaderBadgeRadius)
    .attr("width", config.leaderBadgeRadius * 2)
    .attr("height", config.leaderBadgeRadius * 2)
    .attr("preserveAspectRatio", "xMidYMid slice")
    .attr("href", (d) => withRequestedImageWidth(d.leaderImageUrl, badgeImageWidth))
    .attr("xlink:href", (d) => withRequestedImageWidth(d.leaderImageUrl, badgeImageWidth))
    .attr("clip-path", (d) => `url(#${clipPathIdForCountry(d.id)})`)
    .style("pointer-events", "none");

  badgeGroups
    .selectAll("circle")
    .data((d) => [d])
    .join("circle")
    .attr("cx", (d) => getLeaderBadgeX(d, config))
    .attr("cy", (d) => d.y)
    .attr("r", config.leaderBadgeRadius)
    .attr("fill", "none")
    .attr("stroke", config.leaderBadgeStrokeColor)
    .attr("stroke-width", config.leaderBadgeStrokeWidth)
    .style("pointer-events", "none");

  const sortedCountryRows = highlightedCountryData.sort((a, b) => a.name.localeCompare(b.name));
  updateSidePanel(sortedCountryRows, config);
}
