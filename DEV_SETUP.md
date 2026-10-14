# Developer setup

The current frontend is React; the former Streamlit frontend is no longer part of this repository. The CLI in `main.py` remains supported.

1. Follow the platform-specific setup in [README](README.md#quick-start-on-windows).
2. Install development tools with `python -m pip install -r requirements-dev.txt`.
3. Start the API and React with `./start.ps1`, or use the [manual commands](README.md#manual-startup). Enable Flask debugging explicitly only when needed.
4. Run `python -m pytest -q` at the repository root, then `npm test`, `npm run lint`, and `npm run build` from `frontend-web`.
5. Run `python -m pip_audit -r requirements-dev.txt --no-deps --disable-pip` and `npm audit` after dependency changes. The development lock includes the runtime packages too.

Runtime packages are declared in `requirements.in`; test, formatting, and audit tools are declared in `requirements-dev.in`. Both generated `.txt` lockfiles pin package versions without hashes or dependency annotations. See the [dependency workflow](README.md#working-with-dependencies) before updating them.

See [deployment notes](docs/deployment.md) for the WSGI server, configuration, and private-hosting boundary. Tests use an isolated in-memory database; never point test commands at your saved database.
