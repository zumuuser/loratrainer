#!/bin/bash
# Entrypoint for cloud GPU training container
# Expects: CONFIG_PATH env var pointing to YAML config
set -e

echo "=== LoRA Trainer Cloud Worker ==="
echo "Config: $CONFIG_PATH"

if [ -z "$CONFIG_PATH" ]; then
  echo "ERROR: CONFIG_PATH not set"
  exit 1
fi

python -m toolkit.job "$CONFIG_PATH"

echo "=== Training Complete ==="
