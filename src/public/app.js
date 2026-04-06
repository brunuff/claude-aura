// === Claude Aura — Client-Side Application ===

// --- SSE Connections ---
const baselineSource = new EventSource("/events/baseline");
const stateSource = new EventSource("/events/state");
const observationSource = new EventSource("/events/observation");

// --- DOM References ---
const heartbeatEl = document.getElementById("heartbeat");
const alertZone = document.getElementById("alert-zone");
const personaPills = document.getElementById("persona-pills");
const constraintPills = document.getElementById("constraint-pills");
const layer2 = document.getElementById("layer2");

// === Layer 1: Persona Baseline ===
baselineSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  renderPills(personaPills, data.personaFlags, "persona");
  renderPills(constraintPills, data.constraints, "constraint");
  renderInventory(data.allFlags || [], data.meta || {});
};

function renderPills(container, flags, category) {
  container.innerHTML = "";
  if (!flags || flags.length === 0) {
    container.innerHTML = '<span class="pill">No flags detected</span>';
    return;
  }
  for (const flag of flags) {
    const pill = document.createElement("div");
    pill.className = `pill ${category}`;
    pill.innerHTML = `
      <span class="pill-dot"></span>
      <span class="pill-name">${flag.label}</span>
      <span class="pill-value">${flag.value}</span>
    `;
    pill.title = `${flag.key}\n${flag.effect}`;
    container.appendChild(pill);
  }
}

// === Layer 2: Functional State ===
stateSource.onmessage = (event) => {
  const data = JSON.parse(event.data);

  // Update heartbeat
  if (data.heartbeat) {
    heartbeatEl.className = data.heartbeat;
  }

  // Update ambient state bars (Tier 1)
  if (data.state) {
    for (const [dim, val] of Object.entries(data.state)) {
      const bar = document.querySelector(`.state-bar[data-dim="${dim}"]`);
      if (!bar) continue;
      const fill = bar.querySelector(".bar-fill");
      const value = bar.querySelector(".bar-value");
      fill.style.width = `${val * 100}%`;
      value.textContent = val.toFixed(2);
    }
  }

  // Render Tier 2 risk alerts
  renderAlerts(data.risks || []);

  // Render pressure lines
  renderPressures(data.pressures || []);
};

function renderAlerts(risks) {
  alertZone.innerHTML = "";
  for (const risk of risks) {
    const card = document.createElement("div");
    card.className = `alert-card ${risk.severity}`;
    card.innerHTML = `
      <div class="alert-type">${risk.type.replace(/_/g, " ")}</div>
      <div class="alert-message">${risk.message}</div>
      ${risk.action ? `<div class="alert-action">${risk.action}</div>` : ""}
    `;
    alertZone.appendChild(card);
  }
}

function renderPressures(pressures) {
  const svg = document.getElementById("pressure-map");
  svg.innerHTML = "";
  // Pressure map lines are drawn between Layer 3 budget gauges and Layer 2 bars
  for (const p of pressures) {
    const sourceEl = document.querySelector(
      `.budget-gauge[data-name="${p.source}"], .indicator[data-name="${p.source}"]`
    );
    const targetEl = document.querySelector(
      `.state-bar[data-dim="${p.target}"]`
    );
    if (!sourceEl || !targetEl) continue;

    const sourceRect = sourceEl.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", sourceRect.right.toString());
    line.setAttribute("y1", (sourceRect.top + sourceRect.height / 2).toString());
    line.setAttribute("x2", targetRect.left.toString());
    line.setAttribute("y2", (targetRect.top + targetRect.height / 2).toString());
    line.setAttribute(
      "class",
      `pressure-line ${p.magnitude > 0.5 ? "red" : "amber"}`
    );
    svg.appendChild(line);
  }
}

// === Layer 3: Observation Layer ===
observationSource.onmessage = (event) => {
  const data = JSON.parse(event.data);

  // 3A: Data Flow
  renderDataFlow(data.dataFlow || []);

  // 3B: Token Budgets
  renderTokenBudgets(data.tokenBudgets || []);

  // 3C: Boundaries
  renderBoundaries(data.boundaries || [], data.gitClean);

  // 3D: Metrics
  renderMetrics(data.metrics);
};

function renderDataFlow(indicators) {
  const container = document.getElementById("data-flow");
  container.innerHTML = "";
  for (const ind of indicators) {
    const el = document.createElement("div");
    el.className = `indicator${ind.name === "Event Streaming" && ind.status === "active" ? " streaming" : ""}`;
    el.setAttribute("data-name", ind.name);
    el.innerHTML = `
      <span class="indicator-dot ${ind.status}"></span>
      <span class="indicator-name">${ind.name}</span>
      <span class="indicator-detail">${ind.detail}</span>
    `;
    container.appendChild(el);
  }
}

