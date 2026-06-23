let data = null;
let activeRegion = null;
let activeForecastCadence = "weekly";
let activeForecastRegion = "us";
let explorerChartState = { points: [], emptyMessage: "" };
let chartHitTargets = [];
let chartHover = null;

const els = {
  generatedAt: document.querySelector("#generated-at"),
  nextUpdate: document.querySelector("#next-update"),
  pageTitle: document.querySelector("#page-title"),
  typingStatus: document.querySelector("#typing-status"),
  mapValues: {
    us: document.querySelector("#map-us-value"),
    eu: document.querySelector("#map-eu-value"),
    jp: document.querySelector("#map-jp-value")
  },
  weeklyTitle: document.querySelector("#weekly-title"),
  weeklyContext: document.querySelector("#weekly-context"),
  weeklyChart: document.querySelector("#weekly-chart"),
  forecastNewsPeriod: document.querySelector("#forecast-news-period"),
  forecastNewsList: document.querySelector("#forecast-news-list"),
  weeklyNote: document.querySelector("#weekly-note"),
  cadenceTabs: document.querySelector("#cadence-tabs"),
  forecastRegionTabs: document.querySelector("#forecast-region-tabs"),
  regionTabs: document.querySelector("#region-tabs"),
  activeMarket: document.querySelector("#active-market"),
  chartTitle: document.querySelector("#chart-title"),
  chart: document.querySelector("#forecast-chart"),
  chartTooltip: document.querySelector("#chart-tooltip"),
  regionTitle: document.querySelector("#region-title"),
  regionHeadline: document.querySelector("#region-headline"),
  briefMae: document.querySelector("#brief-mae"),
  briefRmse: document.querySelector("#brief-rmse"),
  briefPearson: document.querySelector("#brief-pearson"),
  regionOutlineMap: document.querySelector("#region-outline-map"),
  tableContext: document.querySelector("#table-context"),
  historicalBody: document.querySelector("#historical-body")
};

const regionOutlineViews = {
  us: "./assets/region-us.svg",
  eu: "./assets/region-eu.svg",
  jp: "./assets/region-jp.svg"
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
        series
      };
    });

  return {
    generatedAt: meta.generatedAt,
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
    weeklyPredictions: current
      .filter((row) => row.record_type === "weekly_prediction")
      .sort(bySort)
      .map((row) => ({
        id: row.region,
        label: row.week_label,
        period: row.period,
        cutoffDay: num(row.cutoff_day),
        forecast: num(row.forecast),
        currentConditions: num(row.actual),
        expectations: num(row.error),
        signal: row.signal,
        interpretation: row.interpretation
      })),
    forecastNews: current
      .filter((row) => row.record_type === "forecast_news")
      .sort(bySort)
      .map((row) => ({
        id: row.region,
        cadence: row.key,
        period: row.period || row.week_label,
        headline: row.label,
        source: row.market,
        tag: row.signal,
        summary: row.interpretation,
        url: row.note
      })),
    regions
  };
}

function setMeta() {
  els.generatedAt.textContent = data.generatedAt;
  els.nextUpdate.textContent = data.nextUpdate;
}

function typeHeroTitle() {
  const node = els.pageTitle;
  if (!node) return;
  const fullText = node.dataset.title || node.textContent;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) {
    node.textContent = fullText;
    return;
  }

  node.textContent = "";
  node.classList.add("typing");
  let index = 0;
  const tick = () => {
    node.textContent = fullText.slice(0, index);
    index += 1;
    if (index <= fullText.length) {
      window.setTimeout(tick, index < 12 ? 38 : 26);
    } else {
      node.classList.remove("typing");
    }
  };
  tick();
}

function typeLoop(node, phrases) {
  if (!node || !phrases.length) return;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) {
    node.textContent = phrases[0];
    return;
  }

  let phraseIndex = 0;
  let charIndex = 0;
  let deleting = false;

  const tick = () => {
    const phrase = phrases[phraseIndex];
    node.textContent = phrase.slice(0, charIndex);

    if (!deleting && charIndex < phrase.length) {
      charIndex += 1;
      window.setTimeout(tick, 34);
      return;
    }

    if (!deleting && charIndex === phrase.length) {
      deleting = true;
      window.setTimeout(tick, 1500);
      return;
    }

    if (deleting && charIndex > 0) {
      charIndex -= 1;
      window.setTimeout(tick, 18);
      return;
    }

    deleting = false;
    phraseIndex = (phraseIndex + 1) % phrases.length;
    window.setTimeout(tick, 280);
  };

  tick();
}

