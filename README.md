# 🤖 BugZero AI — Autonomous DevOps Agent

> Automatically detect, fix, and prevent common issues in your code repositories.

BugZero AI is a Node.js webhook server that acts as an autonomous agent:
it listens for GitHub events, scans your code for secrets and quality issues,
applies AI-powered fixes, and opens a pull request — all without human intervention.

---

## Architecture

```
GitHub Push/PR
      │
      ▼
┌─────────────────┐
│  Webhook Server │  ← Express + HMAC signature verification
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Clone Repo     │  ← git clone --depth 1
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│         Detection Engine            │
│  🔑 Secret Patterns  (regex)        │
│  🧹 ESLint           (npx eslint)   │
│  🛡️  npm audit        (npm audit)    │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────┐
│  AI Fix Engine  │  ← GPT-4o-mini generates code repairs
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Commit & Push  │  ← New branch: bugzero/autofix-{timestamp}
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Pull Request   │  ← Auto-PR with full report + labels
└─────────────────┘
```

---

## Quick Start

### 1. Install dependencies

```bash
cd bugzero
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your tokens
```

Required values:

| Variable               | How to get it                                                     |
|------------------------|-------------------------------------------------------------------|
| `GITHUB_TOKEN`         | https://github.com/settings/tokens (scopes: `repo`, `workflow`)  |
| `GITHUB_WEBHOOK_SECRET`| `openssl rand -hex 32`                                            |
| `OPENAI_API_KEY`       | https://platform.openai.com/api-keys                             |

### 3. Start the server

```bash
npm start
# → 🤖 BugZero AI running on http://localhost:3000
```

### 4. Expose to GitHub (for local dev)

```bash
# Using ngrok:
ngrok http 3000
# Copy the HTTPS URL
```

### 5. Add GitHub Webhook

Go to your repo → **Settings → Webhooks → Add webhook**:

- **Payload URL**: `https://your-ngrok-url/webhook`
- **Content type**: `application/json`
- **Secret**: your `GITHUB_WEBHOOK_SECRET`
- **Events**: ✅ Pushes, ✅ Pull requests

---

## Demo Scenario

1. Create a file `app.js` in your repo with this content:

```js
// Intentionally insecure code for demo
const OPENAI_KEY = 'sk-proj-abcdefghijklmnopqrstuvwxyz1234567890'
const AWS_KEY    = 'AKIAIOSFODNN7EXAMPLE'

var unusedVar = 'oops'
console.log("starting server")
```

2. Commit and push to your repo
3. BugZero AI triggers automatically
4. Within ~60 seconds, a PR appears with:
   - Secrets replaced by `process.env.*`
   - `.env.example` updated
   - Lint issues fixed by AI
   - Full explanation in PR body

---

## Run the Demo Locally (no GitHub needed)

```bash
node test/demo.js
```

This runs the full detection pipeline against a sample insecure file and prints the results.

---

## API Endpoints

| Method | Path            | Description                         |
|--------|-----------------|-------------------------------------|
| POST   | `/webhook`      | GitHub webhook receiver             |
| GET    | `/api/events`   | Last 50 agent log events (JSON)     |
| POST   | `/api/trigger`  | Manually trigger agent on any repo  |
| GET    | `/api/status`   | Config health check                 |
| GET    | `/`             | Dashboard UI                        |

---

## Secret Patterns Detected

| Pattern        | Example match         | Replaced with                      |
|----------------|-----------------------|------------------------------------|
| OpenAI key     | `sk-proj-abc...`      | `process.env.OPENAI_API_KEY`       |
| AWS access key | `AKIAIOSFODNN7...`    | `process.env.AWS_ACCESS_KEY_ID`    |
| GitHub PAT     | `ghp_ABC...`          | `process.env.GITHUB_TOKEN`         |
| Stripe live    | `sk_live_ABC...`      | `process.env.STRIPE_SECRET_KEY`    |
| Bearer tokens  | `Bearer eyJhb...`     | `process.env.BEARER_TOKEN`         |
| Generic api_key| `api_key = "abc123"`  | `process.env.API_KEY`              |

---

## Production Considerations

- Replace the in-memory event log with Redis or PostgreSQL
- Add rate limiting to the webhook endpoint
- Use GitHub Apps instead of PATs for better security
- Run in Docker with resource limits (clone + ESLint can be memory-intensive)
- Store fix history in a database for audit trails
- Add Slack/Discord notifications for each auto-fix PR

---

## License

MIT © BugZero AI
