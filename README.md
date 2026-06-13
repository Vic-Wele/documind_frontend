https://documind-frontend-qtsusar1x-vic-wele-projects.vercel.app/

# DocuMind — Frontend

A sleek, modern chat interface for **DocuMind**, a Retrieval-Augmented Generation (RAG) chatbot. Upload a PDF, then ask questions answered straight from your document — with cited sources.

Built with Next.js and a glassmorphism UI that supports both light and dark themes.

> Backend repo: a FastAPI + LangChain service. This app reads its URL from `NEXT_PUBLIC_API_URL`.

---

## Features

- **Drag-and-drop PDF upload** with live indexing status.
- **Conversational chat** with Markdown-rendered, source-cited answers.
- **Light & dark themes** — royal-sky blue (`#0CAFFF`) in light mode, seafoam green in dark mode — with a toggle, system-preference detection, and no flash on load.
- **Glassmorphism design** — animated gradient backdrop, smooth message animations, typing indicator, and polished empty/loading/error states.
- **Per-visitor sessions** — sends a persistent `X-Session-Id` so each visitor's document stays isolated on the backend.
- **Suggested prompts**, auto-scroll, auto-resizing input, and Enter-to-send.

## Tech stack

- [Next.js](https://nextjs.org) (App Router) + React
- TypeScript
- Tailwind CSS v4
- `react-markdown` for rendering answers

---

## Local development

Requires Node.js 18+ and the [backend](#) running locally.

```bash
# 1. Install dependencies
npm install

# 2. Configure the API URL
cp .env.example .env.local       # defaults to http://127.0.0.1:8000

# 3. Run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

| Variable              | Required | Description                                             |
| --------------------- | -------- | ------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL` | Yes      | Base URL of the backend API (no trailing slash).        |

## Deployment (Vercel)

1. Push this repo to GitHub.
2. On [Vercel](https://vercel.com): **Add New → Project** and import the repo.
3. Add the environment variable `NEXT_PUBLIC_API_URL`, set to your deployed backend URL (e.g. `https://your-backend.up.railway.app`).
4. Deploy. Vercel auto-detects Next.js — no extra config needed.
5. Finally, set the backend's `ALLOWED_ORIGINS` to your Vercel URL to lock down CORS.

## Project structure

```
app/
  layout.tsx     # Root layout + theme bootstrap (no-flash)
  page.tsx       # Chat UI, upload, theme toggle, session handling
  globals.css    # Theme tokens, glassmorphism, animations, markdown styles
components/
  Message.tsx    # Chat bubble (user / assistant) with Markdown rendering
```
