# Code Map

## Project purpose
This repository is a Progressive Web App (PWA) for MCQ revision. It loads a large question bank, lets the user filter and study questions, tracks performance, supports offline use, and offers daily/exam-style quiz flows.

## High-level architecture
- Frontend UI: static HTML, CSS, and vanilla JavaScript
- Data layer: local JSON question bank loaded through `fetch()`
- Runtime state: in-memory state object plus browser `localStorage`
- Offline support: service worker caches the app shell and key assets
- UX model: revision mode, exam mode, filters, default sets, bookmarks, incorrect list, and historical results

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

### `manifest.json`
- PWA metadata for installability and app appearance
- defines app name, icons, theme, and display mode

### `question_bank.json`
- Source dataset for all MCQ content
- Each question includes metadata such as lecture, subchapter, difficulty, type, answers, explanation, and hint

### `raw_questions.txt`
- Raw source text likely used to generate or maintain the question bank

### `icons/`
- SVG assets for the app icon and installable icon variants

## State and data model
The app uses a central `state` object with these main buckets:
- `allQuestions`: full normalized dataset
- `filteredQuestions`: currently visible questions after filters
- `defaultSets`: generated sets A/B/C for structured revision
- `currentSession`: active quiz or session state
- `currentQuestionIndex`: pointer within the active session
- `activeSet`: selected default set
- `filters`: search and attribute filters
- `performance`, `history`, `bookmarks`, `incorrect`: persistent user progress data

## Data flow
1. `DataLayer.loadQuestionBank()` fetches `question_bank.json`.
2. Each item is normalized through `normalizeQuestion()`.
3. `buildDefaultSets()` creates predefined A/B/C distributions by lecture.
4. Search and filter logic is applied through `SearchEngine` and `FilterEngine`.
5. The UI renders and updates question cards, stats, and sidebar summaries.
6. User interactions record progress into `localStorage` through `StorageManager`.
7. `initializeApp()` orchestrates startup, persistence restore, service worker registration, install prompt setup, and default-set loading.

## Startup and lifecycle
### App bootstrap
`initializeApp()` runs on `DOMContentLoaded` and performs the following:
- captures all main DOM elements into the `elements` registry
- restores saved theme, mode, filters, history, performance, bookmarks, and incorrect data
- applies the stored theme immediately
- clears stale service worker caches and registers the service worker
- sets up the browser install prompt UI
- loads the question bank, populates filters, loads the default Set A, and binds UI events
- renders the summary and initial question view

### PWA install flow
`PwaManager` handles installation and cache refresh:
- `clearStaleServiceWorker()` unregisters previous service workers and drops old caches
- `registerServiceWorker()` registers `./service-worker.js` when the browser supports service workers
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
- `hashString()` supports deterministic set generation
- `shuffleOptions()` randomizes option ordering

### Filtering and search
- `SearchEngine.tokenize()` and `matches()` implement token-based matching
- `FilterEngine.apply()` narrows questions based on lecture, difficulty, type, exam priority, subchapter, and search term
- The memoized filter cache reduces repeated compute work

### Storage and persistence
- `StorageManager` reads/writes keys in `localStorage`
- Persistent state includes theme, mode, filters, result history, performance, bookmarks, and incorrect questions

### Quiz and results handling
The application is structured around session-based quiz rendering and result recording.
- `currentQuestionIndex` tracks position
- `ResultsEngine.renderHistory()` exposes recent results
- Bookmarks and incorrect items are surfaced in the sidebar for review

## Key workflows

### Study flow
- User selects a default set or filter combination
- App computes matching questions
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
This map has been refreshed to match the current repository implementation, including startup bootstrap, PWA install lifecycle, persistent state restore, and quiz-session behavior. It should still be updated whenever the app architecture changes.
