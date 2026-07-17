# Cardfight Lab

Cardfight Lab is a local deck-building, matchup-tracking, and analytics application for **Cardfight!! Vanguard**. It began as a small random matchup generator and has grown into a full React and Flask application for maintaining decks, versioning deck lists, recording games, and learning from match history.

The project is designed primarily as a personal testing lab. Everything runs locally, and the default database is a SQLite file stored inside the repository's ignored `instance/` directory.

> This is a fan-made project and is not affiliated with or endorsed by Bushiroad.

## What the application does

- Maintains Standard and Stride deck records, nations, formats, and win/loss statistics.
- Generates random matchups and chooses a first player in the Play Lab.
- Records match results, notes, participating deck versions, and matchup history.
- Provides dashboard summaries, analytics, head-to-head statistics, and rivalry views.
- Maintains a shared card catalog with individual card printings.
- Builds and versions deck lists without overwriting earlier builds.
- Creates a new deck version from an empty list or an exact copy of an older version.
- Compares two versions to surface card, quantity, zone, printing, and grade-curve changes.
- Enforces the current 54-card core deck rules: 50 main-deck cards and one grade 0, 1, 2, and 3 ride-deck card.
- Derives deck nation identity from the selected version's ride line, with saved deck metadata as a fallback.
- Supports manual card entry and optional card-image analysis.
- Includes a just-for-fun Vanguard nation quiz.

## How it works

The React frontend communicates with a Flask JSON API. Flask routes delegate application logic to backend service modules, and Flask-SQLAlchemy persists the data in SQLite.

A typical session looks like this:

1. Create or seed the decks you want to test.
2. Add cards to the shared card catalog manually or with the image assistant.
3. Create a version for a deck and build its main and ride decks.
4. Clone that version when testing a new build so the original remains available.
5. Use Play Lab to choose a matchup and record the result.
6. Review the dashboard, analytics, match history, and rivalry pages over time.

## Technology stack

### Backend

- Python 3.10 or newer; Python 3.12 is recommended.
- Flask and Flask-CORS.
- Flask-SQLAlchemy and SQLAlchemy.
- SQLite by default.
- Pytest for backend regression tests.
- OpenAI Python SDK for optional card-image analysis.

### Frontend

- React 19 and TypeScript.
- Vite 8.
- Tailwind CSS 4.
- React Router.
- Recharts for data visualization.
- TanStack Virtual for large card-library lists.
- Anime.js and Lucide icons.

Vite 8 requires Node.js `^20.19.0` or `>=22.12.0`.

## Prerequisites

Install these tools before starting:

