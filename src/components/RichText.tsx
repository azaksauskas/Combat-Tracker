import DOMPurify from "dompurify";
import { useMemo } from "react";
import { linkifyRolls } from "../lib/rollable";

interface Props {
  html: string;
  className?: string;
  /** When set, dice and modifiers in the text become roll buttons. */
  onRoll?: (expression: string, label: string) => void;
}

/** Renders editor HTML after stripping scripts, handlers and other unsafe markup. */
export function RichText({ html, className = "", onRoll }: Props) {
  const rollable = !!onRoll;
  const clean = useMemo(() => {
    const safe = DOMPurify.sanitize(html);
    return rollable ? linkifyRolls(safe) : safe;
  }, [html, rollable]);
  if (!clean.trim()) return null;
  return (
    <div
      className={`rich-text ${className}`}
      onClick={(e) => {
        const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-roll]");
        if (btn && onRoll) onRoll(btn.dataset.roll!, btn.dataset.label ?? "");
      }}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
