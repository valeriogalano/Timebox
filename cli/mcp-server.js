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
    description: 'Get hours logged in Timebox for a given day, one line per project with its area and entry id.',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format (default: today)' },
      },
    },
  },
  {
    name: 'day_summary',
    description: 'Get the daily Timebox summary for a day: planned blocks per slot from template/override, the hours covering each slot, the tracked entries of the day (one per project), residual capacity and extra work. Logged hours have no slot: "covered" spreads the area\'s hours of the whole day over its blocks in order (how much of the plan is covered).',
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
    description: 'List the operational Timebox blocks of a day (today by default) that still lack enough ready Todoist intention, grouped by area and Timebox project to help turn reserved capacity into next actions.',
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
    description: 'Get the weekly summary of logged hours in Timebox, day by day, with each day\'s entries.',
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
    name: 'entries',
    description: 'List the single logged entries (the Registro screen) in a date range, with optional area and project filters, plus worked and billable totals by area and by project. Each entry shows its id. Use it to review several weeks in one call.',
    inputSchema: {
      type: 'object',
      required: ['from'],
      properties: {
        from: { type: 'string', description: 'First date, YYYY-MM-DD' },
        to: { type: 'string', description: 'Last date, YYYY-MM-DD (default: today)' },
        area: { type: 'string', description: 'Filter by area name (partial, case-insensitive)' },
        project: { type: 'string', description: 'Filter by project name (partial, case-insensitive)' },
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
    description: 'Get a quick overview: hours logged today and this week, alerts on project budgets, project weekly limits and area limits, and the current week\'s area targets: every area whose gap (target − done − blocks left) is beyond 0.5h or 10% of its target, whichever is larger, an area whose target is above its weekly limit, and a closed area with a target above zero.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'log_hours',
    description: 'Log hours on a Timebox project. There is one entry per project and day: it replaces that day\'s hours unless add=true.',
    inputSchema: {
      type: 'object',
      required: ['project', 'hours'],
      properties: {
        project: { type: 'string', description: 'Project name (partial match, must be unambiguous)' },
        hours: { type: 'string', description: 'Hours to log, 0 to 24 — "2", "2.5", "2:30" or "2h 30m". "0" deletes the entry; any other text is an error.' },
        billable_hours: { type: 'string', description: 'Billable hours override (optional, hourly areas only: ignored elsewhere). Same format as hours. When omitted, the billable hours already stored on that entry are kept; on a new entry they equal the hours.' },
        date: { type: 'string', description: 'Date in YYYY-MM-DD format (default: today)' },
        add: { type: 'boolean', description: 'Add to existing hours instead of replacing (default: false)' },
      },
    },
  },
  {
    name: 'plan_vs_tracked',
    description: 'Compare the plan with the real day, per day, slot and area, over a date range: planned hours (template + overrides) and hours covered by block filling (how much of the plan is covered). Per day: hours worked and extra hours outside the plan. Plus range totals.',
    inputSchema: {
      type: 'object',
      required: ['from'],
      properties: {
        from: { type: 'string', description: 'First date, YYYY-MM-DD' },
        to: { type: 'string', description: 'Last date, YYYY-MM-DD (default: from). At most 366 days.' },
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
    name: 'update_area',
    description: 'Rename a Timebox area and/or change its color. At least one of name/color is required. Use find_area to get the id first. Valid color keys (Todoist palette): berry_red, red, orange, yellow, olive_green, lime_green, green, mint_green, teal, sky_blue, light_blue, blue, grape, violet, lavender, magenta, salmon, charcoal, grey, taupe. A hex from the same palette (case-insensitive) also works.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Area id' },
        name: { type: 'string', description: 'New name' },
        color: { type: 'string', description: 'Color key (e.g. "lavender") or hex from the Todoist palette' },
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
    description: 'Update one or more fields of a Timebox project (name, description, budgetHours, weeklyHours, fixedPrice, archived). Use find_project to get the id first. Only include the fields you want to change. Archiving keeps logged hours and hides the project from active lists and Todoist import matching; use archived: false to unarchive.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Project id' },
        name: { type: 'string', description: 'New project name' },
        description: { type: 'string', description: 'New description (pass empty string to clear it)' },
        budgetHours: { type: 'number', description: 'New total budget in hours (pass 0 to clear)' },
        weeklyHours: { type: 'number', description: 'New weekly hours limit (pass 0 to clear)' },
        fixedPrice: { type: 'number', description: 'New fixed price in euro for a project sold at a flat fee (pass 0 to clear)' },
        archived: { type: 'boolean', description: 'Archive (true) or unarchive (false) the project' },
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
        fixedPrice: { type: 'number', description: 'Fixed price in euro, for a project sold at a flat fee (optional)' },
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
    description: 'Move all logged entries from one project into another (summing hours and billable hours on the same day; a merged entry is billed only if both were). Their Todoist import records move along. By default the source project is then DELETED and this is not reversible. Pass deleteSource: false to keep the source project (left at 0h) when you want to preserve a record of it — archive it afterwards with update_project.',
    inputSchema: {
      type: 'object',
      required: ['fromId', 'toId'],
      properties: {
        fromId: { type: 'string', description: 'Source project id (deleted unless deleteSource is false)' },
        toId: { type: 'string', description: 'Destination project id' },
        deleteSource: { type: 'boolean', description: 'Delete the source project after moving its entries (default: true)' },
      },
    },
  },
  {
    name: 'get_recurring',
    description: 'Return all recurring template blocks (the weekly planning base). Each block has id, clientId, slot (am|pm|sera), day (0=Mon…6=Sun), hours, position.',
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
              clientId: { type: 'string', description: 'Area id (from areas or find_area), not the area name' },
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
              clientId: { type: 'string', description: 'Area id (from areas or find_area), not the area name' },
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
  {
    name: 'week_targets',
    description: 'Weekly target per area and the gap on it, for one week. For each area: target (the last one set this week; the area\'s template hours, i.e. the sum of its recurring blocks, when none was set), the Monday target (the first one set), hours done up to today, blocks left (today: planned minus done, never below zero; later days: their whole plan, weekend included) and gap = target − done − blocks left. A positive gap means hours still missing, a negative one hours beyond the target. Also warns when a target is above the area\'s weekly limit and when a closed area has a target above zero. It only reports: it does not suggest what to move.',
    inputSchema: {
      type: 'object',
      properties: {
        weekKey: { type: 'string', description: 'Monday date of the week, e.g. 2026-11-02 (default: the current week)' },
      },
    },
  },
  {
    name: 'set_week_target',
    description: 'Set the weekly target of one area, in hours. Targets are append-only: every change is kept, the first one of the week is the Monday target and the last one is the target the gap is measured on. Setting the same number as the current target stores nothing. A target above the area\'s weekly limit is accepted and reported as a warning.',
    inputSchema: {
      type: 'object',
      required: ['areaId', 'hours'],
      properties: {
        areaId:  { type: 'string', description: 'Area id (from areas or find_area), not the area name' },
        hours:   { type: 'number', minimum: 0, description: 'Target hours for the week' },
        weekKey: { type: 'string', description: 'Monday date of the week, e.g. 2026-11-02 (default: the current week)' },
      },
    },
  },
];

// ── Tool handlers ─────────────────────────────────────────────────────────────

const r2 = h => Math.round(h * 100) / 100;

function formatWeekTargets(d) {
  const lines = [`Week ${d.weekKey} targets (today ${d.today}); gap = target − done − blocks left`];
  for (const a of d.areas) {
    const source = a.targetSet ? (Math.abs(a.mondayTarget - a.target) > 0.001 ? `set, Monday ${r2(a.mondayTarget)}h` : 'set') : 'template';
    lines.push(`  [${a.areaId}] ${a.area} (${a.status}): target ${r2(a.target)}h (${source}), done ${r2(a.done)}h, blocks left ${r2(a.remaining)}h, gap ${a.gap > 0 ? '+' : ''}${r2(a.gap)}h`);
  }
  const t = d.totals;
  lines.push(`Total: target ${r2(t.target)}h, done ${r2(t.done)}h, blocks left ${r2(t.remaining)}h, gap ${t.gap > 0 ? '+' : ''}${r2(t.gap)}h`);
  const warnings = (d.alerts || []).filter(a => a.kind !== 'area-gap');
  if (warnings.length) {
    lines.push('', 'Warnings:');
    for (const w of warnings) lines.push(`  ⚠ ${w.label}`);
  }
  return lines.join('\n');
}

async function callTool(name, args) {
  if (name === 'today') {
    const qs = args.date ? `?date=${encodeURIComponent(args.date)}` : '';
    const d = await httpRequest(`/today${qs}`);
    const lines = [`Date: ${d.date}\n`];
    for (const e of d.entries) lines.push(`  ${e.project} [${e.area}]: ${fmtBillable(e.hours, e.isBillable ? e.billableHours : null)} (id ${e.id})`);
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
      lines.push(`${slot.toUpperCase()} [${slotData.source}]: planned ${slotData.plannedCapacity}h, covered by tracked hours ${slotData.trackedHours}h`);
      if (slotData.plannedBlocks.length) {
        for (const block of slotData.plannedBlocks) {
          lines.push(`  plan ${block.area}: ${block.hours}h`);
        }
      } else {
        lines.push('  plan none');
      }

      lines.push('');
    }

    lines.push('Tracked entries:');
    if (d.trackedEntries.length) {
      for (const entry of d.trackedEntries) {
        lines.push(`  ${entry.project} [${entry.area}]: ${fmtBillable(entry.hours, entry.billableHours)} (id ${entry.id})`);
      }
    } else {
      lines.push('  none');
    }
    lines.push('');

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
      for (const e of day.entries || []) lines.push(`    ${e.project} [${e.area}]: ${e.hours}h (id ${e.id})`);
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
      if (p.billable != null && Math.abs(p.billable - (p.logged || 0)) > 0.001) line += `, billable: ${p.billable}h`;
      if (p.budgetHours) line += `, budget: ${p.budgetHours}h`;
      if (p.weeklyHours) line += `, weekly limit: ${p.weeklyHours}h`;
      if (p.fixedPrice) line += `, fixed price: ${p.fixedPrice}€`;
      if (p.effectiveRate != null) line += `, effective rate: ${p.effectiveRate}€/h`;
      if (p.archived) line += ' (archived)';
      if (p.description) line += `\n  ${p.description}`;
      return line;
    }).join('\n');
  }

  if (name === 'entries') {
    const params = new URLSearchParams();
    for (const key of ['from', 'to', 'area', 'project']) if (args[key]) params.set(key, args[key]);
    const d = await httpRequest(`/entries?${params}`);
    if (!d.entries.length) return `No entries from ${d.from} to ${d.to}.`;
    return [
      `Entries from ${d.from} to ${d.to}:`,
      ...d.entries.map(e => `${e.date}  ${e.project} [${e.area}]: ${fmtBillable(e.hours, e.billableHours)} (id ${e.id})`),
      '',
      'By area:',
      ...d.byArea.map(a => `  ${a.area}: ${fmtBillable(a.hours, a.billableHours)}`),
      '',
      'By project:',
      ...d.byProject.map(p => `  ${p.project} [${p.area}]: ${fmtBillable(p.hours, p.billableHours)}`),
      '',
      `Total: ${d.total}h`,
    ].join('\n');
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
      for (const a of d.alerts) lines.push(`  ⚠ ${a.label ?? a}`);
    } else {
      lines.push('\nNo alerts.');
    }
    if (d.gapAlerts?.length) {
      lines.push('\nWeek targets (gap = target − done − blocks left):');
      for (const a of d.gapAlerts) lines.push(`  ⚠ ${a.label}`);
    }
    return lines.join('\n');
  }

  if (name === 'log_hours') {
    const body = {
      project: args.project,
      hours: String(args.hours),
      date: args.date || undefined,
      add: !!args.add,
    };
    if (args.billable_hours != null) body.billableHours = String(args.billable_hours);
    const d = await httpRequest('/log', 'POST', body);
    const billPart = d.billableHours != null && Math.abs(d.billableHours - d.hours) > 0.001
      ? ` (${d.billableHours}h fatt.)` : '';
    if (d.action === 'noop') return `noop: no entry to delete on "${d.project}" (${d.date})`;
    if (d.action === 'deleted') return `deleted: entry of "${d.project}" (${d.date})`;
    return `${d.action}: ${d.hours}h${billPart} on "${d.project}" (${d.date})`;
  }

  if (name === 'plan_vs_tracked') {
    const params = new URLSearchParams({ from: args.from });
    if (args.to) params.set('to', args.to);
    const d = await httpRequest(`/plan-vs-tracked?${params}`);
    const lines = [`Plan vs tracked from ${d.from} to ${d.to}`, ''];
    for (const day of d.days) {
      lines.push(`${day.date}: planned ${day.plannedHours}h, covered ${day.coveredHours}h, worked ${day.trackedHours}h, extra ${day.extraHours}h`);
      for (const s of day.slots) {
        if (!s.areas.length) continue;
        lines.push(`  ${s.slot.toUpperCase()}: planned ${s.plannedHours}h, covered ${s.coveredHours}h`);
        for (const a of s.areas) {
          lines.push(`    ${a.area}: planned ${a.plannedHours}h, covered ${a.coveredHours}h`);
        }
      }
      for (const x of day.extra) lines.push(`  extra ${x.area}: ${x.hours}h`);
    }
    const t = d.totals;
    lines.push('', `Totals: planned ${t.plannedHours}h, covered ${t.coveredHours}h, worked ${t.trackedHours}h, extra ${t.extraHours}h`);
    for (const slot of SLOTS) {
      const s = t.bySlot[slot];
      lines.push(`  ${slot.toUpperCase()}: planned ${s.plannedHours}h, covered ${s.coveredHours}h`);
    }
    return lines.join('\n');
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

  if (name === 'update_area') {
    if (args.name === undefined && args.color === undefined) throw new Error('name or color is required');
    const body = {};
    if (args.name !== undefined)  body.name = args.name;
    if (args.color !== undefined) body.color = args.color;
    const d = await httpRequest(`/areas/${encodeURIComponent(args.id)}`, 'PATCH', body);
    const parts = [];
    if (args.name !== undefined)  parts.push(`name: '${d.newAreaName || d.newName}'`);
    if (args.color !== undefined) parts.push(`color: ${d.color}`);
    return `Area updated — ${parts.join(', ')}.`;
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
    if (args.fixedPrice !== undefined)  body.fixedPrice = args.fixedPrice || null;
    if (args.archived !== undefined)    body.archived = args.archived;
    const d = await httpRequest(`/projects/${encodeURIComponent(args.id)}`, 'PATCH', body);
    const parts = [];
    if (args.name !== undefined)        parts.push(`name: '${d.name}'`);
    if (args.description !== undefined) parts.push(`description: ${d.description ? `'${d.description}'` : 'cleared'}`);
    if (args.budgetHours !== undefined) parts.push(`budget: ${d.budgetHours ? `${d.budgetHours}h` : 'cleared'}`);
    if (args.weeklyHours !== undefined) parts.push(`weekly limit: ${d.weeklyHours ? `${d.weeklyHours}h` : 'cleared'}`);
    if (args.fixedPrice !== undefined)  parts.push(`fixed price: ${d.fixedPrice ? `${d.fixedPrice}€` : 'cleared'}`);
    if (args.archived !== undefined)    parts.push(d.archived ? 'archived' : 'unarchived');
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
      fixedPrice: args.fixedPrice ?? null,
    };
    const d = await httpRequest('/projects', 'POST', body);
    return `Project '${d.name}' created in area '${d.area || d.client}'.`;
  }

  if (name === 'delete_project') {
    const d = await httpRequest(`/projects/${encodeURIComponent(args.id)}`, 'DELETE');
    return `Project '${d.name}' deleted.`;
  }

  if (name === 'merge_project_entries') {
    const d = await httpRequest('/projects/merge', 'POST', { fromId: args.fromId, toId: args.toId, deleteSource: args.deleteSource });
    return `Merged ${d.count} entries from '${d.from}' into '${d.to}'. Project '${d.from}' ${d.sourceDeleted ? 'deleted' : 'kept (now at 0h)'}.`;
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
    const { removed, created } = await httpRequest('/recurring/slot', 'PUT', { day, slot, blocks });
    const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return `${DAYS[day]} ${slot.toUpperCase()} template updated: ${created.length} block(s) set (${removed} removed).`;
  }

  if (name === 'get_week_overrides') {
    const overrides = await httpRequest(`/overrides?week=${encodeURIComponent(args.weekKey)}`);
    if (!overrides.length) return `No overrides for week ${args.weekKey} (using template).`;
    const clients = await httpRequest('/areas');
    const clientMap = Object.fromEntries(clients.map(c => [c.id, c.name]));
    const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const lines = [`Week ${args.weekKey} overrides:`];
    for (const o of overrides) {
      const blockSummary = o.blocks.length ? o.blocks.map(b => `${clientMap[b.clientId] ?? `? (${b.clientId})`} ${b.hours}h`).join(', ') : '(empty)';
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

  if (name === 'week_targets') {
    const qs = args.weekKey ? `?week=${encodeURIComponent(args.weekKey)}` : '';
    return formatWeekTargets(await httpRequest(`/targets${qs}`));
  }

  if (name === 'set_week_target') {
    const weekKey = args.weekKey || (await httpRequest('/targets')).weekKey;
    const r = await httpRequest('/targets', 'POST', { weekKey, areaId: args.areaId, hours: Number(args.hours) });
    const head = r.createdAt ? `Target set to ${r.hours}h for week ${weekKey}.` : `Target already ${r.hours}h for week ${weekKey}: nothing stored.`;
    return `${head}\n\n${formatWeekTargets(await httpRequest(`/targets?week=${encodeURIComponent(weekKey)}`))}`;
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
