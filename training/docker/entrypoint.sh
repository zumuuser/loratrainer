#!/bin/bash
# Entrypoint for cloud GPU training container
set -e

export HF_HOME=/workspace/.cache/huggingface

echo "=== LoRA Trainer Cloud Worker ==="

# 1. Start worker server to accept dataset uploads and the config yaml
python3 /app/worker.py

# 2. Apply python signature compatibility patch to diffusers
echo "=== Patching Diffusers ==="
python3 -c "
path = '/opt/conda/lib/python3.11/site-packages/diffusers/models/attention_dispatch.py'
import os
if os.path.exists(path):
    content = open(path).read()
    content = content.replace('_custom_op = torch.library.custom_op', '_custom_op = lambda *a, **kw: (lambda fn: fn)')
    content = content.replace('_register_fake = torch.library.register_fake', '_register_fake = lambda *a, **kw: (lambda fn: fn)')
    open(path, 'w').write(content)
" || echo "Patch not applied or not needed"

# 3. Run training via AI Toolkit
echo "=== Beginning Training ==="
python3 /app/ai-toolkit/run.py /workspace/config/train.yaml

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
