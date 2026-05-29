# Security Policy

## Supported Versions

`aiflow` is currently pre-1.0. Security fixes target the latest unreleased `0.1.x` line until the first public release process is finalized.

## Reporting a Vulnerability

Please do not open a public issue for sensitive security reports.

Until the public GitHub repository and security contact are finalized, report suspected vulnerabilities privately to the project maintainers. Include:

- affected version or commit
- operating system and Node.js version
- reproduction steps
- expected and actual behavior
- whether secrets, tokens, files, or command execution are involved

## Security Boundaries

`aiflow` is a local CLI workflow tool. It should not:

- collect or transmit source code
- upload `.aiflow` artifacts
- read or print secrets from `.env`
- perform implicit push, merge, release, archive, publish, or deploy actions
- require interactive confirmation in CI mode

If a future integration needs network access, credentials, or hosted provider APIs, it must document the permission boundary and keep release/archive actions explicit.
