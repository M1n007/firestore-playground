# Firestore Playground

A GraphQL-Playground style GUI for Google Cloud Firestore. Browse collections, build queries, watch data live, probe readable paths, and run CRUD with diff previews. All in the browser, no code required.

<p align="center">
  <img src="images/playground.png" alt="Firestore Playground UI" width="100%" />
</p>

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#getting-started">Getting started</a> ·
  <a href="#usage">Usage</a> ·
  <a href="#keyboard-shortcuts">Shortcuts</a> ·
  <a href="#tech-stack">Tech stack</a> ·
  <a href="#security-notes">Security notes</a>
</p>

## Why

The Firebase Console is great, but it's tied to Google accounts with project access. Sometimes you just want a lightweight client to inspect and mutate Firestore data with your own web config, for debugging, testing security rules from a browser context, seeding data, or sharing an auditing view with a teammate.

This app does that. The UI is inspired by GraphQL Playground / GraphiQL: sidebar with tabs on the left, JSON editor in the middle, documents list on the right.

## Features

### Connect

- Paste your Firebase web config (unquoted keys and trailing commas are fine)
- Save multiple configs to `localStorage`, switch projects with one click
- Sample config button for a quick schema reference

### Query tab

- Collection path input with datalist autocomplete and chip picker from probe results
- Configurable page size (`limit`)
- `where` clause builder. All operators: `==`, `!=`, `<`, `<=`, `>`, `>=`, `in`, `not-in`, `array-contains`, `array-contains-any`
- `orderBy` with `asc` / `desc`
- Load more pagination via `startAfter(lastDoc)`
- Live updates toggle, switches from `getDocs` to `onSnapshot`
- Client-side filter (contains / equals / starts-with) across loaded docs or a single field
- Full-collection scan that pages through beyond the sample limit
- Field chips extracted from loaded docs, up to depth 2

### Probe tab

- ~140 built-in collection candidates (users, orders, messages, sessions, etc.)
- Doc ID candidates like `admin`, `test`, `demo` as fallback when a collection query returns empty
- Results sorted: `confirmed`, `readable`, `blocked`
- Confirmed collections become chips in the Query tab
- Click a confirmed path to open it in the editor

### Document editor

- JSON editor with support for plain values, Timestamp, GeoPoint, DocumentReference, Bytes, ServerTimestamp
- Get any document by path (nested paths OK)
- Subcollection auto-probe on open, 30 common names, found ones show as chips
- CRUD with confirm and diff preview:
  - Create, auto-generated ID in the current collection
  - Set, overwrite entire document
  - Merge, keeps existing fields (`setDoc({ merge: true })`)
  - Update, partial, errors if doc doesn't exist
  - Delete, with confirm
- Diff preview modal before any write, shows `+` added, `−` removed, `~` changed fields

### Import / Export

- Export JSON: download the loaded documents as `.json` (with `path` and `id`)
- Export CSV: flattens nested fields to dot paths, timestamps as ISO strings
- Import JSON: bulk create from a single object or array. If the row has `id`, uses `setDoc`; otherwise auto ID

### Copy as code

Copy the current query / path as a snippet:

- Web SDK v9 (modular)
- Admin SDK (Node)
- REST / curl

### Shareable state

Query + filter + document path are encoded into the URL hash. Copy the URL, send it, the other person opens the same query.

### UI

- Light and dark themes, persisted. Dark by default
- Animated connected-particles canvas on the setup screen with cursor interaction
- Responsive: sidebar becomes a drawer on mobile, split panel stacks
- Custom scrollbars matching the theme
- Documents panel can collapse into a rail

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘/Ctrl + K` | Focus the collection path input |
| `⌘/Ctrl + Enter` | Run current input (load collection / get doc) |
| `⌘/Ctrl + \` | Toggle sidebar |

## Getting started

```bash
npm install
npm start
```

Open <http://localhost:3000>, paste your Firebase web config, click **Connect**.

Production build:

```bash
npm run build
```

## Deploying to Vercel

Create React App works on Vercel out of the box, but `react-scripts@3` needs Node's legacy OpenSSL provider. `vercel.json` in the repo handles that:

```json
{
  "build": { "env": { "NODE_OPTIONS": "--openssl-legacy-provider" } },
  "rewrites": [{ "source": "/(.*)", "destination": "/" }]
}
```

Import the repo at <https://vercel.com/new> and deploy. No other config needed.

## Usage

### 1. Connect

Paste the web config from Firebase Console → Project settings:

```js
{
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  // ...
}
```

Both pure JSON and JS-style objects work. Click **Save** to bookmark it.

### 2. Query

In the **Query** tab:

- Enter a collection path (`users`, `users/abc/comments`, etc.). Pick from found chips or autocomplete
- Optionally add `where` clauses, an `orderBy`, and toggle Live updates
- Click **Run Query**
- If the result hits the page size, **Load more** appears

### 3. Probe

The **Probe** tab comes preloaded with ~140 common collection names. Click **Probe candidates**. Results are sorted `confirmed`, `readable`, `blocked`. Confirmed ones appear as chips in the Query tab.

### 4. Edit

In the editor:

- Path input accepts any Firestore path (`collection/doc`, `a/b/c/d`, etc.)
- Use type helpers at the bottom for non-primitive values:

```json
{
  "createdAt": {"__type":"timestamp","seconds":1776171751,"nanoseconds":0},
  "homeLocation": {"__type":"geopoint","lat":-6.2,"lng":106.8},
  "owner": {"__type":"ref","path":"users/abc"},
  "payload": {"__type":"bytes","base64":"aGVsbG8="},
  "updatedAt": {"__type":"serverTimestamp"}
}
```

- Click **Create**, **Set**, **Merge**, or **Update**. A diff modal shows what will change before committing.

### 5. Import / Export

- **JSON** or **CSV** buttons download the current sample
- **Import** loads a `.json` file into the current collection

## Tech stack

- React 16
- Firebase Web SDK v9 (modular)
- Plain CSS with CSS variables, no framework
- Canvas particles on the setup screen, no deps

## Security notes

Everything runs client-side. The app only talks to Firebase from your browser, no intermediate server.

A few things worth knowing:

- Whatever your Firestore security rules allow, this app can do
- API keys in a Firebase web config are public by design, not secrets. But they still identify your project, so protect with strong security rules and App Check
- If you're pasting a config that belongs to someone else or a production project, make sure you're authorized

## Files

- `src/App.js`, all UI + Firestore logic
- `src/firebase.js`, Firebase init and re-exports
- `src/ParticlesBackground.js`, canvas particle animation
- `src/App.css`, theming, scrollbar, responsive rules
- `public/index.html`, SEO meta, Open Graph, Twitter cards, JSON-LD
- `vercel.json`, Vercel build config

## License

MIT
