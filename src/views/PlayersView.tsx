import clsx from "clsx";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { ChronicleEntry, PlayerDoc, Profile } from "../domain/players";
import type { CampaignState } from "../game/adventure";
import { allAdventures } from "../game/campaign-store";
import { update, useGame } from "../store/game";
import { createProfile, deleteProfile, renameProfile, setChronicleStatus, setRole, useActiveProfile, usePlayers } from "../store/players";
import { DEFAULT_PICKS } from "../game/party-store";
import { built, clockText, renownOf } from "../game/town";

const KIND_ICON: Record<ChronicleEntry["kind"], string> = { adventure: "📜", fight: "⚔", loot: "💰", level: "⭐", story: "🔖", death: "✝" };

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const when = (ms: number) => {
  const mins = Math.round((Date.now() - ms) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(ms).toLocaleDateString();
};

/**
 * The DM's side of the between-session game: who plays, their heroes and
 * progress, and a chronicle of what happened that can go into the campaign
 * notes for the next real session.
 */
export function PlayersView() {
  const profiles = useGame((s) => s.players.profiles);
  const docs = usePlayers((s) => s.docs);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<"new" | "all">("new");
  const [who, setWho] = useState<string>("");
  const [name, setName] = useState("");

  const feed = useMemo(
    () =>
      profiles
        .flatMap((p) => (docs[p.id]?.chronicle ?? []).map((e) => ({ e, p })))
        .filter(({ e, p }) => (filter === "all" || e.status === "new") && (!who || p.id === who))
        .sort((a, b) => b.e.at - a.e.at),
    [profiles, docs, filter, who],
  );
  const newCount = (id: string) => (docs[id]?.chronicle ?? []).filter((e) => e.status === "new").length;
  const current = profiles.find((p) => p.id === selected);

  const toNotes = (p: Profile, e: ChronicleEntry) => {
    update("notes", (d) => {
      d.campaign += `<p><strong>${escape(p.name)}</strong> · ${new Date(e.at).toLocaleDateString()}: ${escape(e.text)}</p>`;
    });
    setChronicleStatus(p.id, e.id, "applied");
    toast.success("Added to campaign notes");
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4">
      <header>
        <h2 className="text-3xl font-bold text-accent">Players</h2>
        <p className="text-sm text-muted">Who plays between sessions, how they're doing, and what happened that you might bring to the table.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[17rem_1fr]">
        <aside className="space-y-3">
          <ul className="space-y-1" aria-label="Player list">
            {profiles.map((p) => (
              <li key={p.id}>
                <button
                  className={clsx("flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm", p.id === selected ? "border-accent bg-accent/10" : "border-line bg-surface hover:border-accent")}
                  onClick={() => setSelected(p.id === selected ? null : p.id)}
                >
                  <Dot profile={p} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-strong">{p.name}</span>
                    <span className="block text-xs text-faint">
                      {p.role === "dm" ? "DM" : "Player"}
                      {docs[p.id]?.updatedAt ? ` · active ${when(docs[p.id]!.updatedAt)}` : ""}
                    </span>
                  </span>
                  {newCount(p.id) > 0 && <span className="rounded-full bg-accent px-1.5 text-xs font-bold text-accent-fg">{newCount(p.id)}</span>}
                </button>
              </li>
            ))}
          </ul>
          <form
            className="flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              // Adding a player here shouldn't change who's playing on this device.
              const prev = useActiveProfile.getState().id;
              createProfile(name, profiles.length === 0 ? "dm" : "player", DEFAULT_PICKS);
              useActiveProfile.setState({ id: prev });
              setName("");
            }}
          >
            <input className="field flex-1 py-1" placeholder="New player's name" value={name} onChange={(e) => setName(e.target.value)} aria-label="New player's name" />
            <button className="btn px-2 text-sm" disabled={!name.trim()}>
              Add
            </button>
          </form>
          <p className="text-xs text-faint">Players pick their profile on the Play page. Logins come later; for now anyone with the link can pick any profile.</p>
        </aside>

        <div className="min-w-0 space-y-4">
          {current && <PlayerCard profile={current} doc={docs[current.id]} onDeleted={() => setSelected(null)} />}

          <section className="rounded-lg border border-line bg-surface p-3 shadow" aria-label="Chronicle">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="font-display text-lg font-bold text-accent">Chronicle</h3>
              <select className="field w-auto py-0.5 text-sm" value={filter} onChange={(e) => setFilter(e.target.value as "new" | "all")} aria-label="Show">
                <option value="new">New only</option>
                <option value="all">Everything</option>
              </select>
              <select className="field w-auto py-0.5 text-sm" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Player">
                <option value="">All players</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {feed.some(({ e }) => e.status === "new") && (
                <button className="btn btn-ghost ml-auto px-2 py-0.5 text-xs" onClick={() => feed.forEach(({ e, p }) => e.status === "new" && setChronicleStatus(p.id, e.id, "dismissed"))}>
                  Mark all as seen
                </button>
              )}
            </div>
            {feed.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted italic">{filter === "new" ? "Nothing new since you last looked." : "Nothing has happened yet."}</p>
            ) : (
              <ol className="space-y-1">
                {feed.map(({ e, p }) => (
                  <li key={`${p.id}/${e.id}`} className={clsx("flex items-start gap-2 rounded-md border px-2 py-1.5 text-sm", e.status === "new" ? "border-line bg-surface-2" : "border-transparent opacity-60")}>
                    <span title={e.kind}>{KIND_ICON[e.kind]}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-strong">{e.text}</div>
                      <div className="text-xs text-faint">
                        <Dot profile={p} small /> {p.name}
                        {e.adventure ? ` · ${e.adventure}` : ""} · {when(e.at)}
                        {e.status === "applied" ? " · in your notes" : ""}
                      </div>
                    </div>
                    {e.status === "new" && (
                      <span className="flex shrink-0 gap-1">
                        <button className="btn px-2 py-0.5 text-xs" onClick={() => toNotes(p, e)} title="Append to campaign notes">
                          → Notes
                        </button>
                        <button className="btn btn-ghost px-2 py-0.5 text-xs" onClick={() => setChronicleStatus(p.id, e.id, "dismissed")} title="Mark as seen">
                          ✓
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Dot({ profile, small }: { profile: Profile; small?: boolean }) {
  return <span className={clsx("inline-block shrink-0 rounded-full", small ? "h-2 w-2" : "h-3 w-3")} style={{ background: profile.color }} />;
}

const profileName = (id: string) => useGame.getState().players.profiles.find((p) => p.id === id)?.name ?? "another player";

function PlayerCard({ profile: p, doc, onDeleted }: { profile: Profile; doc: PlayerDoc | undefined; onDeleted: () => void }) {
  const [name, setName] = useState(p.name);
  const campaign = doc?.campaign as CampaignState | null | undefined;
  const adv = campaign ? allAdventures().find((a) => a.id === campaign.adventureId) : undefined;
  const battle = doc?.battle as { scenario?: { name?: string } } | null | undefined;
  return (
    <section className="space-y-3 rounded-lg border border-line bg-surface p-3 shadow" aria-label={`${p.name}'s details`}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="field-label">Name</span>
          <input className="field py-1" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => renameProfile(p.id, name)} />
        </label>
        <label className="block">
          <span className="field-label">Role</span>
          <select className="field w-auto py-1" value={p.role} onChange={(e) => setRole(p.id, e.target.value as Profile["role"])}>
            <option value="player">Player</option>
            <option value="dm">Dungeon Master</option>
          </select>
        </label>
        <button
          className="btn btn-danger ml-auto"
          onClick={() => {
            if (!confirm(`Delete ${p.name} and all their saves?`)) return;
            deleteProfile(p.id);
            onDeleted();
          }}
        >
          Delete player
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <h4 className="text-xs font-bold tracking-wider text-faint uppercase">Town · {renownOf(doc?.renown ?? 1).title}</h4>
          {doc?.town ? (
            <div className="text-sm">
              <strong className="text-strong">{doc.town.name}</strong> <span className="text-muted">· {clockText(doc.town.hours)}</span>
              <div className="text-xs text-muted">
                {built(doc.town).length} buildings · {doc.town.settlers.length} settlers · {doc.town.gold} gold · {doc.town.food} food
              </div>
              {doc.residence && <div className="text-xs text-warn">Living in {profileName(doc.residence)}'s town</div>}
            </div>
          ) : (
            <p className="text-sm text-muted italic">{doc?.residence ? `Lives in ${profileName(doc.residence)}'s town.` : "No town yet."}</p>
          )}
        </div>
        <div>
          <h4 className="text-xs font-bold tracking-wider text-faint uppercase">Characters</h4>
          {doc?.characters.length ? (
            <ul className="text-sm">
              {doc.characters.map((c) => (
                <li key={c.id}>
                  <strong className="text-strong">{c.name}</strong> <span className="text-muted">· {c.species} {c.className} · {c.background}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted italic">Plays the ready-made heroes.</p>
          )}
        </div>
        <div>
          <h4 className="text-xs font-bold tracking-wider text-faint uppercase">Right now</h4>
          {campaign ? (
            <div className="text-sm">
              <div>
                <strong className="text-strong">{adv?.title ?? "An adventure"}</strong>
                {campaign.ended ? ` · ended in ${campaign.ended}` : adv?.scenes[campaign.sceneId] ? ` · at “${adv.scenes[campaign.sceneId]!.title}”` : ""}
                {battle?.scenario?.name ? ` · fighting ${battle.scenario.name}` : ""}
              </div>
              <ul className="text-xs text-muted">
                {campaign.party.heroes.map((h) => (
                  <li key={h.key}>
                    {h.name}: level {h.level}, {h.dead ? "fallen" : `${h.hp}/${h.hpMax} HP`}
                  </li>
                ))}
              </ul>
              <div className="text-xs text-muted">{campaign.party.gold} gp</div>
            </div>
          ) : battle?.scenario?.name ? (
            <p className="text-sm">Skirmish: {battle.scenario.name}</p>
          ) : (
            <p className="text-sm text-muted italic">Not on an adventure.</p>
          )}
        </div>
      </div>
    </section>
  );
}
