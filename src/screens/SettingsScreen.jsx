import React, { useState, useEffect } from 'react';
import { normalizeSlotCapacityHours } from '../slot-capacity';

export default function SettingsScreen({ theme, setTheme, onDataChange, slotCapacityHours, onSlotCapacityChange }) {
  const [busy, setBusy] = useState(false);
  const [dbPath, setDbPath] = useState('');
  const [todoistToken, setTodoistTokenState] = useState('');
  const [tokenSaved, setTokenSaved] = useState(false);
  const [slotCapacityDraft, setSlotCapacityDraft] = useState(String(slotCapacityHours));
  const [slotCapacitySaved, setSlotCapacitySaved] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [todoistDebug, setTodoistDebug] = useState(() => {
    try { return localStorage.getItem('timebox-todoist-debug') === 'true'; } catch { return false; }
  });
  const [updateStatus, setUpdateStatus] = useState(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [cliInstalled, setCliInstalled] = useState(false);
  const [mcpCodexInstalled, setMcpCodexInstalled] = useState(false);
  const [mcpDesktopInstalled, setMcpDesktopInstalled] = useState(false);
  const [mcpClaudeCodeInstalled, setMcpClaudeCodeInstalled] = useState(false);
  const [toolInstallInfo, setToolInstallInfo] = useState(null);

  function toggleTodoistDebug() {
    setTodoistDebug(prev => {
      const next = !prev;
      try { localStorage.setItem('timebox-todoist-debug', String(next)); } catch {}
      return next;
    });
  }

  useEffect(() => {
    setSlotCapacityDraft(String(slotCapacityHours));
  }, [slotCapacityHours]);

  useEffect(() => {
    window.api.getDbPath().then(p => setDbPath(p || ''));
    window.api.getToolInstallInfo?.().then(info => setToolInstallInfo(info || null));
    window.api.getTodoistToken().then(t => setTodoistTokenState(t || ''));
    window.api.checkCliInstalled().then(v => setCliInstalled(!!v));
    window.api.checkMcpCodexInstalled().then(v => setMcpCodexInstalled(!!v));
    window.api.checkMcpDesktopInstalled().then(v => setMcpDesktopInstalled(!!v));
    window.api.checkMcpClaudeCodeInstalled().then(v => setMcpClaudeCodeInstalled(!!v));
    window.api.getUpdateStatus?.().then(s => s && setUpdateStatus(s));
    const off = window.api.onUpdateState?.(s => setUpdateStatus(s));
    return () => off?.();
  }, []);

  async function handleInstallMcpCodex() {
    setBusy(true);
    const result = await window.api.installMcpCodex();
    setBusy(false);
    if (result?.ok) {
      setMcpCodexInstalled(true);
    } else {
      window.alert(`Configurazione Codex non riuscita:\n${result?.error || 'Errore sconosciuto'}`);
    }
  }

  async function handleInstallMcpClaudeCode() {
    setBusy(true);
    const result = await window.api.installMcpClaudeCode();
    setBusy(false);
    if (result?.ok) {
      setMcpClaudeCodeInstalled(true);
    } else {
      window.alert(`Configurazione Claude Code non riuscita:\n${result?.error || 'Errore sconosciuto'}`);
    }
  }

  async function handleInstallMcpDesktop() {
    setBusy(true);
    const result = await window.api.installMcpDesktop();
    setBusy(false);
    if (result?.ok) {
      setMcpDesktopInstalled(true);
    } else {
      window.alert(`Configurazione Claude Desktop non riuscita:\n${result?.error || 'Errore sconosciuto'}`);
    }
  }

  async function handleInstallCli() {
    setBusy(true);
    const result = await window.api.installCli();
    setBusy(false);
    if (result?.ok) {
      setCliInstalled(true);
    } else {
      window.alert(`Installazione CLI non riuscita:\n${result?.error || 'Errore sconosciuto'}`);
    }
  }

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

  async function handleImportTodoistProjects() {
    setBusy(true);
    setImportResult(null);
    const result = await window.api.importTodoistProjects();
    setBusy(false);
    if (result.error === 'no_token') {
      setImportResult({ error: 'Token non configurato.' });
    } else if (result.error) {
      setImportResult({ error: `Errore API Todoist (${result.status ?? result.error}).` });
    } else {
      setImportResult({ added: result.added });
      if (result.added > 0 && onDataChange) onDataChange();
    }
  }

  async function handleSaveTodoistToken() {
    setBusy(true);
    await window.api.setTodoistToken(todoistToken.trim());
    setBusy(false);
    setTokenSaved(true);
    setTimeout(() => setTokenSaved(false), 2000);
  }

  async function handleSaveSlotCapacity() {
    const normalized = normalizeSlotCapacityHours(slotCapacityDraft);
    setSlotCapacityDraft(String(normalized));
    await onSlotCapacityChange?.(normalized);
    setSlotCapacitySaved(true);
    setTimeout(() => setSlotCapacitySaved(false), 2000);
  }

  async function handleCheckForUpdates() {
    setUpdateBusy(true);
    const result = await window.api.checkForUpdates?.();
    if (result?.state) setUpdateStatus(result.state);
    setUpdateBusy(false);
  }

  async function handleInstallUpdate() {
    await window.api.installUpdate?.();
  }

  async function handleResetData() {
    if (!window.confirm('Cancellare tutti i dati?\n\nQuesta operazione elimina definitivamente aree, progetti, ore e pianificazione.')) return;
    setBusy(true);
    await window.api.resetAllData();
    window.location.reload();
  }

  return (
    <div>
      <Section title="Scorciatorie da tastiera">
        <div style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: 'var(--tb-text-muted)', marginBottom: 14 }}>
            Tutte le scorciatorie usano <kbd style={{ fontFamily: 'monospace', fontSize: 11, background: 'var(--tb-panel-bg-soft)', border: '1px solid var(--tb-border)', borderRadius: 4, padding: '1px 5px' }}>⌘</kbd> come modificatore (alcune anche <kbd style={{ fontFamily: 'monospace', fontSize: 11, background: 'var(--tb-panel-bg-soft)', border: '1px solid var(--tb-border)', borderRadius: 4, padding: '1px 5px' }}>⇧</kbd>).
            Le scorciatoie globali non sono attive quando un campo di testo è in focus; nel timesheet puoi usare anche <kbd style={{ fontFamily: 'monospace', fontSize: 11, background: 'var(--tb-panel-bg-soft)', border: '1px solid var(--tb-border)', borderRadius: 4, padding: '1px 5px' }}>⌥ ← / →</kbd> mentre modifichi una cella.
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <tbody>
              {[
                ['⌘ L', 'Apre il quick-log per navigare a un progetto'],
                ['⌘ T', 'Torna al Timesheet della settimana corrente'],
                ['⌘ ←', 'Settimana precedente (solo nel Timesheet)'],
                ['⌘ →', 'Settimana successiva (solo nel Timesheet)'],
                ['⌥ ← / →', 'In una cella del Timesheet: salva e va al giorno precedente / successivo'],
                ['⌘ B', 'Espande / riduce la sidebar'],
                ['⌘ ,', 'Apre le Impostazioni'],
                ['⌘ 1–8', 'Naviga alle schermate in ordine sidebar'],
                ['⌘ ⇧ H', 'Nascondi / mostra progetti senza ore (Timesheet)'],
                ['⌘ ⇧ V', 'Alterna vista Tracciate / Fatturabili (Timesheet)'],
                ['?',      'Mostra / nasconde l\'overlay delle scorciatorie'],
              ].map(([keys, desc], i, arr) => (
                <tr key={i} style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--tb-border-soft)' : 'none' }}>
                  <td style={{ padding: '9px 12px 9px 0', width: 90, whiteSpace: 'nowrap' }}>
                    <kbd style={{
                      fontFamily: 'monospace', fontSize: 11,
                      background: 'var(--tb-panel-bg-soft)', border: '1px solid var(--tb-border)',
                      borderRadius: 4, padding: '2px 6px', color: 'var(--tb-text-primary)', fontWeight: 700,
                    }}>{keys}</kbd>
                  </td>
                  <td style={{ padding: '9px 0', color: 'var(--tb-text-secondary)', fontSize: 11 }}>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="Aspetto">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--tb-border-soft)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tb-text-primary)', marginBottom: 6 }}>
            Tema
          </div>
          <div style={{ fontSize: 11, color: 'var(--tb-text-muted)', marginBottom: 12 }}>
            Scegli l'aspetto dell'interfaccia. "Sistema" segue le impostazioni del sistema operativo.
          </div>
          <ThemeSelector theme={theme} setTheme={setTheme} />
        </div>
      </Section>
      <Section title="Pianificazione">
        <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tb-text-primary)', marginBottom: 6 }}>
              Capacità slot AM/PM
            </div>
            <div style={{ fontSize: 11, color: 'var(--tb-text-muted)' }}>
              Target usato dalle barre di capacità in Timesheet e Ricorrenza
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <input
              type="number"
              min="0.5"
              max="12"
              step="0.25"
              value={slotCapacityDraft}
              onChange={e => { setSlotCapacityDraft(e.target.value); setSlotCapacitySaved(false); }}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveSlotCapacity(); }}
              style={{
                width: 76, padding: '7px 9px', borderRadius: 6, fontSize: 12,
                border: '1px solid var(--tb-border)', background: 'var(--tb-panel-bg-soft)',
                color: 'var(--tb-text-primary)', fontFamily: "'Open Sans', sans-serif",
                outline: 'none', textAlign: 'right',
              }}
            />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--tb-text-muted)' }}>h</span>
            <button
              onClick={handleSaveSlotCapacity}
              disabled={busy}
              style={{
                padding: '7px 16px', borderRadius: 6, border: 'none',
                background: slotCapacitySaved ? '#3DB33D' : '#4A8FE8',
                color: 'white', fontSize: 12, fontWeight: 700,
                cursor: busy ? 'not-allowed' : 'pointer',
                fontFamily: "'Open Sans', sans-serif",
                transition: 'background 0.2s',
              }}>
              {slotCapacitySaved ? '✓ Salvato' : 'Salva'}
            </button>
          </div>
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
            Il token viene salvato cifrato con Electron safeStorage, usando il sistema di protezione credenziali disponibile.
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
        <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tb-text-primary)', marginBottom: 3 }}>
              Importa progetti
            </div>
            <div style={{ fontSize: 11, color: 'var(--tb-text-muted)' }}>
              Aggiunge sotto l'area "Todoist" tutti i progetti Todoist non ancora presenti in Timebox
            </div>
            {importResult && (
              <div style={{ fontSize: 11, marginTop: 6, color: importResult.error ? '#E05252' : '#3DB33D', fontWeight: 700 }}>
                {importResult.error
                  ? importResult.error
                  : importResult.added === 0
                    ? 'Nessun nuovo progetto da importare.'
                    : `${importResult.added} progett${importResult.added === 1 ? 'o importato' : 'i importati'}, ricarico…`}
              </div>
            )}
          </div>
          <button
            onClick={handleImportTodoistProjects}
            disabled={busy}
            style={{
              flexShrink: 0, padding: '7px 16px', borderRadius: 6, border: 'none',
              background: busy ? 'var(--tb-border)' : '#4A8FE8',
              color: 'white', fontSize: 12, fontWeight: 700,
              cursor: busy ? 'not-allowed' : 'pointer',
              fontFamily: "'Open Sans', sans-serif",
              transition: 'background 0.12s',
            }}>
            Importa
          </button>
        </div>
      </Section>
      <Section title="CLI e MCP">
        <Row
          label="Installa CLI"
          description={
            cliInstalled
              ? `Comando timebox disponibile in ${toolInstallInfo?.installDir || 'directory utente'} · porta HTTP: 37373`
              : `Installa il comando timebox in ${toolInstallInfo?.pathHint || 'una directory utente'} per accedere da terminale (richiede app aperta)`
          }
          buttonLabel={cliInstalled ? '✓ Installata' : 'Installa…'}
          buttonColor="#4A9A4A"
          onClick={handleInstallCli}
          disabled={busy || cliInstalled}
        />
        <Row
          label="Configura Codex"
          description={
            mcpCodexInstalled
              ? 'Timebox MCP configurato in Codex tramite il comando `codex mcp add`'
              : 'Installa il server MCP e lo registra in Codex tramite `codex mcp add`'
          }
          buttonLabel={mcpCodexInstalled ? '✓ Configurato' : 'Configura…'}
          buttonColor="#4A8FE8"
          onClick={handleInstallMcpCodex}
          disabled={busy || mcpCodexInstalled}
        />
        <Row
          label="Configura Claude Code"
          description={
            mcpClaudeCodeInstalled
              ? 'Timebox MCP configurato in Claude Code tramite il comando `claude mcp add` per l’utente corrente'
              : 'Installa il server MCP e lo registra in Claude Code tramite `claude mcp add -s user`'
          }
          buttonLabel={mcpClaudeCodeInstalled ? '✓ Configurato' : 'Configura…'}
          buttonColor="#4A8FE8"
          onClick={handleInstallMcpClaudeCode}
          disabled={busy || mcpClaudeCodeInstalled}
        />
        <Row
          label="Configura Claude Desktop"
          description={
            mcpDesktopInstalled
              ? 'Timebox MCP configurato in Claude Desktop (~/Library/Application Support/Claude/claude_desktop_config.json)'
              : toolInstallInfo?.platform === 'darwin'
                ? 'Installa il server MCP e lo aggiunge a claude_desktop_config.json per Claude Desktop'
                : 'Configurazione automatica disponibile solo su macOS; su Windows/Linux usa la configurazione generica'
          }
          buttonLabel={mcpDesktopInstalled ? '✓ Configurato' : 'Configura…'}
          buttonColor="#4A8FE8"
          onClick={handleInstallMcpDesktop}
          disabled={busy || mcpDesktopInstalled || toolInstallInfo?.platform !== 'darwin'}
        />
        <InfoRow
          label="Configurazione generica"
          description={`Per altri agenti o client MCP, registra Timebox come server stdio usando il comando seguente. Se non è nel PATH, aggiungi ${toolInstallInfo?.pathHint || 'la directory di installazione'} al PATH.`}
          code={toolInstallInfo?.mcpPath || 'timebox-mcp'}
        />
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
          description="Inserisce aree, progetti e ore di esempio (sovrascrive i dati esistenti)"
          buttonLabel="Carica dati demo"
          buttonColor="#4A8FE8"
          onClick={handleSeedData}
          disabled={busy}
        />
        <Row
          label="Cancella tutti i dati"
          description="Elimina definitivamente aree, progetti, ore e pianificazione settimanale"
          buttonLabel="Cancella tutto"
          buttonColor="#E05252"
          onClick={handleResetData}
          disabled={busy}
        />
      </Section>

      <Section title="Aggiornamenti">
        <UpdateSection
          status={updateStatus}
          busy={updateBusy}
          onCheck={handleCheckForUpdates}
          onInstall={handleInstallUpdate}
        />
      </Section>
    </div>
  );
}

