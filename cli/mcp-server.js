#!/usr/bin/env node
'use strict';

const http = require('node:http');
const readline = require('node:readline');
const { randomUUID } = require('node:crypto');

const PORT = parseInt(process.env.TIMEBOX_PORT || '37373', 10);
const SLOTS = ['am', 'pm', 'sera'];

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
    name: 'day_free_capacity',
    description: 'Compute daily free capacity after Timebox planning, tracked hours and imported Todoist tasks, separating truly unallocated capacity from capacity still reserved to planned areas without enough tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format (default: today)' },
      },
    },
  },
  {
    name: 'day_ready_blocks',
    description: 'List today\'s operational Timebox blocks that still lack enough ready Todoist intention, grouped by area and Timebox project to help turn reserved capacity into next actions.',
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
    name: 'day_mismatches',
    description: 'Find operational mismatches for one day between imported Todoist tasks and Timebox planning: unmapped tasks, tasks outside planned areas, capacity overflows, uncovered blocks and estimates beyond residual capacity.',
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
    description: 'List Timebox areas with their color, billing type and hourly rate.',
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
        slot: { type: 'string', enum: ['am', 'pm', 'sera'], description: 'Time slot (default: am)' },
        date: { type: 'string', description: 'Date in YYYY-MM-DD format (default: today)' },
        add: { type: 'boolean', description: 'Add to existing hours instead of replacing (default: false)' },
      },
    },
  },
  {
    name: 'find_area',
    description: 'Search Timebox areas by name (partial, case-insensitive). Returns id, name and color — use id with rename_area.',
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
  {
    name: 'get_recurring',
    description: 'Return all recurring template blocks (the weekly planning base). Each block has id, clientId, slot (am|pm), day (0=Mon…6=Sun), hours, position.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'set_recurring_slot',
    description: 'Replace all recurring blocks for a given day+slot combination. Use this to update the weekly template for one slot without touching the others.',
    inputSchema: {
      type: 'object',
      required: ['day', 'slot', 'blocks'],
      properties: {
        day:    { type: 'integer', minimum: 0, maximum: 6, description: '0=Mon … 6=Sun' },
        slot:   { type: 'string', enum: ['am', 'pm', 'sera'] },
        blocks: {
          type: 'array',
          description: 'New blocks for this slot (replaces existing ones). Pass [] to clear.',
          items: {
            type: 'object',
            required: ['clientId', 'hours'],
            properties: {
              clientId: { type: 'string' },
              hours:    { type: 'number' },
            },
          },
        },
      },
    },
  },
  {
    name: 'get_week_overrides',
    description: 'Return all overrides for a given week. weekKey is the ISO date of Monday (YYYY-MM-DD).',
    inputSchema: {
      type: 'object',
      required: ['weekKey'],
      properties: {
        weekKey: { type: 'string', description: 'Monday date of the target week, e.g. 2026-06-23' },
      },
    },
  },
  {
    name: 'set_week_override',
    description: 'Set an override for one slot of one day of a specific week, replacing the recurring template for that slot. weekKey is the Monday ISO date.',
    inputSchema: {
      type: 'object',
      required: ['weekKey', 'dayIndex', 'slot', 'blocks'],
      properties: {
        weekKey:  { type: 'string', description: 'Monday date of the target week, e.g. 2026-06-23' },
        dayIndex: { type: 'integer', minimum: 0, maximum: 6, description: '0=Mon … 6=Sun' },
        slot:     { type: 'string', enum: ['am', 'pm', 'sera'] },
        blocks: {
          type: 'array',
          description: 'Override blocks for this slot. Pass [] to mark the slot as explicitly empty.',
          items: {
            type: 'object',
            required: ['clientId', 'hours'],
            properties: {
              clientId: { type: 'string' },
              hours:    { type: 'number' },
            },
          },
        },
      },
    },
  },
  {
    name: 'clear_week_override',
    description: 'Remove the override for one slot of one day, reverting it to the recurring template. weekKey is the Monday ISO date.',
    inputSchema: {
      type: 'object',
      required: ['weekKey', 'dayIndex', 'slot'],
      properties: {
        weekKey:  { type: 'string', description: 'Monday date of the target week, e.g. 2026-06-23' },
        dayIndex: { type: 'integer', minimum: 0, maximum: 6, description: '0=Mon … 6=Sun' },
        slot:     { type: 'string', enum: ['am', 'pm', 'sera'] },
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
    for (const slot of SLOTS) {
      const entries = d.slots[slot];
      if (!entries.length) continue;
      lines.push(`${slot.toUpperCase()}:`);
      for (const e of entries) lines.push(`  ${e.project}: ${fmtBillable(e.hours, e.billableHours)}`);
    }
    const total = d.total || 0;
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

    for (const slot of SLOTS) {
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

  if (name === 'day_free_capacity') {
    const qs = args.date ? `?date=${encodeURIComponent(args.date)}` : '';
    const d = await httpRequest(`/day-free-capacity${qs}`);
    const lines = [
      `Date: ${d.date}`,
      `Planned: ${d.totals.plannedCapacity}h`,
      `Tracked: ${d.totals.trackedHours}h`,
      `Todoist estimated: ${d.totals.estimatedHours}h`,
      `Available after tracked + tasks: ${d.totals.availableAfterTrackedAndTasks}h`,
      `Reserved without tasks: ${d.totals.reservedWithoutTasksHours}h`,
      '',
    ];

    if (d.reservedWithoutTasks.length) {
      lines.push('Reserved capacity still without enough tasks:');
      for (const block of d.reservedWithoutTasks) {
        lines.push(`  ${block.slot.toUpperCase()} ${block.area}: reserved ${block.reservedWithoutTasksHours}h after ${block.coveredByTasksHours}h covered by tasks`);
      }
      lines.push('');
    } else {
      lines.push('Reserved capacity still without enough tasks: none');
      lines.push('');
    }

    if (d.tasksWithoutTimeboxProject.length) {
      lines.push('Todoist tasks without Timebox match:');
      for (const task of d.tasksWithoutTimeboxProject) {
        lines.push(`  ${task.title}: ${task.estimatedHours}h (${task.slot}, status: ${task.matchStatus})`);
      }
      lines.push('');
    }

    if (d.tasksOutsidePlannedArea.length) {
      lines.push('Todoist tasks outside planned area:');
      for (const task of d.tasksOutsidePlannedArea) {
        lines.push(`  ${task.title}: ${task.estimatedHours}h in ${task.slot.toUpperCase()} for ${task.area || '?'}`);
      }
      lines.push('');
    }

    if (d.tasksOverReservedCapacity.length) {
      lines.push('Todoist tasks over reserved capacity:');
      for (const task of d.tasksOverReservedCapacity) {
        lines.push(`  ${task.title}: ${task.estimatedHours}h in ${task.slot.toUpperCase()} for ${task.area || '?'}; reserved before task ${task.availableBeforeTask}h, overflow ${task.overflowHours}h`);
      }
    }

    return lines.join('\n').trimEnd();
  }

  if (name === 'day_ready_blocks') {
    const qs = args.date ? `?date=${encodeURIComponent(args.date)}` : '';
    const d = await httpRequest(`/day-ready-blocks${qs}`);
    const lines = [`Date: ${d.date}`];
    if (d.syncedAt) lines.push(`Synced: ${d.syncedAt}`);

    if (!d.groups.length) {
      lines.push('Blocks needing ready Todoist tasks: none');
      return lines.join('\n');
    }

    lines.push(`Blocks needing ready Todoist tasks: ${d.groups.length}`);
    lines.push('');

    for (const group of d.groups) {
      lines.push(
        `${group.slot.toUpperCase()} ${group.area}: available ${group.availableHours}h, Todoist estimated ${group.estimatedHours}h, missing ${group.missingHours}h`
      );
      if (!group.projects.length) {
        lines.push('  projects: none');
        lines.push('');
        continue;
      }

      for (const project of group.projects) {
        if (!project.hasReadyTasks) {
          lines.push(`  ${project.project}: no ready tasks`);
          continue;
        }
        const taskTitles = project.tasks.map(task => `${task.title} (${task.estimatedHours}h)`).join(', ');
        lines.push(`  ${project.project}: ${project.taskCount} task(s), ${project.estimatedHours}h${taskTitles ? ` -> ${taskTitles}` : ''}`);
      }
      lines.push('');
    }

    return lines.join('\n').trimEnd();
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

    for (const slot of SLOTS) {
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

  if (name === 'day_mismatches') {
    const qs = args.date ? `?date=${encodeURIComponent(args.date)}` : '';
    const d = await httpRequest(`/day-mismatches${qs}`);
    const lines = [
      `Date: ${d.date}`,
      `Planned: ${d.totals.plannedCapacity}h`,
      `Tracked: ${d.totals.trackedHours}h`,
      `Residual: ${d.totals.residualCapacity}h`,
      `Todoist estimated: ${d.totals.estimatedHours}h`,
      '',
    ];

    const countTotal = Object.values(d.counts).reduce((sum, count) => sum + count, 0);
    if (!countTotal) {
      lines.push('Mismatches: none');
      return lines.join('\n');
    }

    const mismatches = d.mismatches;
    if (mismatches.tasksWithoutTimeboxProject.length) {
      lines.push('Todoist tasks without Timebox project:');
      for (const task of mismatches.tasksWithoutTimeboxProject) {
        const project = task.todoistProject ? ` | Todoist: ${task.todoistProject}` : '';
        lines.push(`  ${task.title}: ${task.estimatedHours}h (${task.slot}, status: ${task.matchStatus})${project}`);
      }
      lines.push('');
    }

    if (mismatches.tasksOutsidePlannedArea.length) {
      lines.push('Tasks outside planned area:');
      for (const task of mismatches.tasksOutsidePlannedArea) {
        lines.push(`  ${task.title}: ${task.estimatedHours}h in ${task.slot.toUpperCase()} for ${task.area || '?'} (${task.project || '?'})`);
      }
      lines.push('');
    }

    if (mismatches.tasksOverBlockCapacity.length) {
      lines.push('Tasks over block capacity:');
      for (const task of mismatches.tasksOverBlockCapacity) {
        lines.push(`  ${task.title}: ${task.estimatedHours}h in ${task.slot.toUpperCase()} for ${task.area || '?'}; available ${task.availableBeforeTask}h, overflow ${task.overflowHours}h`);
      }
      lines.push('');
    }

    if (mismatches.blocksWithoutReadyTasks.length) {
      lines.push('Blocks without enough ready tasks:');
      for (const block of mismatches.blocksWithoutReadyTasks) {
        lines.push(`  ${block.slot.toUpperCase()} ${block.area}: available ${block.availableHours}h, Todoist estimated ${block.estimatedHours}h, missing ${block.missingHours}h`);
      }
      lines.push('');
    }

    if (mismatches.estimatedBeyondResidualCapacity) {
      const cap = mismatches.estimatedBeyondResidualCapacity;
      lines.push(`Estimated over residual capacity: ${cap.estimatedHours}h estimated vs ${cap.residualCapacity}h residual, overflow ${cap.overflowHours}h`);
    }

    return lines.join('\n').trimEnd();
  }

  if (name === 'week') {
    const offset = args.offset ?? 0;
    const d = await httpRequest(`/week?offset=${offset}`);
    const lines = [`Week ${d.monday} – ${d.sunday}\n`];
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
      let line = `${c.area || c.name}`;
      if (c.color) line += ` (${c.color})`;
      line += ` — ${c.billing || 'no billing'}`;
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
    return d.map(c => {
      let line = `[${c.id}] ${c.name}`;
      if (c.color) line += ` (${c.color})`;
      return line;
    }).join('\n');
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

  if (name === 'get_recurring') {
    const blocks = await httpRequest('/recurring');
    if (!blocks.length) return 'No recurring blocks defined.';
    const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const clients = await httpRequest('/areas');
    const clientMap = Object.fromEntries(clients.map(c => [c.id, c.name]));
    const lines = [];
    for (let day = 0; day <= 6; day++) {
      for (const slot of SLOTS) {
        const dayBlocks = blocks.filter(b => b.day === day && b.slot === slot).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
        if (dayBlocks.length) {
          lines.push(`${DAYS[day]} ${slot.toUpperCase()}: ${dayBlocks.map(b => `${clientMap[b.clientId] ?? b.clientId} ${b.hours}h`).join(', ')}`);
        }
      }
    }
    return lines.join('\n');
  }

  if (name === 'set_recurring_slot') {
    const { day, slot, blocks } = args;
    const existing = await httpRequest('/recurring');
    const toDelete = existing.filter(b => b.day === day && b.slot === slot);
    for (const b of toDelete) await httpRequest(`/recurring/${b.id}`, 'DELETE');
    const created = [];
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const result = await httpRequest('/recurring', 'POST', { clientId: b.clientId, slot, day, hours: b.hours, position: i });
      created.push(result);
    }
    const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return `${DAYS[day]} ${slot.toUpperCase()} template updated: ${created.length} block(s) set (${toDelete.length} removed).`;
  }

  if (name === 'get_week_overrides') {
    const overrides = await httpRequest(`/overrides?week=${encodeURIComponent(args.weekKey)}`);
    if (!overrides.length) return `No overrides for week ${args.weekKey} (using template).`;
    const clients = await httpRequest('/areas');
    const clientMap = Object.fromEntries(clients.map(c => [c.id, c.name]));
    const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const lines = [`Week ${args.weekKey} overrides:`];
    for (const o of overrides) {
      const blockSummary = o.blocks.length ? o.blocks.map(b => `${clientMap[b.clientId] ?? b.clientId} ${b.hours}h`).join(', ') : '(empty)';
      lines.push(`  ${DAYS[o.dayIndex] ?? o.dayIndex} ${o.slot.toUpperCase()}: ${blockSummary}`);
    }
    return lines.join('\n');
  }

  if (name === 'set_week_override') {
    const { weekKey, dayIndex, slot, blocks } = args;
    const blocksWithIds = blocks.map(b => ({ id: randomUUID(), clientId: b.clientId, hours: b.hours }));
    await httpRequest('/overrides', 'POST', { weekKey, dayIndex, slot, blocks: blocksWithIds });
    const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const summary = blocks.length ? blocks.map(b => `${b.clientId} ${b.hours}h`).join(', ') : '(empty slot)';
    return `Override set for week ${weekKey}, ${DAYS[dayIndex]} ${slot.toUpperCase()}: ${summary}`;
  }

  if (name === 'clear_week_override') {
    const { weekKey, dayIndex, slot } = args;
    await httpRequest(`/overrides?week=${encodeURIComponent(weekKey)}&day=${dayIndex}&slot=${slot}`, 'DELETE');
    const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return `Override removed for week ${weekKey}, ${DAYS[dayIndex]} ${slot.toUpperCase()}. Now using recurring template.`;
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
