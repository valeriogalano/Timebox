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
- The optional mobile page is a separate listener on the local network; see *Mobile page on the local network* below.
- The standalone CLI and MCP server communicate with Timebox through that local HTTP API.
- The MCP server can read and mutate Timebox data through its exposed tools, including logging hours and managing projects. Only configure it in clients you trust.
- Todoist sync calls the Todoist REST API and caches matched task data locally.

### Accepted risk: HTTP API has no authentication

The local HTTP API has no token, session, or `Origin`/`Host` check. Any process running as the same local user can read and mutate Timebox data through it, and (in principle) a malicious web page could attempt a no-CORS request or DNS-rebinding attack against `127.0.0.1:37373`.

This is accepted for now: Timebox is single-user local software, and the realistic threat model is another process on the same machine, which already has broader access (e.g. to the SQLite file itself). If this assumption changes — e.g. the API is ever exposed beyond loopback, or Timebox starts handling more sensitive data — revisit this with a `Host`/`Origin` allowlist or a shared local token before widening exposure.

### Mobile page on the local network

Timebox can serve a page for logging hours from a phone. It is off by default and macOS only. When switched on it is a second HTTP listener on port `37374`, separate from the local API above, and it is the only part of Timebox reachable from another device.

**It is reachable on whatever network the computer is connected to, for as long as it is on.** Timebox does not tell a home network from any other: on macOS an app can read neither the Wi-Fi name nor the router's hardware address (the ARP table comes back empty to non-Apple programs), so there is nothing reliable to recognise home by. The control is the switch itself, which sits in the top bar of every screen so its state is always in view. Switch it off before taking the computer elsewhere.

What limits it:

- **It binds only to the computer's addresses in the router's subnet**, never to `0.0.0.0`, so VPN interfaces do not expose it. It follows network changes by rechecking every 30 seconds.
- **It serves four static files and two data routes.** `GET /api/day` returns one day's projects and worked hours; `PUT /api/hours` sets the worked hours of one project on one day. Billable hours, the billed flag, projects, areas and everything else in the local API are not reachable from it.
- **The two data routes require a token** in the `Authorization` header: 32 random bytes, stored encrypted with `safeStorage`, compared in constant time. It can be regenerated in Settings, which invalidates the old link at once. The static files need no token and contain no data.
- The page is sent with a Content Security Policy that only allows its own files.

Accepted risks:

- **The traffic is plain HTTP.** The token and the hours travel unencrypted. On a network that is not yours (a café, a client's office, a hotel) anyone able to observe the traffic while the page is being used can read the token, and with it read project and area names and change worked hours. On such a network, do not open the page; better, switch it off.
- **The port is visible on every network while the switch is on.** Without the token a visitor sees only that a page called Timebox is served.
- **Nothing closes it automatically.** If the switch is left on, the page stays reachable wherever the computer goes.
- **The link contains the token** and stays in the phone's address bar and Home screen icon. Anyone holding the phone, or the link, has the same access. Regenerate the token if either is lost.

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
