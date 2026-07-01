FROM pytorch/pytorch:2.4.0-cuda12.4-cudnn9-runtime

RUN pip install --no-cache-dir \
    git+https://github.com/ostris/ai-toolkit.git \
    huggingface_hub \
    safetensors \
    accelerate \
    transformers \
    peft

WORKDIR /workspace
COPY entrypoint.sh /workspace/entrypoint.sh
COPY worker.py /workspace/worker.py
RUN chmod +x /workspace/entrypoint.sh

ENTRYPOINT ["/workspace/entrypoint.sh"]
