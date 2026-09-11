# BS2 Pro Control

Tauri + React + TypeScript desktop controller for BS2 Pro.

## Development

```bash
yarn install
yarn dev
```

## Windows Build

The GitHub Actions workflow builds a Windows amd64 NSIS installer for pushes to
`main`/`master`, pull requests, and manual runs. The installer is available from
the workflow artifacts.

To publish a GitHub Release, push a version tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The release workflow creates the release and uploads the Windows amd64 installer
automatically.
