// worker.js — 台灣 539 AI 旗艦版 v3
// --------------------------------------------------------------
// 1. 生成所有 C(39,5) 組合（575,757 組）
// 2. 接收主程式之單號機率 probs、last、avoid、streak
// 3. 計算 Top10 並回傳
// --------------------------------------------------------------

let allCombos = [];
let ready = false;

// --------------------- 生成所有組合 -------------------------
function generateAllCombos() {
  const r = [];
  for (let a = 1; a <= 35; a++) {
    for (let b = a + 1; b <= 36; b++) {
      for (let c = b + 1; c <= 37; c++) {
        for (let d = c + 1; d <= 38; d++) {
          for (let e = d + 1; e <= 39; e++) {
            r.push([a, b, c, d, e]);
          }
        }
      }
    }
  }
  return r;
}

// WebWorker 啟動後立刻生成組合（只做一次）
allCombos = generateAllCombos();
ready = true;
postMessage({ type: "ready" });

// --------------------- 計算單組機率 -------------------------
function comboProb(probs, t) {
  let s = 1;
  for (let x of t) s *= probs[x - 1];
  return s;
}

// --------------------- Top10 計算核心 ----------------------
function computeTop10(probs, last, avoid, streak) {
  const scored = [];
  const lastSet = new Set(last);

  for (const t of allCombos) {
    let sc = comboProb(probs, t);

    // 🔥 熱號懲罰（上期 + 前期）
    if (streak) {
      const hotCount = t.filter(x => lastSet.has(x)).length;

      if (hotCount === 1) sc *= 0.95;
      else if (hotCount === 2) sc *= 0.90;
      else if (hotCount === 3) sc *= 0.80;
      else if (hotCount === 4) sc *= 0.65;
      else if (hotCount === 5) sc *= 0.55;
    }

    // 🔥 避免重複上一期（你指定的 539 版）
    if (avoid) {
      const dup = t.filter(x => last.includes(x)).length;

      if      (dup === 1) sc *= 0.90;
      else if (dup === 2) sc *= 0.70;
      else if (dup === 3) sc *= 0.45;
      else if (dup === 4) sc *= 0.25;
      else if (dup === 5) sc *= 0.10;
    }

    scored.push({ t, score: sc });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 10);
}

// --------------------- 接收主程式訊息 ----------------------
onmessage = function(e) {
  const msg = e.data;

  if (msg.type === "computeTop10") {
    const { probs, last, avoid, streak } = msg;
    const top10 = computeTop10(probs, last, avoid, streak);
    postMessage({ type: "top10", data: top10 });
  }
};
