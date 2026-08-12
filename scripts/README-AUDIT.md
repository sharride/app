Playwright + axe audit

Usage

- Install dev deps: `npm install`
- Run an audit against a local dev server (assumes you run `vite preview` or similar):

```bash
npm run audit
```

- Run a CI-friendly audit that builds and serves the `dist` folder, then captures reports/screenshots:

```bash
npm run audit:ci
```

Outputs

- `accessibility/axe-<route>.json` — full axe results per route
- `accessibility/summary.json` — summary with violation counts and paths
- `screenshots/<route>.png` — full-page screenshots

Notes

- `playwright` and `axe-core` are required devDependencies. Installing Playwright downloads browser binaries; allow this on CI or locally.
