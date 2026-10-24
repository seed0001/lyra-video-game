# Lyra — World

An open-world browser game set in the world of the **Lyra** series: Vira, the desert data center
that is Lyra; the highway north to Saltbrush; Halcyon, the city an hour away; and the railroad town
of Ironwood. It runs on the real Death Valley clock (sun, moon and stars at the right time), with
Vira's 280 staff commuting on their real shifts and working inside the buildings.

Built with [three.js](https://threejs.org) (loaded from a CDN). There's no build step; it's a
static site served by a tiny Python server.

## Run it locally

```bash
python serve.py
```

Then open http://localhost:8123. Locally nothing is cached, so edits show up on reload.

## Deploy on Railway

1. In Railway: **New Project → Deploy from GitHub repo** and pick this repository.
2. That's it. Railway reads `railway.json`, starts `python serve.py`, and the server listens on
   Railway's `PORT`. Open **Settings → Networking → Generate Domain** to get a public URL.

There are no environment variables to set. On Railway, files under `assets/` are cached for an hour.

## Controls

| Key | |
|---|---|
| Click | look around (mouse lock) |
| WASD, Space/C, Shift, wheel | move, up/down, fast, speed |
| F | fly / walk |
| `[` `]`, T, L | scrub time, 120× clock, back to live time |
| 1–9, 0, -, =, ` | viewpoints: Vira, Saltbrush, highway, aerial, gate, substation, Halcyon, Nova's house, Ironwood, Juno's place, James's rover |
| I O M P J K N | on foot inside: Vira lobby, ops room, Marcus's office, server aisle, Juno's workshop, Juno's loft, Nova's living room |
| U | walk into the next data hall |
| V / B | follow a commuter's car / the nearest car |
| E | follow the nearest worker on foot |
| R | follow the cast (Marcus, Nova, Juno, James, Solo) |
| Y | follow a semi on its delivery run |
| G, Q, H | Vira's gate, render quality, hide help |

## What's where

- `index.html`, `src/`: the game. `src/main.js` wires everything together.
  `src/cast.js` puts the series cast on their daily schedules: Marcus rides in from Saltbrush, Nova
  drives down from the hills above Halcyon, Juno brings the trike over from Ironwood, and James and
  Solo spend their days at Vira. Nova and Solo have their own Meshy models (`assets/characters/*.glb`,
  converted with `tools/meshy_to_glb.py`); the others are drawn like the staff, in their own clothes,
  until theirs arrive. Everyone has a name tag.
- `assets/`: series stills, character cutouts and vehicle models. Patch is `assets/characters/chance.fbx`, the dog
  model from travisbollenbach.com; he walks laps of the ops room (`src/patch.js`).
- `data/staff/`: Vira's staff. `roster.json` holds the hard facts (built by `tools/staff_roster.py`),
  and `cards/` holds the written character cards (spec in `docs/STAFF_CARDS.md`).
- `docs/ROADMAP_PLATFORM_AND_MEMORY.md`: the plan for accounts and characters with memory.
- `story/`: the series' story bible, canon notes, scripts, storyboards, character references and
  scene stills, for building the game (start at `story/README.md`). It isn't served by the site.
