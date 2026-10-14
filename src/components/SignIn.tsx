import clsx from "clsx";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { auth, signOut, useSession } from "../store/game";
import { MIN_PASSWORD } from "../sync/adapter";
import { Dialog } from "./Dialog";

/** Nothing shows until someone has signed in. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { checked, account } = useSession();
  if (!checked)
    return <div className="mt-32 animate-pulse text-center font-display text-3xl font-bold tracking-widest text-accent uppercase">Entering dungeon…</div>;
  if (!account) return <SignIn />;
  return <>{children}</>;
}

/** Sign in, or make a new account: a name and a password. */
export function SignIn() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (mode === "up" && password !== again) return setError("The passwords don't match");
    setBusy(true);
    try {
      if (mode === "in") await auth().signIn(name, password);
      else await auth().signUp(name, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-start justify-center px-4 pt-24">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-line bg-surface p-6 shadow-xl">
        <header className="text-center">
          <h1 className="font-display text-3xl font-bold tracking-wider text-accent">Combat Tracker</h1>
          <p className="text-sm text-muted">{mode === "in" ? "Welcome back, adventurer." : "A new adventurer joins the table."}</p>
        </header>
        <div className="grid grid-cols-2 gap-1" role="tablist">
          {(
            [
              ["in", "Sign in"],
              ["up", "New player"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={mode === k}
              className={clsx("btn text-sm", mode === k && "border-accent text-accent")}
              onClick={() => {
                setMode(k);
                setError(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="block">
            <span className="field-label">Name</span>
            <input className="field" autoComplete="username" autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
          </label>
          <label className="block">
            <span className="field-label">Password</span>
            <input className="field" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Password" />
          </label>
          {mode === "up" && (
            <label className="block">
              <span className="field-label">Password again</span>
              <input className="field" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} aria-label="Password again" />
            </label>
          )}
          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary w-full font-display" disabled={busy || !name.trim() || !password}>
            {busy ? "…" : mode === "in" ? "Sign in" : "Create my account"}
          </button>
        </form>
        <p className="text-center text-xs text-faint">
          {mode === "up"
            ? `Pick any name and a password of at least ${MIN_PASSWORD} characters. No e-mail needed.`
            : "Forgot your password? Make a new account and ask the DM to move your save over."}
        </p>
      </div>
    </div>
  );
}

/** Who's signed in, with sign-out and a password change. */
export function AccountMenu({ className }: { className?: string }) {
  const account = useSession((s) => s.account);
  const [open, setOpen] = useState(false);
  if (!account) return null;
  return (
    <div className={clsx("space-y-1 text-sm", className)}>
      <div className="truncate text-xs text-muted">
        Signed in as <strong className="text-strong">{account.username}</strong>
      </div>
      <div className="flex gap-1">
        <button className="btn flex-1 px-2 py-1 text-xs" onClick={() => setOpen(true)}>
          🔑 Password
        </button>
        <button className="btn flex-1 px-2 py-1 text-xs" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
      {open && <ChangePassword open onClose={() => setOpen(false)} />}
    </div>
  );
}

function ChangePassword({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onClose={onClose} title="Change password">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            await auth().changePassword(current, next);
            toast.success("Password changed");
            setCurrent("");
            setNext("");
            onClose();
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          }
        }}
      >
        <label className="block">
          <span className="field-label">Current password</span>
          <input className="field" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
        <label className="block">
          <span className="field-label">New password</span>
          <input className="field" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="text-right">
          <button className="btn btn-primary" disabled={!current || next.length < MIN_PASSWORD}>
            Change
          </button>
        </div>
      </form>
    </Dialog>
  );
}
