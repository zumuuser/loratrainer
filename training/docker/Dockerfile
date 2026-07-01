FROM pytorch/pytorch:2.4.0-cuda12.4-cudnn9-runtime

RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
RUN git clone https://github.com/ostris/ai-toolkit.git /workspace/ai-toolkit

RUN pip install --no-cache-dir -r /workspace/ai-toolkit/requirements.txt

COPY entrypoint.sh /workspace/entrypoint.sh
COPY worker.py /workspace/worker.py
RUN chmod +x /workspace/entrypoint.sh

ENV PYTHONPATH="/workspace/ai-toolkit:${PYTHONPATH}"

ENTRYPOINT ["/workspace/entrypoint.sh"]
