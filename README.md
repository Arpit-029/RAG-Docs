# DocMind

Chat with your PDFs in the browser. Uses Groq (llama-3.3-70b) for answers, PDF.js for parsing.

## Run locally

```bash
npm install
npm run dev
```

## Deploy to Vercel

```bash
npm run build
```

Or just push to GitHub and import in Vercel — it auto-detects Vite.

## Notes

- Your Groq API key is stored in localStorage (browser only, never sent anywhere else)
- Get a free key at https://console.groq.com/keys
- No backend needed — everything runs in the browser
