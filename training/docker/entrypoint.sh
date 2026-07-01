#!/bin/bash
# Entrypoint for cloud GPU training container
set -e

echo "=== LoRA Trainer Cloud Worker ==="

if [ -z "$CONFIG_YAML" ]; then
  echo "ERROR: CONFIG_YAML env var not set"
  exit 1
fi

# Write config YAML to file
mkdir -p /workspace/config
echo "$CONFIG_YAML" > /workspace/config/train.yaml

# Run training via AI Toolkit
python -m toolkit.job /workspace/config/train.yaml

echo "=== Generating Sample Images ==="
# Simple inference script using generated LoRA weights
python -c "
import os
from toolkit.job import get_job
# Custom script to generate sample images with base model + LoRA
" || echo "Sample generation failed, continuing"

# Start Python HTTP server in output directory
mkdir -p /workspace/output
touch /workspace/output/done.txt
cd /workspace/output && python3 -m http.server 8000 &

echo "=== Server active. Awaiting download from client... ==="
# Safety timeout (2 hours)
sleep 7200
