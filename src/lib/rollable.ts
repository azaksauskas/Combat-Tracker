import { ROLLABLE_PATTERN, rollableToExpression } from "../domain/dice";

const tidy = (s: string) => s.replace(/^[\s.,;:()]+|[\s.,;:()]+$/g, "");

/** Up to `n` words before a match, e.g. "Wis" in "Dex +2, Wis -1". */
function wordsBefore(text: string, n = 2) {
  return tidy(text.trim().split(/\s+/).slice(-n).join(" "));
}

/**
 * Stat blocks usually name the attack in bold ("<b>Scimitar.</b> +4 to
 * hit…"), so prefer the nearest bold text earlier in the same paragraph.
 */
function boldHeading(node: Text): string | null {
  const block = node.parentElement?.closest("p, li, div, body");
  if (!block) return null;
  let found: string | null = null;
  for (const b of block.querySelectorAll("strong, b")) {
    if (b.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) found = tidy(b.textContent ?? "") || found;
  }
  return found;
}

/**
 * Wraps dice expressions and modifiers in already-sanitised HTML with
 * buttons carrying `data-roll` (the expression) and `data-label` (nearby
 * words, for the roll log). Only text nodes are touched and all text goes
 * through the DOM, so nothing new can be injected.
 */
export function linkifyRolls(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  for (const node of nodes) {
    const text = node.data;
    const heading = boldHeading(node);
    const re = new RegExp(ROLLABLE_PATTERN.source, ROLLABLE_PATTERN.flags);
    let last = 0;
    let m: RegExpExecArray | null;
    const frag = doc.createDocumentFragment();
    while ((m = re.exec(text))) {
      frag.append(text.slice(last, m.index));
      const btn = doc.createElement("button");
      btn.type = "button";
      btn.className = "roll-link";
      btn.dataset.roll = rollableToExpression(m[0]);
      btn.dataset.label = `${heading ?? wordsBefore(text.slice(last, m.index))} ${m[0]}`.trim();
      btn.title = `Roll ${btn.dataset.roll}`;
      btn.textContent = m[0];
      frag.append(btn);
      last = m.index + m[0].length;
    }
    if (last === 0) continue;
    frag.append(text.slice(last));
    node.replaceWith(frag);
  }
  return doc.body.innerHTML;
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
