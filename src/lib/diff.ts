export type DiffLine = { type: "same" | "add" | "del"; text: string };

/**
 * Line-level diff (longest common subsequence). Returns null when the inputs
 * are too large to compare in the browser without freezing it.
 */
export function diffLines(before: string, after: string, maxCells = 4_000_000): DiffLine[] | null {
  const a = before.split("\n");
  const b = after.split("\n");

  // Trim the common prefix/suffix first — most edits touch a small region.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const n = midA.length;
  const m = midB.length;
  if (n * m > maxCells) return null;

  // lcs[i][j] = LCS length of midA[i:] and midB[j:], flattened.
  const w = m + 1;
  const lcs = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i * w + j] =
        midA[i] === midB[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
    }
  }

  const out: DiffLine[] = a.slice(0, start).map((text) => ({ type: "same" as const, text }));
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (midA[i] === midB[j]) {
      out.push({ type: "same", text: midA[i] });
      i++;
      j++;
    } else if (lcs[(i + 1) * w + j] >= lcs[i * w + j + 1]) {
      out.push({ type: "del", text: midA[i++] });
    } else {
      out.push({ type: "add", text: midB[j++] });
    }
  }
  while (i < n) out.push({ type: "del", text: midA[i++] });
  while (j < m) out.push({ type: "add", text: midB[j++] });
  for (const text of a.slice(endA)) out.push({ type: "same", text });
  return out;
}
