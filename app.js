const journalsKey = "stillpoint.journals.v1";
const legacyEntriesKey = "stillpoint.entries.v1";

const state = {
  journals: loadJournals(),
  activeJournalId: null,
  activeEntryId: null
};

let editorMarkdownTimer;

const els = {
  todayLabel: document.querySelector("#todayLabel"),
  homeButton: document.querySelector("#homeButton"),
  sectionButtons: [...document.querySelectorAll("[data-section]")],
  tabs: [...document.querySelectorAll(".site-tab")],
  sections: {
    home: document.querySelector("#homeSection"),
    journal: document.querySelector("#journalSection"),
    letters: document.querySelector("#lettersSection"),
    reading: document.querySelector("#readingSection")
  },
  journalCreateForm: document.querySelector("#journalCreateForm"),
  journalNameInput: document.querySelector("#journalNameInput"),
  newJournalButton: document.querySelector("#newJournalButton"),
  deleteJournalButton: document.querySelector("#deleteJournalButton"),
  journalList: document.querySelector("#journalList"),
  journalTemplate: document.querySelector("#journalTemplate"),
  activeJournalName: document.querySelector("#activeJournalName"),
  entryCount: document.querySelector("#entryCount"),
  wordCount: document.querySelector("#wordCount"),
  newEntryButton: document.querySelector("#newEntryButton"),
  exportButton: document.querySelector("#exportButton"),
  searchInput: document.querySelector("#searchInput"),
  entryList: document.querySelector("#entryList"),
  entryTemplate: document.querySelector("#entryTemplate"),
  form: document.querySelector("#journalForm"),
  entryTitle: document.querySelector("#entryTitle"),
  entryDate: document.querySelector("#entryDate"),
  entryBody: document.querySelector("#entryBody"),
  tagInput: document.querySelector("#tagInput"),
  deleteButton: document.querySelector("#deleteButton")
};

init();

function init() {
  els.todayLabel.textContent = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(new Date());

  if (!state.journals.length) {
    state.journals.push(createJournalRecord("Journal"));
    persist();
  }

  state.activeJournalId = state.journals[0].id;
  ensureActiveEntry();
  bindEvents();
  render();
  selectEntry(getActiveEntries()[0]?.id);
}

function bindEvents() {
  els.homeButton.addEventListener("click", () => showSection("home"));

  els.sectionButtons.forEach((button) => {
    button.addEventListener("click", () => showSection(button.dataset.section));
  });

  els.newJournalButton.addEventListener("click", () => {
    els.journalNameInput.focus();
  });

  els.deleteJournalButton.addEventListener("click", deleteActiveJournal);

  els.journalCreateForm.addEventListener("submit", (event) => {
    event.preventDefault();
    createJournal();
  });

  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveActiveEntry();
  });

  els.newEntryButton.addEventListener("click", () => {
    const draft = createDraft();
    state.activeEntryId = draft.id;
    render();
    selectEntry(draft.id);
    els.entryTitle.focus();
  });

  els.deleteButton.addEventListener("click", deleteActiveEntry);
  els.searchInput.addEventListener("input", renderEntryList);
  els.entryBody.addEventListener("beforeinput", handleEditorBeforeInput);
  els.entryBody.addEventListener("input", handleEditorInput);
  els.entryBody.addEventListener("keydown", handleEditorKeydown);
  els.entryBody.addEventListener("paste", handleEditorPaste);
  els.exportButton.addEventListener("click", exportEntries);
}

function showSection(sectionName) {
  els.tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.section === sectionName);
  });

  Object.entries(els.sections).forEach(([name, section]) => {
    section.classList.toggle("active", name === sectionName);
  });
}

function createJournal() {
  const name = els.journalNameInput.value.trim() || `Journal ${state.journals.length + 1}`;
  const journal = createJournalRecord(name);
  state.journals.unshift(journal);
  state.activeJournalId = journal.id;
  state.activeEntryId = createDraft().id;
  els.journalNameInput.value = "";
  persist();
  render();
  selectEntry(state.activeEntryId);
}

function deleteActiveJournal() {
  const journal = getActiveJournal();
  if (!journal) return;

  const confirmed = window.confirm(`Delete "${journal.name}" and all of its entries?`);
  if (!confirmed) return;

  state.journals = state.journals.filter((item) => item.id !== journal.id);
  if (!state.journals.length) {
    state.journals.push(createJournalRecord("Journal"));
  }

  state.activeJournalId = state.journals[0].id;
  ensureActiveEntry();
  persist();
  render();
  selectEntry(getActiveEntries()[0]?.id);
}

