# Aurel AI agents host (FastAPI + commerce-agents vendor).
# Build context: agent/ (docker compose dev/prod đã set).
FROM python:3.12-slim AS base
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY aurel_agents ./aurel_agents
COPY vendor ./vendor
COPY pyproject.toml ./

# Dữ liệu runtime (sessions/ledger/memory) — volume mount ở compose.
RUN mkdir -p /app/data && useradd -m -u 1000 agent && chown -R agent:agent /app
VOLUME /app/data

ENV AGENT_HOST=0.0.0.0 \
    AGENT_PORT=8100 \
    AUREL_BACKEND_URL=http://backend:4000
USER agent
EXPOSE 8100
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8100/health')"
CMD ["uvicorn", "aurel_agents.host:app", "--host", "0.0.0.0", "--port", "8100"]
