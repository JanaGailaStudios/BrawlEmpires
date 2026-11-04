# Brawl Empires

An English-language, 3D territory-strategy game with solo campaigns and a working room-code multiplayer prototype.

## Play the preview

Open the **Brawl Empires Multiplayer** live preview supplied with this project.

1. Choose a world and enter a commander name.
2. Click **Multiplayer → Create private room**.
3. Share the six-character code and the same preview URL with a friend. For testing by yourself, use another browser window/profile or private window.
4. Your friend selects **Multiplayer → Join room**, enters the code, and clicks **Ready up**.
5. The host chooses 0, 4, 8 or 12 bots and clicks **Start match**. Online matches need 2–4 human players and use free-for-all rules.
6. Each player **right-clicks neutral land** to place their empire. The match begins when everyone has deployed. Unplaced players are automatically deployed after 90 seconds.
7. Click **Chat** (or press Enter while not typing in a field) to send messages to everyone in the room.

**The host must stay connected with the game open. Leaving or disconnecting as host ends the match.** Keep the host tab in the foreground for the best performance. A disconnected guest’s empire is handed to the bot simulation. Rejoining an active match is not supported.

The workspace preview is temporary, not a permanent public hosting service. Everyone must connect to the same running server.

## Run on your computer

Requires Node.js 18 or later (Node.js 22 LTS recommended).

```sh
cd brawl-empires
npm ci
npm start
```

Open **http://localhost:3000**. Other devices on the same network can use `http://YOUR-COMPUTER-LAN-IP:3000`, provided your firewall allows the connection. They must not use `localhost`, which would refer to their own device.

Choose a different port if needed:

```sh
PORT=8080 npm start
```

PowerShell:

```powershell
$env:PORT = "8080"
npm start
```

Run checks:

```sh
npm test
npm audit --omit=dev
```

The test suite starts a separate temporary server on port 43127. Stop any unrelated service on that port before running tests.

**Do not open `public/index.html` directly from disk.** This version is a web application and requires its HTTP/WebSocket server.

## Deploy a shareable prototype

Deploy this folder to a Node-compatible web service or a server you control:

- Install command: `npm ci --omit=dev`
- Start command: `npm start`
- Listen address: `0.0.0.0`
- Port: platform-provided `PORT`, otherwise `3000`
- WebSocket path: `/ws`
- Health check: `/health`

The frontend uses the current page’s host and automatically selects `ws:` or `wss:`. No hard-coded browser-side localhost endpoints, external fonts, or CDN scripts are required.

If using a reverse proxy, forward WebSocket upgrades for `/ws`. Use HTTPS/WSS for public access. Run **one server instance**: room membership and chat are in memory, so this build is not a horizontally scaled service. Restarting the server clears all rooms and chats.

Docker:

```sh
docker build -t brawl-empires .
docker run --rm -p 3000:3000 brawl-empires
```

The Docker image exposes port 3000. TLS can be provided by your hosting platform or reverse proxy.

## Controls

| Input | Action |
|---|---|
| Hold left mouse and drag | Pan the map |
| Right-click | Select a starting point, open actions, place a structure, or select an armed target |
| Scroll wheel | Zoom in/out |
| Hold middle mouse and drag | Orbit/tilt the 3D camera |
| Shift + scroll | Change camera tilt |
| Alt + scroll | Rotate the camera |
| R | Reset north-facing orientation |
| F | Fit the world |
| Space | Expand into adjacent neutral land |
| H | Toggle the biome view |
| Esc | Exit placement mode or open the game menu |
| Enter | Toggle room chat when not typing |

On touchscreens, drag to pan, tap to interact, and pinch to zoom. Menus use ordinary left-click/tap.

## Included gameplay

- 480 × 288 procedural world with seven biomes and three map styles.
- 3D terrain, forests, structures, infantry groups, boats, aircraft and capture animations.
- Troop allocation, neutral expansion, invasions and recalls.
- Cities, walls, forts, firing guard towers and bunkers.
- Gold/coal mines, oil pumps, gas extractors and factories.
- Automatic builders on unbuilt owned land after 30 seconds, subject to spacing, budget and construction limits. Each player can toggle their builders; human players retain a 600-credit reserve.
- Naval transports from owned coasts, with a maximum of 20% of available troops in each boat. No port is required. Transports follow water routes and can be recalled.
- Airfields, airstrikes and anti-air defenses.
- Minimap, empire rankings and income readouts.
- Room chat and synchronized ownership, troops, economy, buildings, attacks, transport boats, aircraft and construction projects.

Solo modes are preserved. **Online is free-for-all only; truce diplomacy is solo-only in this prototype.** Online matches run at 1× and cannot be paused.

## Architecture and limitations

This is a **host-simulated prototype**, not a dedicated authoritative game server:

- `server.js` serves the application, creates random room codes, manages membership/readiness, relays host state and player commands, and broadcasts room chat.
- The host browser runs the game simulation on a timer and publishes periodic snapshots. Ownership updates use deltas with regular full keyframes.
- Guests send actions to the host. The relay attaches the sender’s identity; the host checks ownership, placement, money, targets and army allocations before applying an action.
- Each client maps its own empire to the local player UI, while all network commands use the shared empire IDs.
- Only the room host may publish snapshots or end a match. Guests cannot submit another player’s identity to control their empire.

It is suitable for friendly testing, **not cheat-resistant or ranked multiplayer**. A modified host client can alter the simulation. There is no host migration, persistent match saving, reconnect/resume, authentication, matchmaking, voice chat or moderation service. Room codes are invitations, not an account-security system.

Chat messages are displayed as text, limited to 250 characters, rate-limited, isolated by room, and kept only in server memory (last 80 messages). Player names are length-limited. Commands are allowlisted, numeric inputs are bounded, room capacity is limited, and WebSocket payload size is capped. Public production hosting would still require further security, abuse controls and operational work.

## Project files

- `server.js` — HTTP + WebSocket room service.
- `public/index.html` — English Brawl Empires interface, lobby and chat.
- `public/app.js` — retained 3D game and simulation.
- `public/multiplayer.js` — room UI, host simulation coordination, commands and state synchronization.
- `public/three.min.js` — vendored Three.js r128 (MIT license; upstream license header retained).
- `tests/rooms.test.js` — room and network integration checks.
- `package-lock.json` — pinned backend dependency versions.

## Verification performed

The packaged automated test covers room-code creation, missing-room errors, the four-player limit, room chat isolation, readiness requirements, host-only match start/snapshots, sender identity enforcement and room teardown.

Two independent browser sessions were also used to test creating/joining a room, safe chat rendering, starting a match, separate spawn positions, guest expansion, synchronized city construction, rejection of building on enemy land, in-match chat, and host-disconnect handling. No JavaScript page errors were observed during that run.
