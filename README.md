# sd-webui-gpu-monitor

[ English | [日本語](./README.ja.md) ]

sd-webui-gpu-monitor is a lightweight GPU monitoring overlay for Stable Diffusion WebUI Forge Neo.

## Features

- **Real-time GPU monitoring**: Displays GPU usage, VRAM usage, GPU temperature, and power consumption in a floating window.
- **Lightweight and fast**: Minimizes network bandwidth by communicating in JSON format with shortened key names.
- **Stops communication when closed or minimized**: Automatically stops API communication when the window is closed or minimized, avoiding unnecessary traffic.
- **Click-through mode**:
  - When click-through is enabled, the floating window header is hidden and the window can be clicked through, allowing direct interaction with the WebUI behind it.
  - Opacity can be freely adjusted from the settings modal (0.1 to 0.9).
- **Quick settings integration**: Adds control buttons to the end of the quick settings bar at the top of the screen.
  - `[📈]`: Left-click to show or hide the window; right-click to toggle click-through mode (changes to `[🖱️]` when enabled).
  - `[⚙️]`: Left-click to open the settings modal.
- **Customizable display items**: Toggles each metric on or off from the settings screen, including GPU usage, VRAM usage, the VRAM usage bar, GPU temperature, and power consumption. The GPU name is always shown for error display.
- **Multilingual support (i18n)**: Supports display in multiple languages, following the settings file or the language detected from the HTML lang attribute.
  - Supported languages: `English`, `日本語`

## Installation

### Method 1: Install via WebUI (recommended)

1. Open the **Extensions** tab and select the **Install from URL** tab.
2. Enter this repository URL in the **URL for extension's git repository** field:
   `https://github.com/datenn-si/sd-webui-gpu-monitor`
3. Click the **Install** button.
4. After installation is complete, go to the **Installed** tab and click **Apply and quit** to restart the WebUI.

### Method 2: Install directly with Git

1. Open a terminal (or command prompt) and move to the WebUI extensions folder.
2. Clone the repository.
3. Restart the WebUI.

```bash
cd <WebUI installation path>/extensions
git clone https://github.com/datenn-si/sd-webui-gpu-monitor.git
```

## Contributing

See the [Contributing Guide](./CONTRIBUTING.md) for detailed development setup and guidelines.

## Author

[Datenshi](https://github.com/datenn-si/)

## License

sd-webui-gpu-monitor is licensed under [MIT License](./LICENSE).
