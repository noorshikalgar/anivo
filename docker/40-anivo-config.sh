#!/bin/sh
# Write runtime configuration from environment variables (docs/11 "Docker image").
set -eu
cat > /usr/share/nginx/html/config.js <<CONFIG
window.ANIVO_CONFIG = {
  serverUrl: "${ANIVO_SERVER_URL:-}",
  aiProviders: "${ANIVO_AI_PROVIDERS:-anthropic,openai,ollama}",
  aiBaseUrl: "${ANIVO_AI_BASE_URL:-}",
  telemetry: "${ANIVO_TELEMETRY:-off}",
  disableExternal: "${ANIVO_DISABLE_EXTERNAL:-false}" === "true"
};
CONFIG