const UPDATE_STATUS_LABELS = {
  idle:          { text: 'Non verificato', color: 'var(--tb-text-muted)' },
  checking:      { text: 'Controllo in corso…', color: 'var(--tb-text-muted)' },
  skipped:       { text: 'Controllo saltato (app non pacchettizzata)', color: 'var(--tb-text-muted)' },
  'not-available': { text: 'L\'app è aggiornata', color: '#3DB33D' },
  available:     { text: 'Aggiornamento disponibile – download in corso', color: '#E07B3A' },
  downloading:   { text: 'Download aggiornamento in corso…', color: '#E07B3A' },
  downloaded:    { text: 'Aggiornamento pronto – riavvia per installare', color: '#4A8FE8' },
  error:         { text: 'Errore durante il controllo aggiornamenti', color: '#E05252' },
};

function UpdateSection({ status, busy, onCheck, onInstall }) {
  const label = UPDATE_STATUS_LABELS[status?.status] ?? UPDATE_STATUS_LABELS.idle;
  return (
    <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tb-text-primary)', marginBottom: 3 }}>Stato aggiornamento automatico</div>
        <div style={{ fontSize: 11, color: label.color, fontWeight: 600 }}>{label.text}</div>
        {status?.error?.message && (
          <div style={{ fontSize: 10, color: '#E05252', marginTop: 4, fontFamily: 'monospace' }}>{status.error.message}</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {status?.status === 'downloaded' ? (
          <ActionButton onClick={onInstall} color="#4A8FE8">Installa e riavvia</ActionButton>
        ) : (
          <ActionButton onClick={onCheck} disabled={busy || status?.status === 'checking'} color="#4A8FE8">
            {busy || status?.status === 'checking' ? 'Controllo…' : 'Controlla aggiornamenti'}
          </ActionButton>
        )}
      </div>
    </div>
  );
}

function ActionButton({ onClick, disabled, color, children }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '7px 16px', borderRadius: 6, border: 'none',
        background: disabled ? 'var(--tb-border)' : hover ? color : color + 'dd',
        color: 'white', fontSize: 12, fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: "'Open Sans', sans-serif",
        transition: 'background 0.12s',
      }}>
      {children}
    </button>
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

function InfoRow({ label, description, code }) {
  return (
    <div style={{
      padding: '16px 20px',
      display: 'flex', flexDirection: 'column', gap: 8,
      borderBottom: '1px solid var(--tb-border-soft)',
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--tb-text-primary)', marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--tb-text-muted)' }}>{description}</div>
      </div>
      <div style={{
        fontSize: 11,
        color: 'var(--tb-text-secondary)',
        background: 'var(--tb-panel-bg-soft)',
        border: '1px solid var(--tb-border)',
        borderRadius: 6,
        padding: '8px 10px',
        fontFamily: 'monospace',
        wordBreak: 'break-all',
      }}>
        {code}
      </div>
    </div>
  );
}
