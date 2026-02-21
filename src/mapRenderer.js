import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import { feature } from "https://cdn.jsdelivr.net/npm/topojson-client@3/+esm";

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
  const countriesLayer = mapLayer
    .selectAll("g[data-layer='countries']")
    .data([null])
    .join("g")
    .attr("id", "countries")
    .attr("data-layer", "countries");

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

  return { mapLayer, countriesLayer, circlesLayer, leaderBadgesLayer, labelsLayer, defsLayer };
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

function getCountryDisplayLabel(row) {
  return row.flagEmoji ? `${row.flagEmoji} ${row.name}` : row.name;
}

function getSidebarCountryText(row, numberFormatter) {
  const countryWithFlag = row.flagEmoji ? `${row.name} ${row.flagEmoji}` : row.name;
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

function updateSidePanel(countryRows, locale) {
  const listElements = getCountryListElements();
  if (listElements.length === 0) {
    return;
  }
  if (countryRows.length === 0) {
    resetSidePanel();
    return;
  }

  const numberFormatter = new Intl.NumberFormat(locale || "en-US");

  for (const listEl of listElements) {
    listEl.innerHTML = "";
    for (const row of countryRows) {
      const listItem = document.createElement("li");
      listItem.className = "country-list-item";

      if (row.leaderImageUrl) {
        const thumb = document.createElement("img");
        thumb.className = "country-leader-thumb";
        thumb.src = row.leaderImageUrl;
        thumb.alt = row.leaderName ? `${row.leaderName} portrait` : `${row.name} leader portrait`;
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

export function renderWorldOutline({ svgEl, topoJson, populationByCountryId = {}, state, config }) {
  if (!svgEl) {
    throw new Error("renderWorldOutline requires a valid svgEl.");
  }

  const width = Math.max(320, svgEl.clientWidth || 0);
  const height = Math.max(200, svgEl.clientHeight || 0);
  const svg = d3.select(svgEl);

  svg.attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "xMidYMid meet").style("background", config.backgroundColor);

  const topologyObject = resolveCountryObject(topoJson);
  const countriesFeature = feature(topoJson, topologyObject);
  const countries = countriesFeature.type === "FeatureCollection" ? countriesFeature.features : [countriesFeature];

  const projection = createProjection(config.projection);
  projection.fitExtent(
    [
      [config.fitPadding, config.fitPadding],
      [width - config.fitPadding, height - config.fitPadding],
    ],
    countriesFeature,
  );

  const path = d3.geoPath(projection);
  const { mapLayer, countriesLayer, circlesLayer, leaderBadgesLayer, labelsLayer, defsLayer } = ensureLayers(svg);

  const tx = state.pan?.x ?? 0;
  const ty = state.pan?.y ?? 0;
  const scale = state.zoom ?? 1;
  const initialColors = state.initialColors || {};
  const hasActiveHighlights = Object.keys(initialColors).length > 0;
  mapLayer.attr("transform", `translate(${tx}, ${ty}) scale(${scale})`);

  const countriesSelection = countriesLayer
    .selectAll("path")
    .data(countries, (d, i) => d?.id ?? d?.properties?.name ?? `country-${i}`)
    .join("path")
    .attr("d", path)
    .attr("fill", (d) => {
      const countryName = d?.properties?.name || "";
      const color = initialColors[getCountryInitial(countryName)];
      return color || "none";
    })
    .attr("stroke", config.strokeColor)
    .attr("stroke-width", config.strokeWidth)
    .attr("data-country-id", (d, i) => String(d?.id ?? `country-${i}`))
    .attr("data-country-name", (d) => d?.properties?.name || "");

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
      const [x, y] = path.centroid(d);
      const countryId = normalizeCountryId(d?.id ?? `country-${i}`);
      const populationRecord = populationByCountryId[countryId] || {};
      const populationValue = Number(populationRecord.population);
      const hasPopulation = Number.isFinite(populationValue) && populationValue > 0;
      const leaderImageUrl = String(populationRecord.leaderImageUrl || "").trim();

      return {
        id: countryId || `country-${i}`,
        name: d?.properties?.name || "",
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
    .attr("href", (d) => d.leaderImageUrl)
    .attr("xlink:href", (d) => d.leaderImageUrl)
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
  updateSidePanel(sortedCountryRows, config.populationNumberLocale);
}
