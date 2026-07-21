# CodeGoat

CodeGoat is an AI-assisted pull-request review workspace. Sign in with Supabase, connect GitHub through Composio, select a repository and pull request, and ask the agent to analyze the changes. Conversations and generated repository briefs are stored in Supabase.

## Local development

### Prerequisites

- Node.js 20.6 or newer
- A Supabase project with the migration in [`supabase/migrations`](supabase/migrations) applied
- An OpenRouter API key
- A Composio API key and a configured GitHub auth connection

### 1. Configure environment variables

Create `frontend/.env.local` from the supplied example:

```bash
cp frontend/.env.example frontend/.env.local
```

Set the following values in `frontend/.env.local`:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Create `backend/.env` and add:

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-supabase-anon-key
OPENROUTER_API_KEY=your-openrouter-api-key
COMPOSIO_API_KEY=your-composio-api-key
COMPOSIO_GITHUB_CALLBACK_URL=http://localhost:3000/api/integrations/github/callback
```

### 2. Install dependencies

Run these commands from the repository root:

```bash
cd backend && npm ci
cd ../frontend && npm ci
```

### 3. Start the API

In one terminal:

```bash
cd backend
NODE_OPTIONS=--env-file=.env npm run dev
```

The Fastify API runs on [http://localhost:3000](http://localhost:3000).

### 4. Start the frontend

In a second terminal:

```bash
cd frontend
npm run dev
```

Open the URL shown by Vite (normally [http://localhost:5173](http://localhost:5173)). The Vite development server proxies `/api` requests to the backend at port 3000.

## Checks

```bash
cd backend && npm test
cd frontend && npm run lint
```
