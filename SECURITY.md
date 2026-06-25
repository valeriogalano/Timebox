# Security Policy

> **Personal workflow software.** Timebox is built around the maintainer's own timeblocking, time tracking, billing, and planning process. Treat it as local-first personal software, not as a hardened multi-user SaaS product.
>
> **Vibe coding project.** This project is developed through iterative, AI-assisted coding. Security-sensitive changes should be reviewed carefully and verified against the actual code.

## Supported Versions

Timebox is pre-1.0. Security fixes are applied to the latest published version or current `main` branch state.

## Local Security Model

- User data is stored in a local SQLite database under the Electron user-data directory, unless the user selects a different database path.
- Todoist API tokens are stored encrypted through Electron `safeStorage`, which delegates to the available OS credential/encryption backend.
- The local HTTP API binds to `127.0.0.1:37373` and is available only while the app is running.
- The standalone CLI and MCP server communicate with Timebox through that local HTTP API.
- The MCP server can read and mutate Timebox data through its exposed tools, including logging hours and managing projects. Only configure it in clients you trust.
- Todoist sync calls the Todoist REST API and caches matched task data locally.

### Accepted risk: HTTP API has no authentication

The local HTTP API has no token, session, or `Origin`/`Host` check. Any process running as the same local user can read and mutate Timebox data through it, and (in principle) a malicious web page could attempt a no-CORS request or DNS-rebinding attack against `127.0.0.1:37373`.

This is accepted for now: Timebox is single-user local software, and the realistic threat model is another process on the same machine, which already has broader access (e.g. to the SQLite file itself). If this assumption changes — e.g. the API is ever exposed beyond loopback, or Timebox starts handling more sensitive data — revisit this with a `Host`/`Origin` allowlist or a shared local token before widening exposure.

Platform notes:

- Timebox is macOS-first, with Windows and Linux packages generated through Electron Builder.
- CLI and MCP command installers write into per-user directories (`~/.local/bin` on macOS/Linux and `%APPDATA%\Timebox\bin` on Windows) instead of privileged system paths.
- Claude Desktop automatic MCP configuration is macOS-only; Windows and Linux users should configure their MCP client manually with the command path shown in Settings.

## Reporting a Vulnerability

Please do not open public issues for vulnerabilities.

Report privately to the repository maintainer and include:

- affected version or commit;
- operating system;
- reproduction steps;
- expected impact;
- whether local data, Todoist tokens, the HTTP API, the CLI, or MCP tools are involved.

Do not include personal databases, real client data, Todoist tokens, or sensitive screenshots unless explicitly requested through a private channel.
