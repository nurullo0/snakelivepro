# Snake LIVE PRO

An auto-playing Snake game for **YouTube LIVE** (9:16 vertical). Viewers' gifts, Super Chats, Super Stickers, membership gifts and likes change the game in real time.

```
Phone browser (the game)  <-- Server-Sent Events -->  backend (Node.js)  <-- HTTPS + Google OAuth -->  YouTube Data API
```

* The browser never sees an API key or an OAuth token. Only the backend holds the Google login (refresh token).
* The backend and the game are served from **one address**, so you deploy one service and open one URL on your phone.

## Files

| File | Purpose |
|---|---|
| `index.html`, `style.css` | Stage (1080x1920) and design |
| `game.js` | Game engine: Hamiltonian-cycle snake, apples, levels, sounds, music, effects (`Fx`) |
| `gift-system.js` | 8 gifts, mapping, priority queue, history, popups, likes, test events |
| `youtube.js` | Browser client of the backend (status, reconnect, admin actions) |
| `panel.js` | Control panel (long-press the top-left corner for 1.5 s) and start-up |
| `backend/server.js` | OAuth, live detection, chat reader, quota counter, event stream, static files |
| `backend/test/mock-test.js`, `tests/frontend-test.js` | Automated tests (no real YouTube needed) |
| `config.example` | Names of the settings (no secrets) |

## What was tested (and what was NOT)

Tested automatically with a **mock** Google/YouTube server and a fake browser:
OAuth code exchange, token storage on the server, channel / live / chat-id detection, skipping old chat history, de-duplication (including gift combo updates), outage -> `Reconnecting` -> recovery, live end handling, quota counting, admin password checks, whitelisted static files, a full game level (all 400 cells visited, no self-collision), every gift effect, queue priority / limit / cool-down / history, XSS-safe popups.

**NOT tested yet** (needs your real accounts): the real Google login, a real live broadcast, real gift events, the exact `giftName` strings YouTube sends, phone screen-share streaming, audio capture, phone heat/battery over hours. Do not treat the system as production-ready until you have run the checklist below.

## Setup from a phone (about 40 minutes the first time)

Menu names on websites change; if a button has a slightly different name, look for the closest one.

### 1. Put the files on GitHub
1. Create a free account at github.com, then **New repository** (name `snake-live-pro`, Private is fine).
2. Upload the root files (`index.html`, `style.css`, `game.js`, `gift-system.js`, `youtube.js`, `panel.js`, `README.md`, `config.example`) with **Add file -> Upload files**.
3. Create the backend files with **Add file -> Create new file**: type `backend/server.js` as the file name (the slash creates the folder), paste the code, commit. Do the same for `backend/package.json`. (The test files are optional.)

### 2. Google Cloud (OAuth)
1. Open console.cloud.google.com, create a **new project**.
2. **APIs & Services -> Library -> YouTube Data API v3 -> Enable**.
3. **OAuth consent screen**: user type External, app name `Snake LIVE`, add your own Google account under **Test users**. Add the scope `.../auth/youtube.readonly`.
4. **Credentials -> Create credentials -> OAuth client ID -> Web application**. Leave the redirect URI empty for now; you will fill it in step 4.
5. Copy the **Client ID** and **Client secret** somewhere private.

Note: Google may limit refresh tokens of apps in "Testing" status (about 7 days, as far as I know). If the status turns to `Error` with "login expired", press **Connect YouTube** again.

### 3. Hosting
The backend needs a normal always-on Node.js server (it keeps a connection open and polls the chat). Classic serverless functions are a poor fit. A container host such as **Render** (Web Service) works:
1. New -> Web Service -> connect your GitHub repo.
2. Runtime Node, **Start command** `node backend/server.js`, no build command.
3. After it is created, note the address, e.g. `https://snake-live-pro.onrender.com`.
4. Add **Environment variables** (see `config.example`): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PUBLIC_URL` (the address above), `ADMIN_PASSWORD` (a long password).
5. Free plans may put the service to sleep and may erase the disk on restart (check the host's current terms). If the saved login is lost after a restart, just press **Connect YouTube** again, or put the refresh token into the `REFRESH_TOKEN` variable.

### 4. Finish Google settings
Back in Google Cloud -> your OAuth client -> **Authorized redirect URIs** -> add `PUBLIC_URL/auth/callback` (example `https://snake-live-pro.onrender.com/auth/callback`). Save.

### 5. First run
1. Open your address in Chrome on the phone. The control panel is the first page.
2. Enter the **Admin password** and press **Connect YouTube**, sign in with the YouTube account, allow access. You return to the game address; status becomes `Connected`.
3. Press **START GAME**. Tip: Chrome menu -> **Add to Home screen** for a full-screen app.

### 6. Going live
Start your live from the YouTube app (screen share) as usual. The game detects the active broadcast, its video ID and chat ID by itself: status `LIVE Active`. If it does not detect the broadcast, copy the video ID from the live link and use **Connect LIVE** with the Video ID box.

## Test checklist (before a real stream)
1. Panel -> **Tests**: Test Gift, Test Super Chat, Test Super Sticker, Test Membership Gift, Test Like, Test Subscriber, Queue stress test, Simulate internet loss. Test events are marked `[TEST]` and never change the real YouTube like counter.
2. Run a short **unlisted** live: check channel name, likes, status `LIVE Active`.
3. **Gift Reader** shows every event. If YouTube sends a gift name that is not one of the 8 in-game names, it appears under "Unmapped YouTube gift names": add it as an **alias** in Gift Mapping. Gifts are never guessed from their price.
4. Gifts (Jewels) exist only for eligible channels and countries (see YouTube Studio -> Earn). If they are unavailable, enable **chat commands** (`!estrella`, `!chuche`, `!moneda`, `!f`, `!gorro`, `!zorro`; 20 s cool-down per viewer; Disco and Super GG cannot be triggered for free).

## What YouTube provides (checked in the official `liveChatMessages` reference)
Message types used: `giftEvent` (giftName, jewelsAmount, comboCount; the same message id can be reused to update a combo), `superChatEvent`, `superStickerEvent`, `membershipGiftingEvent`, `giftMembershipReceivedEvent`, `newSponsorEvent`, `memberMilestoneChatEvent`, `textMessageEvent`, `chatEndedEvent`.
* **New subscribers:** there is no chat message type for them. The backend compares the channel subscriber count once a minute and shows an *approximate* "new subscriber" popup (no name, up to a minute late, count may be hidden or rounded).
* **Likes:** read from the video statistics every 20 s, not instant.
* **Super Chat / Super Sticker -> game effect** uses our own tier map (tier 1-5 -> Estrella, Chuche, Moneda, Gorro, Zorro), not a YouTube rule.

## Quota
YouTube API default quota is 10,000 units/day. Chat reading costs 5 units per request. With `CHAT_POLL_MS=8000` the backend uses about 2,500 units per hour, so roughly **4 hours of live per day**. The panel shows the used quota. For longer streams request more quota from Google or raise `CHAT_POLL_MS`.

## Security
Admin actions need `ADMIN_PASSWORD` (8 wrong tries lock an IP for 10 minutes). The login state is random and expires in 10 minutes. Only `youtube.readonly` is requested. Viewer names are shown with `textContent` only. Chat text is never forwarded except `!commands`. Only the listed files are served. Do not commit real secrets.

## Run the tests on a computer
`node backend/test/mock-test.js` and `node tests/frontend-test.js` (Node 18 or newer).
