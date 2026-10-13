import type { Adventure } from "../game/adventure";

/**
 * "The Goblin Trail" — a short first adventure for the ready-made party.
 * Two routes (briars or river road), checks that change who is surprised,
 * loot, rests, a trapped crypt. Milestones: level 2 at the crypt, 3 at the end.
 */
export const GOBLIN_TRAIL: Adventure = {
  id: "goblin-trail",
  title: "The Goblin Trail",
  blurb: "Goblins have taken the miller's daughter. Track them through the woods to an old crypt on the hill.",
  start: "millbrook",
  startingGold: 25,
  scenes: {
    millbrook: {
      id: "millbrook",
      title: "Millbrook's Plea",
      text:
        "Rain drums on the thatch of the Drowned Rat. Old Hobb the miller grips his cap with both hands: goblins took his daughter Tamsin two nights ago, dragged her off along the forest trail. The reeve has scraped together 50 gold for her safe return. Every eye in the tavern is on you.",
      choices: [
        {
          id: "hunters",
          label: "Ask the hunters what they've seen",
          once: true,
          check: { skill: "Persuasion", dc: 12, mode: "choose" },
          success: {
            text: "The grizzled hunter Edda lowers her voice: \"They run with wolves. And they've holed up in the old crypt on the hill — the one we don't go near.\" She presses a small red vial into your hand. \"You'll want this more than me.\"",
            effects: [{ type: "item", id: "potion-healing" }, { type: "flag", name: "warned" }],
            next: { scene: "millbrook" },
          },
          failure: { text: "The hunters stare into their ale. Nobody wants to talk about goblins tonight.", next: { scene: "millbrook" } },
        },
        {
          id: "shrine",
          label: "Pray at the roadside shrine",
          once: true,
          check: { skill: "Religion", dc: 10, mode: "choose" },
          success: {
            text: "The shrine's keeper recognises a kindred spirit and blesses your journey, sending you off with a flask of holy water — and a healing draught.",
            effects: [{ type: "item", id: "potion-healing" }],
            next: { scene: "millbrook" },
          },
          failure: { text: "The candles gutter in the wind. Whatever listens here keeps its own counsel.", next: { scene: "millbrook" } },
        },
        {
          id: "set-out",
          label: "Set out along the forest trail",
          success: { next: { scene: "trail" } },
        },
      ],
    },

    trail: {
      id: "trail",
      title: "The Fork in the Trail",
      text:
        "An hour past the last farm the trail splits. To the left, a narrow path winds into thick briars. To the right, the old river road, wider and muddier — and, they say, watched by bandits who charge a 'toll'.",
      choices: [
        {
          id: "tracks",
          label: "Search for tracks",
          once: true,
          check: { skill: "Survival", dc: 12, mode: "choose" },
          success: {
            text: "Small, clawed footprints — lots of them — and the drag marks of something heavier. They lead into the briars. Now you know where to look.",
            effects: [{ type: "flag", name: "tracked" }, { type: "xp", amount: 25 }],
            next: { scene: "trail" },
          },
          failure: { text: "Rain has turned the ground to soup. You can't make sense of the tracks.", next: { scene: "trail" } },
        },
        {
          id: "briars-sneak",
          label: "Creep along the briar path",
          check: { skill: "Stealth", dc: 12, mode: "group" },
          success: {
            text: "You slip through the thorns without a sound — and catch the goblins squatting around a smoking fire, their wolf gnawing a bone.",
            next: { fight: { scenarioId: "goblin-ambush", surprised: "enemy" }, victory: "goblin-camp", defeat: "captured" },
          },
          failure: {
            text: "A branch snaps. A horn blares. Arrows hiss out of the brush — it's an ambush!",
            next: { fight: { scenarioId: "goblin-ambush", surprised: "party" }, victory: "goblin-camp", defeat: "captured" },
          },
        },
        {
          id: "river",
          label: "Take the river road",
          success: { next: { scene: "toll" } },
        },
      ],
    },

    toll: {
      id: "toll",
      title: "The Toll Bridge",
      text:
        "A rope stretched across the bridge, a crude sign — TOLL 20 GOLD — and six bandits with crossbows lounging behind an overturned wagon. Their leader grins. \"Road's not free, friends.\"",
      choices: [
        {
          id: "pay",
          label: "Pay the toll (20 gp)",
          costGold: 20,
          success: { text: "The bandits count the coins twice and wave you through, laughing.", next: { scene: "crypt-approach" } },
        },
        {
          id: "intimidate",
          label: "Tell them to get out of your way",
          check: { skill: "Intimidation", dc: 14, mode: "choose" },
          success: {
            text: "Something in your voice convinces them that today is not a good day to die. They scatter into the reeds, leaving their loot behind.",
            effects: [{ type: "gold", amount: 15 }, { type: "xp", amount: 150 }],
            next: { scene: "crypt-approach" },
          },
          failure: {
            text: "The leader's grin vanishes. \"Wrong answer.\" Crossbows come up.",
            next: { fight: { scenarioId: "bandit-camp" }, victory: "bandit-loot", defeat: "captured" },
          },
        },
        {
          id: "attack",
          label: "Attack first",
          success: { text: "You don't wait for an answer.", next: { fight: { scenarioId: "bandit-camp", surprised: "enemy" }, victory: "bandit-loot", defeat: "captured" } },
        },
      ],
    },

    "bandit-loot": {
      id: "bandit-loot",
      title: "The Bandits' Wagon",
      text: "The last bandit flees into the river. Their wagon is stacked with stolen goods — and a map with a skull drawn over the hill crypt.",
      choices: [
        {
          id: "search",
          label: "Search the wagon",
          once: true,
          success: {
            text: "Coins, a healing potion, and a finely balanced blade with a faint silver sheen.",
            effects: [{ type: "gold", amount: 40 }, { type: "item", id: "potion-healing" }, { type: "item", id: "weapon-plus-1" }, { type: "xp", amount: 275 }],
            next: { scene: "bandit-loot" },
          },
        },
        { id: "rest", label: "Catch your breath (short rest)", once: true, success: { effects: [{ type: "rest", kind: "short" }], next: { scene: "bandit-loot" } } },
        { id: "go", label: "Follow the map to the crypt", success: { next: { scene: "crypt-approach" } } },
      ],
    },

    "goblin-camp": {
      id: "goblin-camp",
      title: "The Goblin Camp",
      text: "The last goblin falls. Their camp is a mess of bones, stolen chickens and a cage — empty, but for a scrap of a girl's blue ribbon. The trail leads uphill, towards the crypt.",
      choices: [
        {
          id: "search",
          label: "Search the camp",
          once: true,
          success: {
            text: "Under a pile of furs: a purse of silver, a healing potion, and a sword far too fine for any goblin.",
            effects: [{ type: "gold", amount: 30 }, { type: "item", id: "potion-healing" }, { type: "item", id: "weapon-plus-1" }, { type: "xp", amount: 250 }],
            next: { scene: "goblin-camp" },
          },
        },
        { id: "short", label: "Take a short rest", once: true, success: { effects: [{ type: "rest", kind: "short" }], next: { scene: "goblin-camp" } } },
        {
          id: "long",
          label: "Make camp for the night (long rest)",
          once: true,
          success: { text: "You sleep in shifts by the dying fire. Nothing disturbs you but owls.", effects: [{ type: "rest", kind: "long" }], next: { scene: "goblin-camp" } },
        },
        { id: "go", label: "Climb to the crypt", success: { next: { scene: "crypt-approach" } } },
      ],
    },

    "crypt-approach": {
      id: "crypt-approach",
      title: "The Crypt on the Hill",
      text:
        "Crooked headstones, a stone door ajar, claw marks on the threshold. From somewhere below comes a girl's muffled cry — and the dry scrape of bone on stone.",
      onEnter: [{ type: "milestone", level: 2 }],
      choices: [
        {
          id: "inspect",
          label: "Check the entrance for traps",
          once: true,
          check: { skill: "Investigation", dc: 13, mode: "choose" },
          success: {
            text: "A thin wire across the third step, tied to a rusted blade above the arch. You cut it carefully.",
            effects: [{ type: "flag", name: "trap-disarmed" }, { type: "xp", amount: 50 }],
            next: { scene: "crypt-approach" },
          },
          failure: { text: "Dust, cobwebs, old bones. Nothing that looks dangerous.", next: { scene: "crypt-approach" } },
        },
        {
          id: "rest",
          label: "Rest before going in (short rest)",
          once: true,
          success: { effects: [{ type: "rest", kind: "short" }], next: { scene: "crypt-approach" } },
        },
        {
          id: "enter-safe",
          label: "Enter the crypt",
          requiresFlag: "trap-disarmed",
          success: { text: "You step over the cut wire and descend into the dark.", next: { fight: { scenarioId: "crypt" }, victory: "rescue", defeat: "captured" } },
        },
        {
          id: "enter",
          label: "Enter the crypt",
          hideIfFlag: "trap-disarmed",
          success: {
            text: "A wire snaps underfoot — a rusted blade swings down from the arch!",
            effects: [{ type: "damage", dice: "2d6", damageType: "slashing", save: { ability: "dex", dc: 12 } }],
            next: { fight: { scenarioId: "crypt" }, victory: "rescue", defeat: "captured" },
          },
        },
      ],
    },

    rescue: {
      id: "rescue",
      title: "Tamsin",
      text:
        "The last of the dead crumbles. Behind a coffin you find Tamsin, bound and furious, with a goblin's ear-ring clenched in her fist as a trophy. \"Took you long enough,\" she says, and then bursts into tears.",
      choices: [
        {
          id: "home",
          label: "Bring her home to Millbrook",
          success: {
            text: "The whole village turns out with torches. Hobb weeps, the reeve pays up, and Edda the hunter buys the first round. Somewhere beyond the hill, something that sent the dead walking is still out there — but that's a story for another day.",
            effects: [{ type: "gold", amount: 50 }, { type: "milestone", level: 3 }, { type: "settler", name: "Tamsin", trade: "miller's daughter" }],
            next: { end: "victory" },
          },
        },
      ],
    },

    captured: {
      id: "captured",
      title: "Left for Dead",
      text:
        "You wake in the mud hours later, bruised and bleeding, gear scattered. Whoever beat you didn't stay to finish the job. The trail is cold — but Tamsin is still out there.",
      choices: [
        { id: "back", label: "Limp back to Millbrook and try again", success: { effects: [{ type: "rest", kind: "long" }], next: { scene: "trail" } } },
        { id: "give-up", label: "Give up", success: { text: "Millbrook will remember you as the ones who failed.", next: { end: "defeat" } } },
      ],
    },
  },
};

export const ADVENTURES: Adventure[] = [GOBLIN_TRAIL];
