import DOMPurify from "dompurify";
import { useMemo } from "react";

/** Renders editor HTML after stripping scripts, handlers and other unsafe markup. */
export function RichText({ html, className = "" }: { html: string; className?: string }) {
  const clean = useMemo(() => DOMPurify.sanitize(html), [html]);
  if (!clean.trim()) return null;
  return <div className={`rich-text ${className}`} dangerouslySetInnerHTML={{ __html: clean }} />;
}
