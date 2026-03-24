<p align="center">
  <img src="thumbnail.png" width="800" alt="BugZero AI Thumbnail">
</p>

# 🤖 BugZero AI — Autonomous DevOps Agent

> **Zero Bugs. Zero Leaks. Zero Effort.** | Autonomous intelligence that monitors, fixes, and secures your code 24/7.

BugZero AI is a high-performance Node.js agent that acts as your private DevOps engineer. It listens for GitHub/GitLab webhooks, scans your code for security leaks and quality issues, generates AI-powered repairs using GPT-4o-mini, and opens pull requests — all before you even realize there was a problem.

---

## ⚡ Key Highlights (Hackathon Features)

- **Autonomous Intelligence**: Uses GPT-4o-mini to not just find bugs, but intelligently repair them.
- **Security First**: Real-time secret detection (API keys, tokens) with automatic redaction and rotation warnings.
- **Universal Fixer**: Combines regex patterns, ESLint, and npm audit into a single, cohesive fixing pipeline.
- **Manual Control**: A sleek dashboard that allows manual triggers on any public repository.
- **Security-as-Code**: Automatically updates `.env.example` and commits safe code revisions.

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

This project is licensed under the [MIT License](LICENSE).

---

# 🛠️ About BugZero AI

## ✨ The Inspiration
In the fast-paced world of modern DevOps, the window between a developer pushing code and a security vulnerability being discovered is often measured in **hours or days**. During this window, sensitive API keys can be compromised, and low-quality code can infiltrate production.

We were inspired by the idea of **"Zero-Mean-Time-to-Fix"**. Why wait for a human to review a simple linting error or a leaked secret when an AI can do it in seconds? BugZero was born to be the "private investigator" of your repository—always watching, always fixing, and never sleeping.

## 🛠️ How We Built It
BugZero is built on a high-performance **Node.js** architecture designed for low-latency webhook processing. The engine follows a 4-step linear pipeline:

1.  **Webhook Internalization**: An Express.js server verifies HMAC signatures to ensure payload integrity.
2.  **Detection Engine**: We implemented a hybrid system using high-speed regex for secret detection and `npm audit` for dependency graphs.
3.  **AI Repair Logic**: We utilized **GPT-4o-mini** via the OpenAI API to analyze code context and generate repairs.
4.  **Git Automation**: Automated branch creation and Merge/Pull Request submission via the Octokit and GitBeaker libraries.

## 🧠 What We Learned
Throughout the hackathon, we gained deep insights into:
- **Git Internals**: Managing shallow clones and branch head-switching via automated scripts.
- **AI Prompt Engineering**: Learning how to constrain LLM output to produce *only* code without hallucinating unnecessary explanations.
- **Security-as-Code**: Understanding the lifecycle of a leaked secret and how to replace it with `process.env` equivalents without breaking the build.

## 🚧 Challenges We Faced
- **API Rate Limiting**: Handling GitHub and OpenAI rate limits when processing multiple concurrent webhooks.
- **Context Windows**: For large files, we had to implement intelligent "chunking" to ensure the AI only received the relevant lines of code to optimize token usage.
- **Verification**: Ensuring that the AI's "fix" doesn't introduce *new* bugs.

---
**BugZero AI** — *Zero Bugs. Zero Leaks. Zero Effort.*
