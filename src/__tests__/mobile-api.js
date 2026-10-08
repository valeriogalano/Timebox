// Stato finto del processo principale per i test della pagina mobile: le azioni lo
// cambiano come farebbe lib/mobile-access.js. Usato dai test dell'interruttore nella
// barra in alto e della sezione nelle Impostazioni.
export function mockMobileApi(initial) {
  const state = { supported: true, enabled: false, hasToken: false, online: true, port: 37374, ...initial };
  const calls = [];
  window.api = {
    calls,
    getMobileStatus: async () => ({
      supported: state.supported, enabled: state.enabled, hasToken: state.hasToken, port: state.port,
      listening: state.enabled && state.online ? ['192.168.1.20'] : [],
    }),
    setMobileEnabled: async v => {
      calls.push(['enable', v]);
      if (state.failEnable) return { error: 'Archiviazione sicura non disponibile' };
      state.enabled = v; state.hasToken = state.hasToken || v;
      return { ok: true };
    },
    regenerateMobileToken: async () => { calls.push(['token']); return state.failToken ? { error: 'Archiviazione sicura non disponibile' } : { ok: true }; },
    getMobileLink: async () => (state.enabled && state.online ? 'http://mac.local:37374/#abc' : null),
  };
  return state;
}
