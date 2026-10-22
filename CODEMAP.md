# Code Map

## Project purpose
This repository is a Progressive Web App (PWA) for MCQ revision. It loads a selected module question bank, lets the user filter and study questions, tracks performance, supports offline use, and offers daily/exam-style quiz flows. The app supports module selection before filtering, generates 60-question default sets for each module, and also offers an All Questions option for a full module review.

## High-level architecture
- Frontend UI: static HTML, CSS, and vanilla JavaScript
- Data layer: module-specific JSON files loaded through `fetch()`
- Runtime state: in-memory state object plus browser `localStorage`, with optional anonymous Supabase sync
- Offline support: service worker caches the app shell and key assets
- UX model: module selection, revision mode, exam mode, filters, default sets, bookmarks, incorrect list, and historical results

## Core files

### `index.html`
- App shell and layout
- Main filter toolbar, stats cards, quiz panel, and sidebar widgets
- Injects `app.js` and loads the stylesheet

### `styles.css`
- Visual design system for the PWA
- Theme variables for light/dark mode
- Layout for the quiz UI, cards, filters, badges, and responsive behaviour

### `app.js`
- Central application logic
- Maintains `state`, DOM element references, and core helper functions
- Handles normalization, default-set generation, search and filtering, storage, results, and quiz flow

### `service-worker.js`
- Caches the app shell for offline support
- Cleans outdated caches on activation
- Intercepts GET requests and serves cached responses when available
- Reports its active cache version to the page for the footer display

### `sync-config.js`
- Holds the public Supabase Edge Function URL used for progress sync; the service worker checks for its latest copy online and keeps a cached offline fallback
- Leave empty to keep using this device's local storage without cross-device sync

### `supabase/`
- `schema.sql` creates the progress table with row-level security enabled and no browser-role access
- `functions/progress-sync/index.ts` hashes the private sync code and uses the server-side service-role key to read/write progress
- `config.toml` permits unauthenticated function calls; access is instead protected by a randomly generated 192-bit sync code

### `manifest.json`
- PWA metadata for installability and app appearance
- defines app name, icons, theme, and display mode

### `question_bank.json`
- Source dataset for the Managing Software Projects module
- Each question includes metadata such as lecture, subchapter, difficulty, type, answers, explanation, and hint

### `HR questions.json`
- Source dataset for the Human Resources and Quality Management module
- Structured similarly to the main bank so it can be loaded through the same app logic

### `raw_questions.txt`
- Raw source text likely used to generate or maintain the question bank

### `icons/`
- SVG assets for the app icon and installable icon variants

## State and data model
The app uses a central `state` object with these main buckets:
- `moduleId`: selected module key, such as `managing-software-projects` or `human-resources-quality-management`
- `moduleLabel`: user-facing name for the current module
- `allQuestions`: full normalized dataset for the active module
- `filteredQuestions`: currently visible questions after filters
- `defaultSets`: generated sets A/B/C for structured revision, plus `all` for the full module question bank
- `currentSession`: active quiz or session state
- `currentQuestionIndex`: pointer within the active session
- `activeSet`: selected default set or full-module option
- `filters`: search and attribute filters
- `performance`, `history`, `bookmarks`, `incorrect`: persistent user progress data

## Data flow
1. `StorageManager.loadState()` restores the selected module and saved app settings.
2. `DataLayer.loadQuestionBank(moduleId)` fetches the active module file.
3. Each item is normalized through `normalizeQuestion()`.
4. `buildDefaultSets()` creates predefined A/B/C distributions by lecture, with a 60-question target per set when enough questions exist.
5. Search and filter logic is applied through `SearchEngine` and `FilterEngine`.
6. The UI renders and updates question cards, stats, and sidebar summaries.
7. User interactions record progress into `localStorage` through `StorageManager`.
8. `initializeApp()` orchestrates startup, persistence restore, service worker registration, install prompt setup, module selection wiring, and default-set loading.

## Startup and lifecycle
### App bootstrap
`initializeApp()` runs on `DOMContentLoaded` and performs the following:
- captures all main DOM elements into the `elements` registry
- restores saved theme, selected module, mode, filters, history, performance, bookmarks, and incorrect data
- applies the stored theme immediately
- registers the service worker and displays its active version in the footer
- sets up the browser install prompt UI
- loads the selected module bank, restores the chosen set and active quiz if available, and binds UI events
- merges remote progress when sync is configured, then starts a default quiz only when there is no resumable session
- renders the summary and initial question view

### Module selection flow
The UI now includes a dedicated module chooser before the filter toolbar. It uses the `MODULES` registry defined in `app.js` to map module IDs to labels and file paths. Switching modules triggers a reload of the corresponding dataset, repopulates filters, and rebuilds the default A/B/C sets.

### PWA install flow
`PwaManager` handles installation and cache version reporting:
- `registerServiceWorker()` registers `./service-worker.js` without unregistering the current worker or clearing its caches
- The active worker responds to a version message, and the footer renders the reported version
- `setupInstallPrompt()` listens for `beforeinstallprompt` and reveals the install button when available

