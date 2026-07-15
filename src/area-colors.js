/*
 * Area color theming (REDLINE §0 discrepancy fix).
 *
 * Il mock hardcoda hex-area ritoccati (es. GreenTech verde nel mock vs ciano nel DB).
 * Stabilizziamo: il colore Area IDENTITA' è quello del DB (clients[].color), invariato
 * tra i temi. I *tint* del blocco (bg/border) invece si adattano al tema via
 * `color-mix` con i token del pannello, così:
 *   - in dark il tint è delicato su pannello scuro (come il mock);
 *   - in light è leggibile su pannello chiaro senza hex hardcoded;
 *   - l'identita' area resta una sola (clients[].color) in entrambi i temi.
 *
 * Electron 31 = Chromium >= 126: color-mix e' supportato.
 */

export function areaMix(color, pct) {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

export function areaTints(color) {
  return {
    bg:     areaMix(color, 7),
    border: areaMix(color, 22),
    bar:    areaMix(color, 30),
    soft:   areaMix(color, 12),
  };
}