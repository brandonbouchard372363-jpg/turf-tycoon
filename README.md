# Turf Tycoon 🏠

**Buy · Build · Brag.** A multiplayer property-trading board game you play with friends in the browser. Classic rules, original board, lobby codes, and a Free Parking jackpot.

- 2–8 players, joined by a 5-letter lobby code
- Server-authoritative: the server rolls the dice and enforces every rule, so nobody can cheat
- Buying, auctions, rent, color sets, houses & hotels, mortgages, trades with counter-offers, The Slammer, bankruptcy
- Free Parking jackpot house rule (on by default, the host can switch it off in the lobby)
- Refresh-proof: if you drop or reload, you rejoin your seat automatically
- Works on desktop and phones

---

## Files

Everything sits in one folder, with no subfolders, so it uploads to GitHub cleanly from any browser.

- `server.js`: the web + realtime server
- `game.js`: all the game rules
- `board.js`: board spaces, card decks and game pieces. **Edit this to rename neighborhoods or change cards.**
- `index.html`, `style.css`, `app.js`, `boardview.js`, `icons.js`, `sound.js`: what players see
- `*.woff2`: fonts
- `engine.test.js`, `socket.test.js`: automated tests
- `package.json`, `package-lock.json`, `render.yaml`: setup for Node and Render

---

## Run it on your own computer

1. Install **Node.js** (version 18 or newer) from https://nodejs.org — pick the "LTS" download.
2. Open a terminal in the `turf-tycoon` folder and run:
   ```
   npm install
   npm start
   ```
3. Open **http://localhost:3000** in your browser.
4. To test multiplayer by yourself, open a second browser window in private/incognito mode and join with the code.

Friends on the same Wi-Fi can join at `http://YOUR-COMPUTER'S-IP:3000`. For friends anywhere, deploy it to Render (below).

To run the automated tests: `npm test`

---

## Put it online for free with Render

You need two free accounts: **GitHub** (stores the code) and **Render** (runs the server).

### Step 1 — Put the code on GitHub
1. Sign up at https://github.com.
2. Click the **+** in the top right → **New repository**. Name it `turf-tycoon` and click **Create repository**.
3. On the new repo page, click **uploading an existing file**.
4. Unzip `turf-tycoon.zip`, select **all** the files inside, and drag them onto the page. There are no folders, so nothing can get lost.
5. Click **Commit changes**.

### Step 2 — Deploy on Render
1. Sign up at https://render.com — choose **Sign up with GitHub** (easiest).
2. In the Render dashboard click **New +** → **Blueprint**.
3. Pick your `turf-tycoon` repository. Render reads `render.yaml` and fills everything in for you (free plan, `npm install`, `npm start`).
4. Click **Apply** / **Deploy**. The first build takes 2–3 minutes.
5. When it says **Live**, your game address is shown at the top, something like `https://turf-tycoon-xxxx.onrender.com`. That's the link you send your friends.

*Prefer doing it by hand?* Choose **New +** → **Web Service** instead, pick the repo, and set: Runtime **Node**, Build Command `npm install`, Start Command `npm start`, Instance Type **Free**.

### Updating the game later
Change files on GitHub (edit, or re-upload with **Add file → Upload files**; same-named files get replaced). Render redeploys automatically within a couple of minutes.

### Good to know about the free plan
- **Napping:** after ~15 minutes with nobody playing, the server sleeps. The next person to open the link waits up to about a minute while it wakes up. The game shows a "Waking up the server…" screen if the connection is still coming up.
- **Active games keep it awake.** It won't nap in the middle of a game.
- **Restarts end games.** Games live in the server's memory, so a rare restart or a redeploy ends any game in progress. Players are sent back to the home screen with a message. Avoid pushing updates while friends are mid-game.

---

## How to start a game with friends

1. Open your Render link, type your name, and click **Create a game**.
2. You get a 5-letter **lobby code**. Tap it to copy an invite link, then send it to your friends (or just tell them the code).
3. Friends open the link (or go to the site and type the code), enter a name, and join.
4. Everyone picks a game piece and color, then clicks **I'm ready**.
5. The host can toggle the **Free Parking jackpot** house rule, then clicks **Start game** once everyone is ready.

### Playing
- On your turn, click **Roll dice**. Land on an unowned lot → **Buy** it or send it to **auction**.
- Click any space on the board to see its title deed.
- **My lots** lets you build houses/hotels, sell buildings and mortgage lots.
- **Trade** lets you offer lots, cash and Escape Hatch cards to anyone, any time. They can accept, decline or counter.
- If someone goes offline mid-game, the host can remove them from their player card.
- Last player not bankrupt wins. 🏆

---

## The board

Neighborhood sets (cheapest → most expensive): Muddy Flats, Breezy Bay, Sugar Hill, Sunset Strip, Ember Heights, Golden Grove, Evergreen Estates, Royal Ridge.

Landmark lots (marked with a gold star on the board): **Bodecity** (Breezy Bay), **Jerburgerville** (Sunset Strip), **Tilted Taylor** (Ember Heights), **Lawrence Landing** (Evergreen Estates), and **Barnstein Island** (Royal Ridge, the priciest spot on the board).

Card decks: **Lucky Break** and **Block Party**. The jail is **The Slammer**, and the get-out-of-jail card is the **Escape Hatch**.

---

## Credits
Fonts: Fredoka and Nunito (SIL Open Font License, see `client/fonts/OFL-LICENSE.txt`). All board art, icons and sounds are original and generated in code.
