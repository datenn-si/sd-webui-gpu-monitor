# sd-webui-gpu-monitor

[ [English](./README.md) | 日本語 ]

sd-webui-gpu-monitor は Stable Diffusion WebUI Forge Neo 向けの軽量な GPU 監視オーバーレイです。

## 機能

- **リアルタイムGPUモニタリング**: GPU 使用率、VRAM 使用量、GPU 温度、消費電力をフローティングウィンドウに表示します。
- **軽量・高速**: キーの文字数を削減した JSON 形式の通信で、ネットワーク帯域を最小限に抑えています。
- **閉じた際や最小化した際の通信停止**: ウィンドウを閉じるか最小化した際はAPI通信を自動停止し無駄な通信を行いません。
- **クリックスルーモード**:
  - クリックスルー有効時はフローティングウィンドウのヘッダーを隠し、フローティングウィンドウをすり抜けさせて背後のWebUIを直接操作できます。
  - 設定モーダルから透明度（0.1〜0.9）を自由に調整できます。
- **クイック設定への統合**: 画面上部クイック設定バーの末尾に操作ボタンを配置しています。
  - `[📈]`: 左クリックでウィンドウの表示/非表示、右クリックでクリックスルーの切り替え（有効時は `[🖱️]` に変化）ができます。
  - `[⚙️]`: 左クリックで設定モーダルを起動します。
- **表示項目のカスタマイズ**: 設定画面から各指標（GPU 使用率、VRAM 使用量、VRAM 使用量バー、GPU 温度、消費電力）の表示/非表示を個別に切替可能です。（※GPU名はエラー表示のため常時表示）。
- **多言語対応 (i18n)**: 多言語での表示に対応しています。（設定ファイルまたは HTML の lang 属性に基づく自動判定に追従）。
  - 対応言語： `English`, `日本語`

## インストール

### 方法1: WebUI経由でインストール（推奨）

1. **Extensions** タブを開き、**Install from URL** タブを選択します。
2. **URL for extension's git repository** の入力欄に、このリポジトリのURLを入力します:
   `https://github.com/datenn-si/sd-webui-gpu-monitor`
3. **Install** ボタンを押します。
4. インストール完了後、**Installed** タブに移動し、**Apply and quit** を押してWebUIを再起動します。

### 方法2: Gitコマンドで直接インストール

1. ターミナル（またはコマンドプロンプト）を開き、WebUIの拡張機能フォルダへ移動します。
2. リポジトリをクローンします。
3. WebUIを再起動します。

```bash
cd <WebUIのインストールパス>/extensions
git clone https://github.com/datenn-si/sd-webui-gpu-monitor.git
```

## 貢献する

[Contributing Guide](./CONTRIBUTING.ja.md) で詳細な開発環境のセットアップ方法及びガイドラインを確認してください。

## 作者

[だてんし](https://github.com/datenn-si/)

## License

sd-webui-gpu-monitor は [MIT License](./LICENSE) の下で提供されています。
