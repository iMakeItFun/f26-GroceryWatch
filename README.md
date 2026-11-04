# GroceryWatch

A mobile app for comparing grocery prices across nearby stores. Built for CS 411W at Old Dominion University.

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile app | React Native with Expo (TypeScript) |
| Backend API | Node.js with Fastify (TypeScript) |
| Database | PostgreSQL hosted on Supabase |
| Scheduled ingestion | Node script run as a Railway cron service |
| Product data | Open Food Facts, Kroger API |
| Hosting | Railway |

## Repository Structure

```
f26-GroceryWatch/
├── mobile/              Expo mobile app
├── api/                 Fastify API
│   └── src/
│       ├── index.ts     API server and routes
│       ├── db.ts        Database connection pool
│       ├── kroger.ts    Kroger store and price client
│       └── jobs/
│           └── ingest.ts  Scheduled ingestion job
└── supabase/            Database migrations
```

## Prerequisites

Install these before starting:

- [Node.js](https://nodejs.org/) LTS version (20 or newer)
- [Git](https://git-scm.com/)
- [VS Code](https://code.visualstudio.com/) (recommended; it shows hidden files like `.env`)
- The **Expo Go** app on your phone (update it to the latest version from the app store)

You will also need from the team:

- Access to the GitHub repository
- The Supabase **database password** (shared privately, never in the repo or group chat)
- The Kroger **client ID** and **client secret** (shared privately, never in the repo or group chat). Map, store search, and in-store prices need these. Catalog search through Open Food Facts works without them.

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/iMakeItFun/f26-GroceryWatch.git
cd f26-GroceryWatch
```

### 2. Set up the API

```bash
cd api
npm install
```

Create your local environment file by copying the example:

```bash
# macOS / Linux / Git Bash
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env
```

`api/.env` only holds non-secret settings. The example file sets `PORT=3000`.

Set these three values in the user environment on your computer, not in the file. `DATABASE_URL` is the full Supabase Session pooler string, with the database password already included (see [Getting the Database URL](#getting-the-database-url) below).

```powershell
# Windows PowerShell
[Environment]::SetEnvironmentVariable('DATABASE_URL', 'postgresql://postgres.<project-ref>:<database-password>@<pooler-host>:5432/postgres', 'User')
[Environment]::SetEnvironmentVariable('KROGER_CLIENT_ID', '<kroger-client-id>', 'User')
[Environment]::SetEnvironmentVariable('KROGER_CLIENT_SECRET', '<kroger-client-secret>', 'User')
```

```bash
# macOS, in ~/.zshenv
export DATABASE_URL='postgresql://postgres.<project-ref>:<database-password>@<pooler-host>:5432/postgres'
export KROGER_CLIENT_ID='<kroger-client-id>'
export KROGER_CLIENT_SECRET='<kroger-client-secret>'
```

Open a new terminal after setting them. Leave the Kroger values unset only if you are not using Map or in-store search. Those routes then return `Kroger is not configured.`

Start the API:

```bash
npm run dev
```

Confirm it works by opening http://localhost:3000/health in your browser. You should see:

```json
{"status":"ok","db":"connected"}
```

### 3. Set up the mobile app

Open a **second terminal** and leave the API running in the first one.

```bash
cd mobile
npm install
```

Create `mobile/.env` with the API address:

```
EXPO_PUBLIC_API_URL=http://localhost:3000
```

Start Expo:

```bash
npx expo start
```

The home screen should display **"API: ok, DB: connected."**

## Running the App

**In a web browser** (quickest for checking changes):

```bash
npx expo start --web
```

Use `EXPO_PUBLIC_API_URL=http://localhost:3000` in `mobile/.env`.

**On your phone with Expo Go:**

1. Connect your phone to the same Wi-Fi network as your computer.
2. Find your computer's local IP address (`ipconfig` on Windows, `ifconfig` on macOS/Linux), for example `192.168.0.156`.
3. Set `EXPO_PUBLIC_API_URL=http://<your-local-ip>:3000` in `mobile/.env`. Your phone cannot use `localhost`, because that would point to the phone itself.
4. Run `npx expo start -c` and scan the QR code with Expo Go.

Expo only reads `.env` when it starts, so restart it with `-c` (clears the cache) any time you change `mobile/.env`.

## Getting the Database URL

1. Open the GroceryWatch project in the [Supabase dashboard](https://supabase.com/dashboard).
2. Click **Connect** at the top of the project page.
3. Select the **Session pooler** connection type. Do not use the direct connection.
4. Copy the URI and replace `[YOUR-PASSWORD]`, **including the brackets**, with the database password.

A correct Session pooler string has the project ref attached to the username and a host ending in `pooler.supabase.com`:

```
postgresql://postgres.abcdefghijklmnopqrst:yourpassword@aws-0-us-east-1.pooler.supabase.com:5432/postgres
```

## Account creation and login

The mobile app supports creating an account and logging in to manage your list and submit store reviews. The API issues a session token for each user and validates it on profile, product, and review requests.

Before testing signup or login against an existing Supabase project, apply the account schema migration from the repository root:

```bash
npx supabase db push
```

This applies pending schema migrations, including the account fields and session table and the `store_reviews` table. If a required migration has not been applied, the API returns a database setup error.

1. Start the API and mobile app as described above.
2. Open the Account tab in the app.
3. Choose **Create account** and enter a display name, email, and password.
4. After signup, the app stores the session locally and loads your saved list automatically.
5. Use **Log in** later with the same email and password to restore your session.

The server uses the existing Supabase `profiles` table plus a lightweight `user_sessions` table for token-based authentication.

## Database Migrations

Schema changes live in `supabase/migrations/` so everyone's database matches. Link the CLI to the project once:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
```

The project ref is the ID in the dashboard URL after `/project/`. The CLI will ask for the database password.

To create and apply a migration:

```bash
npx supabase migration new <short-description>
# edit the new SQL file in supabase/migrations/
npx supabase db push
```

Coordinate with the team before pushing migrations, since everyone shares the same database.

## Available Scripts

Run these from the `api/` folder:

| Command | What it does |
|---|---|
| `npm run dev` | Starts the API with auto-restart on code changes |
| `npm run build` | Compiles TypeScript into `dist/` |
| `npm start` | Runs the compiled API from `dist/` (used in production) |
| `npm run ingest` | Runs the ingestion job once (run `npm run build` first) |

## Troubleshooting

**`/health` returns `connect ETIMEDOUT` with an IPv6 address (like `2600:...`)**
You are using the direct connection string. Switch to the **Session pooler** string. The direct connection is IPv6-only on the free plan and most networks, including Railway, can't reach it.

**`password authentication failed for user "postgres"`**
- Use the **database password** set when the project was created, not your Supabase account login.
- Make sure the `[ ]` brackets around the password placeholder were removed.
- Check that the username includes the project ref (`postgres.abcd...`), not just `postgres`.
- If unsure of the password, ask the team rather than resetting it, since a reset breaks everyone's `.env` and the Railway deployment.

**`/health` returns an error after editing `.env`**
`npm run dev` does not always reload `.env`. Stop it with Ctrl+C and start it again.

**`'expo' is not recognized as an internal or external command`**
Dependencies aren't installed. Run `npm install` inside the `mobile/` folder.

**App shows "API unreachable"**
- Make sure the API is running in a separate terminal.
- Check `mobile/.env` exists (not `.env.txt`) and has the right `EXPO_PUBLIC_API_URL`.
- Restart Expo with `npx expo start -c`.
- In the browser, press F12 and check the Network tab. A request to `undefined/health` means the env variable wasn't loaded.

**Phone gets "refused to connect" or times out**
- The URL must include the port, like `http://192.168.0.156:3000`.
- The API must listen on `host: "0.0.0.0"` in `api/src/index.ts`.
- Allow Node.js through Windows Defender Firewall on **private networks**.

**`EADDRINUSE` when starting the API**
An old API process is still using port 3000. Close other terminals running the API, or run `npx kill-port 3000`.

**`.env` file seems missing**
Files starting with a dot are hidden in File Explorer and Finder. Open the folder in VS Code instead. On Windows, avoid creating it in Notepad, which may save it as `.env.txt`.

## Git Workflow

- `main` is always deployable and protected. Do not push to it directly.
- Create a branch for each piece of work: `feature/<short-name>`.
- Open a pull request into `main` and get at least one review before merging.
- **Never commit `.env` files.** Run `git status` before committing and confirm no `.env` file appears in the list.

## Deployment

The API and ingestion job are deployed on Railway and redeploy automatically when changes merge into `main`.

| Service | Root directory | Start command | Schedule |
|---|---|---|---|
| API | `/api` | `npm start` | Always on |
| Ingest | `/api` | `npm run ingest` | Cron (UTC) |

Both services need `DATABASE_URL` set to the Session pooler string in their Railway variables. The API service also needs `KROGER_CLIENT_ID` and `KROGER_CLIENT_SECRET` so store search and prices work in the deployed app.

Deployed health check: `https://<railway-domain>/health`

## Data Sources and Attribution

Catalog search uses [Open Food Facts](https://world.openfoodfacts.org/), available under the [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/). Data is crowdsourced and may be incomplete or inaccurate.

Store locations and in-store prices come from the [Kroger API](https://developer.kroger.com/) certification environment (`api-ce.kroger.com`).

# Members

Aaronfx0 - Aaron Breslin - abres005@odu.edu
kylepait - Kyle Pait - kylepait@gmail.com
langloisblaine - Blaine Langlois - blang005@odu.edu
planglan - Peter Langlands - planglands3@gmail.com
shosni2 - Sarah Hosni - shosni@odu.edu
Sam - Sam Garden - sgard009@odu.edu
Stone Casey - Stone Casey - scase008@odu.edu
iMakeItFun - Jordan Dossou - jdoss007@odu.edu
JoshuaHarris1989 - Joshua Harris - Jharr075@ODU.edu OR joshuaharris1989@gmail.com
