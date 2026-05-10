import React, { useState, useEffect } from 'react';

export default function SettingsScreen({ theme, setTheme }) {
  const [busy, setBusy] = useState(false);
  const [dbPath, setDbPath] = useState('');
  const [todoistToken, setTodoistTokenState] = useState('');
  const [tokenSaved, setTokenSaved] = useState(false);
  const [todoistDebug, setTodoistDebug] = useState(() => {
    try { return localStorage.getItem('timebox-todoist-debug') === 'true'; } catch { return false; }
  });

  function toggleTodoistDebug() {
    setTodoistDebug(prev => {
      const next = !prev;
      try { localStorage.setItem('timebox-todoist-debug', String(next)); } catch {}
      return next;
    });
  }

  useEffect(() => {
    window.api.getDbPath().then(p => setDbPath(p || ''));
    window.api.getTodoistToken().then(t => setTodoistTokenState(t || ''));
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

  async function handleSaveDbCopy() {
    setBusy(true);
    const copyPath = await window.api.saveDbCopy();
    setBusy(false);
    if (copyPath) {
      window.alert(`Copia salvata in:\n${copyPath}`);
    }
  }

  async function handleCreateNewDb() {
    setBusy(true);
    const newPath = await window.api.createNewDb();
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

  async function handleSaveTodoistToken() {
    setBusy(true);
    await window.api.setTodoistToken(todoistToken.trim());
    setBusy(false);
    setTokenSaved(true);
    setTimeout(() => setTokenSaved(false), 2000);
  }

  async function handleResetData() {
    if (!window.confirm('Cancellare tutti i dati?\n\nQuesta operazione elimina definitivamente clienti, progetti, ore e pianificazione.')) return;
    setBusy(true);
    await window.api.resetAllData();
    window.location.reload();
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <Section title="Aspetto">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--tb-border-soft)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tb-text-primary)', marginBottom: 6 }}>
            Tema
          </div>
          <div style={{ fontSize: 11, color: 'var(--tb-text-muted)', marginBottom: 12 }}>
            Scegli l'aspetto dell'interfaccia. "Sistema" segue le impostazioni del tuo macOS.
          </div>
          <ThemeSelector theme={theme} setTheme={setTheme} />
        </div>
      </Section>
      <Section title="Todoist">
        <div style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tb-text-primary)', marginBottom: 6 }}>
            Token API
          </div>
          <div style={{ fontSize: 11, color: 'var(--tb-text-muted)', marginBottom: 12 }}>
            Inserisci il tuo token personale Todoist. Puoi trovarlo in{' '}
            <a href="https://todoist.com/app/settings/integrations/developer"
              target="_blank" rel="noreferrer"
              style={{ color: '#4A8FE8', textDecoration: 'none' }}>
              Impostazioni → Integrazioni → Developer
            </a>.
            Il token viene salvato cifrato con il Keychain di macOS.
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="password"
              value={todoistToken}
              onChange={e => { setTodoistTokenState(e.target.value); setTokenSaved(false); }}
              placeholder="Incolla il token Todoist…"
              style={{
                flex: 1, padding: '7px 10px', borderRadius: 6, fontSize: 12,
                border: '1px solid var(--tb-border)', background: 'var(--tb-panel-bg-soft)',
                color: 'var(--tb-text-primary)', fontFamily: "'Open Sans', sans-serif",
                outline: 'none',
              }}
            />
            <button
              onClick={handleSaveTodoistToken}
              disabled={busy}
              style={{
                flexShrink: 0, padding: '7px 16px', borderRadius: 6, border: 'none',
                background: tokenSaved ? '#3DB33D' : '#4A8FE8',
                color: 'white', fontSize: 12, fontWeight: 700,
                cursor: busy ? 'not-allowed' : 'pointer',
                fontFamily: "'Open Sans', sans-serif",
                transition: 'background 0.2s',
              }}>
              {tokenSaved ? '✓ Salvato' : 'Salva'}
            </button>
          </div>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tb-text-primary)', marginBottom: 3 }}>
              Log di debug
            </div>
            <div style={{ fontSize: 11, color: 'var(--tb-text-muted)' }}>
              Registra nel log ogni task recuperato da Todoist e il risultato del match con i progetti
            </div>
          </div>
          <button
            onClick={toggleTodoistDebug}
            style={{
              flexShrink: 0, padding: '5px 14px', borderRadius: 6, border: '1px solid var(--tb-border)',
              background: todoistDebug ? '#4A8FE8' : 'var(--tb-panel-bg-soft)',
              color: todoistDebug ? 'white' : 'var(--tb-text-secondary)',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
              fontFamily: "'Open Sans', sans-serif", transition: 'all 0.15s',
            }}>
            {todoistDebug ? 'Attivo' : 'Disattivo'}
          </button>
        </div>
      </Section>
      <Section title="Database">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--tb-border-soft)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tb-text-primary)', marginBottom: 6 }}>
            File dati
          </div>
          <div style={{
            fontSize: 11, color: 'var(--tb-text-secondary)', marginBottom: 12,
            background: 'var(--tb-panel-bg-soft)', border: '1px solid var(--tb-border)',
            borderRadius: 5, padding: '7px 10px',
            fontFamily: 'monospace', wordBreak: 'break-all',
            minHeight: 30,
          }}>
            {dbPath || '—'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--tb-text-muted)', marginBottom: 12 }}>
            Seleziona un file esistente o crea un nuovo file per cambiare la posizione del database.
            L'app verrà ricaricata automaticamente.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <SelectButton onClick={handleSelectDbFile} disabled={busy} />
            <CreateButton onClick={handleCreateNewDb} disabled={busy} />
            <CopyButton onClick={handleSaveDbCopy} disabled={busy} />
          </div>
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

