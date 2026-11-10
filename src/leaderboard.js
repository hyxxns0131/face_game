// 순위표 (지금은 이 컴퓨터의 localStorage에 저장)
// 나중에 친구들이 각자 기기로 하려면 이 파일만 Firebase/Supabase 버전으로 바꾸면 됩니다.

const KEY = "pokerface.records.v1";
let memory = null; // localStorage를 못 쓰는 환경 대비

function load() {
  if (memory) return memory;
  try {
    memory = JSON.parse(localStorage.getItem(KEY)) || [];
  } catch {
    memory = [];
  }
  return memory;
}

function save(list) {
  memory = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* 저장 실패해도 이번 실행 동안은 메모리에 유지 */
  }
}

/** 모드별로 사람마다 최고 기록 1개씩, 긴 순서대로 */
export function bestPerPlayer(mode) {
  const best = new Map();
  for (const r of load()) {
    if (r.mode !== mode) continue;
    const b = best.get(r.name);
    if (!b || r.time > b.time) best.set(r.name, r);
  }
  return [...best.values()].sort((a, b) => b.time - a.time || a.at - b.at);
}

/** 기록 저장 후 순위 정보를 돌려줍니다. */
export function addRecord(rec) {
  const prev = bestPerPlayer(rec.mode).find((r) => r.name === rec.name);
  save([...load(), rec].slice(-500));
  const ranking = bestPerPlayer(rec.mode);
  return {
    rank: ranking.findIndex((r) => r.name === rec.name) + 1,
    total: ranking.length,
    isBest: !prev || rec.time > prev.time,
    best: Math.max(prev?.time ?? 0, rec.time),
  };
}

export function clearRecords() {
  save([]);
}
