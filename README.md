# Hydration Bread Calculator

A cross-platform (iOS / Android / web) dough calculator built with
[Expo](https://expo.dev) + React Native. It uses **baker's percentages** — flour
is always 100%, and every other ingredient (water/hydration, salt, yeast or
starter) is expressed as a percentage of the flour weight. Pizza dough is just
one style preset of the same model.

The web build is deployed to **Firebase Hosting**.

## Tech stack

- **Expo SDK 57** / React Native 0.86 / React 19
- **react-native-web** for the web target
- **Jest** (`jest-expo`) + `@testing-library/react-native` for tests
- **ESLint** (`eslint-config-expo`)
- **Firebase Hosting** for the exported web app

## Prerequisites

- **Node.js 20** (Expo SDK 57 LTS target). This repo installs deps with `npm`.

## Available scripts

In the project directory:

### `npm run web`
Runs the app in the browser via the Expo dev server (Metro). Defaults to
[http://localhost:8081](http://localhost:8081).

### `npm start`
Starts the Expo dev server for all platforms (press `w` for web, `a` for
Android, `i` for iOS). Use the Expo Go app or a simulator for native.

### `npm test`
Runs the Jest test suite (`jest-expo` preset).

### `npm run lint`
Runs ESLint over the project.

### `npm run export:web`
Exports a static production web build to the `dist/` folder
(`expo export -p web`).

## Deploying to Firebase Hosting

Hosting config lives in `firebase.json` (serves `dist/`, with an SPA rewrite to
`index.html`) and `.firebaserc` (project alias).

### Project

The Firebase project id is **`pizza-app-36305`** (set in `.firebaserc` and in the
CI workflow). Enable Hosting once under Build > Hosting in the Firebase console.

### Preview locally (no account needed)

```bash
npm run export:web
npx firebase-tools emulators:start --only hosting   # http://127.0.0.1:5000
```

### Deploy from your machine

```bash
npm install -g firebase-tools
firebase login                 # interactive, opens a browser
npm run export:web
npm run deploy                 # firebase deploy --only hosting
```

### Deploy from CI (recommended)

`.github/workflows/firebase-hosting.yml` builds the web export and deploys on
every push to `main` (and posts a preview channel on pull requests). The project
id is already pinned in the workflow, so you only need one repository secret:

- `FIREBASE_SERVICE_ACCOUNT` — a service-account JSON key with the
  **Firebase Hosting Admin** role (generate via
  `firebase init hosting:github`, or in the Google Cloud console). Paste the
  entire JSON.

## Project structure

- `App.js` — app entry, renders the calculator.
- `src/bread/BreadCalculator.js` — the calculator UI + baker's-percentage math
  (`computeRecipe`, `PRESETS`).
- `src/bread/BreadCalculator.test.js` — unit + render tests.
- `firebase.json` / `.firebaserc` — Firebase Hosting config.
