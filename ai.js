// ai.js — 台灣 539 AI 旗艦版 v3
// --------------------------------------------------------------
// 功能：
// 1. r 衰減模型
// 2. Markov-1 transition
// 3. Markov 共現矩陣
// 4. TensorFlow 大型 Dense 模型（C）
// 5. AI 融合：FinalProb = 0.3*Decay + 0.3*Markov + 0.4*NN
// 6. 回測需要用的 local Top5 計算
// --------------------------------------------------------------

// --------------------------------------------------------------
// 1. r 衰減（Decay 模型）
// --------------------------------------------------------------
function decayProb(history, r) {
  const w = Array(39).fill(0);
  const n = history.length;
  for (let i = 0; i < n; i++) {
    const weight = Math.pow(r, n - 1 - i);
    for (const num of history[i]) {
      w[num - 1] += weight;
    }
  }
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map(v => v / sum);
}


// --------------------------------------------------------------
// 2. Markov 模型（單階）
// --------------------------------------------------------------
function markovProb(history) {
  const appearAfterAppear = Array(39).fill(0);
  const appearAfterMiss = Array(39).fill(0);
  const countAppear = Array(39).fill(0);
  const countMiss = Array(39).fill(0);

  for (let i = 0; i < history.length - 1; i++) {
    const cur = history[i];
    const nxt = history[i + 1];

    const curSet = new Set(cur);
    const nxtSet = new Set(nxt);

    for (let n = 1; n <= 39; n++) {
      if (curSet.has(n)) {
        countAppear[n - 1]++;
        if (nxtSet.has(n)) appearAfterAppear[n - 1]++;
      } else {
        countMiss[n - 1]++;
        if (nxtSet.has(n)) appearAfterMiss[n - 1]++;
      }
    }
  }

  const prob = [];
  for (let n = 1; n <= 39; n++) {
    const a = appearAfterAppear[n - 1] / (countAppear[n - 1] || 1);
    const b = appearAfterMiss[n - 1] / (countMiss[n - 1] || 1);

    // 加權：上一期出現 → a，沒出現 → b 的平均
    prob.push((a + b) / 2);
  }

  const s = prob.reduce((x, y) => x + y, 0);
  return prob.map(v => v / s);
}


// --------------------------------------------------------------
// 3. Markov 共現矩陣（39x39）→ 加強版 Markov
// --------------------------------------------------------------
function markovCoOccurProb(history) {
  const C = Array.from({ length: 39 }, () => Array(39).fill(0));

  for (const draw of history) {
    for (let i = 0; i < 5; i++) {
      for (let j = i + 1; j < 5; j++) {
        const a = draw[i];
        const b = draw[j];
        C[a - 1][b - 1]++;
        C[b - 1][a - 1]++;
      }
    }
  }

  // 把每行 normalize
  const prob = [];
  for (let i = 0; i < 39; i++) {
    const row = C[i];
    const sum = row.reduce((x, y) => x + y, 0) || 1;
    prob.push(row.reduce((x, y) => x + y) / (sum * 39));
  }

  const s = prob.reduce((x, y) => x + y, 0);
  return prob.map(v => v / s);
}


// --------------------------------------------------------------
// 4. TensorFlow 大型 Dense 模型（C）
// --------------------------------------------------------------
let tfModel = null;

// 建立模型
function createTFModel() {
  const model = tf.sequential();
  model.add(tf.layers.dense({ units: 512, activation: "relu", inputShape: [39 * 20] }));
  model.add(tf.layers.dense({ units: 256, activation: "relu" }));
  model.add(tf.layers.dense({ units: 128, activation: "relu" }));
  model.add(tf.layers.dense({ units: 64, activation: "relu" }));
  model.add(tf.layers.dense({ units: 39, activation: "softmax" }));

  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: "categoricalCrossentropy"
  });

  return model;
}

