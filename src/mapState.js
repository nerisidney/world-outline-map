const defaultState = {
  selectedCountryId: null,
  hoverCountryId: null,
  activeInitial: null,
  initialColors: {},
  colorCursor: 0,
  gameActive: false,
  gameStatus: "idle",
  gameTargetLetter: null,
  gameRequiredCount: 0,
  gameFoundCountryIds: {},
  gameTargetCountryIds: {},
  gameScore: 0,
  gameStreak: 0,
  gameBestStreak: 0,
  gameBestScore: 0,
  gameFoundCount: 0,
  gameTimeRemaining: 0,
  gameMessage: "",
  zoom: 1,
  pan: { x: 0, y: 0 },
};

export function createMapState(initialState = {}) {
  return {
    ...defaultState,
    ...initialState,
    gameFoundCountryIds: {
      ...defaultState.gameFoundCountryIds,
      ...(initialState.gameFoundCountryIds || {}),
    },
    gameTargetCountryIds: {
      ...defaultState.gameTargetCountryIds,
      ...(initialState.gameTargetCountryIds || {}),
    },
    pan: {
      ...defaultState.pan,
      ...(initialState.pan || {}),
    },
  };
}
