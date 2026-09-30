// Links Espadas de Hispania to the arcade menu (the navarra-arcade launcher).
// The menu opens this game as ?menu=<menu url>&lang=<es|eu|en>. Opened on its
// own, the game ignores all of this.
//
// Esc already means "cancel" inside the game, so leaving takes a deliberate
// act: hold Esc (or 1, the cabinet's START) for two seconds, or click the
// "back to the menu" button in the corner. A game left alone for a few
// minutes also goes back to the menu, ready for the next player.

import { setLang, getLang } from './i18n.js';

const params = new URLSearchParams(location.search);
export const menuUrl = params.get('menu');
const HOLD = 2000;
const IDLE = 4 * 60 * 1000; // turn-based: give people time to think

const TEXT = {
  es: { back: '← Menú de juegos', ask: '¿Salir al menú de juegos?', yes: 'Salir', no: 'Seguir jugando' },
  en: { back: '← Game menu', ask: 'Exit to the game menu?', yes: 'Exit', no: 'Keep playing' },
};
const tr = () => TEXT[getLang()] ?? TEXT.es;

export function installArcadeLink() {
  if (!menuUrl) return;
  // The menu's language, as far as this game can follow it (no Basque yet).
  const lang = params.get('lang');
  setLang(lang === 'en' ? 'en' : 'es');

  const back = () => { location.href = menuUrl; };

  const button = document.createElement('button');
  button.className = 'arcade-exit';
  button.addEventListener('click', ask);
  document.body.append(button);
  const label = () => { button.textContent = tr().back; };
  label();
  new MutationObserver(label).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

  let dialog = null;
  function ask() {
    if (dialog) return;
    dialog = document.createElement('div');
    dialog.className = 'arcade-dialog';
    const yes = Object.assign(document.createElement('button'), { textContent: tr().yes, onclick: back });
    const no = Object.assign(document.createElement('button'), { textContent: tr().no, onclick: close });
    const card = document.createElement('div');
    card.append(Object.assign(document.createElement('p'), { textContent: tr().ask }), yes, no);
    dialog.append(card);
    document.body.append(dialog);
    yes.focus();
  }
  function close() { dialog?.remove(); dialog = null; }

  // Hold Esc or 1 for two seconds.
  let holdTimer = null;
  addEventListener('keydown', (e) => {
    if (dialog) {
      if (e.key === 'Enter') back();
      else if (e.key === 'Escape') close();
      e.stopPropagation();
      return;
    }
    if ((e.key === 'Escape' || e.code === 'Digit1') && !e.repeat) holdTimer = setTimeout(ask, HOLD);
  }, true);
  addEventListener('keyup', (e) => {
    if (e.key === 'Escape' || e.code === 'Digit1') clearTimeout(holdTimer);
  });

  // Idle: back to the menu.
  let idleTimer = setTimeout(back, IDLE);
  for (const ev of ['keydown', 'pointerdown', 'pointermove', 'wheel']) {
    addEventListener(ev, () => { clearTimeout(idleTimer); idleTimer = setTimeout(back, IDLE); }, { passive: true, capture: true });
  }
}