function startTypingStatus() {
  typeLoop(els.typingStatus, [
    "reading the latest 2026-06 CSV snapshot",
    "plotting US, EU27, and Japan sentiment paths",
    "updating weekly nowcast signals"
  ]);
}

function renderMapValues() {
  data.monthlyPredictions.forEach((item) => {
    const node = els.mapValues[item.id];
    if (node) node.textContent = fmt(item.valueLabel, 2);
  });
}

function setupReveal() {
  const targets = document.querySelectorAll(
    ".prediction-section, .section-head, .dashboard-grid, .table-section, .updates, .map-card"
  );
  targets.forEach((target) => target.classList.add("reveal"));

  if (!("IntersectionObserver" in window)) {
    targets.forEach((target) => target.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  targets.forEach((target) => observer.observe(target));
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
    button.addEventListener("click", () => {
      pulseButton(button);
      setActiveRegion(button.dataset.region);
    });
  });
}

function createForecastControls() {
  els.cadenceTabs.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      pulseButton(button);
      activeForecastCadence = button.dataset.cadence;
      renderForecastExplorer();
    });
  });

  els.forecastRegionTabs.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      pulseButton(button);
      activeForecastRegion = button.dataset.forecastRegion;
      renderForecastExplorer();
    });
  });
}

function pulseButton(button) {
  button.classList.remove("pressed");
  void button.offsetWidth;
  button.classList.add("pressed");
  window.setTimeout(() => button.classList.remove("pressed"), 430);
}

function updateForecastControls() {
  els.cadenceTabs.querySelectorAll("button").forEach((button) => {
    button.setAttribute("aria-selected", String(button.dataset.cadence === activeForecastCadence));
  });

  els.forecastRegionTabs.querySelectorAll("button").forEach((button) => {
    button.setAttribute("aria-selected", String(button.dataset.forecastRegion === activeForecastRegion));
  });
}

function regionForExplorer() {
  return data.regions.find((region) => region.id === activeForecastRegion) || data.regions[0];
}

function monthlyForExplorer() {
  return data.monthlyPredictions.find((item) => item.id === activeForecastRegion);
}

function newsForExplorer(region, cadence) {
  return data.forecastNews.filter((item) => item.id === region.id && item.cadence === cadence);
}

function renderForecastNews(region, cadence, fallbackPeriod) {
  const items = newsForExplorer(region, cadence);
  const period = items[0]?.period || fallbackPeriod || "--";
  els.forecastNewsPeriod.textContent = period;

  if (!items.length) {
    els.forecastNewsList.innerHTML = `
      <article class="news-item empty-news">
        <span>No CSV news rows</span>
        <h3>Drivers have not been added for this view.</h3>
        <p>Add news driver rows to the site data file to update this panel.</p>
      </article>
    `;
    return;
  }

  els.forecastNewsList.innerHTML = items
    .map(
      (item) => `
        <article class="news-item">
          <div class="news-item-top">
            <span>${item.tag || "Driver"}</span>
            ${
              item.url
                ? `<a href="${item.url}" target="_blank" rel="noreferrer">${item.source || "Source"}</a>`
                : `<small>${item.source || "Source"}</small>`
            }
          </div>
          <h3>${item.headline}</h3>
          <p>${shortNewsSummary(item.summary)}</p>
        </article>
      `
    )
    .join("");
}

function shortNewsSummary(summary) {
  const textValue = text(summary);
  if (textValue.length <= 118) return textValue;
  const clipped = textValue.slice(0, 116);
  return `${clipped.slice(0, clipped.lastIndexOf(" "))}...`;
}

function renderUnavailableExplorer(region) {
  const cadenceLabel = activeForecastCadence === "monthly" ? "Monthly" : "Weekly";
  els.weeklyTitle.textContent = `${region.label} ${activeForecastCadence} forecast`;
  els.weeklyContext.textContent = `${cadenceLabel} view is not configured yet for ${region.label}.`;
  els.forecastNewsPeriod.textContent = "--";
  els.forecastNewsList.innerHTML = `
    <article class="news-item empty-news">
      <span>${cadenceLabel}</span>
      <h3>News panel is not configured for this view.</h3>
      <p>EU27 and Japan monthly views can be added later through the site data file.</p>
    </article>
  `;
  els.weeklyNote.textContent =
    activeForecastCadence === "monthly"
      ? `${region.label} monthly rows will appear here once the regional monthly CSV records are added.`
      : "Weekly rows will appear here once the regional weekly CSV records are added.";
  explorerChartState = {
    points: [],
    emptyMessage: `${cadenceLabel} view not configured`
  };
  drawExplorerChart();
}

