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

```bash
# 1. Build the static web bundle
npm run export:web

# 2. (Optional) preview locally with the Firebase emulator
npx firebase-tools emulators:start --only hosting

# 3. Deploy (requires a Firebase project + auth)
#    Set the project id in .firebaserc, then authenticate via
#    `firebase login` or a CI token (FIREBASE_TOKEN), and run:
npm run deploy
```

## Project structure

- `App.js` — app entry, renders the calculator.
- `src/bread/BreadCalculator.js` — the calculator UI + baker's-percentage math
  (`computeRecipe`, `PRESETS`).
- `src/bread/BreadCalculator.test.js` — unit + render tests.
- `firebase.json` / `.firebaserc` — Firebase Hosting config.
