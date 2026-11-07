"use strict";

/* ============================================================
   Clima — Open-Meteo (sem chave de API)
   Previsão:  https://open-meteo.com/en/docs
   Geocoding: https://open-meteo.com/en/docs/geocoding-api
   ============================================================ */

const API = "https://api.open-meteo.com/v1/forecast";
const GEO = "https://geocoding-api.open-meteo.com/v1/search";

const DEFAULT_PLACE = {
  name: "Fortaleza", admin1: "Ceará", country: "Brasil",
  latitude: -3.7172, longitude: -38.5434,
};

const $ = (sel) => document.querySelector(sel);
const el = {
  form: $("#search"), q: $("#q"), geo: $("#geo"), results: $("#results"),
  place: $("#place"), temp: $("#temp"), cond: $("#cond"), updated: $("#updated"),
  chart: $("#chart"), stats: $("#stats"), week: $("#week"), status: $("#status"),
};

/* ---------- Códigos de tempo (WMO) ---------- */
const WMO = {
  0: "Céu limpo", 1: "Quase limpo", 2: "Parcialmente nublado", 3: "Nublado",
  45: "Neblina", 48: "Neblina com geada",
  51: "Garoa fraca", 53: "Garoa", 55: "Garoa forte", 56: "Garoa congelante", 57: "Garoa congelante forte",
  61: "Chuva fraca", 63: "Chuva", 65: "Chuva forte", 66: "Chuva congelante", 67: "Chuva congelante forte",
  71: "Neve fraca", 73: "Neve", 75: "Neve forte", 77: "Grãos de neve",
  80: "Pancadas fracas", 81: "Pancadas de chuva", 82: "Pancadas fortes",
  85: "Pancadas de neve", 86: "Pancadas de neve fortes",
  95: "Trovoada", 96: "Trovoada com granizo", 99: "Trovoada com granizo forte",
};
const describe = (code) => WMO[code] ?? "Condição desconhecida";

/* ---------- Utilidades ---------- */
const round = (n) => Math.round(n);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

function setStatus(message, retry) {
  el.status.replaceChildren();
  if (!message) return;
  const span = document.createElement("span");
  span.textContent = message;
  el.status.append(span);
  if (retry) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn";
    btn.textContent = "Tentar de novo";
    btn.addEventListener("click", retry);
    el.status.append(btn);
  }
}

function placeLabel(p) {
  return [p.name, p.admin1, p.country].filter(Boolean).join(", ");
}

function savePlace(p) {
  try { localStorage.setItem("clima:place", JSON.stringify(p)); } catch { /* ignora */ }
}
function savedPlace() {
  try { return JSON.parse(localStorage.getItem("clima:place")) ?? DEFAULT_PLACE; }
  catch { return DEFAULT_PLACE; }
}

