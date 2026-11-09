# Yesterday Search 🔍

Custom privacy-respecting metasearch engine powered by [SearXNG](https://github.com/searxng/searxng), customized for **Koyeb Free Tier** and AI Assistant (e.g. DeepResearch, Chatbot) integrations.

## Features ✨

- **Always Up-to-Date**: Automated GitHub Actions workflow checks and pulls the latest official SearXNG engine fixes daily.
- **AI-Ready**: Native JSON format enabled (`format=json`), rate limiter disabled (`limiter: false`).
- **Koyeb Free Tier Optimized**: Memory footprint ~120MB (well below Koyeb's 512MB RAM nano limit), internal port `8080` (HTTP), SSL terminated automatically by Koyeb.
- **Continuous Deployment**: Automatically triggers Koyeb redeployment webhook on every new build.

## Deployment on Koyeb

1. **Deployment Type**: Docker Image
2. **Image**: `ghcr.io/r1tain/yesterday-search:latest`
3. **Ports**: `8080` -> HTTP (Public)
4. **Environment Variables**:
   - `SEARXNG_BASE_URL`: `https://<your-app-subdomain>.koyeb.app/`
   - `SEARXNG_SECRET`: `<your-random-secret-key>`
   - `GRANIAN_BLOCKING_THREADS`: `2` (recommended for Koyeb Nano 0.1 vCPU)
   - `GRANIAN_WORKERS`: `1`

## Auto-Redeployment Webhook Setup

1. In your Koyeb Service settings -> **Deployments** / **Triggers**, copy the **Deploy webhook** URL.
2. Go to GitHub repo **Settings** -> **Secrets and variables** -> **Actions**.
3. Create a repository secret named `KOYEB_DEPLOY_WEBHOOK` with that URL.