const THEME_OPTIONS = [
  { value: 'light',  label: 'Chiaro' },
  { value: 'dark',   label: 'Scuro'  },
  { value: 'system', label: 'Sistema' },
];

function ThemeSelector({ theme, setTheme }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {THEME_OPTIONS.map(({ value, label }) => {
        const active = theme === value;
        return (
          <button key={value} onClick={() => setTheme(value)}
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700,
              border: active ? '2px solid #3DB33D' : '1px solid var(--tb-border)',
              background: active ? '#3DB33D18' : 'transparent',
              color: active ? '#3DB33D' : 'var(--tb-text-secondary)',
              cursor: 'pointer', fontFamily: "'Open Sans', sans-serif",
              transition: 'all 0.12s',
            }}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

function CopyButton({ onClick, disabled }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '7px 16px', borderRadius: 6, border: 'none',
        background: disabled ? 'var(--tb-border)' : hover ? '#7a5fa0' : '#8B6BBF',
        color: 'white', fontSize: 12, fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: "'Open Sans', sans-serif",
        transition: 'background 0.12s',
      }}>
      Salva copia…
    </button>
  );
}

function CreateButton({ onClick, disabled }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '7px 16px', borderRadius: 6, border: 'none',
        background: disabled ? 'var(--tb-border)' : hover ? '#3a8a3a' : '#4A9A4A',
        color: 'white', fontSize: 12, fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: "'Open Sans', sans-serif",
        transition: 'background 0.12s',
      }}>
      Nuovo database…
    </button>
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
        background: disabled ? 'var(--tb-border)' : hover ? '#555' : '#666',
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
    <div style={{ background: 'var(--tb-panel-bg)', borderRadius: 8, border: '1px solid var(--tb-panel-border)', overflow: 'hidden', marginBottom: 20 }}>
      <div style={{
        padding: '10px 20px',
        background: 'var(--tb-panel-bg-soft)', borderBottom: '1px solid var(--tb-border)',
        fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--tb-text-faint)',
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
      borderBottom: '1px solid var(--tb-border-soft)',
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tb-text-primary)', marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--tb-text-muted)' }}>{description}</div>
      </div>
      <button
        onClick={onClick}
        disabled={disabled}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          flexShrink: 0,
          padding: '7px 16px', borderRadius: 6, border: 'none',
          background: disabled ? 'var(--tb-border)' : hover ? buttonColor : buttonColor + 'dd',
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
