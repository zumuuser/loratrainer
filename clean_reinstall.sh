#!/bin/bash
# Exit on error
set -e

# Prompt for sudo password
echo -n "Enter your sudo password: "
read -s sudo_pass
echo ""

echo "=== Stopping any running instances of LoRA Trainer ==="
killall -9 "loratrainer" "LoRA Trainer" 2>/dev/null || pkill -f "LoRA Trainer" 2>/dev/null || true

echo "=== Purging old package installation ==="
echo "$sudo_pass" | sudo -S dpkg -P loratrainer || true

echo "=== Removing leftovers from /opt ==="
echo "$sudo_pass" | sudo -S rm -rf "/opt/LoRA Trainer" || true

echo "=== Cleaning up Cache, Settings & Temp Files ==="
# Move data we want to keep to a temp location
mkdir -p /tmp/lora_preserve
if [ -d "$HOME/.config/loratrainer/loratrainer" ]; then
    echo "Backing up database and datasets..."
    mv "$HOME/.config/loratrainer/loratrainer/loratrainer.db" /tmp/lora_preserve/ 2>/dev/null || true
    mv "$HOME/.config/loratrainer/loratrainer/datasets" /tmp/lora_preserve/ 2>/dev/null || true
    mv "$HOME/.config/loratrainer/loratrainer/models" /tmp/lora_preserve/ 2>/dev/null || true
fi

# Wipe ~/.config/loratrainer completely
echo "Removing app configuration and cache..."
rm -rf "$HOME/.config/loratrainer" || true

# Recreate folders and restore backed up items
echo "Restoring database and datasets..."
mkdir -p "$HOME/.config/loratrainer/loratrainer"
mv /tmp/lora_preserve/loratrainer.db "$HOME/.config/loratrainer/loratrainer/" 2>/dev/null || true
mv /tmp/lora_preserve/datasets "$HOME/.config/loratrainer/loratrainer/" 2>/dev/null || true
mv /tmp/lora_preserve/models "$HOME/.config/loratrainer/loratrainer/" 2>/dev/null || true
rm -rf /tmp/lora_preserve

echo "=== Installing newest package version ==="
echo "$sudo_pass" | sudo -S dpkg -i "/home/zackmayer/.gemini/antigravity/scratch/loratrainer/build_artifacts/loratrainer-linux/loratrainer_0.1.0_amd64.deb"

echo "=== Clean Reinstall Completed Successfully ==="
