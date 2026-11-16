// Links this game to the arcade menu (the navarra-arcade launcher). The menu
// opens a game as  ?menu=<menu url>&lang=<es|eu|en>. Exiting, or leaving the
// game idle, then goes back there. Opened on its own, the game ignores this.

const params = new URLSearchParams(location.search);

export const menuUrl = params.get('menu');
export const langParam = ['es', 'eu', 'en'].includes(params.get('lang')) ? params.get('lang') : null;

export function backToMenu() {
  if (menuUrl) location.href = menuUrl;
}

// ---- paid arcade --------------------------------------------------------------
// start.py --paid stamps <meta name="arcade-mode" content="paid"> into every
// page. A coin buys one game: once it has been played, anything that would
// start another (the game's own setup screen, a rematch) goes back to the
// arcade menu instead, which asks for the next coin. A coin dropped during a
// game (the coin mechanism sends 5) still counts: it goes to the menu's server.
export const paid = !!menuUrl && document.querySelector('meta[name="arcade-mode"]')?.content === 'paid';
const COIN_KEYS = ['Digit5'];
if (paid) {
  addEventListener('keydown', (e) => {
    if (COIN_KEYS.includes(e.code) && !e.repeat) fetch(new URL('/credits/coin', menuUrl), { method: 'POST', mode: 'no-cors' }).catch(() => {});
  });
}
// Screens that set a game up rather than play it; after a game, any of
// them means the next game is starting. A story plays before and after the
// game alike, so it is never either.
const SETUP = ['attract', 'menu', 'howto', 'select', 'stage'];
let played = false;
// Call on every screen change. True means this game's coin is used up and
// the page is going back to the menu, so don't show the screen.
export function creditSpent(screen) {
  if (!paid || screen === 'story') return false;
  if (!SETUP.includes(screen)) { played = true; return false; }
  if (!played) return false;
  backToMenu();
  return true;
}
