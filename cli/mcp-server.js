#!/usr/bin/env node
'use strict';

const http = require('node:http');
const readline = require('node:readline');

const PORT = parseInt(process.env.TIMEBOX_PORT || '37373', 10);

function fmtBillable(hours, billableHours) {
  if (billableHours == null || Math.abs(billableHours - hours) < 0.001) return `${hours}h`;
  return `${hours}h (${billableHours}h fatt.)`;
}

// ── HTTP client ───────────────────────────────────────────────────────────────

function httpRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = http.request(opts, res => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        try {
          const data = JSON.parse(raw);
          if (res.statusCode >= 400) reject(new Error(data.error || raw));
          else resolve(data);
        } catch { reject(new Error(`Invalid response: ${raw}`)); }
      });
    });
    req.on('error', err => {
      if (err.code === 'ECONNREFUSED') {
        reject(new Error(`Timebox app is not running. Please open Timebox and try again.`));
      } else {
        reject(err);
      }
    });
    if (payload) req.write(payload);
    req.end();
  });
}

// ── JSON-RPC stdio transport ──────────────────────────────────────────────────

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function respond(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function respondError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'today',
    description: 'Get hours logged in Timebox for a given day, broken down by AM/PM slot and project.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format (default: today)' },
      },
    },
  },
  {
    name: 'day_summary',
    description: 'Get the daily Timebox summary for a day: planned blocks from template/override, tracked hours, residual capacity and extra work.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format (default: today)' },
      },
    },
  },
  {
    name: 'todoist_imported_tasks',
    description: 'Get Todoist tasks imported into Timebox for a given day, including Todoist project, matched Timebox project, area, slot, estimated duration and match status.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format (default: today)' },
      },
    },
  },
  {
    name: 'week',
    description: 'Get the weekly summary of logged hours in Timebox, day by day.',
    inputSchema: {
      type: 'object',
      properties: {
        offset: { type: 'number', description: 'Week offset: 0 = current week, -1 = last week (default: 0)' },
      },
    },
  },
  {
    name: 'projects',
    description: 'List Timebox projects with their area, budget, weekly limit and total logged hours.',
    inputSchema: {
      type: 'object',
      properties: {
        area: { type: 'string', description: 'Filter by area name (partial, case-insensitive)' },
        client: { type: 'string', description: 'Deprecated alias for area name (partial, case-insensitive)' },
        all: { type: 'boolean', description: 'Include archived projects (default: false)' },
      },
    },
  },
  {
    name: 'areas',
    description: 'List Timebox areas with their billing type and hourly rate.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'status',
    description: 'Get a quick overview: hours logged today and this week, plus any budget alerts.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'log_hours',
    description: 'Log hours on a Timebox project. Replaces existing hours for that day/slot unless add=true.',
    inputSchema: {
      type: 'object',
      required: ['project', 'hours'],
      properties: {
        project: { type: 'string', description: 'Project name (partial match, must be unambiguous)' },
        hours: { type: 'string', description: 'Hours to log — "2", "2.5", or "2:30"' },
        billable_hours: { type: 'string', description: 'Billable hours override (optional). Same format as hours. Defaults to identical to hours.' },
        slot: { type: 'string', enum: ['am', 'pm'], description: 'Time slot (default: am)' },
        date: { type: 'string', description: 'Date in YYYY-MM-DD format (default: today)' },
        add: { type: 'boolean', description: 'Add to existing hours instead of replacing (default: false)' },
      },
    },
  },
  {
    name: 'find_area',
    description: 'Search Timebox areas by name (partial, case-insensitive). Returns id and name — use id with rename_area.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Partial name to search for' },
      },
    },
  },
  {
    name: 'find_project',
    description: 'Search Timebox projects by name or description (partial, case-insensitive). Returns id, name, description and area — use id with rename_project, move_project, delete_project, merge_project_entries.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Partial text to search in project name or description' },
      },
    },
  },
  {
    name: 'rename_area',
    description: 'Rename a Timebox area. Use find_area to get the id first.',
    inputSchema: {
      type: 'object',
      required: ['id', 'name'],
      properties: {
        id: { type: 'string', description: 'Area id' },
        name: { type: 'string', description: 'New name' },
      },
    },
  },
  {
    name: 'rename_project',
    description: 'Rename a Timebox project. Use find_project to get the id first.',
    inputSchema: {
      type: 'object',
      required: ['id', 'name'],
      properties: {
        id: { type: 'string', description: 'Project id' },
        name: { type: 'string', description: 'New name' },
      },
    },
  },
  {
    name: 'update_project',
    description: 'Update one or more fields of a Timebox project (name, description, budgetHours, weeklyHours). Use find_project to get the id first. Only include the fields you want to change.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Project id' },
        name: { type: 'string', description: 'New project name' },
        description: { type: 'string', description: 'New description (pass empty string to clear it)' },
        budgetHours: { type: 'number', description: 'New total budget in hours (pass 0 to clear)' },
        weeklyHours: { type: 'number', description: 'New weekly hours limit (pass 0 to clear)' },
      },
    },
  },
  {
    name: 'move_project',
    description: 'Move a Timebox project to a different area. Use find_project and find_area to get ids first.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Project id' },
        areaId: { type: 'string', description: 'Target area id' },
      },
    },
  },
  {
    name: 'create_project',
    description: 'Create a new project in a Timebox area. Use find_area to get the areaId first.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', description: 'Project name' },
        areaId: { type: 'string', description: 'Area id to create the project in' },
        description: { type: 'string', description: 'Project description (optional, searchable)' },
        budgetHours: { type: 'number', description: 'Total budget in hours (optional)' },
        weeklyHours: { type: 'number', description: 'Weekly hours limit (optional)' },
      },
    },
  },
  {
    name: 'delete_project',
    description: 'Delete a Timebox project. Fails if the project has logged entries — use merge_project_entries first.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Project id' },
      },
    },
  },
  {
    name: 'merge_project_entries',
    description: 'Move all logged entries from one project into another (summing hours on the same day+slot), then delete the source project.',
    inputSchema: {
      type: 'object',
      required: ['fromId', 'toId'],
      properties: {
        fromId: { type: 'string', description: 'Source project id (will be deleted)' },
        toId: { type: 'string', description: 'Destination project id' },
      },
    },
  },
];

