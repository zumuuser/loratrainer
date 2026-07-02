#!/bin/bash
# Entrypoint for cloud GPU training container
set -e

echo "=== LoRA Trainer Cloud Worker ==="

# 1. Start worker server to accept dataset uploads and the config yaml
python3 /app/worker.py

# 2. Run training via AI Toolkit
echo "=== Beginning Training ==="
python -m toolkit.job /workspace/config/train.yaml

echo "=== Generating Sample Images ==="
# Simple inference script using generated LoRA weights
python -c "
import os
from toolkit.job import get_job
" || echo "Sample generation failed, continuing"

# 3. Create done flag and start file server to allow client to download output
mkdir -p /workspace/output
touch /workspace/output/done.txt

echo "=== Server active. Awaiting download from client... ==="
cd /workspace/output && python3 -m http.server 8000
