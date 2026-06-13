let data = null;
let activeRegion = null;

const els = {
  generatedAt: document.querySelector("#generated-at"),
  updateCadence: document.querySelector("#update-cadence"),
  nextUpdate: document.querySelector("#next-update"),
  regionalCards: document.querySelector("#regional-cards"),
  monthlyPredictions: document.querySelector("#monthly-predictions"),
  weeklyContext: document.querySelector("#weekly-context"),
  weeklyChart: document.querySelector("#weekly-chart"),
  weeklyBody: document.querySelector("#weekly-body"),
  weeklyNote: document.querySelector("#weekly-note"),
  regionTabs: document.querySelector("#region-tabs"),
  activeMarket: document.querySelector("#active-market"),
  chartTitle: document.querySelector("#chart-title"),
  chart: document.querySelector("#forecast-chart"),
  regionTitle: document.querySelector("#region-title"),
  regionHeadline: document.querySelector("#region-headline"),
  briefMae: document.querySelector("#brief-mae"),
  briefRmse: document.querySelector("#brief-rmse"),
  briefPearson: document.querySelector("#brief-pearson"),
  briefLatest: document.querySelector("#brief-latest"),
  regionNotes: document.querySelector("#region-notes"),
  tableContext: document.querySelector("#table-context"),
  leaderboardBody: document.querySelector("#leaderboard-body")
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);

  const headers = rows.shift().map((header) => header.trim());
  return rows.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, (values[index] ?? "").trim()]))
  );
}

function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value) {
  return value || "";
}

function fmt(value, digits = 3) {
  const parsed = num(value);
  return parsed === null ? "TBD" : parsed.toFixed(digits);
}

function signed(value) {
  const parsed = num(value);
  if (parsed === null) return "TBD";
  const sign = parsed > 0 ? "+" : "";
  return `${sign}${fmt(parsed, 2)}`;
}

function bySort(a, b) {
  return (num(a.sort_order) ?? 0) - (num(b.sort_order) ?? 0);
}

function latestAsOf(rows) {
  const requested = new URLSearchParams(window.location.search).get("as_of");
  if (requested && rows.some((row) => row.as_of === requested)) return requested;
  return [...new Set(rows.map((row) => row.as_of))].sort().at(-1);
}

function buildData(rows) {
  const asOf = latestAsOf(rows);
  const current = rows.filter((row) => row.as_of === asOf);
  const metaRows = current.filter((row) => row.record_type === "meta");
  const meta = Object.fromEntries(metaRows.map((row) => [row.key, row.value]));

  const regions = current
    .filter((row) => row.record_type === "region_summary")
    .sort(bySort)
    .map((row) => {
      const region = row.region;
      const leaderboard = current
        .filter((item) => item.record_type === "leaderboard" && item.region === region)
        .sort(bySort)
        .map((item) => ({
          rank: num(item.rank),
          method: item.method || item.label,
          family: item.method ? item.family : item.period,
          months: num(item.months),
          mae: num(item.mae),
          rmse: num(item.rmse),
          pearson: num(item.pearson)
        }));
      const series = current
        .filter((item) => item.record_type === "series" && item.region === region)
        .sort(bySort)
        .map((item) => ({
          period: item.period || item.week_label,
          forecast: num(item.forecast) ?? num(item.actual),
          actual: item.forecast ? num(item.actual) : num(item.error)
        }));
      const notes = current
        .filter((item) => item.record_type === "note" && item.region === region)
        .sort(bySort)
        .map((item) => item.note);

      return {
        id: region,
        label: row.label,
        market: row.market,
        target: row.target,
        window: row.window,
        method: row.method,
        rankNote: row.signal,
        headline: row.interpretation,
        latest: {
          period: row.period,
          forecast: num(row.forecast),
          actual: num(row.actual),
          error: num(row.error)
        },
        stats: {
          months: num(row.months),
          mae: num(row.mae),
          rmse: num(row.rmse),
          pearson: num(row.pearson)
        },
        leaderboard,
        series,
        notes
      };
    });

  return {
    generatedAt: meta.generatedAt,
    updateCadence: meta.updateCadence,
    nextUpdate: meta.nextUpdate,
    monthlyPredictions: current
      .filter((row) => row.record_type === "monthly_prediction")
      .sort(bySort)
      .map((row) => ({
        id: row.region,
        label: row.label,
        period: row.period,
        valueLabel: row.value_label || fmt(row.value, 2),
        priorPeriod: row.prior_period,
        signal: row.signal,
        interpretation: row.interpretation
      })),
    weeklyPredictions: {
      label: "US weekly ICS nowcast",
      period: "May 2026 weeks 2-4 and June 2026 week 1",
      status: "Late-May to early-June survey-style forecast slots",
      rows: current
        .filter((row) => row.record_type === "weekly_prediction")
        .sort(bySort)
        .map((row) => ({
          label: row.week_label,
          period: row.period,
          cutoffDay: num(row.cutoff_day),
          forecast: num(row.forecast),
          currentConditions: num(row.actual),
          expectations: num(row.error),
          signal: row.signal
        }))
    },
    regions
  };
}

