import { describe, test, expect } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import MobileSwitch from './MobileSwitch.jsx';
import { mockMobileApi } from '../__tests__/mobile-api.js';

describe('MobileSwitch', () => {
  test('dove la pagina non è supportata non compare', async () => {
    mockMobileApi({ supported: false });
    const { container } = render(<MobileSwitch />);
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });

  test('spento: lo dice, e un clic lo accende', async () => {
    mockMobileApi();
    const { findByRole } = render(<MobileSwitch />);
    const sw = await findByRole('switch');
    expect(sw).toHaveAttribute('aria-checked', 'false');
    expect(sw).toHaveTextContent('iPhone spento');
    expect(sw.title).toMatch(/spenta\. Clic per accenderla/);

    fireEvent.click(sw);
    expect(await findByRole('switch', { checked: true })).toHaveTextContent('iPhone acceso');
    expect(sw.title).toMatch(/accesa su 192\.168\.1\.20: raggiungibile da questa rete/);
    expect(window.api.calls).toEqual([['enable', true]]);
  });

  test('acceso: un clic lo spegne', async () => {
    mockMobileApi({ enabled: true, hasToken: true });
    const { findByRole } = render(<MobileSwitch />);
    const sw = await findByRole('switch', { checked: true });
    fireEvent.click(sw);
    expect(await findByRole('switch', { checked: false })).toHaveTextContent('iPhone spento');
    expect(window.api.calls).toEqual([['enable', false]]);
  });

  test('acceso senza rete locale: resta acceso e lo spiega', async () => {
    mockMobileApi({ enabled: true, hasToken: true, online: false });
    const { findByRole } = render(<MobileSwitch />);
    const sw = await findByRole('switch', { checked: true });
    expect(sw.title).toMatch(/il Mac non è su una rete locale/);
  });

  test('se l\'accensione fallisce resta spento', async () => {
    mockMobileApi({ failEnable: true });
    const { findByRole } = render(<MobileSwitch />);
    const sw = await findByRole('switch');
    fireEvent.click(sw);
    await act(async () => {});
    expect(sw).toHaveAttribute('aria-checked', 'false');
  });
});
