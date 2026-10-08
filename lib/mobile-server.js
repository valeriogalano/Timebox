'use strict';

// Listener HTTP della pagina mobile: è l'unico che esce dal loopback, quindi espone
// il minimo. Serve i quattro file statici della pagina e due rotte sui dati,
// protette da un token. Niente altro: cancellazioni di progetti, merge e il resto
// dell'API stanno su cli/http-server.js, che resta su 127.0.0.1 senza autenticazione.
//
// Il traffico è in chiaro (HTTP) e il listener è aperto su qualunque rete finché
// l'interruttore è acceso (lib/mobile-access.js): il token viaggia leggibile sulla
// rete a cui il computer è collegato. È un compromesso accettato, scritto in SECURITY.md.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createHash, timingSafeEqual } = require('node:crypto');

const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/app.css': ['app.css', 'text/css; charset=utf-8'],
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'],
};

// La pagina carica solo i propri file e parla solo con questo server.
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

const MAX_BODY = 1024;

const digest = value => createHash('sha256').update(String(value)).digest();

// Confronto a tempo costante. Si confrontano gli hash, che hanno sempre la stessa
// lunghezza: timingSafeEqual lancia un errore su lunghezze diverse.
function tokenMatches(header, token) {
  if (!token || typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  return timingSafeEqual(digest(header.slice(7)), digest(token));
}

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > MAX_BODY) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); } catch { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
}

// `getToken()` è letto a ogni richiesta, così un token rigenerato vale subito.
// `getDay(date)` e `saveHours({ projectId, date, clock, today })` sono le uniche due
// operazioni sui dati; `onChange()` avvisa l'app che una registrazione è cambiata.
function createMobileServer({ getToken, getDay, saveHours, isDate, today, onChange, pageDir }) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://timebox.invalid');
      const route = url.pathname;

      if (req.method === 'GET' && STATIC[route]) {
        const [file, type] = STATIC[route];
        return send(res, 200, fs.readFileSync(path.join(pageDir, file)), type);
      }

      if (!route.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
      if (!tokenMatches(req.headers.authorization, getToken())) return send(res, 401, { error: 'Unauthorized' });

      if (req.method === 'GET' && route === '/api/day') {
        const date = url.searchParams.get('date') || today();
        if (!isDate(date)) return send(res, 400, { error: 'date must be YYYY-MM-DD' });
        return send(res, 200, getDay(date));
      }

      if (req.method === 'PUT' && route === '/api/hours') {
        let body;
        try { body = await readJson(req); } catch (err) { return send(res, 400, { error: err.message }); }
        const result = saveHours({
          projectId: String(body.projectId ?? ''),
          date: body.date,
          clock: body.clock,
          today: today(),
        });
        if (result.error) return send(res, result.status || 400, { error: result.error });
        onChange?.();
        return send(res, 200, result);
      }

      return send(res, 404, { error: 'Not found' });
    } catch {
      // Niente dettagli dell'errore a chi sta dall'altra parte della rete.
      if (!res.headersSent) send(res, 500, { error: 'Internal error' });
    }
  });
}

module.exports = { createMobileServer, tokenMatches };