// ── Tool handlers ─────────────────────────────────────────────────────────────

async function callTool(name, args) {
  if (name === 'today') {
    const qs = args.date ? `?date=${encodeURIComponent(args.date)}` : '';
    const d = await httpRequest(`/today${qs}`);
    const lines = [`Date: ${d.date}\n`];
    for (const slot of ['am', 'pm']) {
      const entries = d.slots[slot];
      if (!entries.length) continue;
      lines.push(`${slot.toUpperCase()}:`);
      for (const e of entries) lines.push(`  ${e.project}: ${fmtBillable(e.hours, e.billableHours)}`);
    }
    const total = (d.amTotal || 0) + (d.pmTotal || 0);
    const totalBillable = d.totalBillable ?? null;
    lines.push(`\nTotal: ${fmtBillable(total, totalBillable !== null && Math.abs(totalBillable - total) > 0.001 ? totalBillable : null)}`);
    return lines.join('\n');
  }

  if (name === 'day_summary') {
    const qs = args.date ? `?date=${encodeURIComponent(args.date)}` : '';
    const d = await httpRequest(`/day-summary${qs}`);
    const lines = [
      `Date: ${d.date}`,
      `Planned: ${d.plannedCapacity}h`,
      `Tracked: ${fmtBillable(d.trackedHours, d.trackedBillableHours)}`,
      `Residual: ${d.residualCapacity}h`,
      `Extra: ${d.extraHours}h`,
      '',
    ];

    for (const slot of ['am', 'pm']) {
      const slotData = d.slots[slot];
      lines.push(`${slot.toUpperCase()} [${slotData.source}]: planned ${slotData.plannedCapacity}h, tracked ${slotData.trackedHours}h`);
      if (slotData.plannedBlocks.length) {
        for (const block of slotData.plannedBlocks) {
          lines.push(`  plan ${block.area}: ${block.hours}h`);
        }
      } else {
        lines.push('  plan none');
      }

      if (slotData.trackedEntries.length) {
        for (const entry of slotData.trackedEntries) {
          lines.push(`  done ${entry.project} [${entry.area}]: ${fmtBillable(entry.hours, entry.billableHours)}`);
        }
      } else {
        lines.push('  done none');
      }
      lines.push('');
    }

    if (d.extra.length) {
      lines.push('Extra by area:');
      for (const extra of d.extra) lines.push(`  ${extra.area}: ${extra.hours}h`);
    } else {
      lines.push('Extra by area: none');
    }

    return lines.join('\n');
  }

  if (name === 'todoist_imported_tasks') {
    const qs = args.date ? `?date=${encodeURIComponent(args.date)}` : '';
    const d = await httpRequest(`/todoist-imported${qs}`);
    const lines = [`Date: ${d.dateStr}`];
    if (d.syncedAt) lines.push(`Synced: ${d.syncedAt}`);
    if (!d.tasks.length) {
      lines.push('Tasks: none');
      return lines.join('\n');
    }

    const total = d.tasks.reduce((sum, task) => sum + (task.estimatedHours || 0), 0);
    lines.push(`Tasks: ${d.tasks.length}`);
    lines.push(`Estimated: ${total}h`);
    lines.push('');

    for (const slot of ['am', 'pm']) {
      const tasks = d.tasks.filter(task => task.slot === slot);
      lines.push(`${slot.toUpperCase()}:`);
      if (!tasks.length) {
        lines.push('  none');
        continue;
      }
      for (const task of tasks) {
        const bits = [
          `${task.title || '(untitled)'}`,
          `${task.estimatedHours || 0}h`,
          `status: ${task.matchStatus}`,
        ];
        if (task.todoistProject) bits.push(`Todoist: ${task.todoistProject}`);
        if (task.timeboxProject) bits.push(`Timebox: ${task.timeboxProject}`);
        if (task.area) bits.push(`area: ${task.area}`);
        if (task.dueDate) bits.push(`due: ${task.dueDate}`);
        lines.push(`  ${bits.join(' | ')}`);
      }
    }

    return lines.join('\n');
  }

  if (name === 'week') {
    const offset = args.offset ?? 0;
    const d = await httpRequest(`/week?offset=${offset}`);
    const lines = [`Week ${d.monday} – ${d.friday}\n`];
    for (const day of d.days) {
      const label = day.label || day.day;
      const total = day.total || 0;
      const totalBill = day.totalBillable ?? null;
      const billLabel = totalBill != null && Math.abs(totalBill - total) > 0.001
        ? ` (${totalBill}h fatt.)`
        : '';
      lines.push(`  ${label}: ${total}h${billLabel}`);
    }
    const total = d.total || 0;
    const totBill = d.totalBillable ?? null;
    const billPart = totBill != null && Math.abs(totBill - total) > 0.001 ? ` (${totBill}h fatt.)` : '';
    lines.push(`\nTotal: ${total}h${billPart}`);
    return lines.join('\n');
  }

  if (name === 'projects') {
    const params = new URLSearchParams();
    if (args.area || args.client) params.set('area', args.area || args.client);
    if (args.all) params.set('all', '1');
    const qs = params.toString() ? `?${params}` : '';
    const d = await httpRequest(`/projects${qs}`);
    if (!d.length) return 'No projects found.';
    return d.map(p => {
      let line = `${p.project} [${p.area || p.client}] — logged: ${p.logged || 0}h`;
      if (p.budgetHours) line += `, budget: ${p.budgetHours}h`;
      if (p.weeklyHours) line += `, weekly limit: ${p.weeklyHours}h`;
      if (p.archived) line += ' (archived)';
      if (p.description) line += `\n  ${p.description}`;
      return line;
    }).join('\n');
  }

  if (name === 'clients' || name === 'areas') {
    const d = await httpRequest('/areas');
    if (!d.length) return 'No areas found.';
    return d.map(c => {
      let line = `${c.area || c.name} — ${c.billing || 'no billing'}`;
      if (c.rate) line += ` @ €${c.rate}/h`;
      if (c.limitHours) line += `, limit: ${c.limitHours}h (${c.limitType || ''})`;
      return line;
    }).join('\n');
  }

  if (name === 'status') {
    const d = await httpRequest('/status');
    const todayBill = d.todayBillable != null && Math.abs(d.todayBillable - (d.todayTotal || 0)) > 0.001
      ? ` (${d.todayBillable}h fatt.)` : '';
    const weekBill = d.weekBillable != null && Math.abs(d.weekBillable - (d.weekTotal || 0)) > 0.001
      ? ` (${d.weekBillable}h fatt.)` : '';
    const lines = [
      `Today (${d.today}): ${d.todayTotal || 0}h${todayBill}`,
      `This week: ${d.weekTotal || 0}h${weekBill}`,
    ];
    if (d.alerts?.length) {
      lines.push('\nAlerts:');
      for (const a of d.alerts) lines.push(`  ⚠ ${a}`);
    } else {
      lines.push('\nNo budget alerts.');
    }
    return lines.join('\n');
  }

  if (name === 'log_hours') {
    const body = {
      project: args.project,
      hours: String(args.hours),
      slot: args.slot || undefined,
      date: args.date || undefined,
      add: !!args.add,
    };
    if (args.billable_hours != null) body.billableHours = String(args.billable_hours);
    const d = await httpRequest('/log', 'POST', body);
    const billPart = d.billableHours != null && Math.abs(d.billableHours - d.hours) > 0.001
      ? ` (${d.billableHours}h fatt.)` : '';
    return `${d.action}: ${d.hours}h${billPart} on "${d.project}" (${d.date}, ${d.slot || 'am'})`;
  }

  if (name === 'find_client' || name === 'find_area') {
    const d = await httpRequest(`/areas?search=${encodeURIComponent(args.name)}`);
    if (!d.length) return 'No matches found.';
    return d.map(c => `[${c.id}] ${c.name}`).join('\n');
  }

  if (name === 'find_project') {
    const d = await httpRequest(`/projects?search=${encodeURIComponent(args.name)}&all=1`);
    if (!d.length) return 'No matches found.';
    return d.map(p => {
      let line = `[${p.id}] ${p.project} (area: ${p.area || p.client})`;
      if (p.description) line += `\n  ${p.description}`;
      return line;
    }).join('\n');
  }

  if (name === 'rename_client' || name === 'rename_area') {
    const d = await httpRequest(`/areas/${encodeURIComponent(args.id)}`, 'PATCH', { name: args.name });
    return `Area '${d.oldAreaName || d.oldName}' renamed to '${d.newAreaName || d.newName}'.`;
  }

  if (name === 'rename_project') {
    const d = await httpRequest(`/projects/${encodeURIComponent(args.id)}`, 'PATCH', { name: args.name });
    return `Project renamed to '${d.name}'.`;
  }

  if (name === 'update_project') {
    const body = {};
    if (args.name !== undefined)        body.name = args.name;
    if (args.description !== undefined) body.description = args.description || null;
    if (args.budgetHours !== undefined) body.budgetHours = args.budgetHours || null;
    if (args.weeklyHours !== undefined) body.weeklyHours = args.weeklyHours || null;
    const d = await httpRequest(`/projects/${encodeURIComponent(args.id)}`, 'PATCH', body);
    const parts = [];
    if (args.name !== undefined)        parts.push(`name: '${d.name}'`);
    if (args.description !== undefined) parts.push(`description: ${d.description ? `'${d.description}'` : 'cleared'}`);
    if (args.budgetHours !== undefined) parts.push(`budget: ${d.budgetHours ? `${d.budgetHours}h` : 'cleared'}`);
    if (args.weeklyHours !== undefined) parts.push(`weekly limit: ${d.weeklyHours ? `${d.weeklyHours}h` : 'cleared'}`);
    return `Project '${d.name}' updated — ${parts.join(', ')}.`;
  }

  if (name === 'move_project') {
    const areaId = args.areaId || args.clientId;
    if (!areaId) throw new Error('areaId is required');
    const d = await httpRequest(`/projects/${encodeURIComponent(args.id)}`, 'PATCH', { areaId });
    return `Project '${d.name}' moved to area '${d.area || d.client}'.`;
  }

  if (name === 'create_project') {
    const areaId = args.areaId || args.clientId;
    if (!areaId) throw new Error('areaId is required');
    const body = {
      name: args.name,
      areaId,
      description: args.description ?? null,
      budgetHours: args.budgetHours ?? null,
      weeklyHours: args.weeklyHours ?? null,
    };
    const d = await httpRequest('/projects', 'POST', body);
    return `Project '${d.name}' created in area '${d.area || d.client}'.`;
  }

  if (name === 'delete_project') {
    const d = await httpRequest(`/projects/${encodeURIComponent(args.id)}`, 'DELETE');
    return `Project '${d.name}' deleted.`;
  }

  if (name === 'merge_project_entries') {
    const d = await httpRequest('/projects/merge', 'POST', { fromId: args.fromId, toId: args.toId });
    return `Merged ${d.count} entries from '${d.from}' into '${d.to}'. Project '${d.from}' deleted.`;
  }

  throw new Error(`Unknown tool: ${name}`);
}

// ── Request dispatcher ────────────────────────────────────────────────────────

async function handleRequest(msg) {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    respond(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'timebox', version: '1.0.0' },
    });
    return;
  }

  if (method === 'notifications/initialized') return;

  if (method === 'ping') {
    respond(id, {});
    return;
  }

  if (method === 'tools/list') {
    respond(id, { tools: TOOLS });
    return;
  }

  if (method === 'tools/call') {
    const { name, arguments: args = {} } = params;
    try {
      const text = await callTool(name, args);
      respond(id, { content: [{ type: 'text', text }] });
    } catch (err) {
      respond(id, {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true,
      });
    }
    return;
  }

  if (id !== undefined) {
    respondError(id, -32601, `Method not found: ${method}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', line => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try { msg = JSON.parse(trimmed); }
  catch { return; }
  handleRequest(msg).catch(err => {
    if (msg.id !== undefined) respondError(msg.id, -32603, err.message);
  });
});
