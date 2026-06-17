'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { createTestDb } = require('./helpers');
const { createHttpServer } = require('../http-server');

const MCP_SERVER = path.join(__dirname, '..', 'mcp-server.js');

function startMcp(port) {
  return spawn(process.execPath, [MCP_SERVER], {
    env: { ...process.env, TIMEBOX_PORT: String(port) },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
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
    proc.stderr.on('data', d => { /* suppress */ });
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
    assert.equal(tools.length, 19);
    const names = tools.map(t => t.name);
    for (const n of ['today', 'day_summary', 'day_free_capacity', 'todoist_imported_tasks', 'day_mismatches', 'week', 'projects', 'areas', 'status', 'log_hours',
      'find_area', 'find_project', 'rename_area', 'rename_project', 'update_project',
      'move_project', 'create_project', 'delete_project', 'merge_project_entries']) {
      assert.ok(names.includes(n), `missing tool: ${n}`);
    }
    for (const t of tools) {
      assert.ok(t.description, `${t.name} has no description`);
      assert.ok(t.inputSchema, `${t.name} has no inputSchema`);
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
    assert.ok(text.includes('Actually free (unallocated):'), 'contains actual free capacity');
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
    const lines = res.result.content[0].text.trim().split('\n').filter(Boolean);
    assert.equal(lines.length, 4);
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
