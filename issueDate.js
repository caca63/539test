// issueDate.js
// 539 期數 → 民國日期
// 第 1 期 = 2025/01/01 （你貼的資料的第一筆日期基準）

function getIssueDate(issue) {
    // 基準日（你的第一筆資料）
    const base = new Date(2025, 0, 1); // 2025/01/01

    // 加上 (issue - 1) 天
    base.setDate(base.getDate() + (issue - 1));

    // 民國年
    const y = base.getFullYear() - 1911;
    const m = String(base.getMonth() + 1).padStart(2, "0");
    const d = String(base.getDate()).padStart(2, "0");

    return `${y}/${m}/${d}`;
}

// 讓其他 js 可以叫用
if (typeof window !== "undefined") {
    window.getIssueDate = getIssueDate;
}
