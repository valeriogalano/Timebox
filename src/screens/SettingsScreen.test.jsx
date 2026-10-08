import { describe, test, expect, beforeEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { MobileSection } from './SettingsScreen.jsx';

// Stato finto del processo principale: le azioni lo cambiano come farebbe lui.
function mockApi(initial) {
  const state = { supported: true, enabled: false, hasToken: false, trustedMac: null, currentMac: 'aa:bb:cc:dd:ee:ff', onHomeNetwork: false, listening: [], port: 37374, ...initial };
  const sync = () => {
    state.onHomeNetwork = !!state.trustedMac && state.trustedMac === state.currentMac;
    state.listening = state.enabled && state.onHomeNetwork ? ['192.168.1.20'] : [];
  };
  sync();
  const calls = [];
  window.api = {
    calls,
    getMobileStatus: async () => ({ ...state }),
    setMobileEnabled: async v => { calls.push(['enable', v]); state.enabled = v; state.hasToken = state.hasToken || v; sync(); return { ok: true }; },
    trustMobileNetwork: async () => { calls.push(['trust']); state.trustedMac = state.currentMac; sync(); return { ok: true }; },
    forgetMobileNetwork: async () => { calls.push(['forget']); state.trustedMac = null; sync(); return { ok: true }; },
    regenerateMobileToken: async () => { calls.push(['token']); return state.failToken ? { error: 'Archiviazione sicura non disponibile' } : { ok: true }; },
    getMobileLink: async () => (state.listening.length ? 'http://mac.local:37374/#abc' : null),
  };
}

describe('Impostazioni / iPhone', () => {
  beforeEach(() => mockApi());

  test('dove non è supportata la sezione non compare', async () => {
    mockApi({ supported: false });
    const { container } = render(<MobileSection />);
    await act(async () => {});   // lascia arrivare lo stato
    expect(container).toBeEmptyDOMElement();
  });

  test('spenta e senza rete di casa: lo dice, e non offre link né token', async () => {
    const { findByText, queryByText } = render(<MobileSection />);
    expect(await findByText(/Nessuna rete dichiarata di casa: la pagina resta chiusa\./)).toBeInTheDocument();
    expect(queryByText('Mostra link')).not.toBeInTheDocument();
    expect(queryByText('Rigenera')).not.toBeInTheDocument();
  });

  test('attivata ma senza rete di casa resta chiusa; dichiarata la rete, si apre', async () => {
    const { findByText, getByText } = render(<MobileSection />);
    fireEvent.click(await findByText('Attiva'));
    expect(await findByText('Attiva, ma chiusa: si apre solo sulla rete di casa.')).toBeInTheDocument();

    fireEvent.click(getByText('Usa la rete attuale'));
    expect(await findByText(/Pagina aperta su 192\.168\.1\.20, porta 37374\./)).toBeInTheDocument();
    expect(getByText(/Router aa:bb:cc:dd:ee:ff · sei su questa rete\./)).toBeInTheDocument();
    expect(window.api.calls).toEqual([['enable', true], ['trust']]);
  });

  test('su un\'altra rete lo dichiara e non lascia dimenticare quella di casa per sbaglio', async () => {
    mockApi({ enabled: true, hasToken: true, trustedMac: '11:22:33:44:55:66' });
    const { findByText, getByText } = render(<MobileSection />);
    expect(await findByText(/ora sei su un'altra rete: la pagina è chiusa\./)).toBeInTheDocument();
    expect(getByText('Usa la rete attuale')).toBeInTheDocument();
  });

  test('il link si mostra su richiesta e si nasconde', async () => {
    mockApi({ enabled: true, hasToken: true, trustedMac: 'aa:bb:cc:dd:ee:ff' });
    const { findByText, queryByText } = render(<MobileSection />);
    fireEvent.click(await findByText('Mostra link'));
    expect(await findByText('http://mac.local:37374/#abc')).toBeInTheDocument();
    fireEvent.click(await findByText('Nascondi'));
    await findByText('Mostra link');
    expect(queryByText('http://mac.local:37374/#abc')).not.toBeInTheDocument();
  });

  test('un errore dell\'azione viene mostrato', async () => {
    mockApi({ enabled: true, hasToken: true, trustedMac: 'aa:bb:cc:dd:ee:ff', failToken: true });
    const { findByText } = render(<MobileSection />);
    fireEvent.click(await findByText('Rigenera'));
    expect(await findByText('Archiviazione sicura non disponibile')).toBeInTheDocument();
  });

  test('senza router riconoscibile non si può dichiarare la rete', async () => {
    mockApi({ currentMac: null });
    const { findByText } = render(<MobileSection />);
    expect((await findByText('Usa la rete attuale')).closest('button')).toBeDisabled();
  });
});
