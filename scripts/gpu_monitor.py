import json
import os
import re
import threading

import pynvml  # pyright: ignore[reportMissingImports]
from fastapi import FastAPI, Request  # pyright: ignore[reportMissingImports]
from fastapi.responses import Response  # pyright: ignore[reportMissingImports]
from modules import script_callbacks  # pyright: ignore[reportMissingImports]

if pynvml is None:
    raise RuntimeError("pynvml unavailable")

EXTENSION_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(EXTENSION_ROOT, "config.json")
LOCALES_DIR = os.path.join(EXTENSION_ROOT, "locales")
DEFAULTS = {"gpu_index": 0, "polling_rate": 2000, "retry_rate": 10000}
LIMITS = {
    "gpu_index": (0, 1024),
    "polling_rate": (500, 3600000),
    "retry_rate": (1000, 3600000),
}
LOCALE_STEM = re.compile(r"^[A-Za-z0-9_-]{1,32}$")
GIB = 1024**3
METRIC_KEYS = ("show_usage", "show_vram", "show_vram_bar", "show_temp", "show_power")
OPACITY_MIN = 0.1
OPACITY_MAX = 0.9
OPACITY_STEP = 0.05
OPACITY_DEFAULT = 0.5

nvml_lock = threading.Lock()
nvml_state = {"initialized": False}
config_lock = threading.Lock()


def valid_int(value, minimum, maximum):
    return isinstance(value, int) and not isinstance(value, bool) and minimum <= value <= maximum


def read_raw_config():
    try:
        with open(CONFIG_PATH, encoding="utf-8") as handle:
            raw = json.load(handle)
    except Exception:
        return {}
    return raw if isinstance(raw, dict) else {}


def load_config():
    config = dict(DEFAULTS)
    raw = read_raw_config()
    for key, (minimum, maximum) in LIMITS.items():
        if valid_int(raw.get(key), minimum, maximum):
            config[key] = raw[key]
    return config


def load_language():
    value = read_raw_config().get("language")
    if not isinstance(value, str):
        return "auto"
    code = value.strip().lower().replace("_", "-")
    if not code or not re.match(r"^[a-z0-9-]{1,32}$", code):
        return "auto"
    return code


def load_metrics():
    raw = read_raw_config()
    return {key: raw[key] if isinstance(raw.get(key), bool) else True for key in METRIC_KEYS}