function createJournalRecord(name, entries = []) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name,
    entries: sortEntries(entries),
    createdAt: now,
    updatedAt: now
  };
}

function selectJournal(id) {
  if (!state.journals.some((journal) => journal.id === id)) return;
  state.activeJournalId = id;
  els.searchInput.value = "";
  ensureActiveEntry();
  render();
  selectEntry(getActiveEntries()[0]?.id);
}

function ensureActiveEntry() {
  const journal = getActiveJournal();
  if (!journal) return;
  if (!journal.entries.length) {
    journal.entries.unshift(makeEntry());
    persist();
  }
  state.activeEntryId = journal.entries[0].id;
}

function createDraft() {
  const journal = getActiveJournal();
  const draft = makeEntry();
  journal.entries.unshift(draft);
  journal.updatedAt = draft.updatedAt;
  persist();
  return draft;
}

function makeEntry() {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: "",
    body: "",
    date: toInputDate(now),
    tags: [],
    createdAt: now,
    updatedAt: now
  };
}

function selectEntry(id) {
  const entry = getActiveEntries().find((item) => item.id === id);
  if (!entry) return;

  state.activeEntryId = id;
  els.entryTitle.value = entry.title;
  els.entryDate.value = entry.date || toInputDate(entry.updatedAt);
  setEditorContent(entry.body);
  els.tagInput.value = entry.tags.join(", ");
  renderEntryList();
}

function saveActiveEntry() {
  const journal = getActiveJournal();
  const entry = getActiveEntries().find((item) => item.id === state.activeEntryId);
  if (!journal || !entry) return;

  clearTimeout(editorMarkdownTimer);
  applyEditorMarkdown();

  entry.title = els.entryTitle.value.trim();
  entry.date = els.entryDate.value || toInputDate(new Date());
  entry.body = getEditorContent();
  entry.tags = els.tagInput.value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  entry.updatedAt = new Date().toISOString();

  journal.entries = sortEntries(journal.entries);
  journal.updatedAt = entry.updatedAt;
  state.journals = sortJournals(state.journals);
  persist();
  render();
  selectEntry(entry.id);
}

function deleteActiveEntry() {
  const journal = getActiveJournal();
  const entry = getActiveEntries().find((item) => item.id === state.activeEntryId);
  if (!journal || !entry) return;

  const label = entry.title || "this entry";
  const confirmed = window.confirm(`Delete "${label}"?`);
  if (!confirmed) return;

  if (journal.entries.length === 1) {
    const only = journal.entries[0];
    only.title = "";
    only.body = "";
    only.tags = [];
    only.date = toInputDate(new Date());
    only.updatedAt = new Date().toISOString();
    journal.updatedAt = only.updatedAt;
    persist();
    render();
    selectEntry(only.id);
    return;
  }

  const index = journal.entries.findIndex((item) => item.id === state.activeEntryId);
  journal.entries = journal.entries.filter((item) => item.id !== state.activeEntryId);
  journal.updatedAt = new Date().toISOString();
  persist();
  const next = journal.entries[Math.max(0, index - 1)] || journal.entries[0];
  state.activeEntryId = next.id;
  render();
  selectEntry(next.id);
}

function render() {
  renderJournals();
  renderStats();
  renderEntryList();
}

function renderJournals() {
  els.journalList.replaceChildren();
  state.journals.forEach((journal) => {
    const card = els.journalTemplate.content.firstElementChild.cloneNode(true);
    const savedEntries = journal.entries.filter((entry) => entry.title || entry.body);
    card.classList.toggle("active", journal.id === state.activeJournalId);
    card.querySelector("strong").textContent = journal.name;
    card.querySelector("span").textContent = `${savedEntries.length} ${savedEntries.length === 1 ? "entry" : "entries"}`;
    card.addEventListener("click", () => selectJournal(journal.id));
    els.journalList.append(card);
  });

  els.activeJournalName.textContent = getActiveJournal()?.name || "Journal";
}

