import type { Skill } from "./skills";

/**
 * Things that happen on the road: a farmstead on fire, a wagon in the ditch,
 * lights in the marsh. They turn up near the company for a day or two and
 * wait to be found. Landmarks (standing stones, an old battlefield…) are
 * fixed places, there from the start, that can be looked into once.
 *
 * Each choice is a skill check (the party's best at it rolls) or a sure
 * thing, maybe with a cost. Outcomes are plain data the world store applies.
 */

export interface Effects {
  gold?: number;
  provisions?: number;
  /** With the nearest settlement. */
  rep?: number;
  /** Hours lost. */
  hours?: number;
  /** A chest of this base tier. */
  chest?: number;
  potions?: number;
  /** Mark the nearest unknown place of these kinds on the map. */
  reveal?: ("den" | "lair" | "site" | "mark")[];
  /** See this far around the company. */
  explore?: number;
  /** A band of this foe falls on the company. */
  fight?: string;
  horses?: boolean;
}

export interface Outcome extends Effects {
  text: string;
}

export interface Choice {
  label: string;
  skill?: Skill;
  dc?: number;
  /** Paid up front. */
  cost?: { gold?: number; provisions?: number };
  /** The only outcome of a sure thing; a check's success. */
  ok?: Outcome;
  fail?: Outcome;
  /** Walk on by (the event stays where it is). */
  leave?: boolean;
  /** Only offered when the company has no horses. */
  needsNoHorses?: boolean;
}

export interface EventDef {
  title: string;
  /** What the company sees. */
  text: string;
  /** How it's drawn on the map. */
  look: "fire" | "wagon" | "figure" | "wisps" | "camp" | "pilgrims" | "pedlar" | "tracks" | "horse" | "stones" | "bones" | "hut" | "tower" | "shrine";
  choices: Choice[];
}

const LEAVE: Choice = { label: "Ride on", leave: true };