def valid_opacity(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    if value < OPACITY_MIN - 1e-9 or value > OPACITY_MAX + 1e-9:
        return False
    steps = value / OPACITY_STEP
    return abs(steps - round(steps)) < 1e-6


def load_opacity():
    value = read_raw_config().get("click_through_opacity")
    if value is None:
        return OPACITY_DEFAULT
    if valid_opacity(value):
        return round(float(value), 2)
    return OPACITY_DEFAULT


def load_locales():
    locales = {}
    try:
        names = sorted(os.listdir(LOCALES_DIR))
    except OSError:
        return locales
    for filename in names:
        stem, extension = os.path.splitext(filename)
        if extension.lower() != ".json" or not LOCALE_STEM.match(stem):
            continue
        try:
            with open(os.path.join(LOCALES_DIR, filename), encoding="utf-8") as handle:
                raw = json.load(handle)
        except Exception:
            continue
        if not isinstance(raw, dict):
            continue
        locales[stem.lower().replace("_", "-")] = {
            key: value
            for key, value in raw.items()
            if isinstance(key, str) and isinstance(value, str)
        }
    return locales


def ensure_nvml():
    if pynvml is None:
        raise RuntimeError("pynvml unavailable")
    if not nvml_state["initialized"]:
        pynvml.nvmlInit()
        nvml_state["initialized"] = True


def shutdown_nvml():
    if pynvml is not None and nvml_state["initialized"]:
        try:
            pynvml.nvmlShutdown()
        except Exception:
            pass
    nvml_state["initialized"] = False


def read_power(handle):
    try:
        draw = pynvml.nvmlDeviceGetPowerUsage(handle) / 1000.0
        limit = pynvml.nvmlDeviceGetEnforcedPowerLimit(handle) / 1000.0
    except pynvml.NVMLError:
        return 0.0, 0.0
    return draw, limit


def collect_stats():
    config = load_config()
    with nvml_lock:
        try:
            ensure_nvml()
            count = pynvml.nvmlDeviceGetCount()
            if count < 1:
                raise RuntimeError("no gpu")
            index = config["gpu_index"]
            if index >= count:
                index = 0
            handle = pynvml.nvmlDeviceGetHandleByIndex(index)
            name = pynvml.nvmlDeviceGetName(handle)
            if isinstance(name, bytes):
                name = name.decode("utf-8", "ignore")
            utilization = pynvml.nvmlDeviceGetUtilizationRates(handle)
            memory = pynvml.nvmlDeviceGetMemoryInfo(handle)
            temperature = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
            power_draw, power_limit = read_power(handle)
        except Exception:
            shutdown_nvml()
            raise
    power_draw = min(power_draw, power_limit)
    return {
        "e": False,
        "d": {
            "n": str(name),
            "u": int(utilization.gpu),
            "vu": round(memory.used / GIB, 1),
            "vt": round(memory.total / GIB, 1),
            "t": int(temperature),
            "pd": int(round(power_draw)),
            "pl": int(round(power_limit)),
        },
    }


def current_settings():
    config = load_config()
    settings = {
        "language": load_language(),
        "polling_rate": config["polling_rate"],
        "retry_rate": config["retry_rate"],
        "min": {
            "polling_rate": LIMITS["polling_rate"][0],
            "retry_rate": LIMITS["retry_rate"][0],
        },
        "max": {
            "polling_rate": LIMITS["polling_rate"][1],
            "retry_rate": LIMITS["retry_rate"][1],
        },
    }
    settings.update(load_metrics())
    settings["click_through_opacity"] = load_opacity()
    settings["opacity"] = {"min": OPACITY_MIN, "max": OPACITY_MAX, "step": OPACITY_STEP}
    return settings


def parse_update(payload):
    if not isinstance(payload, dict):
        return None
    language = payload.get("language")
    polling_rate = payload.get("polling_rate")
    retry_rate = payload.get("retry_rate")
    if not isinstance(language, str):
        return None
    if not valid_int(polling_rate, *LIMITS["polling_rate"]):
        return None
    if not valid_int(retry_rate, *LIMITS["retry_rate"]):
        return None
    code = language.strip().lower().replace("_", "-")
    if code != "auto" and code not in load_locales():
        return None
    opacity = payload.get("click_through_opacity")
    if not valid_opacity(opacity):
        return None
    update = {
        "language": code,
        "polling_rate": polling_rate,
        "retry_rate": retry_rate,
        "click_through_opacity": round(float(opacity or OPACITY_DEFAULT), 2),
    }
    for key in METRIC_KEYS:
        value = payload.get(key)
        if not isinstance(value, bool):
            return None
        update[key] = value
    return update


def write_config(updates):
    with config_lock:
        merged = dict(DEFAULTS, language="auto", click_through_opacity=OPACITY_DEFAULT)
        merged.update({key: True for key in METRIC_KEYS})
        merged.update(read_raw_config())
        merged.update(updates)
        temp_path = CONFIG_PATH + ".tmp"
        with open(temp_path, "w", encoding="utf-8") as handle:
            json.dump(merged, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
        os.replace(temp_path, CONFIG_PATH)


def json_response(payload, status_code=200):
    body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    return Response(
        content=body,
        status_code=status_code,
        media_type="application/json",
        headers={"Cache-Control": "no-store"},
    )


def build_stats_response():
    try:
        payload = collect_stats()
    except Exception:
        payload = {"e": True}
    return json_response(payload)


def build_locales_response():
    return json_response({"locales": load_locales()})


async def handle_config_update(request):
    content_type = request.headers.get("content-type", "")
    if not content_type.lower().startswith("application/json"):
        return json_response({"error": True}, 415)
    try:
        payload = await request.json()
    except Exception:
        return json_response({"error": True}, 400)
    update = parse_update(payload)
    if update is None:
        return json_response({"error": True}, 400)
    try:
        write_config(update)
    except Exception:
        return json_response({"error": True}, 500)
    return json_response(current_settings())


def on_app_started(_, app: FastAPI):
    @app.get("/gpu_monitor/stats", include_in_schema=False)
    def gpu_monitor_stats():
        return build_stats_response()

    @app.get("/gpu_monitor/locales", include_in_schema=False)
    def gpu_monitor_locales():
        return build_locales_response()

    @app.get("/gpu_monitor/config", include_in_schema=False)
    def gpu_monitor_config_get():
        return json_response(current_settings())

    @app.post("/gpu_monitor/config", include_in_schema=False)
    async def gpu_monitor_config_post(request: Request):
        return await handle_config_update(request)


script_callbacks.on_app_started(on_app_started)