function renderStats() {
  const savedEntries = getActiveEntries().filter((entry) => entry.title || entry.body);
  els.entryCount.textContent = savedEntries.length;
  els.wordCount.textContent = savedEntries.reduce((sum, entry) => sum + countWords(entry.body), 0);
}

function renderEntryList() {
  const query = els.searchInput.value.trim().toLowerCase();
  const matches = getActiveEntries().filter((entry) => {
    const haystack = [entry.title, entry.date, plainText(entry.body), ...entry.tags].join(" ").toLowerCase();
    return haystack.includes(query);
  });

  els.entryList.replaceChildren();

  if (!matches.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No matching entries.";
    els.entryList.append(empty);
    return;
  }

  matches.forEach((entry) => {
    const card = els.entryTemplate.content.firstElementChild.cloneNode(true);
    card.classList.toggle("active", entry.id === state.activeEntryId);
    card.querySelector(".entry-card__date").textContent = formatInputDate(entry.date);
    card.querySelector("strong").textContent = entry.title || "Untitled entry";
    card.querySelector(".entry-card__meta").textContent = getEntryMeta(entry);
    card.addEventListener("click", () => selectEntry(entry.id));
    els.entryList.append(card);
  });
}

function exportEntries() {
  const journal = getActiveJournal();
  const lines = getActiveEntries()
    .filter((entry) => entry.title || entry.body)
    .map((entry) => {
      const tags = entry.tags.length ? `Tags: ${entry.tags.join(", ")}\n` : "";
      return `# ${entry.title || "Untitled entry"}\nDate: ${entry.date || ""}\n${tags}\n${entryBodyToMarkdown(entry.body)}`;
    })
    .join("\n\n---\n\n");

  const blob = new Blob([lines || journal.name], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slugify(journal.name)}.md`;
  link.click();
  URL.revokeObjectURL(url);
}

function loadJournals() {
  try {
    const journals = JSON.parse(localStorage.getItem(journalsKey)) || [];
    if (journals.length) return sortJournals(journals.map(normalizeJournal));

    const legacyEntries = JSON.parse(localStorage.getItem(legacyEntriesKey)) || [];
    if (legacyEntries.length) {
      return [createJournalRecord("Journal", legacyEntries.map(normalizeEntry))];
    }
  } catch {
    return [];
  }

  return [];
}

function normalizeJournal(journal) {
  return {
    id: journal.id || crypto.randomUUID(),
    name: journal.name || "Journal",
    entries: sortEntries((journal.entries || []).map(normalizeEntry)),
    createdAt: journal.createdAt || new Date().toISOString(),
    updatedAt: journal.updatedAt || journal.entries?.[0]?.updatedAt || new Date().toISOString()
  };
}

function normalizeEntry(entry) {
  const now = new Date().toISOString();
  return {
    id: entry.id || crypto.randomUUID(),
    title: entry.title || "",
    body: entry.body || "",
    date: entry.date || toInputDate(entry.updatedAt || entry.createdAt || now),
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    createdAt: entry.createdAt || now,
    updatedAt: entry.updatedAt || now
  };
}

function persist() {
  localStorage.setItem(journalsKey, JSON.stringify(state.journals));
}

function getActiveJournal() {
  return state.journals.find((journal) => journal.id === state.activeJournalId);
}

function getActiveEntries() {
  return getActiveJournal()?.entries || [];
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    const dateDiff = new Date(b.date || b.updatedAt) - new Date(a.date || a.updatedAt);
    return dateDiff || new Date(b.updatedAt) - new Date(a.updatedAt);
  });
}

function sortJournals(journals) {
  return [...journals].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function countWords(text) {
  return plainText(text).trim().split(/\s+/).filter(Boolean).length;
}

function getEntryMeta(entry) {
  const words = countWords(entry.body);
  const tags = entry.tags.length ? ` - ${entry.tags.join(", ")}` : "";
  return `${words} ${words === 1 ? "word" : "words"}${tags}`;
}

function handleEditorBeforeInput(event) {
  if (event.inputType === "formatBold") {
    event.preventDefault();
    document.execCommand("bold");
  }

  if (event.inputType === "formatItalic") {
    event.preventDefault();
    document.execCommand("italic");
  }
}

function handleEditorInput(event) {
  if (event.inputType === "insertText" && event.data === " ") {
    applyBlockShortcut();
  }

  if (event.inputType === "insertText" && ["*", "`", ")"].includes(event.data)) {
    applyInlineShortcut();
  }

  scheduleEditorMarkdown();
}