/** Events that come and go. */
export const EVENTS: Record<string, EventDef> = {
  fire: {
    title: "A farmstead burning",
    text: "Black smoke over the fields. A family beats at the flames with sacks; the barn is going and the house is next.",
    look: "fire",
    choices: [
      { label: "Form a bucket line", skill: "Athletics", dc: 12, ok: { text: "The house is saved. The farmer presses a sack of meal on you and swears to tell the whole valley.", rep: 2, provisions: 3 }, fail: { text: "It all burns. You did what you could; the family won't forget that you stopped.", rep: 1, hours: 3 } },
      { label: "Search the ashes after", skill: "Investigation", dc: 13, ok: { text: "Under the barn floor, a strongbox the fire didn't reach. The family is too dazed to ask.", gold: 25, rep: -1 }, fail: { text: "Nothing but char. The family watches you poke about with hard eyes.", rep: -2 } },
      LEAVE,
    ],
  },
  wagon: {
    title: "A wagon in the ditch",
    text: "A merchant's wagon lies on its side, one wheel spinning. The merchant sits in the mud, cursing at the mule.",
    look: "wagon",
    choices: [
      { label: "Heave it upright", skill: "Athletics", dc: 11, ok: { text: "Up it comes. The merchant pays for the help and spreads the word down the road.", gold: 15, rep: 1 }, fail: { text: "It won't shift and a hero wrenches a shoulder. You get it up in the end, slowly.", hours: 3, gold: 5 } },
      { label: "Help yourselves to the cargo", ok: { text: "Bolts of cloth and a purse. The merchant will tell everyone who did it.", gold: 40, rep: -3 } },
      LEAVE,
    ],
  },
  traveller: {
    title: "A wounded traveller",
    text: "A man lies by the track with an arrow in his leg. He was set on, he says, and knows where they went.",
    look: "figure",
    choices: [
      { label: "Tend the wound", skill: "Medicine", dc: 10, ok: { text: "He'll walk again. Grateful, he tells you where the ones who did it lair.", rep: 1, reveal: ["den", "lair"] }, fail: { text: "You do more harm than good, but he still points the way before he limps off.", reveal: ["den", "lair"] } },
      { label: "Share your rations", cost: { provisions: 2 }, ok: { text: "He eats like a wolf and tells you of a ruin few have seen.", rep: 1, reveal: ["site", "mark"] } },
      LEAVE,
    ],
  },
  wisps: {
    title: "Lights in the dusk",
    text: "Pale lights bob between the trees, always just ahead, as if leading somewhere.",
    look: "wisps",
    choices: [
      { label: "Follow them", skill: "Survival", dc: 14, ok: { text: "They lead to a drowned cairn and an old chest wrapped in roots.", chest: 2 }, fail: { text: "Round and round until dawn. The lights vanish, and something else has been following you.", hours: 6, fight: "undead" } },
      { label: "Name them for what they are", skill: "Arcana", dc: 12, ok: { text: "Will-o'-wisps, feeding on fear. You note where they gather: there's always a grave beneath.", reveal: ["site", "mark"] }, fail: { text: "Whatever they are, the heroes don't like them. You move on." } },
      LEAVE,
    ],
  },
  camp: {
    title: "An abandoned camp",
    text: "A fire still smoulders. Bedrolls, a cookpot, no people. They left in a hurry.",
    look: "camp",
    choices: [
      { label: "Search the camp", skill: "Investigation", dc: 11, ok: { text: "Dried meat, a few coins, a healing draught tucked in a boot.", provisions: 4, gold: 10, potions: 1 }, fail: { text: "While you rummage, the owners come back, and they're bandits.", fight: "bandits" } },
      { label: "Read the tracks", skill: "Survival", dc: 12, ok: { text: "The tracks lead back toward their hideout. Now you know where it is.", reveal: ["den"] }, fail: { text: "The ground is too trampled to read." } },
      LEAVE,
    ],
  },
  pilgrims: {
    title: "Pilgrims on the road",
    text: "A line of pilgrims in grey, singing, afraid of the woods ahead. They ask for an escort.",
    look: "pilgrims",
    choices: [
      { label: "Escort them", ok: { text: "A slow walk, but safe. They pay what they can and pray for the company.", hours: 6, gold: 12, rep: 2 } },
      { label: "Share a fire with them", cost: { provisions: 1 }, skill: "Religion", dc: 11, ok: { text: "Talk of saints and old roads. Their elder marks a forgotten shrine on your map.", reveal: ["mark"] }, fail: { text: "A pleasant evening, nothing more.", rep: 1 } },
      LEAVE,
    ],
  },
  pedlar: {
    title: "A pedlar",
    text: "A pedlar with a pack taller than he is, and a mule with a pack taller than that.",
    look: "pedlar",
    choices: [
      { label: "Buy rations (5 for 10 gold)", cost: { gold: 10 }, ok: { text: "Hard bread and harder cheese, but it fills a belly.", provisions: 5 } },
      { label: "Buy a healing draught (30 gold)", cost: { gold: 30 }, ok: { text: "He swears it's the real thing. It is.", potions: 1 } },
      { label: "Haggle for his news", skill: "Persuasion", dc: 12, ok: { text: "For the price of a smile, he tells you where the trouble is.", reveal: ["den", "lair", "site"] }, fail: { text: "\"News costs, friend.\" He won't budge." } },
      LEAVE,
    ],
  },
  tracks: {
    title: "Tracks in the mud",
    text: "Fresh tracks cross the path: many feet, heavy, heading somewhere with purpose.",
    look: "tracks",
    choices: [
      { label: "Follow them", skill: "Survival", dc: 12, ok: { text: "They lead you to the edge of a camp. You mark it and slip away.", reveal: ["den", "lair"] }, fail: { text: "You lose them in a stream, and an afternoon with them.", hours: 3 } },
      LEAVE,
    ],
  },
  horse: {
    title: "A riderless horse",
    text: "A saddled horse grazes alone, reins trailing. Whoever rode it isn't coming back.",
    look: "horse",
    choices: [
      { label: "Calm it and take it", skill: "Animal Handling", dc: 12, needsNoHorses: true, ok: { text: "It comes to hand, and others follow from the trees: enough to mount the company.", horses: true }, fail: { text: "It bolts. In the saddlebags it left behind, a few coins.", gold: 8 } },
      { label: "Search the saddlebags", ok: { text: "A purse and a letter you can't read. The horse wanders off.", gold: 18 } },
      LEAVE,
    ],
  },
};

