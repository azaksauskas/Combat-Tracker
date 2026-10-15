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
| 4 | Known across the realm | Lords and factions take notice; 15 buildings |
| 5 | A hero of the realm | Songs in far-off taverns; 20 buildings |

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

- The world has a clock. **While a player is in the game, 1 real minute is
  1 game hour.**
- **Long actions jump it forward:** sleeping (a long rest is 8 hours),
  travelling by waystone, crafting, building.
- **While a player is away** the world runs at real speed (a week away is
  a game week): on the next visit the game simulates the town hour by hour
  (income, construction, events) with the seeded RNG and opens with a
  "While you were away…" report. Catch-up is capped at 30 game days.
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
| **Levels 4–5** | Heroes keep their levels; ability increase, proficiency +3, Extra Attack, Uncanny Dodge, Mass Healing Word, Fireball; milestone lairs |
| Later | Logins (Firebase Auth, DM and player roles, security rules) |
| Idea | A kids' version to play with a child, based on Mausritter (mice adventurers, simpler rules); see "Future ideas" |

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
  - Logins came in phase D (below).
- **M8 done:** towns and time (the 🏘 Town tab on the Play page).
  - Found a town: a hall, some gold, food and materials. Build houses,
    farms, a lumber camp, market, tavern, apothecary and watchtowers (the
    smithy waits for M9). One project at a time; each takes game hours and
    costs gold and materials. Renown limits the number of buildings (4 /
    7 / 11 for levels 1 / 2 / 3).
  - Settlers arrive when there are beds (far more often with a tavern),
    work the buildings in the order they were built, eat a food a day and
    leave when food runs out. People rescued in adventures move in when the
    adventure ends (new "Settler for the town" effect; Tamsin in The Goblin
    Trail).
  - Every morning: production, then the day's events (merchant caravans,
    thieves, storms, good harvests, travellers). Thieves grow bolder as the
    town's power grows, less so with a watchtower, more so with the owner
    away.
  - The clock: 1 minute = 1 hour while on the Play page; real speed while
    away, with the "While you were away…" report on return. Sleeping (8 h)
    and helping out (1 day) jump it; each adventure choice takes an hour,
    a night's camp 8 more, a battle an hour.
  - Adventures and the town: potions brewed by the apothecary go with the
    party; what the party earned and the potions left come home at the
    end; renown follows the best hero's level.
  - Waystone: move into another player's town (if open; 6 hours of travel)
    and back home. Your own town carries on without you; theirs keeps its
    owner's clock.
  - The DM's Players page shows each player's town and renown.
- **M9 done:** crafting.
  - Components: iron (salvaged from armed foes in battles won on
    adventures), arcane dust (from the undead), herbs (gathered daily by a
    staffed apothecary, and in good harvests). A staffed market sells all
    three.
  - Smithy: each hero has a weapon, armour and spell-focus slot; a new mod
    replaces the old one. Honed edge (+1 damage), Balanced grip (+1 to
    hit), Fire rune (+1d4 fire), Riveted plates (+1 AC), Focus crystal (+1
    spell attack and save DC), Splitting lens (one more Magic Missile
    dart). Mods stay with the hero across adventures and skirmishes, and
    the chronicle tells the DM.
  - Apothecary: brew Potions of Healing and Greater Healing to order.
  - Crafting and brewing take game hours.
  - Time limits: "Help out" works once per bed in the town per real day;
    sleep only between 20:00 and 06:00, until dawn.
  - Not yet: mods on spells learned at level 3 (fitted before levelling,
    they apply to the spells known then).

- **Alignment and settlers (after M9):**
  - Alignment on characters (builder), the ready-made heroes and monsters
    (stat blocks, also in the tracker).
  - Deeds: adventure choices can carry a deed (lawful/chaotic, good/evil;
    new "Deed" effect in the editor; The Goblin Trail is tagged). At the end
    of an adventure, deeds move the town's reputation ("known as kind and
    law-abiding"). A new town starts with its founders' alignment.
  - Settlers have an alignment, a mood and something on their mind. Every
    morning their mood drifts towards their opinion of the town: food,
    crowding, thefts this week, a watchtower, tavern and market, pride in
    the heroes (up after victories, down after defeats and deaths), an empty
    hall when the owner lives elsewhere, and whether the heroes' deeds suit
    their beliefs. The unhappiest leaves when miserable (one a day, saying
    why); happy settlers invite friends.
  - Getting workers: travellers come more often the more appealing the town
    is (shown with its reasons), far more often with a tavern, and judge it
    before staying; a staffed tavern can hire a worker for 20 gold.

