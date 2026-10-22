# PixelVault

PixelVault is a private image vault built with Next.js. Sign in with Telegram,
upload images to your Telegram Saved Messages, and browse your image library
from a dashboard. Image metadata and account data are stored in MongoDB.

## Features

- Telegram sign-in with a phone verification code or QR code
- Upload JPEG, PNG, WebP, and GIF images up to 10 MB
- Store uploaded images in the signed-in user's Telegram Saved Messages
- Browse, search, and preview images in the dashboard
- Display and cache the user's Telegram profile photo
- Automatically sign out when the Telegram session is revoked
- Store image and account metadata in MongoDB

## Requirements

- Node.js and npm
- A MongoDB database reachable from the app
- Telegram API credentials from [my.telegram.org](https://my.telegram.org)
- A Telegram account for signing in and storing images

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the example environment file and fill in your own values:

   ```bash
   cp .env.example .env
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000).

## Project structure

```text
src/
  app/                Next.js pages and API route handlers
  lib/
    telegram/         Telegram auth, session encryption, and storage services
    auth.ts           Website session and authenticated-user helpers
    mongodb.ts        MongoDB connection
  models/             Mongoose schemas
scripts/
  telegram/           Telegram login and session maintenance utilities
  tests/              Manual upload workflow checks
```

## Environment variables

| Variable | Description |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string. Ensure the database allows connections from the app's network. |
| `TELEGRAM_API_ID` | Telegram API ID from `my.telegram.org`. |
| `TELEGRAM_API_HASH` | Telegram API hash from `my.telegram.org`. Keep it private. |
| `TELEGRAM_SESSION_ENCRYPTION_KEY` | 32-byte encryption key encoded as 64 hexadecimal characters. Used to encrypt stored Telegram sessions. |

Generate an encryption key with:

```bash
openssl rand -hex 32
```

Never commit `.env` or place real credentials in `.env.example`. For Vercel,
configure the same variables in the project's Environment Variables settings,
then redeploy. Use the same encryption key across deployments so existing
Telegram sessions remain decryptable.

## Available scripts

```bash
npm run dev    # Start the development server
npm run lint   # Run ESLint
npm run build  # Build the production app
npm run start  # Start the production server
```

## Deployment notes

The project can be deployed to Vercel. Configure all required environment
variables and make sure MongoDB network access permits connections from the
deployment. Image uploads require the Telegram session created by signing in.

The current Telegram QR sign-in flow keeps its temporary login state in server
process memory. Serverless deployments may route requests to different
instances, which can interrupt QR sign-in; use a long-running Node.js host or
durable shared coordination for reliable QR sign-in in that environment.