function renderWeeklyExplorer(region) {
  const rows = data.weeklyPredictions.filter((row) => row.id === activeForecastRegion);
  if (!rows.length) {
    renderUnavailableExplorer(region);
    return;
  }

  els.weeklyTitle.textContent = `${region.label} weekly consumer sentiment path`;
  els.weeklyContext.textContent = `${region.label}, May 2026 weeks 2-4 and June 2026 week 1. CSV-driven weekly nowcast slots.`;
  renderForecastNews(region, "weekly", rows.at(-1)?.label);
  els.weeklyNote.textContent =
    activeForecastRegion === "us"
      ? "Illustrative weekly path based on the May ICS level: the late-May readings firm gradually, and the first June slot shows a modest continuation of that rebound."
      : `${region.label} weekly path is shown from the same CSV forecast format for visual review.`;
  explorerChartState = {
    points: rows.map((row) => ({ label: row.label, value: row.forecast })),
    emptyMessage: ""
  };
  drawExplorerChart();
}

function renderMonthlyExplorer(region) {
  const monthly = monthlyForExplorer();
  const rows = region.series.slice(-6);
  if (!monthly || !rows.length) {
    renderUnavailableExplorer(region);
    return;
  }

  els.weeklyTitle.textContent = `${region.label} monthly consumer sentiment path`;
  els.weeklyContext.textContent = `Latest monthly forecast: ${monthly.period} at ${fmt(monthly.valueLabel, 2)}.`;
  renderForecastNews(region, "monthly", monthly.period);
  els.weeklyNote.textContent = monthly.interpretation;
  explorerChartState = {
    points: rows.map((row) => ({ label: row.period, value: row.forecast })),
    emptyMessage: ""
  };
  drawExplorerChart();
}

function renderForecastExplorer() {
  updateForecastControls();
  const region = regionForExplorer();
  if (activeForecastCadence === "weekly") {
    renderWeeklyExplorer(region);
  } else {
    renderMonthlyExplorer(region);
  }
}

function setActiveRegion(regionId) {
  const next = data.regions.find((region) => region.id === regionId);
  if (!next) return;
  clearChartTooltip();
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
  const firstMonth = activeRegion.series[0]?.period;
  const lastMonth = activeRegion.series.at(-1)?.period;
  els.regionHeadline.textContent =
    firstMonth && lastMonth ? `Displayed months: ${firstMonth} - ${lastMonth}.` : activeRegion.window;
  els.briefMae.textContent = fmt(activeRegion.stats.mae);
  els.briefRmse.textContent = fmt(activeRegion.stats.rmse);
  els.briefPearson.textContent = fmt(activeRegion.stats.pearson);
  renderRegionOutline();
}

function renderRegionOutline() {
  els.regionOutlineMap.src = regionOutlineViews[activeRegion.id] || regionOutlineViews.us;
}

