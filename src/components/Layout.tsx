import clsx from "clsx";
import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { MapWindow } from "../map/MapWindow";
import { useGame } from "../store/game";
import { useUi } from "../store/ui";
import { DiceTray } from "./DiceTray";
import { DragonMenuIcon } from "./DragonMenuIcon";
import { ThemeEditor } from "./ThemeEditor";

const NAV = [
  { to: "/admin", label: "🛡️ Battle order" },
  { to: "/encounters", label: "⚔️ Encounters" },
  { to: "/campaign", label: "📜 Campaign notes" },
  { to: "/info", label: "📕 Rules & notes" },
  { to: "/play", label: "🎮 Play" },
  { to: "/adventures", label: "📖 Adventures" },
];

function ThemeButton({ className }: { className?: string }) {
  const { theme, set } = useUi();
  return (
    <button className={className} onClick={() => set({ theme: theme === "dark" ? "light" : "dark" })} title="Toggle light/dark">
      🌓 {theme === "dark" ? "Parchment" : "Dungeon"} theme
    </button>
  );
}

/** On the battle order page the map is docked, so the floating window steps aside. */
function useMapDocked() {
  const onCombatPage = useLocation().pathname === "/admin";
  return useUi((s) => onCombatPage && s.dockMap);
}

function MapButton({ className, dockable }: { className?: string; dockable?: boolean }) {
  const { mapOpen, mapMinimized, dockMap, set } = useUi();
  const onCombatPage = useLocation().pathname === "/admin";
  if (dockable && onCombatPage) {
    return (
      <button className={clsx(className, dockMap && "text-accent")} aria-pressed={dockMap} onClick={() => set({ dockMap: !dockMap })}>
        🗺️ Battle map
      </button>
    );
  }
  return (
    <button
      className={clsx(className, mapOpen && "text-accent")}
      aria-pressed={mapOpen}
      onClick={() => set(mapOpen && mapMinimized ? { mapMinimized: false } : { mapOpen: !mapOpen, mapMinimized: false })}
    >
      🗺️ Battle map
    </button>
  );
}

function ConnectionGate({ children }: { children: React.ReactNode }) {
  const { status, error } = useGame();
  if (status === "connecting") {
    return (
      <div className="mt-32 animate-pulse text-center font-display text-3xl font-bold tracking-widest text-accent uppercase">
        Entering dungeon…
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="mx-auto mt-24 max-w-lg rounded-lg border border-danger bg-surface p-6">
        <h2 className="mb-2 text-xl font-bold text-accent">Could not reach the table</h2>
        <p className="text-sm text-muted">{error}</p>
        <button className="btn mt-4" onClick={() => location.reload()}>
          Retry
        </button>
      </div>
    );
  }
  return <>{children}</>;
}

const navItem = "btn justify-start w-full";

/** DM screens: sidebar on desktop, collapsible top bar on mobile. */
function MenuButton({ open, onClick, className }: { open: boolean; onClick: () => void; className?: string }) {
  return (
    <button
      className={clsx("rounded-md p-1 text-accent transition hover:bg-surface-3 hover:brightness-110", className)}
      onClick={onClick}
      aria-expanded={open}
      aria-label={open ? "Hide menu" : "Show menu"}
      title={open ? "Hide menu" : "Show menu"}
    >
      <DragonMenuIcon />
    </button>
  );
}

/** DM screens: hideable sidebar on desktop, dropdown menu on mobile. */
export function DmLayout() {
  const mapDocked = useMapDocked();
  const { sidebarOpen, set } = useUi();
  const [mobileOpen, setMobileOpen] = useState(false);
  const nav = (
    <>
      <MapButton className={navItem} dockable />
      {NAV.map((n) => (
        <NavLink key={n.to} to={n.to} className={({ isActive }) => clsx(navItem, isActive && "border-accent text-accent")}>
          {n.label}
        </NavLink>
      ))}
      <ThemeButton className={clsx(navItem, "mt-4")} />
      <button className={navItem} onClick={() => set({ themeEditorOpen: true })}>
        🎨 Customise colours
      </button>
      <NavLink to="/" className={clsx(navItem, "justify-center font-display")}>
        Player view
      </NavLink>
    </>
  );

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {sidebarOpen ? (
        <aside className="sticky top-0 z-40 hidden h-screen w-64 shrink-0 flex-col gap-3 overflow-y-auto border-r border-line bg-surface-2/70 p-4 backdrop-blur md:flex">
          <div className="mb-4 flex items-start gap-2">
            <MenuButton open onClick={() => set({ sidebarOpen: false })} className="-ml-1" />
            <div>
              <h1 className="text-2xl leading-tight font-bold tracking-wider text-accent">Combat Tracker</h1>
              <p className="mt-1 text-xs font-bold tracking-widest text-muted uppercase">Dungeon Master</p>
            </div>
          </div>
          <nav className="flex flex-col gap-3">{nav}</nav>
        </aside>
      ) : (
        <MenuButton
          open={false}
          onClick={() => set({ sidebarOpen: true })}
          className="fixed top-3 left-3 z-40 hidden border border-line bg-surface shadow-lg md:block"
        />
      )}
      <div className="sticky top-0 z-40 border-b border-line bg-surface-2/90 backdrop-blur md:hidden">
        <div className="flex items-center justify-between p-3">
          <span className="font-display text-xl font-bold text-accent">Combat Tracker</span>
          <MenuButton open={mobileOpen} onClick={() => setMobileOpen(!mobileOpen)} />
        </div>
        {mobileOpen && (
          // Close the menu after picking something.
          <nav className="flex flex-col gap-2 px-4 pb-4" onClick={(e) => (e.target as HTMLElement).closest("a, button") && setMobileOpen(false)}>
            {nav}
          </nav>
        )}
      </div>
      <main className={clsx("w-full min-w-0 flex-1 px-4 pt-8 pb-12 md:px-8 md:pt-12", !sidebarOpen && "md:pl-20")}>
        <ConnectionGate>
          <Outlet />
        </ConnectionGate>
      </main>
      {!mapDocked && <MapWindow editable />}
      <DiceTray />
      <ThemeEditor />
    </div>
  );
}

/** Table-facing screen: minimal chrome that fades until hovered. */
export function PlayerLayout() {
  const ctl = "btn bg-surface shadow-lg";
  return (
    <div className="min-h-screen px-4 pt-8 pb-12 md:px-8">
      <div className="fixed right-4 bottom-4 z-50 flex flex-col gap-2 opacity-20 transition-opacity hover:opacity-100 focus-within:opacity-100 sm:flex-row md:top-6 md:bottom-auto">
        <MapButton className={ctl} />
        <ThemeButton className={ctl} />
      </div>
      <ConnectionGate>
        <Outlet />
      </ConnectionGate>
      <MapWindow editable={false} />
    </div>
  );
}