- **M10 done:** region and threats.
  - Factions: four built in (The Red Fang goblins, River Road Bandits, the
    Restless Dead, the Cult of the Hollow Eye), each with an alignment, a
    tribute, the renown at which they notice heroes, and a raid battle and
    a lair battle. 🏴 Factions in the DM menu adds your own, with any
    skirmish, map or saved encounter as their battles.
  - Each morning a faction's attention to a town grows with the town's
    power, faster when the town's reputation offends its alignment and
    slower with a watchtower. Stages: scouts seen → tribute demanded with a
    3-day deadline (or, for factions that take no gold, a raid announced) →
    raid by a set hour. Factions that share the town's outlook turn
    friendly and send traders.
  - Answers: pay (they'll be back), refuse (they raid in a day), defend the
    town on the battle screen, or strike their lair: win and the faction is
    broken for good, with loot. Undefended or lost raids take a share of
    gold, food and materials and shake the settlers.
  - Town battles use the chosen party with its mods and the town's potions,
    salvage iron and dust, move the clock and go in the chronicle; the DM's
    Players page shows each town's threats.

- **Levels 4–5 done:**
  - Heroes keep their level and XP between adventures, skirmishes and town
    battles (per player). Adventures start with the heroes as they are; a
    new hero catches up with the party at the next XP gain.
  - Level 4: +2 to the class's main ability (Str, Dex, Wis, Int), carried
    into attacks, damage, spell DCs and skills. Casters get 3 second-level
    slots.
  - Level 5: proficiency +3; Fighter Extra Attack, Rogue Uncanny Dodge
    (reaction, halves a hit) and Sneak Attack 3d6, Cleric Mass Healing Word
    (bonus action, up to six allies), Wizard Fireball (20-ft sphere, 8d6);
    third-level slots.
  - Monsters can have Multiattack. New: Gnoll Warrior, Bugbear Warrior,
    Bandit Captain (from memory: check against the SRD), and three tougher
    battles: The Crypt Depths, The Hollow Sanctum, The Gnoll Warband.
  - Town battles give XP; breaking a lair is a milestone (Red Fang → 2,
    River Road → 3, Restless Dead → 4, Hollow Eye → 5). Heroes famous enough
    can seek a faction's lair out at any time. New faction for renown 4:
    the Gnoll Pack.
  - With the AI playing the party: Crypt Depths 60% at level 3, Hollow
    Sanctum 85% at level 4, Gnoll Warband 77% at level 4.

- **Game balance page** (⚙️ Game balance in the DM menu): every tunable
  number of the between-session game, grouped (time, founding, buildings,
  production, settlers, events, factions, crafting, heroes), each with its
  default and a short explanation. Search, "only changed", reset per field
  or all, export and import as JSON. Saved in the synced library and applied
  live for every player; the rules read them through `num()` in
  `src/game/tuning.ts`, where new tunables are added.

- **Feedback round, phase A (part 1):**
  - Finished adventures move under "✓ Completed"; playing one again gives
    no gold, XP or items (potions used come back).
  - Story flags are now "clues": the editor shows where each clue is
    learned and which choices need it, and warns when a needed clue is
    never learned. Choices have a clear "✎ Edit" button; built-in
    adventures have "✎ Edit a copy".
  - Death saves are rolled by the player (🎲 on the dying hero's turn).
    Reaching two failures in a battle leaves a lasting injury (broken hand,
    twisted knee, cracked ribs, concussion or deep wound); three failures
    and the hero is dead and can't be picked.
  - Shrine (new building): treats injuries and raises the fallen, for gold,
    herbs or arcane dust and time. All costs are on the balance page.
- **Feedback round, phase A (part 2): raids and retreats.**
  - Raiders arrive on the hour they announced (deadlines run hourly, not
    at dawn).
  - If the heroes aren't there, the town's militia fights: settlers,
    staffed watchtowers and spirit, plus a d6, against the raiders'
    strength (higher for factions that need more renown). They drive the
    raiders off, hold with smaller losses, or are overrun. The town panel
    shows the odds; every number is on the balance page.
  - A threat bar on the Adventures tab, in adventures and in battle shows
    what's coming and when. Raid news pops up once ("📯 News of a raid"),
    never mid-battle: a messenger toast says the report waits until the
    fight is over. The "While you were away" report also waits.
  - Retreat: on a hero's turn. Every enemy next to a standing hero gets a
    parting opportunity attack, then the fight is lost. Fleeing an
    adventure fight or a lair costs extra hours on the way back
    (`travel.fleeHours`); fleeing a raid leaves the town to the raiders.
- **Feedback round, phase B: the town's economy.**
  - Trades: every staffed building wants a trade (farm: farmer, lumber
    camp: woodcutter, market: trader, tavern: brewer, apothecary:
    herbalist, watchtower: guard, smithy: smith, shrine: priest). Anyone
    can do the job, but at half pace (`trades.untrainedPace`): half the
    output, and crafting there takes twice as long.
  - Settlers take the job of their trade first. The player can put anyone
    anywhere, or tell them to rest. Settlers mind: working their trade
    pleases them; a workplace of their trade they aren't working, or none
    at all, doesn't.
  - The town lists what it needs ("the apothecary stands empty: it needs a
    herbalist"). A notice at the hall (10 gold, 3 days) calls for a trade:
    more travellers, mostly of that trade, and they stay. The tavern can
    hire a chosen trade for 1.5× the price.
  - Market: buy and sell food, materials, iron, herbs and arcane dust
    (selling pays half the price), to cover a shortage quickly.
  - Patrols: a small fight near the town (Low 2024 budget, random foes),
    4 hours, a bounty of 8 gold at level 1 that halves with each patrol the
    same day. Half XP.
  - Contracts: jobs posted on the town's board in the mornings (one, plus
    one each for a staffed market and tavern), lasting 4 days: a Moderate
    fight for gold and goods (food, materials, herbs, dust), 8 hours.
  - Every number is on the balance page (Settlers, Patrols & contracts,
    Crafting).
- **Feedback round, phase C: visual tools.**
  - Adventure editor graph view (🕸 Graph, the default; ☰ List is the old
    view), built with React Flow. Scenes are cards, choices are arrows:
    grey to a scene, amber dashed for a failed check, green for a fight
    won, red dashed for a fight lost; end markers for victory and defeat.
    Choices that stay in the same scene show as "↺ n stay here" on the
    card. Arrow labels show around the selected scene only.
  - Drag scenes to arrange them (saved as `layout` in the adventure).
    Drag from a scene's right dot onto another scene or an end to add a
    choice ("Go to …", "Head home"). Click a scene to edit it below.
    Scenes without a saved place are laid out by distance from the start.
  - Region mini-map on the town page: the town in the middle, other
    heroes' towns nearby, factions' lairs further out (further for
    factions that need more renown; unknown ones are "?"). Dotted lines
    are scouts, red animated arrows are raids on their way, green lines
    are friends, a crossed lair is broken. Click a known lair to strike.
- **Feedback round, phase D: logins.**
  - Sign in with a name and a password (Firebase Email/Password; the name
    becomes a never-mailed address). New players sign up themselves; no
    e-mail is needed. Password change in the menu.
  - A player's document id is their account id, and holds their profile
    (name, colour) next to their saves. "Who's playing?" is gone: the
    signed-in account plays.
  - DMs are listed in `roles/dm`. The first account to press "👑 I'm the
    DM" takes the role; DMs can make others DMs on the Players page.
    Players see only Play and the player screen; DM tools redirect them.
  - Saves from before logins can be claimed once ("That was me: …"). A
    forgotten password: make a new account; the DM moves the old save over.
  - `firestore.rules`: everything needs an account; only DMs write the
    shared documents and the roles; each player writes only their own
    document (DMs any); everyone signed in reads all players' documents.
- **Town as an idle game (before phase E).**
  - Hourly production: every building adds a 24th of its day's output to
    its work in progress each game hour and hands over whole units; the
    tiles show a bar filling towards the next unit. Settlers eat hourly
    too; meals missed for lack of food make them hungry at dawn.
  - Building levels: each level adds 60% of the base output (houses +2
    beds). An upgrade costs the build cost × 1.7 per level, takes the
    builders (one project at a time), and the building keeps working
    meanwhile. The highest level is 1 + renown.
  - Plots: renown gives the base; every town hall level adds 2 more.
  - No storage limits.
  - Goals: three at a time, in order from the first farm to a level-5
    building, each with a reward to claim (🎁). Lifetime counts (patrols,
    contracts, raids driven off, potions brewed) feed them.
  - The return after time away is a chest: what the town gathered, then
    what happened. Stores show "+3" / "−17" rising when they change.
  - All numbers under "Upgrades" on the balance page.
- **Feedback round, phase E: spies, guilds and the slow takeover.**
  - Every player writes only their own save, so cross-player effects are
    settled where they belong: a spy mission and its result live in the
    sender's document (decided from the target as the sender's game sees
    it, with a seeded roll); the target's game applies it to its own town
    once (`seenMissions`). Guild membership lives in each member's
    document; influence is worked out from what everyone can see. The
    owner's game applies the takeover stages to its own town.
  - 🕵 Spies (need a staffed tavern; take an hour of real time): scout
    (stores, defences, guilds), sabotage (burns 15% of food and
    materials), stir unrest (−3 spirit; counts for the sender's guild
    there). Watchtowers catch spies; a caught spy names its sender.
    Factions send spies too: watched towns may be scouted (+attention) or
    the watch catches them (−attention).
  - 🏛 Guilds: a hero living in another player's town founds one (30 gold
    from their own town); others living there join. Influence grows per
    member per real day (more with renown), per day's work for the guild,
    and per unrest stirred; the owner's crackdowns take it away.
  - Authority of the owner: 20 + 10 × renown + spirit + settlers' mood ×
    0.2 + 5 per staffed watchtower, −15 while living elsewhere.
  - Stages by influence ÷ authority: ½ tithe (production −25%); ¾ the
    guild blocks the market, hiring, notices and upgrades; 1 the guild
    runs the town (no building, workers, crafting, help, opening) and its
    founder collects a tithe for their own town each real day.
  - The owner answers: crack down (30 gold, every 12 real hours), banish
    the guild while it's weak (members are sent home), or, once the town
    is lost, fight to take it back (removes 60% of the guild's influence).
  - All numbers under "Spies & guilds" on the balance page.
- **Phase F: battles worth watching and worth thinking about.**
  - Feel: creatures walk their path square by square; melee attackers
    lunge, arrows and spells fly (coloured by damage type), struck
    creatures flash and shake, crits pop, the fallen topple and the slain
    fade. Monsters act at a pace you can follow. The end card shows each
    hero's damage dealt and taken, healing and foes dropped, the battle's
    hero (⭐), and the XP the foes were worth.
  - Cover: from the attacker's best corner to the target's four corners;
    1–2 lines blocked by walls give half cover (+2 AC and Dex saves), 3–4
    three-quarters (+5); no line of sight is total cover. A creature in
    the way gives half cover. Shown in the odds; the AI counts it, and
    shooters look for spots with cover.
  - New actions: 🤝 Help (next ally's attack on that enemy has Advantage),
    🫥 Hide (needs three-quarters cover from every foe that can see you;
    Stealth vs 15; Rogues can Hide as a bonus action; attacking or being
    hurt gives you away), ✋ Shove / Trip and 🤼 Grapple (each replaces one
    attack; Str or Dex save vs 8 + Str + proficiency), Break free.
  - Morale: once half their side is down, a badly hurt monster (or any,
    if their strongest has fallen) makes a DC 10 Wisdom save or flees for
    the nearest edge and leaves the field (no salvage from it). Undead,
    constructs, oozes and plants never break.
  - Objectives: "Hold the Ford" (survive 4 rounds) and "Run for the Gate"
    (get every standing hero onto the exit squares). Scenarios take a
    `goal`, and maps mark exits with X.
- **Phase G: heroes first: gear, spells and the infirmary.** The town
  exists to make the heroes stronger; the heroes are the game.
  - 🧙 Heroes tab: each hero's sheet with four slots (main hand, off hand,
    on the back, armour). Gear changes only in town, between adventures.
    Weapons and armour follow the 2024 SRD (damage, properties, mastery,
    AC); untrained gear is marked, armour a class can't wear isn't offered.
    Each class starts with its kit (Brann: greatsword, javelin on his back,
    chain mail). What's taken off goes to the 🗄 armoury.
  - Getting gear: the market sells simple weapons, light armour and
    shields for gold; the smithy forges martial weapons and heavier armour
    from gold, iron and hours. Prices × `gear.priceMultiplier`.
  - In a fight a hero holds their main weapon; the one on their back is
    drawn with 🔄 (free, once a turn) and stowed the same way.
  - ✨ Spells: Clerics and Wizards prepare cantrips and spells in town
    within the 2024 limits (cantrips 3, 4 from level 4; prepared 4/5/6/7/9
    at levels 1–5; spell levels up to 1/2/3). The catalogue holds the SRD
    spells the engine runs, now with Shield of Faith (+2 AC,
    concentration), Chill Touch, Ray of Frost, Toll the Dead, Ice Knife and
    more. Shield and Mage Armor (AC 13 + Dex without armour) are features.
  - 🛏 Infirmary: after a battle a hero who went down rests about a day
    (24 h, +12 with a lasting injury); one who ended below half HP rests
    less (up to 12 h, by HP lost). A staffed shrine halves the time, and
    a Potion of Healing from the town's stores takes 8 hours off (greater:
    16). Recovering heroes stay home: they aren't sent on adventures,
    patrols, contracts or into skirmishes. Counted on the town's clock;
    numbers under "Heroes" on the balance page.
  - Found weapons: adventures can give weapons and armour (the DM picks
    them in the editor's item list). On the road a hero can sling a found
    weapon on their back as the spare; back home it stays their spare
    (the old one goes to the armoury), and everything else found goes to
    the armoury. The bandits' wagon has a longbow, the goblin camp
    scimitars.
- **Phase H: treasure.** Magic items worth fighting for, and a town that
  can make them.
  - 💎 Magic items (SRD 5.2, those the engine runs): Weapon/Shield +1…+3,
    Armor +1…+3, Flame Tongue, Frost Brand, Cloak and Ring of Protection,
    Bracers of Defense, Stone of Good Luck, Amulet of Health, Periapt of
    Wound Closure (half the time in the infirmary), Pearl of Power, Boots
    of Speed, Wands of the War Mage, Rings of Resistance. Rarities:
    uncommon, rare, very rare, legendary (coloured). Five one-of-a-kind
    treasures with their own story (Emberbrand, the Crypt-Warden's Mantle,
    Hearthstone, Staff of the Last Dawn, Wolfsong): each player finds each
    at most once.
  - A hero can be attuned to 3 items. A magic weapon works on the weapon
    in hand (the drawn spare doesn't get it), magic armour needs armour, a
    magic shield needs a shield, Bracers only work without either. Items
    change hands in town only; the 💎 treasury keeps the rest.
  - 🧰 Loot chests: won patrols and jobs (wooden), raids and taking the
    town back (iron-bound), lairs and won adventures (silver); every two
    hero levels above 1 make it one better, up to gilded. Opened on the
    Heroes tab: gold, iron, herbs, dust and, by chance, a magic item
    (gilded: always, sometimes two); silver and gilded chests may hold a
    unique. Contents are fixed when the chest is found.
  - Adventures can give magic items too (the editor's item list); what
    the party carries home goes to the treasury, and a +1 weapon found on
    the road becomes a real Weapon, +1.
  - ⚒ The smithy forges +1 arms from level 2, +2 and Armor +1 from level
    3, +3 and Armor +2 from level 5 (gold, iron, a little dust, hours).
  - 🔮 Mage tower (new building, worked by a mage): gathers arcane dust,
    crafts wondrous items (better ones at higher levels) and breaks
    unwanted items down into dust. The market buys magic items for half
    their value.
  - All numbers under "Treasure" on the balance page.
- **Phase I: the roster.** The heroes are people with a past and a
  future; the town is where heroes want to be.
  - 🍺 Heroes for hire: a tavern draws heroes looking for work, a new
    batch every few days. How many (1–4) and how good (level, a second
    trait) depends on the town's ⭐ attraction: renown × 10 + spirit +
    tavern level × 10 + 5 per hero looking after the town + settlers ÷ 2.
    Hiring takes a staffed tavern and a fee by level; the hero joins at
    their level with their traits. The roster only grows this way: players
    no longer build heroes (the DM still can).
  - ✨ Traits: Tough, Brawler, Keen-eyed, Quick, Stalwart, Studious,
    Scarred veteran, Quick healer (half the infirmary), Homebody and
    Merchant's eye (for patrons). Brann is Tough, Pip Quick, Maren
    Stalwart, Ezra Studious.
  - 📜 Personal quests by class, counted from every battle's tally:
    Fighter "The Champion's Road" (foes felled 5/15/30), Rogue "A Name in
    the Shadows" and Wizard "The Arcane Ladder" (damage 80/250/600),
    Cleric "The Path of Mercy" (healing 30/100/250). Stage I: a silver
    chest; II: a new trait; III: the class's unique treasure (Emberbrand,
    Wolfsong, the Crypt-Warden's Mantle, Staff of the Last Dawn), or a
    gilded chest if already found.
  - 🏛 Patrons: a hero at home can look after a building: +25% output,
    +25% more if it suits their class (★), more again for a Homebody. A
    patron stays home (not in the party) and adds to the town's
    attraction. Shown on the building's tile.
  - Numbers under "Roster" on the balance page.
- **Visual polish: a living village.**
  - A sky over the town turns with its clock: sunrise, a sun crossing the
    sky, a red dusk, a moon and stars; the village darkens at night and
    houses, the hall, the tavern, the shrine and the tower light up.
  - Settlers walk the streets below the buildings: to work in the
    morning, to the tavern in the evening (🍺), home to bed at night (💤),
    shifting about a little as they go. Patrons stand by their building
    with their class's sign.
  - Chimneys smoke, the forge throws sparks, the farm sways, the lumber
    camp chops, the mage tower glows; a building that finishes a unit
    shows "+1" with what it made.
  - Hero sheets carry a crest in the class's colour with the level on it.
  - Everything is decoration over the same tiles (they stay clickable)
    and stops for players who ask for reduced motion.

## Direction: a company on the road (Battle Brothers style)

The town-building had drifted toward Travian (timers, resource counters,
player-versus-player intrigue). The game turns toward Battle Brothers: you
lead a company of adventurers across a land, take work in settlements, pay
your people and fight tactical battles where death matters. The tactical
engine, heroes, gear, treasure, injuries and the infirmary stay; the town
becomes the company's camp.

1. **BB-1: the world map and the march** (done, below).
2. **BB-2: wages, food and work.** Daily pay and rations for the company;
   contracts, markets and reputation in each settlement.
3. **BB-3: a bigger company.** Six heroes in battle and a reserve; death is
   harder to undo.
4. **BB-4: the town becomes the camp.** No real-time clock, timers or build
   queues; the camp's tents (forge, infirmary, mage) serve the heroes.
   Spies, guilds, takeovers and moving into other heroes' towns are already
   hidden (and switched off): "Features → features.intrigue" on the balance
   page brings them back.
5. **BB-5: Little Fighter 2 feel.** Signature moves, knockback into walls,
   things to throw on the battlefield, wave fights.

- **BB-1: the world map.**
  - 🧭 World tab (first when a town exists): a land generated from the
    player's seed: the camp, five settlements (two villages, two towns, a
    city, each known for something), roads between them, forests, hills,
    marsh and a lake, the factions' lairs (further out the more renown
    they need) and a site for every adventure.
  - Click anywhere (or on a place) to march; the clock runs only while
    the company moves (×1, ×2, ×4, halt). Roads ×1.5, forest ×0.6, hills
    ×0.7, marsh ×0.5; the marched hours pass on the town's clock.
  - The company sees 150 map units around it; lairs and adventure sites
    stay ❔ until seen.
  - Bands (wolves, bandits, the faction's own foes out of their lairs)
    roam and give chase when they spot the company; settlements are safe
    ground. When one catches up: stand and fight, or try to slip away
    (best Stealth vs DC 12). A won fight clears the band and leaves a
    chest; a lost one sends the company limping back toward the camp.
  - Arriving: the camp (into the town), an adventure site (begin it), a
    lair (attack it when renown allows). Settlements wait for BB-2.
  - Numbers under "World" on the balance page.
  - Drawn in pen and ink: paper with a dot grid, scalloped forests full of
    little trees, hatched mountains, marsh tufts, a stippled lake shore,
    dotted roads, settlements as tiny drawn houses in hexagon frames, a
    compass rose and an old-map typeface. Colour only for water, the
    company's red banner and bands on the move.
  - The map draws itself as the company explores: unseen land is blank
    paper; footprints trail behind the banner. The view follows the
    company; drag to look around, scroll or +/− to zoom.

## Future ideas

- **A kids' version for playing with a child**, along the lines of
  Mausritter (brave mice, short rules, three stats, item slots that make
  inventory physical). The engine can carry a second, simpler ruleset next
  to 5e: the town, map editor, adventures and time would stay; combat would
  use Mausritter-style rules (no attack rolls: roll damage, armour reduces
  it, Strength takes the rest). Check Mausritter's licence for what can be
  reused before building content from it.
