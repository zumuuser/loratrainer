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

# 2b. Apply scaled_dot_product_attention enable_gqa compatibility patch to Krea-2 mmdit
echo "=== Patching Krea-2 mmdit ==="
python3 -c "
path = '/app/ai-toolkit/extensions_built_in/diffusion_models/krea2/src/mmdit.py'
import os
if os.path.exists(path):
    content = open(path).read()
    old_block = '''    with sdpa_kernel(SDPBackend.CUDNN_ATTENTION):
        x = F.scaled_dot_product_attention(
            q, k, v, attn_mask=mask, scale=scale, enable_gqa=gqa
        )'''
    new_block = '''    if q.shape[1] != k.shape[1]:
        num_groups = q.shape[1] // k.shape[1]
        k = k.repeat_interleave(num_groups, dim=1)
        v = v.repeat_interleave(num_groups, dim=1)
        gqa = False
    try:
        x = F.scaled_dot_product_attention(
            q, k, v, attn_mask=mask, scale=scale, enable_gqa=gqa
        )
    except TypeError:
        x = F.scaled_dot_product_attention(
            q, k, v, attn_mask=mask, scale=scale
        )'''
    if old_block in content:
        content = content.replace(old_block, new_block)
        open(path, 'w').write(content)
" || echo "Krea-2 mmdit patch not applied or not needed"

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
