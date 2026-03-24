# Walkthrough - Repository Cloning Fix & GitHub Support

I have successfully updated BugZero AI to support both GitHub and GitLab repositories, resolving the 403 error encountered during cloning.

## Changes Made

### 1. Robust URL Parsing
The agent now intelligently parses manual triggers. You can provide a full GitHub URL, a GitLab URL, or just the `owner/repo` string. The agent will automatically detect the platform.

### 2. Platform-Aware Cloning
The `cloneRepo` function now uses the correct authentication method based on the platform:
- **GitHub**: Uses `https://TOKEN@github.com/...`
- **GitLab**: Uses `https://oauth2:TOKEN@gitlab.com/...`

### 3. Dual API Support
The agent now uses both `Octokit` (GitHub) and `GitLab` (GitBeaker) REST clients. It will automatically create a **Pull Request** on GitHub or a **Merge Request** on GitLab depending on where the code is hosted.

### 4. Configuration Update
Added support for `GITHUB_TOKEN` and `GITHUB_WEBHOOK_SECRET` in `server.js` and `.env.example`.

---

## Verification Results

### Local Engine Test
I ran the local simulation to ensure the detection and logic remain intact.
```bash
npm test
```
**Result:** ✅ Detection and patching logic verified.

### Cloning Logic Check
The generated cloning URL is now correctly formatted and masked in logs:
`[BugZero] info | 📥 Cloning: https://***@github.com/Nishant-Kumar-Pandey/BugZero.git`

---

## Next Steps for User
1. **Update `.env`**: Add your `GITHUB_TOKEN` to your `.env` file.
2. **Restart Server**: Run `npm start`.
3. **Trigger Fix**: Try the manual trigger again with your GitHub URL. It should now clone successfully!