/* ---------- Carregar previsão ---------- */
async function load(place) {
  setStatus("Carregando previsão…");
  try {
    const params = new URLSearchParams({
      latitude: place.latitude,
      longitude: place.longitude,
      current: "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day",
      hourly: "temperature_2m,relative_humidity_2m,wind_speed_10m",
      daily: "weather_code,temperature_2m_max,temperature_2m_min",
      timezone: "auto",
      forecast_days: 7,
    });
    const res = await fetch(`${API}?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    render(place, data);
    savePlace(place);
    setStatus("");
  } catch (err) {
    console.error(err);
    setStatus("Não foi possível carregar a previsão. Verifique a conexão.", () => load(place));
  }
}

/* ---------- Render geral ---------- */
function render(place, data) {
  const c = data.current;
  const u = data.current_units;

  el.place.textContent = placeLabel(place);
  el.temp.innerHTML = `${round(c.temperature_2m)}<span>°</span>`;
  el.cond.textContent = describe(c.weather_code);
  el.updated.textContent = `Atualizado às ${c.time.slice(11, 16)}`;

  renderStats(c, u);
  renderChart(hoursFrom(data));
  renderWeek(data.daily);
}

function renderStats(c, u) {
  const items = [
    ["Sensação térmica", `${round(c.apparent_temperature)}°`],
    ["Umidade", `${round(c.relative_humidity_2m)}%`],
    ["Vento", `${round(c.wind_speed_10m)} ${u.wind_speed_10m}`],
  ];
  el.stats.replaceChildren(...items.map(([label, value]) => {
    const row = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    row.append(dt, dd);
    return row;
  }));
}

/* ---------- Próximas 24 h ---------- */
function hoursFrom(data) {
  const h = data.hourly;
  const nowKey = data.current.time.slice(0, 13) + ":00";
  let start = h.time.findIndex((t) => t >= nowKey);
  if (start < 0) start = 0;
  const out = [];
  for (let i = start; i < Math.min(start + 25, h.time.length); i++) {
    out.push({
      time: h.time[i],
      temp: h.temperature_2m[i],
      hum: h.relative_humidity_2m[i],
      wind: h.wind_speed_10m[i],
    });
  }
  return { points: out, windUnit: data.hourly_units.wind_speed_10m };
}

function renderChart({ points, windUnit }) {
  const W = 960, H = 300, PAD = 12;
  const TOP = 34, BASE = 205;          // área da linha
  const BAR_BASE = 252, BAR_MAX = 38;  // barras de umidade
  const n = points.length;

  const temps = points.map((p) => p.temp);
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const span = max - min || 1;

  const x = (i) => PAD + (i * (W - PAD * 2)) / (n - 1);
  const y = (t) => TOP + (1 - (t - min) / span) * (BASE - TOP);

  let d = `M ${x(0)} ${y(points[0].temp)}`;
  for (let i = 1; i < n; i++) {
    const mx = (x(i - 1) + x(i)) / 2;
    d += ` C ${mx} ${y(points[i - 1].temp)} ${mx} ${y(points[i].temp)} ${x(i)} ${y(points[i].temp)}`;
  }
  const area = `${d} L ${x(n - 1)} ${BASE + 14} L ${x(0)} ${BASE + 14} Z`;

  const bars = points.map((p, i) => {
    const h = (p.hum / 100) * BAR_MAX;
    return `<rect class="hum" x="${x(i) - 5}" y="${BAR_BASE - h}" width="10" height="${h}" rx="3"/>`;
  }).join("");

  const ticks = points.map((p, i) => {
    if (i % 3 !== 0) return "";
    const label = i === 0 ? "agora" : `${p.time.slice(11, 13)}h`;
    return `<text class="tick" x="${x(i)}" y="${H - 6}" text-anchor="${i === 0 ? "start" : "middle"}">${label}</text>`;
  }).join("");

  const iMax = temps.indexOf(max);
  const iMin = temps.indexOf(min);
  const peak = (i, dy) =>
    `<text class="peak" x="${Math.min(Math.max(x(i), 24), W - 24)}" y="${y(temps[i]) + dy}" text-anchor="middle">${round(temps[i])}°</text>`;
  const peaks = max === min ? peak(iMax, -12) : peak(iMax, -12) + peak(iMin, 24);

  el.chart.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Temperatura e umidade nas próximas 24 horas">
      <line class="grid" x1="0" x2="${W}" y1="${BASE + 14}" y2="${BASE + 14}"/>
      ${bars}
      <path class="area" d="${area}"/>
      <path class="line" d="${d}"/>
      ${peaks}
      <circle class="now" cx="${x(0)}" cy="${y(points[0].temp)}" r="5"/>
      ${ticks}
      <line class="cursor" id="cursor" y1="${TOP - 8}" y2="${BAR_BASE}" visibility="hidden"/>
      <circle class="dot" id="dot" r="7" visibility="hidden"/>
      <rect x="0" y="0" width="${W}" height="${H}" fill="transparent"/>
    </svg>
    <div class="tip" id="tip" hidden></div>`;

  const svg = el.chart.querySelector("svg");
  const line = svg.querySelector(".line");
  const areaEl = svg.querySelector(".area");

  // Único momento animado: a linha se desenha uma vez.
  if (!reducedMotion) {
    const len = line.getTotalLength();
    line.style.strokeDasharray = len;
    line.style.strokeDashoffset = len;
    areaEl.style.opacity = 0;
    line.getBoundingClientRect(); // força reflow
    line.style.transition = "stroke-dashoffset 1.3s cubic-bezier(.2,.7,.2,1)";
    areaEl.style.transition = "opacity 1s ease 0.5s";
    line.style.strokeDashoffset = 0;
    areaEl.style.opacity = 1;
  }

  /* Interação: mostra a hora sob o cursor */
  const cursor = svg.querySelector("#cursor");
  const dot = svg.querySelector("#dot");
  const tip = el.chart.querySelector("#tip");

  const show = (evt) => {
    const rect = svg.getBoundingClientRect();
    const vx = ((evt.clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(((vx - PAD) / (W - PAD * 2)) * (n - 1))));
    const p = points[i];

    cursor.setAttribute("x1", x(i)); cursor.setAttribute("x2", x(i));
    dot.setAttribute("cx", x(i));   dot.setAttribute("cy", y(p.temp));
    cursor.setAttribute("visibility", "visible");
    dot.setAttribute("visibility", "visible");

    const pct = x(i) / W;
    tip.hidden = false;
    tip.style.left = `${pct * 100}%`;
    tip.style.transform = pct < 0.15 ? "none" : pct > 0.85 ? "translateX(-100%)" : "translateX(-50%)";
    tip.innerHTML = `<strong>${round(p.temp)}°</strong> às ${p.time.slice(11, 16)}<br>
      Umidade ${round(p.hum)}% · Vento ${round(p.wind)} ${windUnit}`;
  };
  const hide = () => {
    cursor.setAttribute("visibility", "hidden");
    dot.setAttribute("visibility", "hidden");
    tip.hidden = true;
  };

  svg.addEventListener("pointermove", show);
  svg.addEventListener("pointerdown", show);
  svg.addEventListener("pointerleave", hide);
}

/* ---------- Próximos dias ---------- */
function renderWeek(daily) {
  const lo = Math.min(...daily.temperature_2m_min);
  const hi = Math.max(...daily.temperature_2m_max);
  const span = hi - lo || 1;
  const fmt = new Intl.DateTimeFormat("pt-BR", { weekday: "short" });

  el.week.replaceChildren(...daily.time.map((date, i) => {
    const tMin = daily.temperature_2m_min[i];
    const tMax = daily.temperature_2m_max[i];
    const left = ((tMin - lo) / span) * 100;
    const width = Math.max(((tMax - tMin) / span) * 100, 4);

    const li = document.createElement("li");
    li.innerHTML = `
      <span class="day">${i === 0 ? "Hoje" : fmt.format(new Date(`${date}T12:00`)).replace(".", "")}</span>
      <span class="what">${describe(daily.weather_code[i])}</span>
      <span class="lo">${round(tMin)}°</span>
      <span class="track"><i style="left:${left}%;width:${width}%"></i></span>
      <span class="hi">${round(tMax)}°</span>`;
    return li;
  }));
}

/* ---------- Busca de cidade ---------- */
async function searchCity(name) {
  setStatus("Buscando cidade…");
  try {
    const params = new URLSearchParams({ name, count: 5, language: "pt", format: "json" });
    const res = await fetch(`${GEO}?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { results = [] } = await res.json();
    setStatus("");

    if (results.length === 0) {
      setStatus(`Nenhuma cidade encontrada para “${name}”. Tente outro nome.`);
      return;
    }
    if (results.length === 1) return pick(results[0]);
    showResults(results);
  } catch (err) {
    console.error(err);
    setStatus("Não foi possível buscar a cidade. Verifique a conexão.", () => searchCity(name));
  }
}

function showResults(list) {
  el.results.replaceChildren(...list.map((r) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.append(`${r.name} `);
    const small = document.createElement("small");
    small.textContent = [r.admin1, r.country].filter(Boolean).join(", ");
    btn.append(small);
    btn.addEventListener("click", () => pick(r));
    li.append(btn);
    return li;
  }));
  el.results.hidden = false;
  el.results.querySelector("button")?.focus();
}

function pick(r) {
  el.results.hidden = true;
  el.q.value = "";
  load({ name: r.name, admin1: r.admin1, country: r.country, latitude: r.latitude, longitude: r.longitude });
}

/* ---------- Eventos ---------- */
el.form.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = el.q.value.trim();
  if (name) searchCity(name);
});

el.geo.addEventListener("click", () => {
  if (!navigator.geolocation) {
    setStatus("Seu navegador não permite obter a localização.");
    return;
  }
  setStatus("Obtendo localização…");
  navigator.geolocation.getCurrentPosition(
    (pos) => load({
      name: "Sua localização",
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
    }),
    () => setStatus("Permissão negada. Busque pelo nome da cidade."),
    { timeout: 10000 }
  );
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") el.results.hidden = true;
});
document.addEventListener("click", (e) => {
  if (!el.results.hidden && !el.results.contains(e.target) && e.target !== el.q) el.results.hidden = true;
});

/* ---------- Início ---------- */
load(savedPlace());