### Quiz session lifecycle
The live app flow is session-based and managed by `QuizEngine` and `ReviewEngine`:
- `createSession()` builds a new quiz session from selected questions and randomizes options
- `handleOptionSelection()` adds or removes answers, including multi-select support
- `ReviewEngine.renderQuestion()` draws the active question, selected state, bookmark toggle, and revealed answer panel when appropriate
- `submitQuiz()` evaluates each question, appends lecture stats, records incorrect IDs, stores score history, and shows a final percentage alert

## Important logic clusters

### Question normalization and loading
- `normalizeQuestion()` standardizes question structure
- `MODULES` maps module IDs to module labels and JSON files
- `DataLayer.loadQuestionBank(moduleId)` loads the active module bank and resets state for that module
- `hashString()` supports deterministic set generation
- `shuffleOptions()` randomizes option ordering

### Filtering and search
- `SearchEngine.tokenize()` and `matches()` implement token-based matching
- `FilterEngine.apply()` narrows questions based on lecture, difficulty, type, exam priority, subchapter, and search term
- The memoized filter cache reduces repeated compute work

### Storage and persistence
- `StorageManager` reads/writes keys in `localStorage`
- Persistent state includes theme, mode, filters, every completed result, performance, bookmarks, incorrect questions, and the active quiz with shuffled question order, answers, and position
- Existing local data is retained and merged when a sync code is connected
- Quiz-result history is merged by result ID; lecture performance is recomputed from a shared baseline plus per-quiz performance deltas
- Bookmark changes are recorded as timestamped events so removals also sync across devices

### Anonymous cross-device sync setup
Cross-device sync is inactive until the Supabase project is configured and the Edge Function is deployed:
1. Create a Supabase project and run `supabase/schema.sql` in its SQL Editor.
2. Link the repository to that project with the Supabase CLI and deploy `supabase/functions/progress-sync` with `supabase functions deploy progress-sync --no-verify-jwt`. Ensure the function has the project's `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment variables; never put the service-role key in the frontend.
3. Set `window.REVISION_SYNC_FUNCTION_URL` in `sync-config.js` to `https://<project-ref>.supabase.co/functions/v1/progress-sync`, then deploy the static app.
4. In the app, create a sync code on one device, copy it, and enter the same code on each other device. The code is a bearer secret: anyone who obtains it can access that progress.

The browser never receives the service-role key. Only the Edge Function can access the table; the stored sync identifier is a SHA-256 hash of the code. Cloud updates use optimistic version checks and retry when another device writes concurrently. Local changes remain saved when offline and sync on reconnect.

For later releases, update `CACHE_NAME` in `service-worker.js` so the footer continues to identify the active worker release.

### Quiz and results handling
The application is structured around session-based quiz rendering and result recording.
- `currentQuestionIndex` tracks position
- `ResultsEngine.renderHistory()` exposes recent results
- Bookmarks and incorrect items are surfaced in the sidebar for review

## Key workflows

### Study flow
- User selects a module
- User selects a default set or the full-module option within that module
- App computes matching questions for the chosen module
- User advances through question cards
- Explanation and answer summary appear after selection or submission

### Revision vs exam modes
- Mode selection changes app behavior and presentation
- A daily quiz feature is available to generate focused review sessions

### Offline flow
- Service worker precaches the app shell and key assets
- Browser requests are served from the cache first, falling back to the network

## Dependency map
- `index.html` depends on `styles.css`, `app.js`, and `manifest.json`
- `app.js` depends on `question_bank.json` and `localStorage`
- `service-worker.js` depends on the asset list and cache lifecycle rules
- The app is essentially a static single-page frontend without a build toolchain

## Risks and notes
- The app logic is concentrated in `app.js`; broad changes will require careful review of shared state and events.
- There is no automated test suite visible in the repository, so behavior validation depends on manual verification.
- `question_bank.json` is large and central to the product, so file-level changes should be considered carefully.
- Offline support is strong but tied to the exact asset list in `service-worker.js`.
- Because the app writes user progress to `localStorage`, any change to storage keys or state structure can have migration impact.
- The install and service worker logic is stateful and browser-dependent, so updates there should be validated in a live browser context.

## Update guidance
When feature work or bug fixes are requested:
1. Identify the affected module in this map.
2. Update the relevant section rather than re-reading the whole repository.
3. Refresh any changed app flows, state keys, or UI dependencies.
4. Keep the map aligned with the actual current implementation.

## Current status
This map has been refreshed to match the current repository implementation, including module selection, multi-bank loading, per-module 60-question default sets, the All Questions full-bank option, startup bootstrap, PWA install lifecycle, persistent state restore, and quiz-session behavior. HR content is now treated as a separate module with the same default-set mechanism as the main project management bank, plus an option to revise the full module question list. It should still be updated whenever the app architecture changes.
