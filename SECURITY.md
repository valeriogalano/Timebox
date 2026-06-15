# Security Policy

## Supported Versions

Timebox is pre-1.0. Security fixes are applied to the latest published version.

## Reporting a Vulnerability

Please do not open public issues for vulnerabilities.

Report privately by email to the repository maintainer, including:

- affected version or commit;
- operating system;
- reproduction steps;
- expected impact;
- whether local data, Todoist tokens, or the local HTTP API are involved.

Timebox stores user data locally. Todoist tokens are encrypted with Electron
`safeStorage`, and the HTTP/CLI bridge binds only to `127.0.0.1`.