function setMeta() {
  els.generatedAt.textContent = data.generatedAt;
  els.updateCadence.textContent = data.updateCadence;
  els.nextUpdate.textContent = data.nextUpdate;
}

function createRegionCards() {
  els.regionalCards.innerHTML = data.regions
    .map(
      (region) => `
        <button class="region-card" type="button" data-region="${region.id}">
          <h3>${region.label}<span>${region.market}</span></h3>
          <p>${region.headline}</p>
          <div class="card-metrics" aria-label="${region.label} metrics">
            <div><span>MAE</span><strong>${fmt(region.stats.mae)}</strong></div>
            <div><span>RMSE</span><strong>${fmt(region.stats.rmse)}</strong></div>
            <div><span>r</span><strong>${fmt(region.stats.pearson)}</strong></div>
          </div>
        </button>
      `
    )
    .join("");

  els.regionalCards.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => setActiveRegion(button.dataset.region));
  });
}

function createTabs() {
  els.regionTabs.innerHTML = data.regions
    .map(
      (region) => `
        <button type="button" role="tab" data-region="${region.id}" aria-selected="false">
          ${region.label}
        </button>
      `
    )
    .join("");

  els.regionTabs.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => setActiveRegion(button.dataset.region));
  });
}

function renderMonthlyPredictions() {
  els.monthlyPredictions.innerHTML = data.monthlyPredictions
    .map(
      (item) => `
        <article class="prediction-card">
          <h3>${item.label}<span>${item.period}</span></h3>
          <span class="prediction-value">${item.valueLabel}</span>
          <p class="prediction-meta">Compared with ${item.priorPeriod}: ${item.signal}</p>
          <p class="prediction-meta">${item.interpretation}</p>
        </article>
      `
    )
    .join("");
}

function renderWeeklyPredictions() {
  const weekly = data.weeklyPredictions;
  els.weeklyContext.textContent = `${weekly.label}, ${weekly.period}. ${weekly.status}.`;
  els.weeklyBody.innerHTML = weekly.rows
    .map(
      (row) => `
        <tr>
          <td>${row.label}</td>
          <td class="num">day ${row.cutoffDay}</td>
          <td class="num">${fmt(row.forecast, 2)}</td>
          <td class="num">${fmt(row.currentConditions, 2)}</td>
          <td class="num">${fmt(row.expectations, 2)}</td>
        </tr>
      `
    )
    .join("");
  els.weeklyNote.textContent =
    "Illustrative weekly path based on the May ICS level: the late-May readings firm gradually, and the first June slot shows a modest continuation of that rebound.";
  drawWeeklyChart();
}

function setActiveRegion(regionId) {
  const next = data.regions.find((region) => region.id === regionId);
  if (!next) return;
  activeRegion = next;
  render();
}

function renderCardsAndTabs() {
  document.querySelectorAll("[data-region]").forEach((node) => {
    const isActive = node.dataset.region === activeRegion.id;
    node.classList.toggle("active", isActive);
    if (node.getAttribute("role") === "tab") {
      node.setAttribute("aria-selected", String(isActive));
    }
  });
}

function renderBrief() {
  els.activeMarket.textContent = `${activeRegion.label} / ${activeRegion.market}`;
  els.chartTitle.textContent = `${activeRegion.label}: forecast vs actual`;
  els.regionTitle.textContent = `${activeRegion.label} (${activeRegion.market})`;
  els.regionHeadline.textContent = activeRegion.headline;
  els.briefMae.textContent = fmt(activeRegion.stats.mae);
  els.briefRmse.textContent = fmt(activeRegion.stats.rmse);
  els.briefPearson.textContent = fmt(activeRegion.stats.pearson);

  if (activeRegion.latest.actual === null) {
    els.briefLatest.textContent = `${activeRegion.latest.period}: forecast ${fmt(activeRegion.latest.forecast, 2)}, forecast-only update`;
  } else {
    const error = activeRegion.latest.error ?? activeRegion.latest.forecast - activeRegion.latest.actual;
    els.briefLatest.textContent = `${activeRegion.latest.period}: forecast ${fmt(
      activeRegion.latest.forecast,
      2
    )}, actual ${fmt(activeRegion.latest.actual, 2)}, error ${signed(error)}`;
  }

  els.regionNotes.innerHTML = activeRegion.notes.map((note) => `<li>${note}</li>`).join("");
}