function renderTokenBudgets(budgets) {
  const container = document.getElementById("token-budgets");
  container.innerHTML = "";
  for (const b of budgets) {
    const el = document.createElement("div");
    el.className = "budget-gauge";
    el.setAttribute("data-name", b.name);
    el.innerHTML = `
      <span class="budget-name">${b.name}</span>
      <div class="budget-track"><div class="budget-fill"></div></div>
      <span class="budget-label">${b.label}</span>
    `;
    container.appendChild(el);
  }
}

function renderBoundaries(boundaries, gitClean) {
  const container = document.getElementById("boundaries");
  container.innerHTML = "";
  for (const b of boundaries) {
    let status = b.status;
    // Override git boundary with live state
    if (b.name === "Git State Enforcement" && gitClean !== null) {
      status = gitClean ? "enforced" : "active"; // active = red dot for dirty
    }
    const el = document.createElement("div");
    el.className = "indicator";
    el.setAttribute("data-name", b.name);
    el.innerHTML = `
      <span class="indicator-dot ${status}"></span>
      <span class="indicator-name">${b.name}</span>
      <span class="indicator-detail">${
        b.name === "Git State Enforcement" && gitClean !== null
          ? gitClean ? "Clean" : "DIRTY — uncommitted changes"
          : b.detail
      }</span>
    `;
    container.appendChild(el);
  }
}

function renderMetrics(metrics) {
  if (!metrics) return;
  document.getElementById("msg-count").textContent = metrics.messageCount;
  document.getElementById("tool-count").textContent = metrics.toolCallCount;

  // Session duration
  const elapsed = Math.floor((Date.now() - metrics.sessionStartTime) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  document.getElementById("session-time").textContent =
    `${mins}:${secs.toString().padStart(2, "0")}`;

  // Permission ratio
  const total = metrics.permissionGrants + metrics.permissionDenials;
  document.getElementById("perm-ratio").textContent =
    total > 0 ? `${metrics.permissionGrants}/${metrics.permissionDenials}` : "-";
}

// Update session timer every second
setInterval(() => {
  const timeEl = document.getElementById("session-time");
  const current = timeEl.textContent;
  const parts = current.split(":");
  if (parts.length === 2) {
    let mins = parseInt(parts[0], 10);
    let secs = parseInt(parts[1], 10) + 1;
    if (secs >= 60) { secs = 0; mins++; }
    timeEl.textContent = `${mins}:${secs.toString().padStart(2, "0")}`;
  }
}, 1000);

// === Layer 4: Full Harness Inventory ===

function renderInventory(allFlags, meta) {
  // Meta row
  const metaRow = document.getElementById("inventory-meta");
  metaRow.innerHTML = `
    <span class="meta-item">Total: <span class="meta-val">${meta.totalFlags || allFlags.length}</span></span>
    <span class="meta-item">Enabled: <span class="meta-val">${meta.enabledFlags || "?"}</span></span>
    <span class="meta-item">Unclassified: <span class="meta-val">${meta.unknownFlags || "?"}</span></span>
    ${meta.userID ? `<span class="meta-item">User: <span class="meta-val">${meta.userID}</span></span>` : ""}
    ${meta.firstStartTime ? `<span class="meta-item">Init: <span class="meta-val">${new Date(meta.firstStartTime).toLocaleDateString()}</span></span>` : ""}
  `;

  // Flag grid
  const grid = document.getElementById("inventory-grid");
  grid.innerHTML = "";
  for (const flag of allFlags) {
    const el = document.createElement("div");
    el.className = `inv-flag`;
    el.setAttribute("data-category", flag.category);
    const valClass = flag.value === "enabled" ? "enabled" : flag.value === "disabled" ? "disabled" : "";
    el.innerHTML = `
      <span class="inv-cat ${flag.category}" title="${flag.category}"></span>
      <span class="inv-key" title="${flag.key}">${flag.label}</span>
      <span class="inv-val ${valClass}" title="${flag.effect}">${flag.value}</span>
    `;
    el.title = `${flag.key}\n${flag.effect}\nCategory: ${flag.category}`;
    grid.appendChild(el);
  }

  // Wire up filter buttons
  const filterBtns = document.querySelectorAll(".filter-btn");
  filterBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      filterBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const filter = btn.getAttribute("data-filter");
      const flags = grid.querySelectorAll(".inv-flag");
      flags.forEach(f => {
        if (filter === "all" || f.getAttribute("data-category") === filter) {
          f.classList.remove("hidden");
        } else {
          f.classList.add("hidden");
        }
      });
    });
  });
}

// SSE reconnection handling
for (const source of [baselineSource, stateSource, observationSource]) {
  source.onerror = () => {
    console.warn("[Aura] SSE connection lost, reconnecting...");
  };
}
