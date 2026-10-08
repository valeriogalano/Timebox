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
- The optional mobile page is a separate listener on the home network only; see *Mobile page on the home network* below.
- The standalone CLI and MCP server communicate with Timebox through that local HTTP API.
- The MCP server can read and mutate Timebox data through its exposed tools, including logging hours and managing projects. Only configure it in clients you trust.
- Todoist sync calls the Todoist REST API and caches matched task data locally.

### Accepted risk: HTTP API has no authentication

The local HTTP API has no token, session, or `Origin`/`Host` check. Any process running as the same local user can read and mutate Timebox data through it, and (in principle) a malicious web page could attempt a no-CORS request or DNS-rebinding attack against `127.0.0.1:37373`.

This is accepted for now: Timebox is single-user local software, and the realistic threat model is another process on the same machine, which already has broader access (e.g. to the SQLite file itself). If this assumption changes — e.g. the API is ever exposed beyond loopback, or Timebox starts handling more sensitive data — revisit this with a `Host`/`Origin` allowlist or a shared local token before widening exposure.

### Mobile page on the home network

Timebox can serve a page for logging hours from a phone. It is off by default and macOS only. When enabled it is a second HTTP listener on port `37374`, separate from the local API above, and it is the only part of Timebox reachable from another device.

What limits it:

- **It opens only on the network declared as home.** The network is recognised by the router's MAC address (`route -n get default`, then `arp`, with one `ping` to the router when its ARP entry has expired), checked at start and every 30 seconds. On any other network, and whenever the router cannot be identified, the listener is closed. The Wi-Fi name is not used: macOS hides it from apps without the location permission.
- **It binds only to the computer's addresses in the router's subnet**, never to `0.0.0.0`, so VPN interfaces do not expose it.
- **It serves four static files and two data routes.** `GET /api/day` returns one day's projects and worked hours; `PUT /api/hours` sets the worked hours of one project on one day. Billable hours, the billed flag, projects, areas and everything else in the local API are not reachable from it.
- **The two data routes require a token** in the `Authorization` header: 32 random bytes, stored encrypted with `safeStorage`, compared in constant time. It can be regenerated in Settings, which invalidates the old link at once. The static files need no token and contain no data.
- The page is sent with a Content Security Policy that only allows its own files.

Accepted risks:

- **The traffic is plain HTTP.** The token and the hours travel unencrypted on the home network: any device on that network that can observe the traffic can read the token and then change worked hours. This is accepted because the listener only exists on the home network; it is not a design for untrusted networks.
- **The router's MAC address can be spoofed.** Someone who knows it can make another network look like home and get the listener to open there. They still need the token. The check is there to keep the port closed in a café, not to stop a targeted attacker.
- **The link contains the token** and stays in the phone's address bar and Home screen icon. Anyone holding the phone, or the link, has the same access.
- Up to 30 seconds can pass between leaving the home network and the listener closing. In that window it is still bound to the home address, which the new network normally does not route.

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
