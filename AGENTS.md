# AGENTS.md

## Cursor Cloud specific instructions

This is a single product: **Hydration Bread Calculator**, an **Expo (React Native)** app that targets iOS / Android / web from one codebase, using baker's percentages. The **web** build is deployed to **Firebase Hosting**. There is no backend, database, or auth. Standard scripts (`start`, `web`, `test`, `lint`, `export:web`, `deploy`) live in `package.json` and are documented in `README.md`.

Stack: Expo SDK 57, React Native 0.86, React 19, `react-native-web`, Jest (`jest-expo`) + `@testing-library/react-native`, ESLint (`eslint-config-expo`).

### Node version gotcha (important)
- The VM's default `node` on `PATH` is `/exec-daemon/node` (Node 22). This project is developed on **Node 20** (Expo SDK 57 LTS target). Because `/exec-daemon` precedes nvm in `PATH`, `nvm use` alone is not enough — explicitly prepend the Node 20 bin dir before running any command:
  ```bash
  export PATH="/home/ubuntu/.nvm/versions/node/v20.20.2/bin:$PATH"
  ```
- Dependencies are installed with **npm** (there is a `package-lock.json`). A root `.npmrc` sets `legacy-peer-deps=true`, which is required — strict peer resolution otherwise fails on the bleeding-edge Expo/React Native/testing-library version matrix.

### Running the app (dev)
```bash
export PATH="/home/ubuntu/.nvm/versions/node/v20.20.2/bin:$PATH"
npm run web    # Expo dev server (Metro), serves http://localhost:8081
```
- The web JS bundle is built lazily on the first browser request, so the first load takes ~10-30s and the terminal may sit at "Waiting on http://localhost:8081" until then.
- For native, `npm start` then press `a`/`i` (needs a simulator or Expo Go).

### Lint / Test
- `npm run lint` (ESLint 9 — do NOT upgrade to ESLint 10; `eslint-plugin-react` used by `eslint-config-expo` breaks on v10). `typescript` is a devDependency because the Expo flat config loads `@typescript-eslint`.
- `npm test` runs Jest via the `jest-expo` preset. `@react-native/jest-preset` must be present (it is a devDependency) — `jest-expo` no longer bundles it.

### Web export + Firebase Hosting
- `npm run export:web` produces the static site in `dist/` (this is what Firebase serves; `firebase.json` points `hosting.public` at `dist` with an SPA rewrite to `index.html`).
- Preview hosting locally without any credentials:
  ```bash
  npx firebase-tools emulators:start --only hosting --project demo-bread
  # serves dist/ at http://127.0.0.1:5000
  ```
- Actual `npm run deploy` (`firebase deploy`) needs a real Firebase project id in `.firebaserc` and auth (interactive `firebase login`, or a `FIREBASE_TOKEN` / service-account for CI).
