// charts.js
// ============================================
// 539 visualization module
// 出現次數柱狀圖 + 連莊折線圖
// ============================================

// ==========================
// 1. 計算出現次數
// ==========================
function countNumbers(hist) {
    const cnt = Array(39).fill(0);
    for (const draw of hist) {
        for (const n of draw) cnt[n - 1]++;
    }
    return cnt;
}

// ==========================
// 2. 計算每期的「連莊數量」
// --------------------------
// 規則：與前一期重複的號碼數量（0~5）
// ==========================
function streakSeries(hist) {
    const out = [];
    for (let i = 0; i < hist.length; i++) {
        if (i === 0) {
            out.push(0);
            continue;
        }
        const prev = hist[i - 1];
        const curr = hist[i];
        let c = 0;
        for (const n of curr) if (prev.includes(n)) c++;
        out.push(c);
    }
    return out;
}

// ==========================
// 3. 畫出現次數柱狀圖
// ==========================
function drawCountChart(hist) {
    const cnt = countNumbers(hist);
    const ctx = document.getElementById("countChart");

    if (!ctx) return;

    new Chart(ctx, {
        type: "bar",
        data: {
            labels: Array.from({ length: 39 }, (_, i) => i + 1),
            datasets: [
                {
                    label: "出現次數",
                    data: cnt,
                    borderWidth: 1,
                    backgroundColor: "#60a5fa55",
                    borderColor: "#93c5fd"
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                x: {
                    ticks: { color: "#e5e7eb" },
                },
                y: {
                    ticks: { color: "#e5e7eb" },
                }
            }
        }
    });
}

// ==========================
// 4. 畫連莊折線圖
// ==========================
function drawStreakChart(hist) {
    const streak = streakSeries(hist);
    const ctx = document.getElementById("streakChart");
    if (!ctx) return;

    new Chart(ctx, {
        type: "line",
        data: {
            labels: streak.map((_, i) => i + 1),
            datasets: [
                {
                    label: "連莊（與前一期重複數）",
                    data: streak,
                    borderColor: "#38bdf8",
                    backgroundColor: "#38bdf850",
                    pointRadius: 2,
                    tension: 0.2,
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                x: { ticks: { color: "#e5e7eb" } },
                y: {
                    ticks: { color: "#e5e7eb" },
                    suggestedMin: 0,
                    suggestedMax: 5
                }
            }
        }
    });
}

// ==========================
// 5. 單一 API：由 index.html 呼叫
// ==========================
function renderCharts(history) {
    drawCountChart(history);
    drawStreakChart(history);
}

if (typeof window !== "undefined") {
    window.renderCharts = renderCharts;
}
