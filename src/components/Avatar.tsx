import clsx from "clsx";
import { initials } from "../domain/combat";
import type { Combatant } from "../domain/types";

interface Props {
  combatant: Pick<Combatant, "name" | "image" | "isMonster">;
  ring?: string;
  size?: "xs" | "sm" | "md" | "lg";
  active?: boolean;
}

const SIZES = { xs: "size-8 text-sm", sm: "size-10 text-base", md: "size-14 text-xl", lg: "size-16 text-2xl" };

export function Avatar({ combatant, ring, size = "md", active }: Props) {
  return (
    <div className={clsx("relative shrink-0", SIZES[size])}>
      <div
        className={clsx("flex size-full items-center justify-center rounded-full bg-cover bg-center font-bold text-white", size === "xs" ? "border-2" : "border-[3px]")}
        style={{
          borderColor: ring ?? "var(--line)",
          backgroundColor: combatant.isMonster ? "var(--token-monster)" : "var(--token-player)",
          backgroundImage: combatant.image ? `url("${combatant.image}")` : undefined,
        }}
      >
        {!combatant.image && initials(combatant.name)}
      </div>
      {active && (
        <span
          aria-label="Active turn"
          className="absolute -right-1 -bottom-1 flex size-6 animate-pulse items-center justify-center rounded-full border-2 border-surface bg-accent text-[10px] shadow-[0_0_10px_var(--accent)]"
        >
          ⚔️
        </span>
      )}
    </div>
  );
}
