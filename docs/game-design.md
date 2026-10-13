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
| Characters | 4 ready-made level-1 characters, or your own from the character builder (M5). |

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

## Phase 2: the bridge between sessions

The game becomes something your players play **between real sessions**.
Each player has a hero and a town, the world keeps moving while they're
away, and what happens flows back to the DM's table.

### Renown: levels mean fame

Levels stay as in 5e. A hero's level is also how far their name has
travelled, scaled down while the game only supports levels 1–3:

| Level | Renown | Opens up |
| --- | --- | --- |
| 1 | Unknown, a village name at most | Local errands, a first plot of land |
| 2 | Known in the valley | People seek you out; found a proper village |
| 3 | Known across the region | Rivals take notice; regional quests and threats |
| 4–5 (later) | Known across the realm | Lords, factions, a bigger map |

### Towns

- **Every player has their own town** and can leave it at any time to
  join another player's. A hero lives in one town at a time.
- **Buildings** give the other systems a purpose: smithy (weapon and armor
  mods), apothecary (potions), tavern (rumours, which are new quests, and
  recruiting), shrine (healing, bringing back the fallen), watchtower and
  walls (defence), market (selling, weekly income).
- **Settlers** come from the story: people you rescue or befriend move in
  and staff buildings.
- **Power** = town size + the hero's renown. More power brings more
  attention: tribute demands, raids (fought as skirmishes on the town's own
  map) and rival factions whose lairs are dungeons the DM builds.

### Time

- The world has a clock. **While a player is in the game it runs in real
  time** at a rate the DM sets.
- **Long actions jump it forward:** sleeping (a long rest is 8 hours),
  travelling by waystone, crafting, building.
- **While a player is away** nothing waits: on the next visit the game
  works out how long it's been, simulates the town day by day (income,
  construction, events, raids) with the seeded RNG, and opens with a
  "While you were away…" report. Catch-up is capped so a long break
  doesn't end in ruin.
- Each town keeps its own clock; a hero who joins another town lives on
  that town's clock.
- Open for later: whether the DM's real sessions should also move the
  clock, so the side game and the table stay in step.

### Logins (prepared, not built yet)

Data is organised per player profile (characters, towns, saves, the
weekly chronicle) so that adding Firebase Auth later turns the profile
picker into a real sign-in without changing the data model.

## Milestones

| | Delivers |
| --- | --- |
| **M0** | Stat blocks as data; a few SRD monsters; 4 ready-made characters; one-click attack and damage in the tracker |
| **M1** | Rules core with tests: turns and actions, movement and walls, attacks, saves, damage types, crits, death saves, opportunity attacks |
| **M2** | First playable skirmish: Play page, party vs encounter, click to move and attack, combat log, monster AI, save/resume |
| **M3** | RPG layer: scenes, choices, skill checks, rests, items, XP, levels 2–3 |
| **M4** | Spells and conditions with full effects; more classes and monsters |
| **M5** | Character builder and adventure editor in the DM app |
| **M6** | Map editor: paint walls, terrain, hero starts and monsters; maps for skirmishes, adventure fights, later towns and lairs |
| **M7** | Player profiles and bridge prep: ownership of characters and saves, a chronicle of results for the DM (no logins yet) |
| **M8** | Towns and time: founding a town, buildings, settlers, the world clock, catch-up simulation and the "while you were away" report |
| **M9** | Mods and crafting through the smithy and apothecary |
| **M10** | Region and threats: renown tiers, power, factions, raids, lairs as DM-built dungeons |
| Later | Logins (Firebase Auth, DM and player roles, security rules); levels 4–5 |

## Status

- **M0 done:** structured stat blocks, SRD content, one-click attacks in the tracker.
- **M1 done (engine, no screen yet):** `src/game/`. Implemented:
  - initiative (d20 + Dex), rounds, and per-turn action / bonus action /
    movement / reaction
  - grid movement with walls, difficult terrain and no corner-cutting;
    allies can be passed, enemies can't
  - line of sight and range, including long-range Disadvantage
  - attacks: the 2024 condition effects on Advantage and Disadvantage,
    natural 1 / 20, automatic crits on Paralyzed or Unconscious targets
    within 5 ft
  - saves: Str / Dex saves auto-fail while Paralyzed, Stunned or
    Unconscious
  - opportunity attacks; Dash, Disengage, Dodge, standing up from Prone
  - 0 HP: monsters die; characters fall Unconscious, make death saves,
    fail them when damaged, and die from massive damage
  - features: Pack Tactics, extra damage on Advantage, knock Prone on hit,
    Sneak Attack, Undead Fortitude, Nimble Escape, Second Wind, and the
    Graze / Vex / Slow / Sap masteries
  - Not yet: cover, area effects, spells and spell slots, Hide, Help,
    grappling and shoving. These come in M4.
- **M2 done:** Play page (🎮 in the DM menu).
  - Three scenarios at 2024 difficulty: Goblin Ambush, The Restless Crypt,
    Bandit Camp. Saved encounters with stat-block monsters can be played
    too.
  - Click to move (range and path cost shown), pick an action then a
    target (chance to hit and the reasons for Advantage shown), plus Dash,
    Disengage, Dodge, Second Wind and stand up.
  - Monster AI, combat log, floating damage numbers.
  - Auto-save and resume; victory and defeat screens.
  - With the AI playing the party, it wins 70–83% of fights, which take
    about 4 rounds.
