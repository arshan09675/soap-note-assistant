# SOAP Note Assistant

A local React + Vite app that turns raw clinical notes or voice transcripts into editable SOAP notes using Groq's Chat Completions API.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env` from the example file:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Add your server-side Groq API key:

   ```env
   VITE_GROQ_API_KEY=your-groq-api-key-here
   ```

4. Start the frontend and API proxy:

   ```bash
   npm run dev
   ```

The Vite frontend proxies `/api/generate` to the Express server on port `3001`.

## Scripts

- `npm run dev` starts the Express proxy and Vite together.
- `npm run dev:frontend` starts only Vite.
- `npm run dev:server` starts only the API proxy.
- `npm run build` creates a production frontend build.
- `npm run lint` runs Oxlint.

Generated SOAP notes are drafts and must be reviewed by a licensed clinician.
