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

## Milestones

| | Delivers |
| --- | --- |
| **M0** | Stat blocks as data; a few SRD monsters; 4 ready-made characters; one-click attack and damage in the tracker |
| **M1** | Rules core with tests: turns and actions, movement and walls, attacks, saves, damage types, crits, death saves, opportunity attacks |
| **M2** | First playable skirmish: Play page, party vs encounter, click to move and attack, combat log, monster AI, save/resume |
| **M3** | RPG layer: scenes, choices, skill checks, rests, items, XP, levels 2–3 |
| **M4** | Spells and conditions with full effects; more classes and monsters |
| **M5** | Character builder and adventure editor in the DM app |

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
