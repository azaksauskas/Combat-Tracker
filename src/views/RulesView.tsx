const CONDITION_RULES: [string, string][] = [
  ["Blinded", "Can't see; auto-fails sight checks. Attacks against it have advantage, its attacks have disadvantage."],
  ["Charmed", "Can't attack the charmer; the charmer has advantage on social checks against it."],
  ["Deafened", "Can't hear; auto-fails hearing checks."],
  ["Exhaustion", "Cumulative levels; each level imposes a penalty. Six levels is death."],
  ["Frightened", "Disadvantage on checks and attacks while the source is in sight; can't willingly move closer."],
  ["Grappled", "Speed 0. Ends if the grappler is incapacitated or the creature is moved out of reach."],
  ["Incapacitated", "Can't take actions or reactions."],
  ["Invisible", "Can't be seen without magic. Its attacks have advantage, attacks against it have disadvantage."],
  ["Paralyzed", "Incapacitated, can't move or speak. Fails Str/Dex saves; hits within 5 ft are crits."],
  ["Petrified", "Turned to stone: incapacitated, resistance to all damage, immune to poison and disease."],
  ["Poisoned", "Disadvantage on attack rolls and ability checks."],
  ["Prone", "Can only crawl. Melee attacks against it have advantage, ranged have disadvantage."],
  ["Restrained", "Speed 0. Attacks against it have advantage; its attacks and Dex saves have disadvantage."],
  ["Stunned", "Incapacitated, can't move, speaks falteringly. Fails Str/Dex saves; attacks against it have advantage."],
  ["Unconscious", "Incapacitated and prone, drops what it holds. Fails Str/Dex saves; hits within 5 ft are crits."],
];

export function RulesView() {
  return (
    <div className="mx-auto w-full max-w-4xl">
      <h2 className="mb-4 text-3xl font-bold text-accent">DM reference</h2>
      <section className="rounded-lg border border-line bg-surface p-6 shadow">
        <h3 className="mb-3 text-xl font-bold text-strong">Conditions</h3>
        <dl className="grid gap-3 sm:grid-cols-2">
          {CONDITION_RULES.map(([name, text]) => (
            <div key={name}>
              <dt className="font-bold text-accent">{name}</dt>
              <dd className="text-sm text-muted">{text}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
