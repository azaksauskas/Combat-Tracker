# Game design brief: solo 5e adventure

A single-player game built on the combat tracker: short story scenes with
choices and skill checks lead into tactical grid battles played with the
D&D 2024 rules (SRD 5.2), and the party grows between fights.

## Decisions

| Question | Decision |
| --- | --- |
| Who plays | The DM alone first; later possibly players between sessions |
| Rules | As close to 5e as practical, **2024 rules (SRD 5.2)** |
| Mode | Solo; you control a party of 2–4 characters |
| Platform | Desktop first |
| Characters | 4 ready-made level-1 characters; the character builder comes in M5 together with the adventure editor. Level-up choices (M3) get a small "pick one" screen. |

## Gameplay

- **Scenes:** text, choices and skill checks. Outcomes lead to a fight, an
  item, a rest or a different path.
- **Fights:** turn-based on a grid with walls and difficult terrain;
  computer-controlled monsters with simple roles (brute, archer, caster).
- **Progress:** XP and levels, equipment that changes AC and attacks, short
  and long rests. Saved in the browser.

## Rules priorities

1. Core combat: action / bonus action / movement / reaction; attack rolls
   against AC with advantage and disadvantage; critical hits double the
   damage dice; saving throws against a DC; damage types with resistance,
   immunity and vulnerability; death saves; opportunity attacks; cover;
   difficult terrain.
2. Conditions with real mechanical effects.
3. Content that grows: levels 1–5; Fighter, Rogue, Cleric and Wizard first;
   a small set of spells with concentration; low-CR monsters.

## Architecture

- Rules are pure functions in `src/domain/` (state + action → new state +
  log), shared by the tracker and the game. That gives undo, saving and
  replay, and leaves room for multiplayer or a server later.
- Stat blocks are data (abilities, saves, resistances, structured attacks
  and saving-throw effects), not just free text. The tracker uses the same
  data for one-click attacks.
- The game is a separate "Play" page in the same app that reuses the map,
  tokens, dice and themes.

## Content and licensing

Rules, classes and monsters come from the System Reference Document 5.2
(CC-BY-4.0, attribution in the README). Content outside the SRD stays out of
anything shared publicly. Your own homebrew comes from the roster.

## Milestones

| | Delivers |
| --- | --- |
| **M0** | Stat blocks as data; a few SRD monsters; 4 ready-made characters; one-click attack and damage in the tracker |
| **M1** | Rules core with tests: turns and actions, movement and walls, attacks, saves, damage types, crits, death saves, opportunity attacks |
| **M2** | First playable skirmish: Play page, party vs encounter, click to move and attack, combat log, monster AI, save/resume |
| **M3** | RPG layer: scenes, choices, skill checks, rests, items, XP, levels 2–3 |
| **M4** | Spells and conditions with full effects; more classes and monsters |
| **M5** | Character builder and adventure editor in the DM app |