/** Landmarks: fixed, there from the start, looked into once. */
export const MARKS: Record<string, EventDef & { name: string }> = {
  stones: {
    name: "Standing stones",
    title: "The standing stones",
    text: "A ring of grey stones, older than any kingdom. The grass inside is greener than it should be.",
    look: "stones",
    choices: [
      { label: "Study the carvings", skill: "Arcana", dc: 13, ok: { text: "A star map. Under the tallest stone, an offering from people long gone.", chest: 2 }, fail: { text: "The carvings make heads ache. Nothing comes of it." } },
      { label: "Leave an offering (10 gold)", cost: { gold: 10 }, ok: { text: "The wind drops. The heroes sleep there and wake with the land laid out clear in their minds.", explore: 260 } },
      LEAVE,
    ],
  },
  battlefield: {
    name: "Old battlefield",
    title: "An old battlefield",
    text: "Rusted blades in the heather and mounds that might be graves. Crows everywhere.",
    look: "bones",
    choices: [
      { label: "Scavenge", skill: "Investigation", dc: 12, ok: { text: "Under the rust, good steel and a captain's purse.", gold: 35, chest: 1 }, fail: { text: "You disturb what should have been left. The dead get up.", fight: "undead" } },
      { label: "Bury the dead", ok: { text: "A long day's digging. It feels right, and the nearby folk hear of it.", hours: 8, rep: 2 } },
      LEAVE,
    ],
  },
  hermit: {
    name: "Hermit's hut",
    title: "A hermit's hut",
    text: "A hut of turf and wattle, smoke from the roof. An old woman watches from the door.",
    look: "hut",
    choices: [
      { label: "Ask what she knows", skill: "Persuasion", dc: 11, ok: { text: "She knows every hole in these hills and marks them all on your map.", reveal: ["den", "den", "lair", "site"] }, fail: { text: "She shuts the door on you, and then opens it to throw out some bread.", provisions: 2 } },
      { label: "Trade rations for her herbs", cost: { provisions: 3 }, ok: { text: "Bitter stuff in clay pots. It works.", potions: 2 } },
      LEAVE,
    ],
  },
  tower: {
    name: "Ruined watchtower",
    title: "A ruined watchtower",
    text: "Half a tower on a rise, its stair still clinging to the inside wall.",
    look: "tower",
    choices: [
      { label: "Climb to the top", skill: "Athletics", dc: 11, ok: { text: "From the top you can see for miles.", explore: 320 }, fail: { text: "The stair gives way halfway up. Bruises, and only a glimpse.", explore: 160, hours: 2 } },
      { label: "Search the cellar", skill: "Perception", dc: 13, ok: { text: "The garrison's last pay chest, never collected.", gold: 30 }, fail: { text: "Rats, and a nest of something with too many legs.", fight: "vermin" } },
      LEAVE,
    ],
  },
  shrine: {
    name: "Wayside shrine",
    title: "A wayside shrine",
    text: "A weathered saint in a stone niche, offerings of flowers and copper at her feet.",
    look: "shrine",
    choices: [
      { label: "Pray", skill: "Religion", dc: 10, ok: { text: "Peace settles on the company. The next settlement hears that you kept the old ways.", rep: 2, potions: 1 }, fail: { text: "Quiet, and no answer. Still, it was good to stop." } },
      { label: "Take the copper", ok: { text: "A handful of coins. It feels like being watched.", gold: 12, rep: -2 } },
      LEAVE,
    ],
  },
};

export const MARK_KINDS = Object.keys(MARKS);
export const EVENT_KINDS = Object.keys(EVENTS);

export const eventDef = (kind: string): EventDef | undefined => EVENTS[kind] ?? MARKS[kind];

/** Resolve a choice: the party's best rolls a d20 for a check. */
export function resolveChoice(choice: Choice, bonus: number, roll: number): { ok: boolean; outcome: Outcome; total?: number } {
  if (!choice.skill || choice.dc === undefined) return { ok: true, outcome: choice.ok ?? { text: "" } };
  const total = roll + bonus;
  const ok = total >= choice.dc;
  return { ok, total, outcome: (ok ? choice.ok : choice.fail) ?? { text: "Nothing comes of it." } };
}
