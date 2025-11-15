// ai.js — 台灣 539 AI 旗艦版 v3（完整版修正）
// --------------------------------------------------------------
// 功能：
// 1. r 衰減模型
// 2. Markov-1 transition
// 3. Markov 共現矩陣
// 4. TensorFlow Dense 模型（C）
// 5. AI 融合權重 FinalProb
// 6. Local Top5（回測用）
// --------------------------------------------------------------


// --------------------------------------------------------------
// 1. r 衰減（Decay）
// --------------------------------------------------------------
function decayProb(history, r) {
  const w = Array(39).fill(0);
  const n = history.length;

  for (let i = 0; i < n; i++) {
    const weight = Math.pow(r, n - 1 - i);
    for (const num of history[i]) w[num - 1] += weight;
  }

  const s = w.reduce((a, b) => a + b, 0) || 1;
  return w.map(v => v / s);
}


// --------------------------------------------------------------
// 2. Markov（單階）
// --------------------------------------------------------------
function markovProb(history) {
  const appearAfterAppear = Array(39).fill(0);
  const appearAfterMiss = Array(39).fill(0);
  const countAppear = Array(39).fill(0);
  const countMiss = Array(39).fill(0);

  for (let i = 0; i < history.length - 1; i++) {
    const curSet = new Set(history[i]);
    const nxtSet = new Set(history[i + 1]);

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
    prob.push((a + b) / 2);
  }

  const s = prob.reduce((x, y) => x + y, 0) || 1;
  return prob.map(v => v / s);
}


// --------------------------------------------------------------
// 3. Markov 共現矩陣（加強版 Markov）
// --------------------------------------------------------------
function markovCoOccurProb(history) {
  const C = Array.from({ length: 39 }, () => Array(39).fill(0));

  for (const draw of history) {
    for (let i = 0; i < 5; i++) {
      for (let j = i + 1; j < 5; j++) {
        const a = draw[i] - 1;
        const b = draw[j] - 1;
        C[a][b]++;
        C[b][a]++;
      }
    }
  }

  const prob = Array(39).fill(0);

  for (let i = 0; i < 39; i++) {
    const row = C[i];
    const sum = row.reduce((a, b) => a + b, 0) || 1;
    prob[i] = sum / (sum * 39);
  }

  const s = prob.reduce((a, b) => a + b, 0) || 1;
  return prob.map(v => v / s);
}


// --------------------------------------------------------------
// 4. TensorFlow Dense 模型（C）
// --------------------------------------------------------------
let tfModel = null;

// 建立架構
function createTFModel() {
  const m = tf.sequential();
  m.add(tf.layers.dense({ units: 512, activation: "relu", inputShape: [780] }));
  m.add(tf.layers.dense({ units: 256, activation: "relu" }));
  m.add(tf.layers.dense({ units: 128, activation: "relu" }));
  m.add(tf.layers.dense({ units: 64, activation: "relu" }));
  m.add(tf.layers.dense({ units: 39, activation: "softmax" }));

  m.compile({
    optimizer: tf.train.adam(0.001),
    loss: "categoricalCrossentropy"
  });

  return m;
}

// 載入模型（你使用 model.json + bin）
async function initTFModel() {
  try {
    tfModel = await tf.loadLayersModel("./ai/model.json");
    console.log("✅ TF 模型成功載入");
  } catch (err) {
    console.error("❌ TF 模型載入失敗，改用空模型：", err);
    tfModel = createTFModel();
  }
}

// NN 預測
function nnProb(history) {
  const N = 20;
  const arr = [];
  const recent = history.slice(-N);

  recent.forEach(draw => {
    const row = Array(39).fill(0);
    draw.forEach(n => row[n - 1] = 1);
    arr.push(...row);
  });

  while (arr.length < 39 * N) arr.unshift(0);

  const input = tf.tensor2d([arr]);
  const out = tfModel.predict(input).dataSync();

  const s = out.reduce((a, b) => a + b, 0) || 1;
  return Array.from(out).map(v => v / s);
}


// --------------------------------------------------------------
// 5. Final AI = 0.3*Decay + 0.3*Markov + 0.4*NN
// --------------------------------------------------------------
async function AI_finalProb(history) {
  // 🟢 等模型載入完（非常重要）
  if (!tfModel) {
    console.log("⏳ 等待 TF 模型初始化...");
    await initTFModel();
  }

  const r = parseFloat(document.getElementById("r").value);
  const useAI = document.getElementById("useAI").checked;

  const decay = decayProb(history, r);
  if (!useAI) return decay;

  const mk1 = markovProb(history);
  const mk2 = markovCoOccurProb(history);
  const mk = mk1.map((v, i) => (v + mk2[i]) / 2);

  // 🟢 NN 預測
  const nn = nnProb(history);

  const final = [];
  for (let i = 0; i < 39; i++) {
    const v = 0.3 * decay[i] + 0.3 * mk[i] + 0.4 * nn[i];
    final.push(v);
  }

  const s = final.reduce((x, y) => x + y, 0) || 1;
  return final.map(v => v / s);
}

window.AI_finalProb = AI_finalProb;


// --------------------------------------------------------------
// 6. Local Top5（回測用）
// --------------------------------------------------------------
function localComboProb(prob, t) {
  return t.reduce((s, x) => s * prob[x - 1], 1);
}

function AI_localComputeTop5(probs, last, avoid, streak) {

  // 🛑 **probs 一定要是 array，不然 run() 會爆掉**
  if (!Array.isArray(probs) || probs.length !== 39) {
    console.error("❌ AI_localComputeTop5：probs 格式錯誤：", probs);
    return [];
  }

  const lastSet = new Set(last);
  const sorted = probs
    .map((p, i) => [i + 1, p])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(x => x[0]);

  const combos = [];
  for (let a = 0; a < 16; a++)
    for (let b = a + 1; b < 17; b++)
      for (let c = b + 1; c < 18; c++)
        for (let d = c + 1; d < 19; d++)
          for (let e = d + 1; e < 20; e++)
            combos.push([
              sorted[a], sorted[b], sorted[c], sorted[d], sorted[e]
            ]);

  const result = [];

  for (const t of combos) {
    let sc = localComboProb(probs, t);

    if (streak) {
      const hot = t.filter(n => lastSet.has(n)).length;
      sc *= [1, 0.95, 0.9, 0.8, 0.65, 0.55][hot];
    }

    if (avoid) {
      const dup = t.filter(n => last.includes(n)).length;
      sc *= [1, 0.9, 0.7, 0.45, 0.25, 0.1][dup];
    }

    result.push({ t, score: sc });
  }

  result.sort((a, b) => b.score - a.score);
  return result.slice(0, 5);
}

window.AI_localComputeTop5 = AI_localComputeTop5;
