'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { createTestDb } = require('./helpers');
const { createHttpServer } = require('../http-server');
const { setTodoistCache } = require('../../db/queries');

const MCP_SERVER = path.join(__dirname, '..', 'mcp-server.js');

function startMcp(port) {
  const proc = spawn(process.execPath, [MCP_SERVER], {
    env: { ...process.env, TIMEBOX_PORT: String(port) },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  proc.stderr.resume();
  return proc;
}

function rpc(proc, msg) {
  return new Promise((resolve, reject) => {
    const line = JSON.stringify(msg) + '\n';
    let buf = '';

    function onData(chunk) {
      buf += chunk;
      const nl = buf.indexOf('\n');
      if (nl === -1) return;
      proc.stdout.off('data', onData);
      try { resolve(JSON.parse(buf.slice(0, nl))); }
      catch (e) { reject(e); }
    }

    proc.stdout.on('data', onData);
    proc.stdin.write(line);
  });
}

let seq = 0;
function msg(method, params) {
  return { jsonrpc: '2.0', id: ++seq, method, params };
}

describe('MCP server', () => {
  let httpServer;
  let httpPort;
  let mcp;

  before(() => new Promise(resolve => {
    createTestDb();
    httpServer = createHttpServer();
    httpServer.listen(0, '127.0.0.1', () => {
      httpPort = httpServer.address().port;
      mcp = startMcp(httpPort);
      resolve();
    });
  }));

  after(() => new Promise(resolve => {
    mcp.kill();
    httpServer.close(resolve);
  }));

  it('initialize → protocolVersion and serverInfo', async () => {
    const res = await rpc(mcp, msg('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '0' },
    }));
    assert.equal(res.result.protocolVersion, '2024-11-05');
    assert.equal(res.result.serverInfo.name, 'timebox');
    assert.ok(res.result.capabilities.tools !== undefined);
  });

  it('tools/list → tools with required fields', async () => {
    const res = await rpc(mcp, msg('tools/list', {}));
    const { tools } = res.result;
    assert.ok(Array.isArray(tools));
    assert.equal(tools.length, 25);
    const names = tools.map(t => t.name);
    for (const n of ['today', 'day_summary', 'day_free_capacity', 'day_ready_blocks', 'todoist_imported_tasks', 'day_mismatches', 'week', 'projects', 'areas', 'status', 'log_hours',
      'find_area', 'find_project', 'rename_area', 'rename_project', 'update_project',
      'move_project', 'create_project', 'delete_project', 'merge_project_entries',
      'get_recurring', 'set_recurring_slot', 'get_week_overrides', 'set_week_override', 'clear_week_override']) {
      assert.ok(names.includes(n), `missing tool: ${n}`);
    }
    for (const t of tools) {
      assert.ok(t.description, `${t.name} has no description`);
      assert.ok(t.inputSchema, `${t.name} has no inputSchema`);
    }
  });

  it('README MCP section documents every exposed tool', async () => {
    const res = await rpc(mcp, msg('tools/list', {}));
    const toolNames = res.result.tools.map(tool => tool.name);
    const readme = fs.readFileSync(path.join(__dirname, '..', '..', 'README.md'), 'utf8');
    const mcpSection = readme.split('## MCP Server')[1]?.split('## Build and Packaging')[0] || '';

    assert.ok(mcpSection.length > 0, 'README MCP section should exist');
    for (const name of toolNames) {
      assert.ok(
        mcpSection.includes('`' + name + '`'),
        `README MCP section is missing tool documentation for: ${name}`
      );
    }
  });

  it('tools/call today → text with date and total', async () => {
    const res = await rpc(mcp, msg('tools/call', {
      name: 'today',
      arguments: { date: '2020-01-01' },
    }));
    const text = res.result.content[0].text;
    assert.ok(text.includes('2020-01-01'), 'contains date');
    assert.ok(text.includes('Total:'), 'contains total');
  });

  it('tools/call day_summary → text with planned, residual and extra sections', async () => {
    const res = await rpc(mcp, msg('tools/call', {
      name: 'day_summary',
      arguments: { date: '2020-01-01' },
    }));
    const text = res.result.content[0].text;
    assert.ok(text.includes('Date: 2020-01-01'), 'contains date');
    assert.ok(text.includes('Planned:'), 'contains planned');
    assert.ok(text.includes('Residual:'), 'contains residual');
    assert.ok(text.includes('Extra by area:'), 'contains extra section');
  });

  it('tools/call day_free_capacity → text with free vs reserved capacity distinction', async () => {
    const res = await rpc(mcp, msg('tools/call', {
      name: 'day_free_capacity',
      arguments: { date: '2020-01-01' },
    }));
    const text = res.result.content[0].text;
    assert.ok(text.includes('Date: 2020-01-01'), 'contains date');
    assert.ok(text.includes('Available after tracked + tasks:'), 'contains available capacity');
    assert.ok(text.includes('Reserved without tasks:'), 'contains reserved capacity');
  });

  it('tools/call day_ready_blocks → text with uncovered blocks grouped by project', async () => {
    setTodoistCache('2020-01-08', [
      { id: 'rb1', projectId: 'p4', content: 'Sensor triage', hours: 1, slot: 'am' },
      { id: 'rb2', content: 'Inbox follow-up', hours: 1, slot: 'pm', todoistProjectName: 'Inbox' },
    ], '2026-06-17T09:00:00.000Z');

    const res = await rpc(mcp, msg('tools/call', {
      name: 'day_ready_blocks',
      arguments: { date: '2020-01-08' },
    }));
    const text = res.result.content[0].text;
    assert.ok(text.includes('Date: 2020-01-08'), 'contains date');
    assert.ok(text.includes('GreenTech SA'), 'contains first area');
    assert.ok(text.includes('Dashboard MVP: 1 task(s), 1h'), 'contains project with ready task');
    assert.ok(text.includes('Mobile App: no ready tasks'), 'contains sibling project without tasks');
    assert.ok(text.includes('Brand Identity: no ready tasks'), 'contains area with no tasks');
  });

  it('tools/call todoist_imported_tasks → text with imported task details', async () => {
    const today = new Date();
    const monday = new Date(today);
    const dow = monday.getDay();
    monday.setDate(monday.getDate() - (dow === 0 ? 6 : dow - 1) - 7 + 1);
    const seededDate = monday.toISOString().slice(0, 10);

    const res = await rpc(mcp, msg('tools/call', {
      name: 'todoist_imported_tasks',
      arguments: { date: seededDate },
    }));
    const text = res.result.content[0].text;
    assert.ok(text.includes(`Date: ${seededDate}`), 'contains date');
    assert.ok(text.includes('Tasks: 2'), 'contains task count');
    assert.ok(text.includes('Setup endpoint autenticazione'), 'contains imported task title');
    assert.ok(text.includes('Todoist: API Integration'), 'contains Todoist project');
    assert.ok(text.includes('status: matched'), 'contains match status');
  });

  it('tools/call day_mismatches → text with mismatch sections', async () => {
    const today = new Date();
    const monday = new Date(today);
    const dow = monday.getDay();
    monday.setDate(monday.getDate() - (dow === 0 ? 6 : dow - 1) - 7 + 1);
    const seededDate = monday.toISOString().slice(0, 10);

    const res = await rpc(mcp, msg('tools/call', {
      name: 'day_mismatches',
      arguments: { date: seededDate },
    }));
    const text = res.result.content[0].text;
    assert.ok(text.includes(`Date: ${seededDate}`), 'contains date');
    assert.ok(text.includes('Todoist estimated:'), 'contains estimated total');
    assert.ok(text.includes('Tasks over block capacity:'), 'contains capacity section');
    assert.ok(text.includes('Blocks without enough ready tasks:'), 'contains uncovered blocks section');
  });

  it('tools/call week → text with week range', async () => {
    const res = await rpc(mcp, msg('tools/call', { name: 'week', arguments: {} }));
    const text = res.result.content[0].text;
    assert.ok(text.includes('Week'), 'contains Week header');
    assert.ok(text.includes('Total:'), 'contains total');
  });

  it('tools/call projects → lists projects with area', async () => {
    const res = await rpc(mcp, msg('tools/call', { name: 'projects', arguments: {} }));
    const text = res.result.content[0].text;
    assert.ok(text.length > 0);
    assert.ok(text.includes('['), 'contains area bracket');
  });

  it('tools/call areas → 4 seed areas', async () => {
    const res = await rpc(mcp, msg('tools/call', { name: 'areas', arguments: {} }));
    const text = res.result.content[0].text;
    const lines = text.trim().split('\n').filter(Boolean);
    assert.equal(lines.length, 4);
    assert.ok(text.includes('#'), 'contains area colors');
  });

  it('tools/call find_area → includes color', async () => {
    const res = await rpc(mcp, msg('tools/call', {
      name: 'find_area',
      arguments: { name: 'acme' },
    }));
    const text = res.result.content[0].text;
    assert.ok(text.includes('Acme Corp'));
    assert.ok(text.includes('#'), 'contains area color');
  });

  it('tools/call status → today and week totals', async () => {
    const res = await rpc(mcp, msg('tools/call', { name: 'status', arguments: {} }));
    const text = res.result.content[0].text;
    assert.ok(text.includes('Today'), 'contains Today');
    assert.ok(text.includes('This week'), 'contains This week');
  });

  it('tools/call log_hours → logs and returns action', async () => {
    const res = await rpc(mcp, msg('tools/call', {
      name: 'log_hours',
      arguments: { project: 'website', hours: '1', date: '2025-07-01' },
    }));
    const text = res.result.content[0].text;
    assert.ok(text.includes('website') || text.toLowerCase().includes('website'), 'contains project');
    assert.ok(!res.result.isError, 'not an error');
  });

  it('tools/call log_hours with billable_hours → persists override and renders divergence', async () => {
    const res = await rpc(mcp, msg('tools/call', {
      name: 'log_hours',
      arguments: { project: 'website', hours: '4', billable_hours: '3', date: '2025-08-15' },
    }));
    assert.ok(!res.result.isError, 'not an error');
    const text = res.result.content[0].text;
    assert.ok(text.includes('fatt.'), `expected text to mention 'fatt.' but got: ${text}`);
  });

  it('tools/call log_hours with unknown project → isError true', async () => {
    const res = await rpc(mcp, msg('tools/call', {
      name: 'log_hours',
      arguments: { project: 'NonexistentXYZ999', hours: '1' },
    }));
    assert.ok(res.result.isError, 'should be isError');
    assert.ok(res.result.content[0].text.startsWith('Error:'));
  });

  it('unknown method → error -32601', async () => {
    const res = await rpc(mcp, msg('unknownMethod', {}));
    assert.equal(res.error.code, -32601);
  });
});
