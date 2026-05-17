'use strict';

const http = require('http');
const { EventEmitter } = require('events');
const { randomUUID } = require('crypto');
const { getTodayData }    = require('./commands/today');
const { getWeekData }     = require('./commands/week');
const { getProjectsData } = require('./commands/projects');
const { getClientsData }  = require('./commands/clients');
const { getStatusData }   = require('./commands/status');
const { logHours }        = require('./commands/log');
const { fmt, getToday }   = require('./format');
const {
  getClients, saveClient,
  getProjects, saveProject, deleteProject,
  hasProjectEntries, mergeProjectEntries,
} = require('../db/queries');

function serializeWeek(data) {
  return {
    ...data,
    monday: fmt(data.monday),
    friday: fmt(data.friday),
    days: data.days.map(d => ({ ...d, day: fmt(d.day) })),
  };
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function createHttpServer() {
  const emitter = new EventEmitter();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1`);
    const p = url.pathname;
    const q = url.searchParams;

    try {
      if (req.method === 'GET' && p === '/ping') {
        return json(res, 200, { ok: true });
      }

      if (req.method === 'GET' && p === '/today') {
        const date = q.get('date') || fmt(getToday());
        return json(res, 200, getTodayData(date));
      }

      if (req.method === 'GET' && p === '/week') {
        const offset = parseInt(q.get('offset') || '0', 10) || 0;
        return json(res, 200, serializeWeek(getWeekData(getToday(), offset)));
      }

      if (req.method === 'GET' && p === '/projects') {
        const clientFilter = q.get('client') || undefined;
        const includeArchived = q.get('all') === '1';
        const nameSearch = q.get('search') || undefined;
        return json(res, 200, getProjectsData({ clientFilter, includeArchived, nameSearch }));
      }

      if (req.method === 'GET' && p === '/clients') {
        const nameFilter = q.get('search') || undefined;
        return json(res, 200, getClientsData({ nameFilter }));
      }

      if (req.method === 'GET' && p === '/status') {
        return json(res, 200, getStatusData(fmt(getToday())));
      }

      if (req.method === 'POST' && p === '/log') {
        const body = await readBody(req);
        const { project, hours, slot, date, add } = body;
        if (!project || !hours) return json(res, 400, { error: 'project and hours are required' });
        const result = logHours({
          projectName: project,
          hoursStr: String(hours),
          slot,
          date: date || fmt(getToday()),
          add: !!add,
        });
        emitter.emit('change', 'entries');
        return json(res, 200, result);
      }

      if (req.method === 'POST' && p === '/projects/merge') {
        const { fromId, toId } = await readBody(req);
        if (!fromId || !toId) return json(res, 400, { error: 'fromId and toId are required' });
        const allProjects = getProjects();
        const from = allProjects.find(pr => pr.id === fromId);
        const to   = allProjects.find(pr => pr.id === toId);
        if (!from) return json(res, 400, { error: `Project not found: ${fromId}` });
        if (!to)   return json(res, 400, { error: `Project not found: ${toId}` });
        const { count } = mergeProjectEntries(fromId, toId);
        emitter.emit('change', 'structure');
        return json(res, 200, { count, from: from.name, to: to.name });
      }

      if (req.method === 'POST' && p === '/projects') {
        const { name, clientId, budgetHours, weeklyHours } = await readBody(req);
        if (!name || !clientId) return json(res, 400, { error: 'name and clientId are required' });
        const client = getClients().find(c => c.id === clientId);
        if (!client) return json(res, 400, { error: `Client not found: ${clientId}` });
        const id = randomUUID();
        saveProject({ id, clientId, name, budgetHours: budgetHours ?? null, weeklyHours: weeklyHours ?? null });
        emitter.emit('change', 'structure');
        return json(res, 200, { id, name, client: client.name });
      }

      if (req.method === 'PATCH' && p.startsWith('/clients/') && p !== '/clients/') {
        const id = p.slice('/clients/'.length);
        const { name } = await readBody(req);
        if (!name) return json(res, 400, { error: 'name is required' });
        const existing = getClients().find(c => c.id === id);
        if (!existing) return json(res, 404, { error: `Client not found: ${id}` });
        saveClient({ ...existing, name });
        emitter.emit('change', 'structure');
        return json(res, 200, { id, oldName: existing.name, newName: name });
      }

      if (req.method === 'PATCH' && p.startsWith('/projects/') && p !== '/projects/') {
        const id = p.slice('/projects/'.length);
        const body = await readBody(req);
        const existing = getProjects().find(pr => pr.id === id);
        if (!existing) return json(res, 404, { error: `Project not found: ${id}` });
        const updated = { ...existing };
        if (body.name)     updated.name = body.name;
        if (body.clientId) updated.clientId = body.clientId;
        saveProject(updated);
        const client = getClients().find(c => c.id === updated.clientId);
        emitter.emit('change', 'structure');
        return json(res, 200, { id, name: updated.name, clientId: updated.clientId, client: client?.name });
      }

      if (req.method === 'DELETE' && p.startsWith('/projects/') && p !== '/projects/') {
        const id = p.slice('/projects/'.length);
        const existing = getProjects().find(pr => pr.id === id);
        if (!existing) return json(res, 404, { error: `Project not found: ${id}` });
        if (hasProjectEntries(id))
          return json(res, 409, { error: `Cannot delete project '${existing.name}': it has entries. Move them first.` });
        deleteProject(id);
        emitter.emit('change', 'structure');
        return json(res, 200, { id, name: existing.name });
      }

      json(res, 404, { error: 'Not found' });
    } catch (err) {
      json(res, err.message?.includes('No project') || err.message?.includes('Ambiguous') ? 400 : 500, { error: err.message });
    }
  });
  server.emitter = emitter;
  return server;
}

module.exports = { createHttpServer };
