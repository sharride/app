# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## Fonts (Self-hosted)

We use self-hosted WOFF2 fonts for best performance. Place your licensed WOFF2 files in `public/fonts/` and name them as follows (these names are referenced by the default build):

- `Inter-Regular.woff2`
- `Inter-SemiBold.woff2`
- `Cairo-Regular.woff2`
- `Cairo-Bold.woff2`

The repository includes placeholder files; replace them with real WOFF2 binaries from your licensed font source.

Quick ways to generate optimized WOFF2 subsets:

- Using `ttf2woff2` (simple conversion from TTF):

```bash
# install (npm)
npm install -g ttf2woff2

# convert
ttf2woff2 Inter-Regular.ttf Inter-Regular.woff2
```

- Using `pyftsubset` from `fonttools` for subsetting and WOFF2 output (recommended to keep only needed unicode ranges):

```bash
pip install fonttools brotli

# subset to Latin + Arabic ranges and output woff2
pyftsubset Inter-Regular.ttf --output-file=Inter-Regular.woff2 --flavor=woff2 --unicodes=U+0020-00FF,U+0600-06FF --layout-features='kern,liga' --recalc-bounds
```

- Or use the web tool `google-webfonts-helper` to download properly subsetted WOFF2 files and CSS.

Important
- Ensure you have the rights to self-host fonts (check the font license).
- If you cannot commit fonts to the repository, host them in a private storage bucket and update the paths in `index.html` and `src/index.css` accordingly.

After replacing font files, re-run the build:

```bash
npm run build
```

If you'd like, I can add a short `scripts/` helper to validate font presence and sizes before building.
