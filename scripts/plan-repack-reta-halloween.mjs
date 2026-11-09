/**
 * One-off planner (no DB writes). Uses compiled Jest path via dynamic import of TS through tsx.
 */
import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

// Load via babel-jest transform is hard; inline validate+reference fallback for 8x3.
const REFERENCE = [
  [[1, 2], [3, 4], [0, 7]],
  [[2, 6], [4, 7], [3, 5]],
  [[1, 6], [5, 7], [0, 3]],
  [[3, 7], [0, 4], [2, 5]],
  [[0, 6], [2, 4], [1, 5]],
  [[1, 3], [4, 6], [2, 7]],
  [[1, 7], [5, 6], [0, 2]],
  [[0, 1], [4, 5], [3, 6]],
  [[6, 7], [1, 4], [2, 3]],
  [[0, 5]],
];

function edgeKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function seededPermutation(n, seed) {
  const perm = Array.from({ length: n }, (_, i) => i);
  let s = seed >>> 0;
  const rng = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  return perm;
}

const TID = "143dbb0f-cc5d-497e-b1b9-c9489cce9454";
const raw = JSON.parse(
  fs.readFileSync("tmp/reta-halloween-matches-raw.json", "utf8")
);
const matches = raw.rows;
if (matches.length !== 28) {
  console.error("expected 28 matches, got", matches.length);
  process.exit(1);
}

const pairIds = [
  ...new Set(matches.flatMap((m) => [m.pair1_id, m.pair2_id])),
].sort();
if (pairIds.length !== 8) {
  console.error("expected 8 pairs, got", pairIds.length);
  process.exit(1);
}

const byEdge = new Map();
for (const m of matches) {
  const key = edgeKey(m.pair1_id, m.pair2_id);
  if (byEdge.has(key)) {
    console.error("duplicate edge", key);
    process.exit(1);
  }
  byEdge.set(key, m);
}

const seed = 1;
const ordered = [...pairIds].sort((a, b) => a.localeCompare(b));
const perm = seededPermutation(8, seed);
const indexed = perm.map((i) => ordered[i]);

const patches = [];
for (let r = 0; r < REFERENCE.length; r += 1) {
  const roundEdges = REFERENCE[r];
  const chunk = roundEdges.map(([a, b]) => ({
    pair1: indexed[a],
    pair2: indexed[b],
  }));
  // court assignment: rotate like assignCourtsInChunk without anchor specialty
  for (let k = 0; k < chunk.length; k += 1) {
    const p1 = chunk[k].pair1;
    const p2 = chunk[k].pair2;
    const existing = byEdge.get(edgeKey(p1, p2));
    if (!existing) {
      console.error("missing edge", p1, p2);
      process.exit(1);
    }
    patches.push({
      id: existing.id,
      round: r + 1,
      court: ((r + k) % chunk.length) + 1,
      pair1_id: existing.pair1_id,
      pair2_id: existing.pair2_id,
    });
  }
}

if (patches.length !== 28) {
  console.error("bad patch count", patches.length);
  process.exit(1);
}

const byRound = {};
for (const p of patches) byRound[p.round] = (byRound[p.round] || 0) + 1;
const pattern = Array.from({ length: 10 }, (_, i) => byRound[i + 1] || 0).join(
  "-"
);

// Validate no pair twice per round + consecutive rests for 8/3
const rests = {};
for (let r = 1; r <= 10; r += 1) rests[r] = [];
const plays = Object.fromEntries(pairIds.map((id) => [id, 0]));
for (let r = 1; r <= 10; r += 1) {
  const roundPatches = patches.filter((p) => p.round === r);
  const used = new Set();
  for (const p of roundPatches) {
    if (used.has(p.pair1_id) || used.has(p.pair2_id)) {
      console.error("pair repeated in round", r);
      process.exit(1);
    }
    used.add(p.pair1_id);
    used.add(p.pair2_id);
    plays[p.pair1_id] += 1;
    plays[p.pair2_id] += 1;
  }
  for (const id of pairIds) {
    if (!used.has(id)) rests[r].push(id);
  }
}
for (const id of pairIds) {
  if (plays[id] !== 7) {
    console.error("pair play count", id, plays[id]);
    process.exit(1);
  }
  let restCount = 0;
  for (let r = 1; r <= 10; r += 1) if (rests[r].includes(id)) restCount += 1;
  if (restCount !== 3) {
    console.error("rest count", id, restCount);
    process.exit(1);
  }
}
for (let r = 1; r <= 9; r += 1) {
  const a = new Set(rests[r]);
  for (const id of rests[r + 1]) {
    if (a.has(id)) {
      console.error("consecutive rest", id, r);
      process.exit(1);
    }
  }
}

fs.writeFileSync(
  "tmp/reta-halloween-repack-plan.json",
  JSON.stringify(
    {
      tournamentId: TID,
      pattern,
      seed,
      usedFallback: true,
      patches,
      preservedIds: patches.map((p) => p.id).sort(),
    },
    null,
    2
  )
);

fs.writeFileSync(
  "tmp/reta-halloween-matches-backup.json",
  JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      tournamentId: TID,
      matchCount: matches.length,
      matches,
    },
    null,
    2
  )
);

console.log(
  JSON.stringify({
    ok: true,
    patches: patches.length,
    pattern,
    uniqueIds: new Set(patches.map((p) => p.id)).size,
  })
);
