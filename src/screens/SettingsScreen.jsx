import React, { useState, useEffect } from 'react';

export default function SettingsScreen() {
  const [busy, setBusy] = useState(false);
  const [dbPath, setDbPath] = useState('');

  useEffect(() => {
    window.api.getDbPath().then(p => setDbPath(p || ''));
  }, []);

  async function handleSelectDbFile() {
    setBusy(true);
    const newPath = await window.api.selectDbFile();
    setBusy(false);
    if (newPath) {
      setDbPath(newPath);
      window.location.reload();
    }
  }

  async function handleSeedData() {
    if (!window.confirm('Caricare i dati di prova?\n\nTutti i dati esistenti verranno eliminati e sostituiti con i dati demo.')) return;
    setBusy(true);
    await window.api.seedDemoData();
    window.location.reload();
  }

  async function handleResetData() {
    if (!window.confirm('Cancellare tutti i dati?\n\nQuesta operazione elimina definitivamente clienti, progetti, ore e pianificazione.')) return;
    setBusy(true);
    await window.api.resetAllData();
    window.location.reload();
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <Section title="Database">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0efe8' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#383838', marginBottom: 6 }}>
            File dati
          </div>
          <div style={{
            fontSize: 11, color: '#888', marginBottom: 12,
            background: '#f8f7f2', border: '1px solid #e8e7e0',
            borderRadius: 5, padding: '7px 10px',
            fontFamily: 'monospace', wordBreak: 'break-all',
            minHeight: 30,
          }}>
            {dbPath || '—'}
          </div>
          <div style={{ fontSize: 11, color: '#aaa', marginBottom: 12 }}>
            Seleziona un file esistente o crea un nuovo file per cambiare la posizione del database.
            L'app verrà ricaricata automaticamente.
          </div>
          <SelectButton onClick={handleSelectDbFile} disabled={busy} />
        </div>
      </Section>
      <Section title="Dati">
        <Row
          label="Carica dati di prova"
          description="Inserisce clienti, progetti e ore di esempio (sovrascrive i dati esistenti)"
          buttonLabel="Carica dati demo"
          buttonColor="#4A8FE8"
          onClick={handleSeedData}
          disabled={busy}
        />
        <Row
          label="Cancella tutti i dati"
          description="Elimina definitivamente clienti, progetti, ore e pianificazione settimanale"
          buttonLabel="Cancella tutto"
          buttonColor="#E05252"
          onClick={handleResetData}
          disabled={busy}
        />
      </Section>
    </div>
  );
}

function SelectButton({ onClick, disabled }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '7px 16px', borderRadius: 6, border: 'none',
        background: disabled ? '#ddd' : hover ? '#555' : '#666',
        color: 'white', fontSize: 12, fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: "'Open Sans', sans-serif",
        transition: 'background 0.12s',
      }}>
      Seleziona file…
    </button>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ background: 'white', borderRadius: 8, border: '1px solid #e8e7e0', overflow: 'hidden', marginBottom: 20 }}>
      <div style={{
        padding: '10px 20px',
        background: '#f8f7f2', borderBottom: '1px solid #e8e7e0',
        fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#bbb',
      }}>
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Row({ label, description, buttonLabel, buttonColor, onClick, disabled }) {
  const [hover, setHover] = useState(false);
  return (
    <div style={{
      padding: '16px 20px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20,
      borderBottom: '1px solid #f0efe8',
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#383838', marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 11, color: '#aaa' }}>{description}</div>
      </div>
      <button
        onClick={onClick}
        disabled={disabled}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          flexShrink: 0,
          padding: '7px 16px', borderRadius: 6, border: 'none',
          background: disabled ? '#ddd' : hover ? buttonColor : buttonColor + 'dd',
          color: 'white', fontSize: 12, fontWeight: 700,
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: "'Open Sans', sans-serif",
          transition: 'background 0.12s',
        }}>
        {buttonLabel}
      </button>
    </div>
  );
}