function handleEditorKeydown(event) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
    event.preventDefault();
    document.execCommand("bold");
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "i") {
    event.preventDefault();
    document.execCommand("italic");
  }
}

function handleEditorPaste(event) {
  event.preventDefault();
  const text = event.clipboardData.getData("text/plain");
  document.execCommand("insertText", false, text);
  scheduleEditorMarkdown();
}

function scheduleEditorMarkdown() {
  clearTimeout(editorMarkdownTimer);
  editorMarkdownTimer = setTimeout(applyEditorMarkdown, 350);
}

function applyEditorMarkdown() {
  const text = els.entryBody.innerText.replace(/\u00a0/g, " ").trim();
  if (!text || !hasMarkdownSyntax(text)) return;

  const html = sanitizeRichHtml(renderMarkup(text));
  if (!html || html === els.entryBody.innerHTML) return;

  els.entryBody.innerHTML = html;
  moveCaretToEnd(els.entryBody);
}

function hasMarkdownSyntax(text) {
  return /(^|\n)\s*(#{1,3}|[-*]|1\.|>)\s/.test(text) ||
    /\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\)/.test(text);
}

function setEditorContent(content) {
  const trimmed = (content || "").trim();
  els.entryBody.innerHTML = looksLikeHtml(trimmed) ? sanitizeRichHtml(trimmed) : renderMarkup(trimmed);
}

function getEditorContent() {
  return sanitizeRichHtml(els.entryBody.innerHTML).trim();
}

function applyBlockShortcut() {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed) return;

  const block = getCurrentBlock(selection.anchorNode);
  if (!block || block.closest("#entryBody") !== els.entryBody) return;

  const text = block.textContent;
  const heading = text.match(/^(#{1,3})\s$/);
  const quote = text === "> ";
  const unorderedList = text === "- " || text === "* ";
  const orderedList = /^1\.\s$/.test(text);

  if (!heading && !quote && !unorderedList && !orderedList) return;

  block.textContent = "";

  if (heading) {
    document.execCommand("formatBlock", false, `h${heading[1].length + 1}`);
  } else if (quote) {
    document.execCommand("formatBlock", false, "blockquote");
  } else if (unorderedList) {
    document.execCommand("insertUnorderedList");
  } else if (orderedList) {
    document.execCommand("insertOrderedList");
  }
}

function applyInlineShortcut() {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed) return;

  const node = selection.anchorNode;
  const offset = selection.anchorOffset;
  if (!node || node.nodeType !== Node.TEXT_NODE) return;

  const before = node.textContent.slice(0, offset);
  const match =
    before.match(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/) ||
    before.match(/\*\*([^*]+)\*\*$/) ||
    before.match(/`([^`]+)`$/) ||
    before.match(/\*([^*]+)\*$/);

  if (!match) return;

  const syntax = match[0];
  const range = document.createRange();
  range.setStart(node, offset - syntax.length);
  range.setEnd(node, offset);
  range.deleteContents();

  const replacement = createInlineReplacement(match, syntax);
  range.insertNode(replacement);
  moveCaretAfter(replacement);
}

function createInlineReplacement(match, syntax) {
  if (syntax.startsWith("[")) {
    const link = document.createElement("a");
    link.href = match[2];
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = match[1];
    return link;
  }

  const tagName = syntax.startsWith("**") ? "strong" : syntax.startsWith("`") ? "code" : "em";
  const element = document.createElement(tagName);
  element.textContent = match[1];
  return element;
}

function getCurrentBlock(node) {
  let current = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  while (current && current !== els.entryBody) {
    if (/^(P|DIV|LI|H2|H3|H4|BLOCKQUOTE)$/.test(current.tagName)) return current;
    current = current.parentElement;
  }
  return els.entryBody;
}

