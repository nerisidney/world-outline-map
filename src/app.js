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

function getCountryInitial(countryName) {
  return String(countryName || "")
    .trim()
    .toLowerCase()
    .charAt(0);
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

function withRequestedImageWidth(imageUrl, width) {
  const normalizedUrl = String(imageUrl || "").trim();
  if (!normalizedUrl) {
    return "";
  }

  try {
    const url = new URL(normalizedUrl, window.location.href);
    url.searchParams.set("width", String(Math.max(64, Math.round(width))));
    return url.toString();
  } catch {
    return normalizedUrl;
  }
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

function setupCountryPopup({ svgEl, populationByCountryId, locale, allowedImageHosts, popupImageWidth, isGameActive = () => false }) {
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
    const englishName = countryName || record.name || "Unknown country";
    const nativeName = String(record.nativeName || "").trim();
    const displayName = composeDisplayName(englishName, nativeName);
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
      leaderImg.src = withRequestedImageWidth(imageUrl, popupImageWidth || 420);
      leaderImg.alt = record.leaderName ? `${record.leaderName} portrait` : `${displayName} leader portrait`;
      leaderImg.referrerPolicy = "no-referrer";
      leaderImg.hidden = false;
    } else {
      leaderImg.hidden = true;
      leaderImg.removeAttribute("src");
      leaderImg.alt = "";
    }

    const cityPopup = document.querySelector("#city-popup");
    if (cityPopup) {
      cityPopup.hidden = true;
      cityPopup.setAttribute("aria-hidden", "true");
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
    if (isGameActive()) {
      return;
    }
    const countryDetails = getPopupCountryFromTarget(event.target);
    if (!countryDetails?.countryId) {
      return;
    }
    openPopup(countryDetails);
  });

  document.addEventListener("keydown", (event) => {
    if (isGameActive()) {
      return;
    }
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

function setupCityPopup({ svgEl, populationByCountryId, locale, allowedImageHosts, popupImageWidth, isGameActive = () => false }) {
  const popup = document.querySelector("#city-popup");
  const closeBtn = document.querySelector("#city-popup-close");
  const nameEl = document.querySelector("#city-popup-name");
  const popEl = document.querySelector("#city-popup-population");
  const summaryEl = document.querySelector("#city-popup-summary");
  const cityImg = document.querySelector("#city-popup-image");

  if (!popup || !closeBtn || !nameEl || !popEl || !summaryEl || !cityImg) {
    return;
  }

  const numberFormatter = new Intl.NumberFormat(locale || "en-US");
  const citySummaryCache = new Map();
  let openCityToken = "";

  const trimSummary = (text, maxChars = 340) => {
    const normalized = String(text || "").replace(/\s+/g, " ").trim();
    if (!normalized) {
      return "";
    }
    if (normalized.length <= maxChars) {
      return normalized;
    }
    return `${normalized.slice(0, maxChars - 1).trim()}…`;
  };

  const fetchCitySummary = async (wikiTitle) => {
    const normalizedTitle = String(wikiTitle || "").trim();
    if (!normalizedTitle) {
      return { summary: "", imageUrl: "" };
    }
    if (citySummaryCache.has(normalizedTitle)) {
      return citySummaryCache.get(normalizedTitle);
    }

    const safeTitle = encodeURIComponent(normalizedTitle.replace(/\s+/g, "_"));
    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${safeTitle}`;
    try {
      const response = await fetch(summaryUrl, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`Wikipedia summary fetch failed: ${response.status}`);
      }
      const payload = await response.json();
      const summaryText = trimSummary(payload?.extract || "");
      const imageUrl = sanitizeLeaderImageUrl(payload?.thumbnail?.source || "", allowedImageHosts);
      const resolved = { summary: summaryText, imageUrl };
      citySummaryCache.set(normalizedTitle, resolved);
      return resolved;
    } catch {
      const fallback = { summary: "", imageUrl: "" };
      citySummaryCache.set(normalizedTitle, fallback);
      return fallback;
    }
  };

  const closePopup = () => {
    popup.hidden = true;
    popup.setAttribute("aria-hidden", "true");
  };

  const openPopup = async ({ countryId, cityName, countryName }) => {
    const record = populationByCountryId[countryId] || {};
    const displayCity = String(cityName || record.capital || "").trim() || "Unknown city";
    const displayCountry = String(countryName || record.name || "this country").trim();
    openCityToken = `${countryId}:${displayCity}:${Date.now()}`;
    const token = openCityToken;
    nameEl.textContent = displayCity;

    const cityPopulationValue = Number(record.capitalPopulation);
    if (Number.isFinite(cityPopulationValue) && cityPopulationValue > 0) {
      popEl.textContent = `City population: ${numberFormatter.format(cityPopulationValue)}`;
    } else {
      popEl.textContent = "City population: N/A";
    }

    const summaryFromData = trimSummary(String(record.capitalSummaryEn || "").trim());
    const summaryFallback = `${displayCity} is the capital city of ${displayCountry}.`;
    summaryEl.textContent = summaryFromData || "Loading summary from Wikipedia…";

    const imageUrl = sanitizeLeaderImageUrl(record.capitalImageUrl, allowedImageHosts);
    if (imageUrl) {
      cityImg.src = withRequestedImageWidth(imageUrl, popupImageWidth || 520);
      cityImg.alt = `${displayCity} city view`;
      cityImg.referrerPolicy = "no-referrer";
      cityImg.hidden = false;
    } else {
      cityImg.hidden = true;
      cityImg.removeAttribute("src");
      cityImg.alt = "";
    }

    const countryPopup = document.querySelector("#country-popup");
    if (countryPopup) {
      countryPopup.hidden = true;
      countryPopup.setAttribute("aria-hidden", "true");
    }

    popup.hidden = false;
    popup.setAttribute("aria-hidden", "false");

    if (summaryFromData) {
      return;
    }

    const wikiTitle = String(record.capitalWikiTitle || displayCity).trim();
    const wikiDetails = await fetchCitySummary(wikiTitle);
    if (openCityToken !== token) {
      return;
    }

    summaryEl.textContent = wikiDetails.summary || summaryFallback;
    if (!cityImg.hidden) {
      return;
    }
    if (!wikiDetails.imageUrl) {
      return;
    }
    cityImg.src = withRequestedImageWidth(wikiDetails.imageUrl, popupImageWidth || 520);
    cityImg.alt = `${displayCity} city view`;
    cityImg.referrerPolicy = "no-referrer";
    cityImg.hidden = false;
  };

  closeBtn.addEventListener("click", closePopup);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePopup();
    }
  });

  document.addEventListener("click", (event) => {
    if (isGameActive()) {
      return;
    }
    const cityNode = event.target?.closest?.("[data-capital-country-id]");
    if (!cityNode) {
      return;
    }

    const countryId = normalizeCountryId(cityNode.getAttribute("data-capital-country-id"));
    const cityName = String(cityNode.getAttribute("data-capital-name") || "").trim();
    const countryName = String(cityNode.getAttribute("data-capital-country-name") || "").trim();
    if (!countryId) {
      return;
    }

    void openPopup({ countryId, cityName, countryName });
  });
}

function setupGameMode({ svgEl, state, render, config, actions }) {
  const statusEls = Array.from(document.querySelectorAll("[data-role='game-status']"));
  const taskEls = Array.from(document.querySelectorAll("[data-role='game-task']"));
  const timeEls = Array.from(document.querySelectorAll("[data-role='game-time']"));
  const scoreEls = Array.from(document.querySelectorAll("[data-role='game-score']"));
  const bestScoreEls = Array.from(document.querySelectorAll("[data-role='game-best-score']"));
  const messageEls = Array.from(document.querySelectorAll("[data-role='game-message']"));
  const startBtns = Array.from(document.querySelectorAll("[data-action='game-start']"));
  const stopBtns = Array.from(document.querySelectorAll("[data-action='game-stop']"));
  const bestScoreStorageKey = "worldMapGameBestScore";

  const roundSeconds = Math.max(15, Number(config.gameRoundSeconds) || 120);
  const maxTargetCount = Math.max(1, Number(config.gameTargetCount) || 10);
  const correctScore = Math.max(1, Number(config.gameCorrectScore) || 10);
  const wrongPenalty = Math.max(0, Number(config.gameWrongPenalty) || 4);
  const streakBonus = Math.max(0, Number(config.gameStreakBonus) || 2);
  const winTimeBonusPerSecond = Math.max(0, Number(config.gameWinTimeBonusPerSecond) || 1);

  let timerId = null;
  try {
    const storedBest = Number(window.localStorage.getItem(bestScoreStorageKey) || 0);
    if (Number.isFinite(storedBest) && storedBest > 0) {
      state.gameBestScore = Math.max(Number(state.gameBestScore || 0), Math.round(storedBest));
    }
  } catch {
    // Ignore storage read failures.
  }

  const setText = (nodes, text) => {
    for (const node of nodes) {
      node.textContent = text;
    }
  };

  const toSecondsLabel = (seconds) => `${Math.max(0, Math.round(seconds))}s`;

  const getStatusLabel = () => {
    if (state.gameActive) {
      return "Running";
    }
    if (state.gameStatus === "won") {
      return "Won";
    }
    if (state.gameStatus === "lost") {
      return "Time Up";
    }
    return "Idle";
  };

  const syncUi = () => {
    const targetLetter = String(state.gameTargetLetter || "").toUpperCase();
    const taskText = state.gameActive
      ? `Find ${state.gameRequiredCount} countries that start with "${targetLetter}".`
      : "Press Start to begin a timed round.";
    setText(taskEls, taskText);
    setText(statusEls, getStatusLabel());
    const timeValue = Number.isFinite(Number(state.gameTimeRemaining)) ? Number(state.gameTimeRemaining) : roundSeconds;
    setText(timeEls, toSecondsLabel(timeValue));
    setText(scoreEls, String(Math.max(0, Math.round(state.gameScore || 0))));
    setText(bestScoreEls, String(Math.max(0, Math.round(state.gameBestScore || 0))));
    setText(messageEls, String(state.gameMessage || "Find countries by clicking on the map."));

    for (const btn of startBtns) {
      btn.disabled = state.gameActive;
      btn.textContent = state.gameActive ? "Running..." : "Start";
    }
    const canReset = state.gameActive || (state.gameStatus && state.gameStatus !== "idle");
    for (const btn of stopBtns) {
      btn.disabled = !canReset;
    }
  };

  const stopTimer = () => {
    if (timerId !== null) {
      window.clearInterval(timerId);
      timerId = null;
    }
  };

  const updateBestScore = () => {
    const currentScore = Math.max(0, Math.round(Number(state.gameScore || 0)));
    const previousBest = Math.max(0, Math.round(Number(state.gameBestScore || 0)));
    if (currentScore <= previousBest) {
      return;
    }
    state.gameBestScore = currentScore;
    try {
      window.localStorage.setItem(bestScoreStorageKey, String(currentScore));
    } catch {
      // Ignore storage write failures.
    }
  };

  const resetRoundState = (message = "") => {
    state.gameActive = false;
    state.gameStatus = "idle";
    state.gameTargetLetter = null;
    state.gameRequiredCount = 0;
    state.gameTargetCountryIds = {};
    state.gameFoundCountryIds = {};
    state.gameScore = 0;
    state.gameStreak = 0;
    state.gameBestStreak = 0;
    state.gameFoundCount = 0;
    state.gameTimeRemaining = roundSeconds;
    state.gameMessage = message;
  };

  const collectCountryCatalog = () => {
    const byId = new Map();
    const countryPaths = svgEl.querySelectorAll("path[data-country-id]");
    for (const path of countryPaths) {
      const id = normalizeCountryId(path.getAttribute("data-country-id"));
      const name = String(path.getAttribute("data-country-name") || "").trim();
      const initial = getCountryInitial(name);
      if (!id || !name || !/^[a-z]$/.test(initial)) {
        continue;
      }
      byId.set(id, { id, name, initial });
    }
    return Array.from(byId.values());
  };

  const pickTargetRound = () => {
    const countryCatalog = collectCountryCatalog();
    const letterBuckets = new Map();

    for (const country of countryCatalog) {
      if (!letterBuckets.has(country.initial)) {
        letterBuckets.set(country.initial, []);
      }
      letterBuckets.get(country.initial).push(country);
    }

    const entries = Array.from(letterBuckets.entries())
      .filter((entry) => entry[1].length > 0)
      .sort((a, b) => b[1].length - a[1].length);
    if (entries.length === 0) {
      return null;
    }

    const pool = entries;
    const [targetLetter, countries] = pool[Math.floor(Math.random() * pool.length)];
    return {
      targetLetter,
      countries,
      requiredCount: Math.min(maxTargetCount, countries.length),
    };
  };

  const startRound = () => {
    stopTimer();
    actions.clearHighlights();

    const round = pickTargetRound();
    if (!round) {
      resetRoundState("No countries are available for a game round.");
      render();
      return;
    }

    state.gameActive = true;
    state.gameStatus = "running";
    state.gameTargetLetter = round.targetLetter;
    state.gameRequiredCount = round.requiredCount;
    state.gameTargetCountryIds = Object.fromEntries(round.countries.map((country) => [country.id, true]));
    state.gameFoundCountryIds = {};
    state.gameScore = 0;
    state.gameStreak = 0;
    state.gameBestStreak = 0;
    state.gameFoundCount = 0;
    state.gameTimeRemaining = roundSeconds;
    state.gameMessage = `Click countries that start with "${round.targetLetter.toUpperCase()}".`;
    render();

    timerId = window.setInterval(() => {
      if (!state.gameActive) {
        stopTimer();
        return;
      }
      const nextTime = Math.max(0, Number(state.gameTimeRemaining || 0) - 1);
      state.gameTimeRemaining = nextTime;
      if (nextTime <= 0) {
        state.gameActive = false;
        state.gameStatus = "lost";
        state.gameStreak = 0;
        state.gameMessage = `Time up. You found ${state.gameFoundCount}/${state.gameRequiredCount}.`;
        stopTimer();
        render();
        return;
      }
      syncUi();
    }, 1000);
  };

  const resetRound = () => {
    const hadRoundState =
      state.gameActive ||
      (state.gameStatus && state.gameStatus !== "idle") ||
      Object.keys(state.gameFoundCountryIds || {}).length > 0 ||
      Number(state.gameScore || 0) > 0;
    stopTimer();
    resetRoundState("Round reset.");
    render();
    return hadRoundState;
  };

  const processCountryGuess = ({ countryId, countryName }) => {
    if (!state.gameActive) {
      return;
    }

    if (!countryId || !state.gameTargetCountryIds[countryId]) {
      state.gameStreak = 0;
      state.gameScore = Math.max(0, Number(state.gameScore || 0) - wrongPenalty);
      state.gameMessage = `${countryName || "That country"} does not match "${String(state.gameTargetLetter || "").toUpperCase()}". Streak reset.`;
      render();
      return;
    }

    if (state.gameFoundCountryIds[countryId]) {
      state.gameMessage = `${countryName || "This country"} is already counted.`;
      syncUi();
      return;
    }

    state.gameFoundCountryIds[countryId] = true;
    state.gameFoundCount = Number(state.gameFoundCount || 0) + 1;
    state.gameStreak = Number(state.gameStreak || 0) + 1;
    state.gameBestStreak = Math.max(Number(state.gameBestStreak || 0), state.gameStreak);

    const points = correctScore + Math.max(0, state.gameStreak - 1) * streakBonus;
    state.gameScore = Number(state.gameScore || 0) + points;
    updateBestScore();
    state.gameMessage = `Correct: ${countryName || "Country"} (+${points}). Streak: ${state.gameStreak}.`;

    if (state.gameFoundCount >= state.gameRequiredCount) {
      const timeBonus = Math.round(Math.max(0, Number(state.gameTimeRemaining || 0)) * winTimeBonusPerSecond);
      state.gameScore += timeBonus;
      updateBestScore();
      state.gameActive = false;
      state.gameStatus = "won";
      state.gameMessage = `You won! ${state.gameFoundCount}/${state.gameRequiredCount} found. Time bonus: +${timeBonus}.`;
      stopTimer();
    }

    render();
  };

  for (const btn of startBtns) {
    btn.addEventListener("click", startRound);
  }
  for (const btn of stopBtns) {
    btn.addEventListener("click", resetRound);
  }

  document.addEventListener("click", (event) => {
    if (!state.gameActive) {
      return;
    }
    const suppressedUntil = Number(svgEl.dataset.suppressCountryClickUntil || "0");
    if (Date.now() < suppressedUntil) {
      return;
    }

    const mapPath = event.target?.closest?.("path[data-country-id]");
    if (mapPath && svgEl.contains(mapPath)) {
      const countryId = normalizeCountryId(mapPath.getAttribute("data-country-id"));
      const countryName = String(mapPath.getAttribute("data-country-name") || "").trim();
      processCountryGuess({ countryId, countryName });
      return;
    }

    const rowItem = event.target?.closest?.(".country-list-item[data-country-id]");
    if (rowItem) {
      const countryId = normalizeCountryId(rowItem.getAttribute("data-country-id"));
      const countryName = String(rowItem.getAttribute("data-country-name") || "").trim();
      processCountryGuess({ countryId, countryName });
    }
  });

  if (!Number.isFinite(Number(state.gameTimeRemaining)) || Number(state.gameTimeRemaining) <= 0) {
    state.gameTimeRemaining = roundSeconds;
  }
  syncUi();
  return { syncUi, resetRound };
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

function bindKeyboardEvents({ state, render, actions, onSpaceReset }) {
  void state;

  window.addEventListener("keydown", (event) => {
    const interactiveTarget = event.target?.closest?.("input, textarea, select, button, [contenteditable='true']");
    if (interactiveTarget) {
      return;
    }

    if (event.code === "Space") {
      event.preventDefault();
      const clearedHighlights = actions.clearHighlights();
      const clearedRound = typeof onSpaceReset === "function" ? onSpaceReset() : false;
      if (clearedHighlights || clearedRound) {
        render();
      }
      return;
    }

    const key = String(event.key || "").toLowerCase();
    if (state.gameActive) {
      return;
    }
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
    const gameActive = Boolean(state.gameActive);
    const buttons = lettersContainer.querySelectorAll(".mobile-letter-btn");
    for (const btn of buttons) {
      const letter = btn.dataset.letter || "";
      const isActive = Boolean(active[letter]);
      btn.classList.toggle("is-active", isActive);
      btn.style.setProperty("--chip-color", active[letter] || "#1f2a37");
      btn.setAttribute("aria-pressed", String(isActive));
      btn.disabled = gameActive;
    }

    const activeCount = Object.keys(active).length;
    clearBtn.disabled = gameActive || activeCount === 0;
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
    popupImageWidth: config.leaderPopupImageWidth,
    isGameActive: () => Boolean(state.gameActive),
  });
  setupCityPopup({
    svgEl: containerEl,
    populationByCountryId,
    locale: config.populationNumberLocale,
    allowedImageHosts: config.allowedLeaderImageHosts,
    popupImageWidth: config.cityPopupImageWidth,
    isGameActive: () => Boolean(state.gameActive),
  });

  let syncMobileControls = () => {};
  let syncMapNavigation = () => {};
  let syncGameMode = () => {};
  let resetGameRound = () => false;
  let renderFrameId = null;
  const renderNow = () => {
    renderWorldOutline({
      svgEl: containerEl,
      topoJson,
      populationByCountryId,
      state,
      config,
    });
    syncGameMode();
    syncMobileControls();
    syncMapNavigation();
  };
  const render = () => {
    if (renderFrameId !== null) {
      return;
    }
    renderFrameId = window.requestAnimationFrame(() => {
      renderFrameId = null;
      renderNow();
    });
  };

  const gameMode = setupGameMode({ svgEl: containerEl, state, render, config, actions });
  syncGameMode = gameMode.syncUi;
  resetGameRound = gameMode.resetRound;
  syncMobileControls = setupMobileControls({ state, render, actions });
  syncMapNavigation = setupMapNavigation({ svgEl: containerEl, state, config, render });
  bindKeyboardEvents({ state, render, actions, onSpaceReset: resetGameRound });

  renderNow();
  window.addEventListener("resize", render);

  return { state, render };
}

const svgEl = document.querySelector("#world-map");

if (svgEl) {
  initApp(svgEl).catch((error) => {
    console.error(error);
  });
}
