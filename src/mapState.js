const defaultState = {
  selectedCountryId: null,
  hoverCountryId: null,
  activeInitial: null,
  initialColors: {},
  colorCursor: 0,
  zoom: 1,
  pan: { x: 0, y: 0 },
};

export function createMapState(initialState = {}) {
  return {
    ...defaultState,
    ...initialState,
    pan: {
      ...defaultState.pan,
      ...(initialState.pan || {}),
    },
  };
}
