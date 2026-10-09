# sd-webui-gpu-monitor に貢献する

[ [English](./CONTRIBUTING.md) | 日本語 ]

## 開発

### 事前要件

- [python](https://www.python.org/) >= 3.10.0
- [node.js](https://nodejs.org/ja) >= 26.10.0
- [pnpm](https://pnpm.io/) == 12.9.1
- (pnpm@12.9.1 未導入の場合) [corepack](https://github.com/nodejs/corepack) >= 0.36.0

### セットアップ

1. このリポジトリをクローンします。
2. Python 仮想環境を作成して有効化し、Ruff をインストールします。
3. pnpm が未導入ならインストールします。`package.json` の `packageManager` でバージョンが固定されているため、Corepack (`corepack enable`) を有効にすれば自動で使われます。
4. Node.js の依存パッケージを pnpm でインストールします。

```bash
git clone https://github.com/datenn-si/sd-webui-gpu-monitor.git
cd sd-webui-gpu-monitor

python -m venv venv
venv\Scripts\activate
# Windows (PowerShell): `venv\Scripts\Activate.ps1`
# Mac/Linux: source venv/bin/activate
pip install ruff

corepack enable  # pnpm@12.9.1 未導入の場合
pnpm install
```

---

```bash
pnpm run prepare
```

`pnpm install` 時に `prepare` スクリプトが自動で実行されるため、この手順はフックを再登録したい場合にのみ必要です。

### コミット前の自動実行

`git commit` のたびに、ステージされたファイルだけに lint-staged が実行されます:

- `*.py`: `ruff check --fix` と `ruff format`
- `*.js`: `oxlint --fix`
- `*.js`, `*.css`, `*.json`, `*.md`: `oxfmt`

`.lintstagedrc.js` は `venv/Scripts/ruff.exe` (Windows) または `venv/bin/ruff` (POSIX) の Ruff を探し (`.venv` も確認)、見つからなければグローバルの `ruff` にフォールバックします。

そのため、ターミナルで仮想環境を有効化していなくてもコミットできます。oxlint と oxfmt が同じファイルを同時に編集しないよう、タスクは順次実行 (`--concurrent false`) されます。

### 手動実行する場合

| コマンド              | 説明                                          |
| --------------------- | --------------------------------------------- |
| `pnpm run lint`       | Ruff check と oxlint を実行                   |
| `pnpm run lint:py`    | Ruff check のみ実行                           |
| `pnpm run lint:js`    | oxlint のみ実行                               |
| `pnpm run lint:fix`   | Ruff check と oxlint を自動修正付きで実行     |
| `pnpm run format`     | Ruff format と oxfmt を実行                   |
| `pnpm run format:py`  | Ruff format のみ実行                          |
| `pnpm run format:web` | `.js`、`.css`、`.json`、`.md` に oxfmt を実行 |
| `pnpm run check`      | ファイルを変更せずにリントと整形を検証        |

### CI

`.github/workflows/lint.yml` は `main` を対象とする push と pull request のたびに実行されます。

- Python ジョブ: Python 3.10 をセットアップし、`ruff check .` と `ruff format --check .` を実行します。
- Web ジョブ: Node.js 26.10.0 をセットアップして依存関係をインストールし、`oxlint .` と `oxfmt --check` を実行します。

### Linterの調整

- 拡張機能がホスト側 WebUI から import するモジュールに合わせて、`pyproject.toml` の `known-first-party` を調整します。
- `no-undef` の誤検知を避けるため、`.oxlintrc.json` の `globals` に WebUI のグローバル変数を追加・削除します。
