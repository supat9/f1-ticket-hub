const strings = JSON.parse(document.querySelector("#home-copy").textContent);
const cases = JSON.parse(document.querySelector("#board-data").textContent);
// The walkthrough shows the checkout ticket after engineering submits its fix.
const exampleCase = cases.find(item => item.id === "F1-000108");
exampleCase.status = "review";
const statuses = ["new", "working", "review", "closed"];
const tabs = Array.from(document.querySelectorAll("[data-tab]"));
const board = document.querySelector("#board");
const search = document.querySelector("#search");
const cardTemplate = document.querySelector("#card-template");
const dialog = document.querySelector("#case-dialog");
const dialogTitle = document.querySelector("#dialog-title");
const details = document.querySelector("#case-details");
const form = document.querySelector("#case-form");
const caseInput = document.querySelector("#case-input");
const advance = document.querySelector("#advance-handoff");
const handoffState = document.querySelector("#handoff-state");
const triageToggle = document.querySelector("#show-triage");
const triageResult = document.querySelector("#triage-result");
let locale = 0;
let nextId = Math.max(...cases.map(item => Number(item.id.slice(3)))) + 1;
let verified = false;

function t(key) {
  return strings[key][locale];
}

function selectTab(name) {
  for (const tab of tabs) {
    const selected = tab.dataset.tab === name;
    tab.setAttribute("aria-selected", selected);
    tab.tabIndex = selected ? 0 : -1;
    document.getElementById(tab.getAttribute("aria-controls")).hidden = !selected;
  }
  for (const button of document.querySelectorAll(".side-menu button")) {
    button.setAttribute("aria-current", button.dataset.openTab === name);
  }
}

function renderBoard() {
  const query = search.value.trim().toLowerCase();
  const matchingCases = cases.filter(item => [item.id, ...item.title, item.owner, t(item.category)].join(" ").toLowerCase().includes(query));
  const columns = document.createDocumentFragment();

  for (const status of statuses) {
    const items = matchingCases.filter(item => item.status === status);
    const column = document.createElement("section");
    column.className = "column column-" + status;
    column.innerHTML = '<h4 class="column-title"><span class="dot" aria-hidden="true"></span><span class="column-name"></span><span class="count"></span></h4><div class="column-cards"></div>';
    column.querySelector(".column-name").textContent = t(status);
    column.querySelector(".count").textContent = items.length;
    const cards = column.querySelector(".column-cards");

    for (const item of items) {
      const card = cardTemplate.content.firstElementChild.cloneNode(true);
      card.querySelector(".case-id").textContent = item.id;
      card.querySelector("strong").textContent = item.title[locale];
      card.querySelector(".card-owner").textContent = item.owner || t("unassigned");
      card.querySelector(".card-category").textContent = t(item.category);
      card.addEventListener("click", () => {
        dialogTitle.textContent = item.title[locale];
        details.textContent = [item.id, t(item.status), item.owner || t("unassigned"), t(item.category)].join(" · ");
        details.hidden = false;
        form.hidden = true;
        dialog.showModal();
      });
      cards.append(card);
    }
    columns.append(column);
  }
  board.replaceChildren(columns);
  document.querySelector("#board-empty").hidden = matchingCases.length > 0;
}

function renderHandoff() {
  const closed = exampleCase.status === "closed";
  const badge = document.querySelector("#hero-status");
  badge.textContent = t(exampleCase.status);
  badge.classList.toggle("done", closed);
  handoffState.textContent = t(verified && !closed ? "verified" : exampleCase.status);
  advance.textContent = t(verified ? "closeCase" : "verify");
  advance.hidden = closed;
}

const scenarios = JSON.parse(document.querySelector("#checkout-report-data").textContent);
const liveTriage = document.querySelector("#live-triage");
const includeReply = document.querySelector("#include-reply");
const triageMessage = document.querySelector("#triage-message");
const copyTriage = document.querySelector("#copy-triage");
let triageRequest;
let triageDecision;
function resetTriage() {
  triageRequest?.abort();
  triageRequest = null;
  triageDecision = null;
  triageResult.hidden = true;
  triageToggle.disabled = false;
  triageToggle.textContent = t(liveTriage.checked ? "liveAction" : "assess");
  triageMessage.textContent = "";
  const scenario = scenarios[document.documentElement.lang];
  document.querySelector("#triage-report").textContent = scenario.report;
  const reply = document.querySelector("#triage-reply");
  reply.textContent = scenario.reply;
  reply.hidden = !includeReply.checked;
}

function setLocale(language) {
  locale = language === "en" ? 1 : 0;
  document.documentElement.lang = language;
  for (const element of document.querySelectorAll("[data-copy]")) {
    element.textContent = t(element.dataset.copy);
  }
  for (const element of document.querySelectorAll("[data-label]")) {
    element.setAttribute("aria-label", t(element.dataset.label));
  }
  for (const element of document.querySelectorAll("[data-placeholder]")) {
    element.placeholder = t(element.dataset.placeholder);
  }
  for (const button of document.querySelectorAll("[data-lang]")) {
    button.setAttribute("aria-pressed", button.dataset.lang === language);
  }
  renderBoard();
  renderHandoff();
  resetTriage();
}