- **M3 done:** the RPG layer.
  - Adventures: scenes, choices, skill checks (one hero of your choosing,
    or a 2024 group check), story flags, choices you can make only once,
    gold costs.
  - Effects: XP, milestones, gold, items, traps with saving throws, short
    and long rests.
  - Fights inside the story: surprise from checks, and HP, features and
    potions carry over between scenes and battles.
  - Progression: 2024 XP table, fixed HP per level, hit dice, and class
    features for levels 2–3 (Action Surge, Champion's Improved Critical,
    Cunning Action, Turn Undead); fallen heroes stay fallen.
  - Items: Potion of Healing and Greater Healing (bonus action, yourself or
    an ally within 5 ft) and a +1 weapon that can be equipped.
  - First adventure, "The Goblin Trail": two routes, three possible
    battles, milestone levels 2 and 3. Automated playthroughs with the AI
    finish on both routes.
  - Not yet: level-3 subclass choices beyond the SRD's one per class,
    shops, the adventure editor (M5).
- **M4 done:** spells.
  - Spell slots (pips in the side panel), recovered on a long rest; the
    Wizard's Arcane Recovery on one short rest per day.
  - Cleric: Sacred Flame, Guiding Bolt (next attack has Advantage), Cure
    Wounds, Healing Word (bonus action, revives the fallen), Bless
    (concentration, +1d4 to attacks and saves, pick up to 3 allies), and at
    level 3 Aid and Disciple of Life.
  - Wizard: Fire Bolt, Magic Missile (always hits), Burning Hands (15-ft
    cone, aimed at a square, hits friends too), Shield (cast automatically
    as a reaction when +5 AC turns a hit into a miss), and at level 3
    Shatter (10-ft sphere) and Potent Cantrip.
  - Concentration: Con save when damaged (DC 10 or half the damage), lost
    when a new concentration spell is cast or at 0 HP.
  - Area spells show the squares and creatures they would hit before you
    click.
  - New monsters: Giant Rat and Cultist (transcribed from memory — check
    against the SRD 5.2 PDF), and a fourth skirmish, The Cult Cellar.
  - Not yet: monsters that cast spells, multiattack, cover, Hide, Help,
    grappling and shoving; the AI-controlled party doesn't heal or bless.
- **M5 done:** character builder and adventure editor.
  - Character builder (Play page → "Build a character"): Fighter, Rogue,
    Cleric or Wizard; Human, Dwarf, Elf or Halfling; Acolyte, Criminal,
    Sage or Soldier; the standard array (picking a taken score swaps the
    two) and the background's +2 / +1. A live sheet shows AC, HP, skills,
    attacks and spells, with to-hit and spell DCs from your scores.
    Characters are saved in the synced library as choices, not results, so
    rules fixes reach them; they also appear in the tracker's content picker.
  - Pick 1–4 heroes for the next adventure or skirmish from the ready-made
    party and your own (remembered per browser).
  - Adventure editor (📖 Adventures in the DM menu): title, blurb, starting
    gold and first scene; scenes with text and arrival effects; choices
    with flags, gold costs, "only once", skill checks (one hero or a group)
    and separate success / failure outcomes; effects (XP, milestone level,
    gold, items, flags, traps with saves, rests); and where each outcome
    leads: a scene ("+ New scene…" creates and links one), a fight (a
    built-in skirmish or one of your saved encounters, with surprise), or
    the end.
  - Renaming a scene's id updates every link; a problems list explains
    broken links, dead ends, unreachable scenes and missing endings, and
    clicking one opens the scene.
  - Autosaves to the synced library; export and import as JSON; copy a
    built-in adventure to start from; playtest from the start or from any
    scene. Your adventures appear on the Play page.
  - Not yet: subclass and feat choices, levels above 3, Wizard spell
    choices, images in scenes, and a visual scene graph.
- **M6 done:** map editor (🧱 Battle maps in the DM menu).
  - Paint walls and difficult terrain by clicking or dragging (right-click
    erases), place up to four numbered hero start squares, and place
    monsters from the SRD list or from your roster (any entry with a stat
    block). Keys 1–5 switch tools; "Wall the edges" outlines the map; maps
    from 6×6 to 30×20.
  - Live summary: monster count, 2024 encounter difficulty for a party of
    level 1–3, and checks (no starts, no monsters, deleted roster entries,
    monsters walled off from the heroes).
  - "Run 20 AI fights" plays the map with your current party and reports
    the win rate, rounds and heroes downed, for balancing.
  - Built-in skirmishes can be copied into editable maps. Your maps appear
    on the Play page and as fights in the adventure editor.
- **M7 done:** player profiles and the bridge to the table.
  - "Who's playing?" on the Play page: pick or create a profile (the first
    one is the DM's and takes over anything this browser saved before).
    Each device remembers who's playing; "Switch" changes it.
  - Each player has their own synced document: characters they built, the
    party they picked, the adventure and battle in progress, and their
    chronicle. Saves follow the player to any device; two open tabs stay in
    step.
  - The chronicle records what matters at the table: setting out, loot (gold,
    items, XP), level-ups, deaths, story flags, battles won, lost or fled,
    and how an adventure ended.
  - 👥 Players (DM menu): every player with their characters, current
    adventure, party HP and gold, and last activity; the chronicle feed
    (new only or everything, per player) with "→ Notes" to append an entry
    to the campaign notes, or ✓ to mark it seen. Players' characters also
    appear in the tracker's content picker, so they can join a real fight.
  - Logins prepared, not built: profile ids become auth uids, and
    `firestore.rules.draft` sketches the rules (each player writes only
    their own document; the DM reads all). Until then anyone with the link
    can pick any profile.
