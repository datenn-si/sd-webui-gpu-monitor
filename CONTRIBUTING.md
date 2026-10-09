# Contributing to sd-webui-gpu-monitor

[ English | [日本語](./CONTRIBUTING.ja.md) ]

## Development

### Prerequisites

- [python](https://www.python.org/) >= 3.10.0
- [node.js](https://nodejs.org/ja) >= 26.10.0
- [pnpm](https://pnpm.io/) == 12.9.1
- (If pnpm@12.9.1 is not installed) [corepack](https://github.com/nodejs/corepack) >= 0.36.0

### Setup

1. Clone this repository.
2. Create a Python virtual environment, activate it, and install Ruff.
3. Install pnpm if it is not available yet. The `packageManager` field in `package.json` pins the version, so Corepack (`corepack enable`) picks it up automatically.
4. Install Node.js dependencies using pnpm.

```bash
git clone https://github.com/datenn-si/sd-webui-gpu-monitor.git
cd sd-webui-gpu-monitor

python -m venv venv
venv\Scripts\activate
# Windows (PowerShell): `venv\Scripts\Activate.ps1`
# Mac/Linux: source venv/bin/activate
pip install ruff

corepack enable  # If pnpm@12.9.1 is not installed
pnpm install
```

---

```bash
pnpm run prepare
```

`pnpm install` runs the `prepare` script automatically, so this step is only needed when the hooks have to be re-registered.

### Pre-Commit Automated Execution

Every `git commit` runs lint-staged on the staged files only:

- `*.py`: `ruff check --fix` and `ruff format`
- `*.js`: `oxlint --fix`
- `*.js`, `*.css`, `*.json`, `*.md`: `oxfmt`

`.lintstagedrc.js` looks for Ruff in `venv/Scripts/ruff.exe` (Windows) or `venv/bin/ruff` (POSIX), also checking `.venv`, and falls back to a global `ruff`.

Commits therefore work even when the virtual environment is not activated in your terminal. The hook runs tasks sequentially (`--concurrent false`) so that oxlint and oxfmt never edit the same file at the same time.

### To run manually

| Command               | Description                                         |
| --------------------- | --------------------------------------------------- |
| `pnpm run lint`       | Run Ruff check and oxlint                           |
| `pnpm run lint:py`    | Run Ruff check only                                 |
| `pnpm run lint:js`    | Run oxlint only                                     |
| `pnpm run lint:fix`   | Run Ruff check and oxlint with auto-fix             |
| `pnpm run format`     | Run Ruff format and oxfmt                           |
| `pnpm run format:py`  | Run Ruff format only                                |
| `pnpm run format:web` | Run oxfmt on `.js`, `.css`, `.json` and `.md` files |
| `pnpm run check`      | Verify lint and format without modifying files      |

### CI

`.github/workflows/lint.yml` runs on every push and pull request targeting `main`.

- Python job: sets up Python 3.10, then runs `ruff check .` and `ruff format --check .`.
- Web job: sets up Node.js 26.10.0, installs dependencies, then runs `oxlint .` and `oxfmt --check`.

### Adjustment of Linter

- Adjust `known-first-party` in `pyproject.toml` to match the modules your extension imports from the host WebUI.
- Add or remove WebUI global variables in the `globals` section of `.oxlintrc.json` to avoid false `no-undef` reports.
