// Navigation state machine for /rem. Pure — no DOM, no network.
export const VIEWS = ['intro', 'selector', 'province'];

export function initialState() {
  return { view: 'intro', slug: null };
}

/**
 * Reducer for R.E.M. explorer navigation.
 * @param {{view:string, slug:string|null}} state
 * @param {{type:string, slug?:string}} action
 */
export function remReducer(state, action) {
  switch (action.type) {
    case 'ENTER':
      return state.view === 'intro' ? { view: 'selector', slug: null } : state;
    case 'SELECT_PROVINCE':
      if (!action.slug || typeof action.slug !== 'string') return state;
      return { view: 'province', slug: action.slug };
    case 'BACK':
      if (state.view === 'province') return { view: 'selector', slug: null };
      if (state.view === 'selector') return { view: 'intro', slug: null };
      return state;
    case 'RESET':
      return initialState();
    default:
      return state;
  }
}
