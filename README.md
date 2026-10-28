# TrainerOS

Client, session-package and payment tracker for personal trainers. Built for iPhone (installs to the Home Screen, works offline) with optional cloud sync so data is never lost.

## Deploy to Vercel (about 10 minutes)

**1. Deploy the app**

```powershell
cd C:\Users\rishab.guddad\trainer-os
npx vercel          # log in when asked, accept the defaults
```

**2. Add the cloud database** (free)

In the Vercel dashboard, open the project and go to **Storage**, then **Create Database**, then **Upstash for Redis** (free plan). Connect it to this project. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.

**3. Set your passcode**

Go to **Settings**, then **Environment Variables**, and add:

| Name | Value |
|---|---|
| `APP_PASSCODE` | a long secret only you know, e.g. `rahul-gym-2026-blue` |

**4. Redeploy so the new settings take effect**

```powershell
npx vercel --prod
```

## Install on iPhone

1. Open your `https://<project>.vercel.app` link in **Safari**.
2. Tap **Share**, then **Add to Home Screen**.
3. Open TrainerOS **from the new icon**. Go to **More**, then **Cloud sync**, enter your passcode, and tap **Turn on cloud sync**.

Use the app from the icon. On iPhone, the Home Screen app keeps its own data separate from Safari.

## How your data is kept safe

- **On the phone:** everything saves instantly and works offline.
- **In the cloud:** every change uploads within a couple of seconds, or the next time you're online.
- **Daily snapshots:** the last copy of each day is kept in Redis for 45 days (`traineros:snapshot:YYYY-MM-DD`). This protects you from an accidental "Erase all".
- **New or reset phone:** install, enter the passcode, and everything comes back.
- **Backup file:** More → Back up now exports a JSON file you can keep in iCloud Drive.

Sync is designed for one main phone. If two devices edit while offline, the app asks which copy to keep.

## Features

- **Packages:** create 8, 10, 12, 15 or any number of sessions. You pick the start date, training days and time, and every date is scheduled automatically, skipping days you don't train.
- **Workout rotation:** "Push, Pull, Legs" rotates across sessions. Each day can be edited afterwards.
- **Session status:** Done (one tap), No-show, Cancelled, with notes per session.
- **Make-up sessions:** a cancelled package session can add a make-up at the end of the package.
- **Pause a package:** move all upcoming sessions to a new start date (for example, the client is travelling). You can also extend a package or delete it.
- **Payments:** UPI, cash, bank or card. Upfront package payments are tracked as advance credit, and dues update automatically as sessions are completed.
- **Reminders:** a WhatsApp payment reminder and a "share schedule" message are pre-written for you.
- **Today screen:** week strip, earnings, and a "not marked yet" list so no session is ever forgotten.
- **Money screen:** monthly earned vs collected, outstanding dues, advances held, and a 6-month chart.
- **General:** search, archive clients, dark mode, and undo on every change.

## Project layout

| Path | What it is |
|---|---|
| `index.html`, `styles.css`, `app.js` | The app (no framework, no build step) |
| `sw.js` | Offline support. Bump `VERSION` when you change the app. |
| `manifest.webmanifest`, `icons/` | Home Screen install |
| `api/data.js` | Vercel serverless function for cloud sync |

To update the app later, edit the files, bump `VERSION` in `sw.js`, and run `npx vercel --prod`. Phones pick up the new version the next time the app is opened.