// 初始化模型
async function initTFModel() {
  if (tfModel) return;

  try {
    // ⭐ 載入你網站上的模型（正確路徑）
    tfModel = await tf.loadLayersModel('./ai/model.json');
    console.log("AI model loaded from /ai/model.json");
  } 
  catch (err) {
    console.error("Failed to load model, fallback to empty model:", err);

    // 若 model.json 找不到 → 建立空模型（保底）
    tfModel = createTFModel();
  }
}

// 神經網路預測
function nnProb(history) {
  const N = 20;
  const arr = [];

  const recent = history.slice(-N);
  recent.forEach(draw => {
    const row = Array(39).fill(0);
    draw.forEach(n => { row[n - 1] = 1; });
    arr.push(...row);
  });

  while (arr.length < 39 * N) arr.unshift(0);

  const input = tf.tensor2d([arr]);
  const out = tfModel.predict(input).dataSync();

  const s = out.reduce((a, b) => a + b, 0);
  return out.map(v => v / s);
}


// --------------------------------------------------------------
// 5. AI 融合模型
// FinalProb = 0.3*Decay + 0.3*Markov + 0.4*NN
// --------------------------------------------------------------
async function AI_finalProb(history) {

  await initTFModel();

  const r = parseFloat(document.getElementById("r").value);
  const useAI = document.getElementById("useAI").checked;

  const decay = decayProb(history, r);
  if (!useAI) return decay;

  const mk1 = markovProb(history);
  const mk2 = markovCoOccurProb(history);
  const nn = nnProb(history);

  // Markov 合併
  const mk = mk1.map((v, i) => (v + mk2[i]) / 2);

  // 最終融合
  const final = [];
  for (let i = 0; i < 39; i++) {
    const v =
      0.3 * decay[i] +
      0.3 * mk[i] +
      0.4 * nn[i];

    final.push(v);
  }

  const s = final.reduce((x, y) => x + y, 0);
  return final.map(v => v / s);
}

window.AI_finalProb = AI_finalProb;


// --------------------------------------------------------------
// 6. 回測專用：local Top5 計算（不使用 Worker）
// --------------------------------------------------------------
function localComboProb(probs, t) {
  return t.reduce((s, x) => s * probs[x - 1], 1);
}

function AI_localComputeTop5(probs, last, avoid, streak) {
  const lastSet = new Set(last);
  const result = [];

  // 只取組合裡面較高機率的（top 20000）避免卡頓
  const sortedNums = probs
    .map((p, i) => [i + 1, p])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)  // 20 個號碼中選 5 = 15504 組
    .map(x => x[0]);

  const combos = [];
  for (let a = 0; a < 16; a++)
    for (let b = a + 1; b < 17; b++)
      for (let c = b + 1; c < 18; c++)
        for (let d = c + 1; d < 19; d++)
          for (let e = d + 1; e < 20; e++)
            combos.push([
              sortedNums[a],
              sortedNums[b],
              sortedNums[c],
              sortedNums[d],
              sortedNums[e]
            ]);

  for (const t of combos) {
    let sc = localComboProb(probs, t);

    // 熱號懲罰
    if (streak) {
      const hotCount = t.filter(n => lastSet.has(n)).length;
      if (hotCount === 1) sc *= 0.95;
      else if (hotCount === 2) sc *= 0.90;
      else if (hotCount === 3) sc *= 0.80;
      else if (hotCount === 4) sc *= 0.65;
      else if (hotCount === 5) sc *= 0.55;
    }

    // 避免重複
    if (avoid) {
      const dup = t.filter(n => last.includes(n)).length;
      if (dup === 1) sc *= 0.90;
      else if (dup === 2) sc *= 0.70;
      else if (dup === 3
) sc *= 0.45;
      else if (dup === 4) sc *= 0.25;
      else if (dup === 5) sc *= 0.10;
    }

    result.push({ t, score: sc });
  }

  result.sort((a, b) => b.score - a.score);
  return result.slice(0, 5);
}

window.AI_localComputeTop5 = AI_localComputeTop5;
