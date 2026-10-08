import React, { useEffect, useState } from 'react';

// Evento con cui l'interruttore nella barra in alto e la sezione nelle Impostazioni
// si avvisano a vicenda: lo stato vero sta nel processo principale.
export const MOBILE_CHANGED = 'timebox:mobile-changed';

// Interruttore della pagina per l'iPhone, sempre visibile nella barra in alto.
// La pagina è raggiungibile da qualunque rete a cui il Mac è collegato finché è
// attiva: per questo lo stato deve vedersi a colpo d'occhio, da ogni schermata.
// Acceso è pieno, spento è a contorno: si distingue per forma, non per colore.
// Lo stato sta scritto nell'etichetta: nella barra in alto, che su macOS è anche la
// barra del titolo, il `title` nativo non compare al passaggio del mouse.
export default function MobileSwitch() {
  const [status, setStatus] = useState(null);

  const load = () => window.api.getMobileStatus?.().then(setStatus);
  useEffect(() => {
    load();
    window.addEventListener(MOBILE_CHANGED, load);
    return () => window.removeEventListener(MOBILE_CHANGED, load);
  }, []);

  if (!status?.supported) return null;

  const on = status.enabled;
  const open = status.listening.length > 0;
  const title = !on
    ? 'Pagina per l\'iPhone spenta. Clic per accenderla.'
    : open
      ? `Pagina per l'iPhone accesa su ${status.listening.join(', ')}: raggiungibile da questa rete. Clic per spegnerla.`
      : 'Pagina per l\'iPhone accesa, ma il Mac non è su una rete locale. Clic per spegnerla.';

  async function toggle() {
    await window.api.setMobileEnabled(!on);
    await load();
    window.dispatchEvent(new Event(MOBILE_CHANGED));
  }

  return (
    <button type="button" role="switch" aria-checked={on} onClick={toggle} title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '3px 9px', borderRadius: 999, cursor: 'pointer',
        fontFamily: "'Open Sans', sans-serif", fontSize: 11, fontWeight: 700,
        border: `1px solid ${on ? 'var(--tb-tab-active-bg)' : 'var(--tb-border)'}`,
        background: on ? 'var(--tb-tab-active-bg)' : 'transparent',
        color: on ? 'var(--tb-tab-active-text)' : 'var(--tb-text-muted)',
        WebkitAppRegion: 'no-drag',
      }}>
      <span aria-hidden="true" style={{
        width: 7, height: 7, borderRadius: '50%',
        background: on && open ? 'currentColor' : 'transparent', border: '1.5px solid currentColor',
      }} />
      iPhone {!on ? 'spento' : open ? 'acceso' : 'acceso · senza rete'}
    </button>
  );
}