function moveCaretAfter(node) {
  const range = document.createRange();
  const selection = window.getSelection();
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function moveCaretToEnd(node) {
  const range = document.createRange();
  const selection = window.getSelection();
  range.selectNodeContents(node);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function entryBodyToMarkdown(body) {
  if (!looksLikeHtml(body)) return body;

  const template = document.createElement("template");
  template.innerHTML = sanitizeRichHtml(body);
  return [...template.content.childNodes].map(nodeToMarkdown).join("\n\n").trim();
}

function nodeToMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent.trim();
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const text = [...node.childNodes].map(inlineNodeToMarkdown).join("").trim();
  const tag = node.tagName.toLowerCase();

  if (tag === "h2") return `# ${text}`;
  if (tag === "h3") return `## ${text}`;
  if (tag === "h4") return `### ${text}`;
  if (tag === "blockquote") return text.split("\n").map((line) => `> ${line}`).join("\n");
  if (tag === "ul") return [...node.children].map((item) => `- ${inlineNodeToMarkdown(item).trim()}`).join("\n");
  if (tag === "ol") return [...node.children].map((item, index) => `${index + 1}. ${inlineNodeToMarkdown(item).trim()}`).join("\n");
  if (tag === "br") return "\n";
  return text;
}

function inlineNodeToMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const text = [...node.childNodes].map(inlineNodeToMarkdown).join("");
  const tag = node.tagName.toLowerCase();

  if (tag === "strong" || tag === "b") return `**${text}**`;
  if (tag === "em" || tag === "i") return `*${text}*`;
  if (tag === "code") return `\`${text}\``;
  if (tag === "a") return `[${text}](${node.getAttribute("href") || ""})`;
  if (tag === "br") return "\n";
  return text;
}

function looksLikeHtml(value) {
  return /<\/?[a-z][\s\S]*>/i.test(value || "");
}

function renderMarkup(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let paragraph = [];
  let listItems = [];
  let listTag = "ul";

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(`<p>${formatInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!listItems.length) return;
    blocks.push(`<${listTag}>${listItems.map((item) => `<li>${formatInline(item)}</li>`).join("")}</${listTag}>`);
    listItems = [];
  };

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      return;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    const numbered = trimmed.match(/^\d+\.\s+(.+)$/);
    const quote = trimmed.match(/^>\s+(.+)$/);

    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length + 1;
      blocks.push(`<h${level}>${formatInline(heading[2])}</h${level}>`);
      return;
    }

    if (bullet) {
      flushParagraph();
      if (listTag !== "ul") flushList();
      listTag = "ul";
      listItems.push(bullet[1]);
      return;
    }

    if (numbered) {
      flushParagraph();
      if (listTag !== "ol") flushList();
      listTag = "ol";
      listItems.push(numbered[1]);
      return;
    }

    if (quote) {
      flushParagraph();
      flushList();
      blocks.push(`<blockquote>${formatInline(quote[1])}</blockquote>`);
      return;
    }

    flushList();
    paragraph.push(trimmed);
  });

  flushParagraph();
  flushList();
  return blocks.join("");
}

function formatInline(value) {
  return escapeHtml(value)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function sanitizeRichHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  const allowedTags = new Set(["A", "BLOCKQUOTE", "BR", "CODE", "DIV", "EM", "H2", "H3", "H4", "LI", "OL", "P", "STRONG", "UL"]);

  const sanitizeNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent);
    if (node.nodeType !== Node.ELEMENT_NODE) return document.createTextNode("");

    const tagName = node.tagName === "B" ? "STRONG" : node.tagName === "I" ? "EM" : node.tagName;
    if (!allowedTags.has(tagName)) {
      const fragment = document.createDocumentFragment();
      node.childNodes.forEach((child) => fragment.append(sanitizeNode(child)));
      return fragment;
    }

    const element = document.createElement(tagName.toLowerCase());
    if (tagName === "A") {
      const href = node.getAttribute("href") || "";
      if (/^https?:\/\//.test(href)) {
        element.href = href;
        element.target = "_blank";
        element.rel = "noopener noreferrer";
      }
    }

    node.childNodes.forEach((child) => element.append(sanitizeNode(child)));
    return element;
  };

  const fragment = document.createDocumentFragment();
  template.content.childNodes.forEach((node) => fragment.append(sanitizeNode(node)));
  const wrapper = document.createElement("div");
  wrapper.append(fragment);
  return wrapper.innerHTML;
}

function plainText(value) {
  if (!looksLikeHtml(value)) return value || "";

  return entryBodyToMarkdown(value)
    .replace(/\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/g, "$1")
    .replace(/[#>*_`-]/g, " ");
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function toInputDate(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function formatInputDate(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${date}T00:00:00`));
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "journal";
}