for (const tab of tabs) {
  tab.addEventListener("click", () => selectTab(tab.dataset.tab));
}
document.querySelector(".tabs").addEventListener("keydown", event => {
  const index = tabs.indexOf(event.target);
  if (index < 0) return;
  const moves = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 };
  if (!Object.hasOwn(moves, event.key)) return;
  event.preventDefault();
  const nextTab = tabs[moves[event.key]];
  selectTab(nextTab.dataset.tab);
  nextTab.focus();
});
for (const link of document.querySelectorAll("[data-open-tab]")) {
  link.addEventListener("click", () => selectTab(link.dataset.openTab));
}
for (const button of document.querySelectorAll("[data-lang]")) {
  button.addEventListener("click", async () => {
    const language = button.dataset.lang;
    if (document.documentElement.lang === language) return;
    const buttons = document.querySelectorAll("[data-lang]");
    for (const control of buttons) control.disabled = true;
    try {
      const response = await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language }),
      });
      if (!response.ok) throw new Error("Language update failed");
      setLocale(language);
      document.querySelector("#language-message").textContent = "";
    } catch {
      document.querySelector("#language-message").textContent = t("languageError");
    } finally {
      for (const control of buttons) control.disabled = false;
    }
  });
}
search.addEventListener("input", renderBoard);
document.querySelector("#new-case").addEventListener("click", () => {
  dialogTitle.textContent = t("newCase");
  details.hidden = true;
  form.hidden = false;
  form.reset();
  caseInput.setCustomValidity("");
  dialog.showModal();
  caseInput.focus();
});
document.querySelector("#close-dialog").addEventListener("click", () => dialog.close());
caseInput.addEventListener("input", () => caseInput.setCustomValidity(""));
form.addEventListener("submit", event => {
  event.preventDefault();
  const title = caseInput.value.trim();
  if (!title) {
    caseInput.setCustomValidity(t("titleRequired"));
    caseInput.reportValidity();
    return;
  }
  const id = "F1-" + String(nextId).padStart(6, "0");
  nextId += 1;
  cases.unshift({ id, status: "new", owner: "", category: "general", title: [title, title] });
  search.value = "";
  dialog.close();
  renderBoard();
});
includeReply.addEventListener("change", resetTriage);
liveTriage.addEventListener("change", resetTriage);
triageToggle.addEventListener("click", async () => {
  const request = new AbortController();
  triageRequest = request;
  triageToggle.disabled = true;
  triageResult.hidden = true;
  const live = liveTriage.checked;
  triageMessage.textContent = t(live ? "livePending" : "assessing");
  const sample = includeReply.checked ? "checkout-reply" : "checkout-report";
  try {
    const response = await fetch(`/api/triage?sample=${sample}&lang=${document.documentElement.lang}&provider=${live ? "local" : "example"}`, {
      method: "POST", signal: request.signal,
    });
    if (request.signal.aborted) return;
    if (!response.ok) {
      const issue = response.status === 429 ? "liveBusy" : response.status === 504 ? "liveTimeout" : "liveError";
      triageMessage.textContent = t(live ? issue : "unavailable");
      return;
    }
    const {readiness} = await response.json();
    if (request.signal.aborted) return;
    triageDecision = readiness;
    const ask = readiness === "ask";
    document.querySelector("#triage-decision").textContent = t(ask ? "askFirst" : "ready");
    document.querySelector("#triage-impact").textContent = t(includeReply.checked ? "observedOutcome" : "unknownOutcome");
    document.querySelector("#triage-action-label").textContent = t(ask ? "customerQuestion" : "acceptance");
    document.querySelector("#triage-action").textContent = t(ask ? "checkoutQuestion" : "checkoutCheck");
    copyTriage.textContent = t(ask ? "copyQuestion" : "copyHandoff");
    triageResult.hidden = false;
    triageMessage.textContent = t(live ? "liveResult" : "reviewed");
  } catch {
    if (!request.signal.aborted) triageMessage.textContent = t(live ? "liveError" : "unavailable");
  } finally {
    if (triageRequest === request) triageToggle.disabled = false;
  }
});
copyTriage.addEventListener("click", async () => {
  if (!triageDecision) return;
  const scenario = scenarios[document.documentElement.lang];
  const text = triageDecision === "ask" ? t("checkoutQuestion") :
    [scenario.title, scenario.report, ...(includeReply.checked ? [scenario.reply] : []), t("acceptance"), t("checkoutCheck")].join("\n");
  try {
    await navigator.clipboard.writeText(text);
    triageMessage.textContent = t("copied");
  } catch {
    triageMessage.textContent = t("manualCopy");
  }
});
advance.addEventListener("click", () => {
  if (verified) exampleCase.status = "closed";
  verified = true;
  renderHandoff();
  renderBoard();
  if (advance.hidden) {
    handoffState.tabIndex = -1;
    handoffState.focus();
  }
});
setLocale(document.documentElement.lang);
function openTriageLink() {
  if (location.hash === "#ai-triage") {
    selectTab("triage");
    document.querySelector("#features").scrollIntoView();
  }
}
openTriageLink();
window.addEventListener("hashchange", openTriageLink);
