import launch

if not launch.is_installed("pynvml"):
    launch.run_pip("install nvidia-ml-py", "nvidia-ml-py for sd-webui-gpu-monitor")
