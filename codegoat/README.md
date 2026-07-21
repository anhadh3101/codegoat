# CodeGoat

CodeGoat is an AI-assisted pull-request review workspace. Users sign in with Supabase, connect GitHub through Composio, select a pull request, and discuss its changes with an AI agent. Conversation history and generated repository briefs are stored in Supabase.

## Run locally

Requirements: Node.js 20.19+; a Supabase project with the migration in [`supabase/migrations`](supabase/migrations) applied; OpenRouter and Composio API keys.

1. Create `frontend/.env.local` from [`frontend/.env.example`](frontend/.env.example), then set the Supabase URL and anon key. Leave `VITE_API_URL` blank locally.
2. Create `backend/.env`:

   ```dotenv
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_PUBLISHABLE_KEY=your-supabase-anon-key
   OPENROUTER_API_KEY=your-openrouter-api-key
   COMPOSIO_API_KEY=your-composio-api-key
   COMPOSIO_GITHUB_CALLBACK_URL=http://localhost:3000/api/integrations/github/callback
   FRONTEND_ORIGIN=http://localhost:5173
   ```

3. In separate terminals, install dependencies and run both services:

   ```bash
   cd backend && npm ci && NODE_OPTIONS=--env-file=.env npm run dev
   ```

   ```bash
   cd frontend && npm ci && npm run dev
   ```

Open the Vite URL (usually http://localhost:5173).

## Deploy to Render

[`render.yaml`](render.yaml) creates two services: a Node API and a static React site. Supabase remains your external database/auth service.

1. Commit and push this configuration to `main`.
2. Open the [Render Blueprint importer](https://dashboard.render.com/blueprint/new?repo=https://github.com/anhadh3101/openai-build-week-CodeGoat) and apply the Blueprint.
3. In Render, set the API service secrets: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `OPENROUTER_API_KEY`, `COMPOSIO_API_KEY`, `COMPOSIO_GITHUB_CALLBACK_URL`, and `FRONTEND_ORIGIN`.
4. Set the static-site build values: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_API_URL`.
5. After Render assigns URLs, set `VITE_API_URL` to the API URL and `FRONTEND_ORIGIN` to the static-site URL, then redeploy the static site.
6. Set `COMPOSIO_GITHUB_CALLBACK_URL` to `https://<api-service>.onrender.com/api/integrations/github/callback` and register the same callback URL with Composio. Add the static-site URL to Supabase Auth's allowed redirect URLs.

Never place `OPENROUTER_API_KEY` or `COMPOSIO_API_KEY` in variables beginning with `VITE_`; Vite exposes those values to the browser.
