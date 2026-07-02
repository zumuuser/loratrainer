FROM pytorch/pytorch:2.4.0-cuda12.4-cudnn9-runtime

RUN apt-get update && apt-get install -y git libgl1-mesa-glx libglib2.0-0 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN git clone https://github.com/ostris/ai-toolkit.git /app/ai-toolkit

RUN pip install --no-cache-dir -r /app/ai-toolkit/requirements.txt

COPY entrypoint.sh /app/entrypoint.sh
COPY worker.py /app/worker.py
RUN chmod +x /app/entrypoint.sh

ENV PYTHONPATH="/app/ai-toolkit:${PYTHONPATH}"

ENTRYPOINT ["/app/entrypoint.sh"]