function renderTable() {
  els.tableContext.textContent = `${activeRegion.target}; benchmark window ${activeRegion.window}. ${activeRegion.rankNote}.`;
  els.leaderboardBody.innerHTML = activeRegion.leaderboard
    .map((row, index) => {
      const isConsumerSim = row.method.toLowerCase().includes("consumersim");
      return `
        <tr class="${isConsumerSim ? "highlight-row" : ""} ${index >= 5 ? "extra-method" : ""}">
          <td class="num">${row.rank}</td>
          <td>${row.method}</td>
          <td><span class="family-pill">${row.family}</span></td>
          <td class="num">${row.months}</td>
          <td class="num">${fmt(row.mae)}</td>
          <td class="num">${fmt(row.rmse)}</td>
          <td class="num">${fmt(row.pearson)}</td>
        </tr>
      `;
    })
    .join("");
}

function chartValues(series) {
  return series.flatMap((point) => [point.forecast, point.actual]).filter((value) => Number.isFinite(value));
}

function drawChart() {
  const canvas = els.chart;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(320, Math.floor(rect.width));
  const height = Math.max(320, Math.floor(rect.height || 340));
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const padding = { top: 28, right: 24, bottom: 54, left: 54 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const values = chartValues(activeRegion.series);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const yMin = min - spread * 0.14;
  const yMax = max + spread * 0.14;

  const xFor = (index) =>
    padding.left + (activeRegion.series.length === 1 ? 0 : (index / (activeRegion.series.length - 1)) * plotW);
  const yFor = (value) => padding.top + ((yMax - value) / (yMax - yMin)) * plotH;

  ctx.font = "12px Consolas, monospace";
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#dedbd2";
  ctx.fillStyle = "#5f5f5f";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  for (let i = 0; i < 5; i += 1) {
    const t = i / 4;
    const value = yMax - t * (yMax - yMin);
    const y = padding.top + t * plotH;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    ctx.fillText(value.toFixed(1), padding.left - 9, y);
  }

  ctx.strokeStyle = "#101010";
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + plotH);
  ctx.lineTo(padding.left + plotW, padding.top + plotH);
  ctx.stroke();

  const forecastPoints = activeRegion.series
    .filter((point) => Number.isFinite(point.forecast))
    .map((point) => [xFor(activeRegion.series.indexOf(point)), yFor(point.forecast)]);
  const actualPoints = activeRegion.series
    .filter((point) => Number.isFinite(point.actual))
    .map((point) => [xFor(activeRegion.series.indexOf(point)), yFor(point.actual)]);

  drawLine(ctx, actualPoints, "#101010", 2.5);
  drawLine(ctx, forecastPoints, "#d64f2a", 2.5);
  drawPoints(ctx, actualPoints, "#101010");
  drawPoints(ctx, forecastPoints, "#d64f2a");

  ctx.fillStyle = "#5f5f5f";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  activeRegion.series.forEach((point, i) => {
    if (i % 2 === 0 || i === activeRegion.series.length - 1) {
      ctx.fillText(point.period.slice(2), xFor(i), padding.top + plotH + 16);
    }
  });
}

function drawWeeklyChart() {
  const canvas = els.weeklyChart;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(280, Math.floor(rect.width));
  const height = Math.max(240, Math.floor(rect.height || 260));
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const rows = data.weeklyPredictions.rows.filter((row) => Number.isFinite(row.forecast));
  const values = rows.map((row) => row.forecast);
  const min = Math.min(...values) - 1;
  const max = Math.max(...values) + 1;
  const pad = { top: 22, right: 18, bottom: 42, left: 48 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const xFor = (index) => pad.left + (index / (rows.length - 1)) * plotW;
  const yFor = (value) => pad.top + ((max - value) / (max - min)) * plotH;

  ctx.font = "12px Consolas, monospace";
  ctx.strokeStyle = "#dedbd2";
  ctx.fillStyle = "#5f5f5f";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i < 4; i += 1) {
    const t = i / 3;
    const y = pad.top + t * plotH;
    const value = max - t * (max - min);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.fillText(value.toFixed(1), pad.left - 8, y);
  }

  const forecastPoints = rows.map((row, index) => [xFor(index), yFor(row.forecast)]);
  drawLine(ctx, forecastPoints, "#d64f2a", 2.8);
  drawPoints(ctx, forecastPoints, "#d64f2a");

  ctx.fillStyle = "#5f5f5f";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  rows.forEach((row, index) => {
    ctx.fillText(row.label, xFor(index), pad.top + plotH + 14);
  });
}

function drawLine(ctx, points, color, width) {
  if (!points.length) return;
  ctx.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
}

function drawPoints(ctx, points, color) {
  ctx.fillStyle = color;
  points.forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });
}

function render() {
  renderCardsAndTabs();
  renderBrief();
  renderTable();
  drawChart();
}

async function init() {
  const response = await fetch("./data/consumersim_site_data.csv");
  const csv = await response.text();
  data = buildData(parseCsv(csv));
  activeRegion = data.regions[0];
  setMeta();
  createRegionCards();
  createTabs();
  renderMonthlyPredictions();
  renderWeeklyPredictions();
  render();
}

window.addEventListener("resize", () => {
  if (!data) return;
  window.requestAnimationFrame(() => {
    drawChart();
    drawWeeklyChart();
  });
});

init();
