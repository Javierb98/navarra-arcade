// Placeholder until Olite is built: a "coming soon" card. Any button (or
// Esc) goes back to the arcade menu when the menu opened this page.

const params = new URLSearchParams(location.search);
const menuUrl = params.get('menu');
const lang = ['es', 'eu', 'en'].includes(params.get('lang')) ? params.get('lang') : 'es';
const TEXT = {
  es: { soon: 'Próximamente', about: 'Construye la ciudad y el palacio real de Olite con Carlos III el Noble.', back: 'Pulsa cualquier botón para volver al menú' },
  eu: { soon: 'Laster', about: 'Eraiki Erriberriko hiria eta errege-jauregia Karlos III.a Nobletarekin.', back: 'Sakatu edozein botoi menura itzultzeko' },
  en: { soon: 'Coming soon', about: 'Build the town and royal palace of Olite with Charles III the Noble.', back: 'Press any button to go back to the menu' },
}[lang];

document.documentElement.lang = lang;
document.getElementById('app').innerHTML = `
  <div class="soon">
    <h1>Olite</h1>
    <p class="badge">${TEXT.soon}</p>
    <p>${TEXT.about}</p>
    ${menuUrl ? `<p class="hint">${TEXT.back}</p>` : ''}
  </div>`;

if (menuUrl) {
  const back = () => { location.href = menuUrl; };
  addEventListener('keydown', back);
  setTimeout(back, 20000); // don't leave a child staring at this page
  const poll = () => {
    for (const pad of navigator.getGamepads?.() ?? []) if (pad?.buttons.some((b) => b.pressed)) return back();
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
}
