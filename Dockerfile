FROM python:3.14-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /src

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        libffi-dev \
        libsodium-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src ./src
COPY config.yml ./config.yml
COPY assets ./assets

# Default configuration path; can be overridden via CONFIG_PATH env.
ENV CONFIG_PATH=/src/config.yml

CMD ["python", "-m", "src.main"]