- [Python](https://www.python.org/downloads/) 3.10+
- [Node.js](https://nodejs.org/) 20.19+ or 22.12+
- npm, which is included with Node.js
- Git

The commands below assume your terminal is open at the top-level `cardfight` directory.

## Quick start on Windows

### 1. Clone the project

```powershell
git clone <your-repository-url>
cd cardfight
```

### 2. Create and activate a Python virtual environment

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

If PowerShell prevents activation, either adjust the execution policy for the current session or call the virtual environment's Python executable directly.

### 3. Install frontend packages

```powershell
cd frontend-web
npm ci
cd ..
```

### 4. Create the local environment file

```powershell
Copy-Item .env.example .env
```

The default mock image analyzer does not require an API key.

### 5. Seed and launch the application

```powershell
.\start.ps1 -Seed
```

This starts:

- Flask API: `http://127.0.0.1:5000`
- React application: `http://localhost:5173`

The `-Seed` flag is only necessary when adding starter decks that are not already in the database. For later sessions, use:

```powershell
.\start.ps1
```

Available launcher options:

```powershell
.\start.ps1                 # Backend and React frontend
.\start.ps1 -Seed           # Seed, then start both
.\start.ps1 -ApiOnly        # Flask only
.\start.ps1 -FrontendOnly   # React frontend only
.\start.ps1 -ApiOnly -Seed  # Seed, then start Flask only
```

Run the script from an activated virtual environment so the child terminals inherit the environment's Python path.

## Setup on macOS or Linux

There is no shell launcher yet, but the same application can be prepared with:

```bash
git clone <your-repository-url>
cd cardfight

python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

cd frontend-web
npm ci
cd ..

cp .env.example .env
python -m backend.seed
```

After setup, start Flask and Vite in separate terminals as described below.

## Manual startup

The application can also be run in two terminals. This is useful outside Windows or when debugging one side of the application independently.

### Terminal 1: Flask backend

Activate the Python virtual environment, then run:

```bash
python -m flask --app backend.app run --debug --port 5000
```

Confirm the API is available at `http://127.0.0.1:5000/api/health`.

### Terminal 2: React frontend

```bash
cd frontend-web
npm run dev
```

Open `http://localhost:5173` in a browser.

The frontend defaults to `http://127.0.0.1:5000` for API requests. To use another backend URL, set `VITE_CARDFIGHT_API_URL` before starting Vite.

## Working with dependencies

Activate `.venv` in each new terminal before running Python commands. Run backend commands from the repository root so imports such as `backend.app`, `backend.models`, and `deck` resolve consistently. Prefer module commands such as `python -m backend.seed` over running a backend file by path.

To add a Python package:

```bash
python -m pip install <package-name>
```

Then add a compatible pinned version to `requirements.txt` so another clone can reproduce the environment.

To add a frontend package, run the command from `frontend-web/`:

```bash
npm install <package-name>
```

npm updates both `package.json` and `package-lock.json`; commit both files when the dependency is intentional.

## Environment configuration

Copy `.env.example` to `.env`. Flask loads the root `.env` file during startup.

```dotenv
FLASK_DEBUG=true

CARD_IMAGE_ANALYZER_PROVIDER=mock
CARD_IMAGE_ANALYZER_MODEL=

OPENAI_API_KEY=
```

### Card-image analyzer

The default provider is `mock`. It performs filename-based placeholder inference so the workflow can be tested without sending an image to an external service.

To enable OpenAI-backed image analysis:

```dotenv
CARD_IMAGE_ANALYZER_PROVIDER=openai
CARD_IMAGE_ANALYZER_MODEL=<a-vision-capable-model>
OPENAI_API_KEY=<your-api-key>
```

Review analyzed fields before saving them. Card names, numbers, rarities, and unusual or newly released set information may still need correction.

### Optional database URL

Without configuration, Flask uses:

```text
instance/cardfight.db
```

Set `DATABASE_URL` in `.env` to use another SQLAlchemy database URL:

```dotenv
# Windows
DATABASE_URL=sqlite:///C:/Users/you/data/cardfight.db

# macOS or Linux
DATABASE_URL=sqlite:////home/you/data/cardfight.db
```

SQLite is the expected development database. Other database engines have not been the primary target of this project.

## SQLite database creation and seeding

### Automatic database creation

Starting the Flask application imports `backend.app`, calls `db.create_all()`, and creates missing tables automatically. A first launch therefore creates:

```text
instance/cardfight.db
```

The application also runs the lightweight compatibility helpers in `backend/schema.py`. These helpers add a small number of known columns to older local databases. The project does not currently use Alembic or Flask-Migrate.

### Seeding starter decks

Starter deck names and formats live in the root `deck.py` file. Edit its `decks` list if you want a custom initial collection, then run:

```bash
python -m backend.seed
```

The seed is additive:

- It inserts a deck only when no deck with that name exists.
- It does not delete matches, cards, versions, or existing deck records.
- It does not overwrite an existing deck's metadata.

After seeding, use the Deck Library in the web application to set nations, icons, formats, and other deck details.

### Creating a completely fresh database

1. Stop the Flask application.
2. Back up `instance/cardfight.db` if its data matters.
3. Delete `instance/cardfight.db`.
4. Start Flask or run `python -m backend.seed`.

The tables and database file will be recreated. Seeding after recreation restores only the starter decks from `deck.py`; it does not restore match history, cards, or deck lists.

The `instance/` directory and SQLite files are ignored by Git, so each clone maintains its own local data.

## Project structure

```text
cardfight/
├── backend/
│   ├── app.py                 # Flask application factory and API setup
│   ├── database.py            # Shared SQLAlchemy instance
│   ├── models.py              # Database models and relationships
│   ├── schema.py              # Lightweight SQLite compatibility upgrades
│   ├── seed.py                # Additive starter-deck seed
│   ├── routes/                # HTTP request/response layer
│   └── services/              # Validation, queries, and business logic
├── frontend-web/
│   ├── public/nations/        # Nation artwork used by the UI
│   └── src/
│       ├── animations/        # Reusable page and builder motion
│       ├── api/               # Typed API request functions
│       ├── components/        # Reusable layout, cards, forms, and builder UI
│       ├── pages/             # Route-level React screens
│       ├── types/             # Shared frontend API types
│       ├── App.tsx            # Route definitions
│       └── main.tsx           # React entry point
├── tests/                     # Backend regression tests
├── deck.py                    # Starter deck definitions for seeding
├── main.py                    # Optional terminal matchup client
├── requirements.txt           # Python dependencies
├── start.ps1                  # Windows development launcher
├── .env.example               # Safe environment template
└── README.md
```

## Backend architecture

The backend follows a small route/service/model structure:

- `backend/routes/` validates HTTP-level input, translates errors into status codes, and returns JSON.
- `backend/services/` owns business rules, database queries, serialization, statistics, and card-image analysis.
- `backend/models.py` defines the SQLAlchemy entities and relationships.
- `backend/app.py` configures Flask, CORS, SQLite foreign keys, schema initialization, and blueprint registration.

There is currently no user authentication or production deployment configuration. Keep the development server on a trusted local machine unless those concerns are addressed first.

The major database entities are:

- `Deck`: a named deck identity, format, nation metadata, and aggregate record.
- `DeckVersion`: a saved build of a deck with a name, notes, and active state.
- `DeckCard`: a card, printing, quantity, zone, and ordering within one version.
- `Card`: shared gameplay identity such as name, grade, nation, and card type.
- `CardPrinting`: set code, set name, collector number, rarity, and image/product metadata.
- `Match`: two participating decks, optional deck versions, result, first player, format, date, and notes.

Deck-building rules are enforced in the service layer as well as reflected in the frontend. Known set codes are mapped to authoritative set names through `backend/services/card_set_names.py`, while unlisted and upcoming products can still be entered as custom sets.

## Frontend architecture

The frontend is a single-page React application:

- `pages/` composes each major workflow and owns page-level state.
- `components/` contains reusable UI and feature-specific sections.
- `api/` isolates calls to the Flask backend.
- `types/api.ts` describes the JSON contracts returned by Flask.
- `animations/` keeps animation setup separate from page and business logic.

Main screens include Dashboard, Play Lab, Deck Library, Card Library, Deck Builder, Nation Quiz, Match History, Analytics, and Rivalries.

## Deck and card rules currently enforced

- Card grades must be between 0 and 4.
- A core deck contains exactly 54 cards.
- The main deck contains no more than 50 cards.
- The ride deck contains exactly four cards.
- Ride-deck cards have quantity one.
- The ride deck contains one card each at grades 0, 1, 2, and 3.
- G-zone, token, and other auxiliary cards do not count toward the 54-card core.
- Editing a shared card cannot silently make an existing ride deck invalid.

These rules live in backend services so API requests cannot bypass them. The frontend also prevents common invalid actions and shows deck-completion feedback.

## Testing and quality checks

Run backend tests from the repository root:

```bash
python -m pytest -q
```

Run frontend linting and a production build:

```bash
cd frontend-web
npm run lint
npm run build
```

The production build is written to `frontend-web/dist/`.

## Optional terminal client

With Flask running, the original terminal workflow is still available:

```bash
python main.py
```

It requests a matchup from the API, prompts for the winner and notes, and saves the match. If the API is unavailable, it falls back to the starter definitions in `deck.py`, but fallback results are not persisted.

## Common issues

### The frontend cannot reach Flask

- Confirm `http://127.0.0.1:5000/api/health` returns JSON.
- Confirm the frontend is using the correct `VITE_CARDFIGHT_API_URL`.
- Restart Vite after changing frontend environment variables.

### `python` or a package is not found

- Confirm the virtual environment is activated.
- Reinstall dependencies with `python -m pip install -r requirements.txt`.
- Run `python -m pip --version` to verify which Python environment is active.

### `npm` or Vite fails to start

- Confirm the Node.js version satisfies Vite's requirement.
- Run `npm ci` inside `frontend-web/`.
- Remove and reinstall frontend dependencies only if the lockfile installation fails.

### Image analysis reports that it is disabled

The default provider is intentionally `mock`. Set the provider, model, and API key in `.env` to enable OpenAI-backed analysis.

### The database contains outdated local data

Back up the SQLite file first. Then either edit records through the application or recreate `instance/cardfight.db` and seed again.