function renderTable() {
  els.tableContext.textContent = `${shortTarget(activeRegion.target)} | ${activeRegion.window} | ${shortRankNote(
    activeRegion.rankNote
  )}.`;
  els.historicalBody.innerHTML = activeRegion.leaderboard
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

function shortTarget(target) {
  return target
    .replace("University of Michigan Index of Consumer Sentiment", "UMich ICS")
    .replace("Eurostat consumer confidence indicator", "Eurostat CCI")
    .replace("Cabinet Office / ESRI Consumer Confidence Index", "ESRI CCI");
}

function shortRankNote(note) {
  return note
    .replace("#1 by MAE among displayed non-naive methods", "#1 MAE among displayed non-naive methods")
    .replace("Leads the displayed model comparison for EU27.", "#1 MAE among displayed methods")
    .replace("Leads the displayed model comparison for Japan.", "#1 MAE among displayed methods");
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
  chartHitTargets = [];

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

  const forecastPoints = [];
  const actualPoints = [];
  activeRegion.series.forEach((point, index) => {
    const x = xFor(index);
    if (Number.isFinite(point.actual)) {
      const y = yFor(point.actual);
      actualPoints.push([x, y]);
      chartHitTargets.push({ type: "actual", index, x, y });
    }
    if (Number.isFinite(point.forecast)) {
      const y = yFor(point.forecast);
      forecastPoints.push([x, y]);
      chartHitTargets.push({ type: "forecast", index, x, y });
    }
  });

  drawLine(ctx, actualPoints, "#101010", 2.5);
  drawLine(ctx, forecastPoints, "#d64f2a", 2.5);
  drawPoints(ctx, actualPoints, "#101010");
  drawPoints(ctx, forecastPoints, "#d64f2a");
  drawHoverPoint(ctx);

  ctx.fillStyle = "#5f5f5f";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  activeRegion.series.forEach((point, i) => {
    if (i % 2 === 0 || i === activeRegion.series.length - 1) {
      ctx.fillText(point.period.slice(2), xFor(i), padding.top + plotH + 16);
    }
  });
}

function drawHoverPoint(ctx) {
  if (!chartHover) return;
  const target = chartHitTargets.find((item) => item.type === chartHover.type && item.index === chartHover.index);
  if (!target) return;
  const color = target.type === "forecast" ? "#d64f2a" : "#101010";
  ctx.save();
  ctx.beginPath();
  ctx.arc(target.x, target.y, 7.5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255, 253, 248, 0.94)";
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(target.x, target.y, 3.8, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function setupChartTooltip() {
  els.chart.addEventListener("pointermove", handleChartPointerMove);
  els.chart.addEventListener("pointerleave", clearChartTooltip);
}

function handleChartPointerMove(event) {
  if (!activeRegion || !chartHitTargets.length) return;
  const rect = els.chart.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const nearest = nearestChartTarget(x, y);

  if (!nearest || nearest.distance > 16) {
    clearChartTooltip();
    return;
  }

  if (!chartHover || chartHover.type !== nearest.target.type || chartHover.index !== nearest.target.index) {
    chartHover = { type: nearest.target.type, index: nearest.target.index };
    drawChart();
  }
  showChartTooltip(nearest.target);
}

function nearestChartTarget(x, y) {
  return chartHitTargets.reduce((best, target) => {
    const distance = Math.hypot(target.x - x, target.y - y);
    return !best || distance < best.distance ? { target, distance } : best;
  }, null);
}

function showChartTooltip(target) {
  const point = activeRegion.series[target.index];
  const forecastClass = target.type === "forecast" ? "active" : "";
  const actualClass = target.type === "actual" ? "active" : "";
  els.chartTooltip.innerHTML = `
    <div class="tooltip-period">${point.period}</div>
    <div class="tooltip-row ${forecastClass}">
      <span>Forecast</span>
      <b>${valueLabel(point.forecast)}</b>
    </div>
    <div class="tooltip-row ${actualClass}">
      <span>Actual</span>
      <b>${valueLabel(point.actual)}</b>
    </div>
  `;
  els.chartTooltip.hidden = false;

  const canvasBox = els.chart.getBoundingClientRect();
  const shellBox = els.chart.parentElement.getBoundingClientRect();
  const tooltipWidth = els.chartTooltip.offsetWidth || 160;
  const tooltipHeight = els.chartTooltip.offsetHeight || 94;
  const rawLeft = canvasBox.left - shellBox.left + target.x + 14;
  const rawTop = canvasBox.top - shellBox.top + target.y - tooltipHeight - 12;
  const maxLeft = shellBox.width - tooltipWidth - 12;
  const maxTop = shellBox.height - tooltipHeight - 12;
  els.chartTooltip.style.left = `${Math.max(12, Math.min(rawLeft, maxLeft))}px`;
  els.chartTooltip.style.top = `${Math.max(12, Math.min(rawTop, maxTop))}px`;
}

function clearChartTooltip() {
  if (!chartHover && els.chartTooltip.hidden) return;
  chartHover = null;
  els.chartTooltip.hidden = true;
  if (activeRegion) drawChart();
}

function valueLabel(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "pending";
}

function drawExplorerChart() {
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

  const rows = explorerChartState.points.filter((row) => Number.isFinite(row.value));
  if (rows.length < 2) {
    ctx.fillStyle = "#5f5f5f";
    ctx.font = "13px Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(explorerChartState.emptyMessage || "No chart data", width / 2, height / 2);
    return;
  }

  const values = rows.map((row) => row.value);
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

  const forecastPoints = rows.map((row, index) => [xFor(index), yFor(row.value)]);
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
  const response = await fetch("./data/consumersim_site_data.csv", { cache: "no-store" });
  const csv = await response.text();
  data = buildData(parseCsv(csv));
  activeRegion = data.regions[0];
  typeHeroTitle();
  startTypingStatus();
  setupReveal();
  setMeta();
  renderMapValues();
  createTabs();
  createForecastControls();
  setupChartTooltip();
  renderForecastExplorer();
  render();
}

window.addEventListener("resize", () => {
  if (!data) return;
  window.requestAnimationFrame(() => {
    drawChart();
    drawExplorerChart();
  });
});

init();
