# AGENTS.md

## Cursor Cloud specific instructions

This is a single-product client-side app: **Pizza Dough Calculator**, a Create React App (react-scripts 4.0.3, React 17) SPA. There is no backend, database, or auth. Standard scripts live in `package.json` (`start`, `build`, `test`) and are documented in `README.md`.

### Node version gotcha (important)
- The VM's default `node` on `PATH` is `/exec-daemon/node` (Node 22). `react-scripts@4.0.3` is **incompatible** with Node 22 — `yarn start`/`yarn build` crash with `ERR_PACKAGE_PATH_NOT_EXPORTED` from `postcss-safe-parser`.
- Use **Node 16** (installed via nvm, set as default alias). Because `/exec-daemon` precedes nvm in `PATH`, `nvm use` alone is not enough; explicitly prepend the Node 16 bin dir before running any command:
  ```bash
  export PATH="/home/ubuntu/.nvm/versions/node/v16.20.2/bin:$PATH"
  ```
  (`yarn` is installed globally for Node 16.)

### Running the app (dev)
```bash
export PATH="/home/ubuntu/.nvm/versions/node/v16.20.2/bin:$PATH"
BROWSER=none yarn start   # serves http://localhost:3000
```

### Lint
- There is no standalone lint script. CRA runs ESLint during `yarn start`/`yarn build`; warnings appear in the terminal output.

### Tests
- `CI=true yarn test` runs Jest. Note: `src/App.test.js` is the stale default CRA test (asserts a "learn react" link that no longer exists), so it currently **fails** — this is a pre-existing code issue, not an environment problem.
