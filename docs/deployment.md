# Running outside the development server

The API has debug disabled by default and supports a standard WSGI server. It
remains a single-user application without authentication or authorization. Keep
the API private or behind an access-controlled reverse proxy; CORS is a browser
policy, not a replacement for access control.

## API

Install the version-pinned runtime lock in a virtual environment:

```sh
python -m pip install -r requirements.txt
waitress-serve --host=127.0.0.1 --port=5000 backend.app:app
```

Waitress supports Windows and Unix. This command binds only to loopback and does
not enable Flask's development debugger or reloader. The existing `backend.app:app`
entry point is retained for other WSGI hosts. The application factory accepts an
explicit config mapping for tests or custom hosting.

## Frontend

Build the React app with Node 24 LTS:

```sh
cd frontend-web
npm ci
npm run build
```

Serve `frontend-web/dist` using a static web host with an SPA fallback to
`index.html`. API routes must go to Flask rather than the SPA fallback. If the
API lives at a different address, set `VITE_CARDFIGHT_API_URL` before building;
it is a build-time value. An empty value uses same-origin `/api/` requests when
a reverse proxy routes them to Flask. Vite's development/preview servers are
intended for development and build checks, not public hosting.

## Configuration and data

- `DATABASE_URL` selects the SQLAlchemy database. SQLite remains the default;
  keep `instance/cardfight.db` and back it up before changing deployment or schema.
- `CARDFIGHT_CORS_ORIGINS` accepts comma-separated literal HTTP(S) frontend
  origins. Its default contains localhost/127.0.0.1 on ports 5173 and 4173. Set it
  to your frontend's exact origin, or blank for same-origin-only hosting.
- JSON/multipart request bodies have a 16 MB application limit. Artwork imports
  retain the existing 8 MB image limit, decode validation, and approved URL hosts.
- `.env` is local configuration and stays out of Git. Neither the server setup
  nor dependency cleanup changes existing deck, match, artwork, or purchase data.

Expected validation and conflict errors retain useful messages. Unexpected
failures return a fixed JSON error and roll back the transaction; diagnostics
remain in server logs. The local launcher writes logs under `instance/`.

## Checks before release

Install `requirements-dev.txt` for tests and audit tools. CI runs the complete
backend suite, frontend tests, lint, build, and dependency audits. Dependabot
tracks Python, npm, and GitHub Actions updates. A clean local audit reports known
dependency advisories; GitHub's CodeQL results are verified separately after the
branch is pushed.

References: [Flask deployment guidance](https://flask.palletsprojects.com/en/stable/deploying/),
[Waitress setup](https://flask.palletsprojects.com/en/stable/deploying/waitress/),
[Flask configuration](https://flask.palletsprojects.com/en/stable/config/).
