// Links this game to the arcade menu (the navarra-arcade launcher). The menu
// opens a game as  ?menu=<menu url>&lang=<es|eu|en>. Exiting, or leaving the
// game idle, then goes back there. Opened on its own, the game ignores this.

const params = new URLSearchParams(location.search);

export const menuUrl = params.get('menu');
export const langParam = ['es', 'eu', 'en'].includes(params.get('lang')) ? params.get('lang') : null;

export function backToMenu() {
  if (menuUrl) location.href = menuUrl;
}
