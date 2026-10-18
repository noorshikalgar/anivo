# 6. Self-host

> **NOTE:** The images go to `ghcr.io` with the 1.0 release. Before that, build them from the source code: `docker build -f docker/Dockerfile -t anivo .` and `docker build -f docker/server.Dockerfile -t anivo-server .`

## The web app

```bash
docker run -p 8080:8080 ghcr.io/noorshikalgar/anivo
```

The image is static files with NGINX (non-root, port 8080, health check at `/healthz`). Settings at start (environment variables):

| Variable | Use |
|---|---|
| `ANIVO_SERVER_URL` | The share server (see below). Empty: no share links |
| `ANIVO_AI_PROVIDERS` | AI panel providers that users can select |
| `ANIVO_AI_BASE_URL` | Your company LLM gateway |
| `ANIVO_DISABLE_EXTERNAL` | `true` blocks external network calls |

## The share server (optional)

```bash
docker run -p 8081:8081 -v anivo-data:/data ghcr.io/noorshikalgar/anivo-server
```

It stores encrypted scenes for share links. It cannot read them: the browser encrypts each scene, and the key is only in the link.

| Variable | Use | Default |
|---|---|---|
| `ANIVO_ALLOWED_ORIGINS` | Web app origins that can upload | `*` |
| `ANIVO_API_TOKENS` | Tokens for uploads (comma-separated) | none |
| `ANIVO_SHARE_TTL_DAYS` | Days before a share is deleted | 30 |
| `ANIVO_MAX_SHARE_MB` | Maximum size of one share | 64 |

> **WARNING:** If the share server is on a shared network, set `ANIVO_ALLOWED_ORIGINS` to your web app address.

Both together: see the `compose.yaml` example in [docs/11](../docs/11-distribution.md).
