import { describe, test, expect, beforeEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { MobileSection } from './SettingsScreen.jsx';
import MobileSwitch from '../components/MobileSwitch.jsx';
import { mockMobileApi } from '../__tests__/mobile-api.js';

describe('Impostazioni / iPhone', () => {
  beforeEach(() => mockMobileApi());

  test('dove non è supportata la sezione non compare', async () => {
    mockMobileApi({ supported: false });
    const { container } = render(<MobileSection />);
    await act(async () => {});   // lascia arrivare lo stato
    expect(container).toBeEmptyDOMElement();
  });

  test('spenta: lo dice, e non offre link né token', async () => {
    const { findByText, queryByText } = render(<MobileSection />);
    expect(await findByText(/Si accende e si spegne anche dalla barra in alto\./)).toBeInTheDocument();
    expect(queryByText('Mostra link')).not.toBeInTheDocument();
    expect(queryByText('Rigenera')).not.toBeInTheDocument();
  });

  test('accesa: dice dove ascolta e che vale su qualunque rete', async () => {
    const { findByText, getByText } = render(<MobileSection />);
    fireEvent.click(await findByText('Accendi'));
    expect(await findByText(/Pagina accesa su 192\.168\.1\.20, porta 37374\./)).toBeInTheDocument();
    expect(getByText(/raggiungibile da qualunque rete a cui il Mac è collegato: fuori casa va spenta\./)).toBeInTheDocument();
    expect(window.api.calls).toEqual([['enable', true]]);
  });

  test('accesa senza rete locale: lo dichiara', async () => {
    mockMobileApi({ enabled: true, hasToken: true, online: false });
    const { findByText } = render(<MobileSection />);
    expect(await findByText('Accesa, ma il Mac non è su una rete locale.')).toBeInTheDocument();
    fireEvent.click(await findByText('Mostra link'));
    expect(await findByText('Link non disponibile: il Mac non è su una rete locale.')).toBeInTheDocument();
  });

  test('il link si mostra su richiesta e si nasconde', async () => {
    mockMobileApi({ enabled: true, hasToken: true });
    const { findByText, queryByText } = render(<MobileSection />);
    fireEvent.click(await findByText('Mostra link'));
    expect(await findByText('http://mac.local:37374/#abc')).toBeInTheDocument();
    fireEvent.click(await findByText('Nascondi'));
    await findByText('Mostra link');
    expect(queryByText('http://mac.local:37374/#abc')).not.toBeInTheDocument();
  });

  test('un errore dell\'azione viene mostrato', async () => {
    mockMobileApi({ enabled: true, hasToken: true, failToken: true });
    const { findByText } = render(<MobileSection />);
    fireEvent.click(await findByText('Rigenera'));
    expect(await findByText('Archiviazione sicura non disponibile')).toBeInTheDocument();
  });

  test('la sezione e l\'interruttore nella barra in alto restano allineati', async () => {
    const { findByText, findByRole } = render(<><MobileSwitch /><MobileSection /></>);
    const sw = await findByRole('switch');
    expect(sw).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(await findByText('Accendi'));
    expect(await findByRole('switch', { checked: true })).toHaveTextContent('iPhone acceso');

    fireEvent.click(sw);
    expect(await findByText('Accendi')).toBeInTheDocument();
    expect(sw).toHaveAttribute('aria-checked', 'false');
  });
});
