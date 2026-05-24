const supabaseUrl = "https://bmtmlmpixhkhoyjcomrc.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJtdG1sbXBpeGhraG95amNvbXJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1ODYyNzQsImV4cCI6MjA5NTE2MjI3NH0.bI18cB6yluWHG_Rg4rvWR1t6w5k7ZFs5gVsMrOJ_QA0";
const journalsKey = "stillpoint.journals.v1";
const legacyEntriesKey = "stillpoint.entries.v1";

const db = window.supabase?.createClient(supabaseUrl, supabaseAnonKey);

const state = {
  journals: [],
  activeJournalId: null,
  activeEntryId: null,
  user: null,
  loading: false,
  authMessage: ""
};

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
  accountPill: document.querySelector("#accountPill"),
  authStatus: document.querySelector("#authStatus"),
  authUsername: document.querySelector("#authUsername"),
  authPassword: document.querySelector("#authPassword"),
  signInButton: document.querySelector("#signInButton"),
  signUpButton: document.querySelector("#signUpButton"),
  signOutButton: document.querySelector("#signOutButton"),
  journalCreateForm: document.querySelector("#journalCreateForm"),
  journalNameInput: document.querySelector("#journalNameInput"),
  newJournalButton: document.querySelector("#newJournalButton"),
  deleteJournalButton: document.querySelector("#deleteJournalButton"),
  journalList: document.querySelector("#journalList"),
  journalTemplate: document.querySelector("#journalTemplate"),
  activeJournalName: document.querySelector("#activeJournalName"),
  entryCount: document.querySelector("#entryCount"),
  streakCount: document.querySelector("#streakCount"),
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

async function init() {
  els.todayLabel.textContent = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(new Date());

  bindEvents();

  if (!db) {
    setAuthStatus("Supabase could not load. Using this browser only.");
    loadLocalData();
    return;
  }

  const { data } = await db.auth.getSession();
  state.user = data.session?.user || null;

  db.auth.onAuthStateChange(async (_event, session) => {
    state.user = session?.user || null;
    await loadData();
  });

  await loadData();
}

function bindEvents() {
  els.homeButton.addEventListener("click", () => showSection("home"));

  els.sectionButtons.forEach((button) => {
    button.addEventListener("click", () => showSection(button.dataset.section));
  });

  els.signInButton.addEventListener("click", signIn);
  els.signUpButton.addEventListener("click", signUp);
  els.signOutButton.addEventListener("click", signOut);

  els.newJournalButton.addEventListener("click", () => {
    els.journalNameInput.focus();
  });

  els.deleteJournalButton.addEventListener("click", deleteActiveJournal);

  els.journalCreateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await createJournal();
  });

  els.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveActiveEntry();
  });

  els.newEntryButton.addEventListener("click", async () => {
    const draft = await createDraft(true);
    state.activeEntryId = draft.id;
    render();
    selectEntry(draft.id);
    els.entryTitle.focus();
  });

  els.deleteButton.addEventListener("click", deleteActiveEntry);
  els.searchInput.addEventListener("input", renderEntryList);
  els.exportButton.addEventListener("click", exportEntries);
}

async function signIn() {
  const username = normalizeUsername(els.authUsername.value);
  const password = els.authPassword.value;
  if (!username || !password) {
    setAuthStatus("Enter your username and password first.");
    return;
  }

  setAuthStatus("Signing in...");
  const email = usernameToEmail(username);
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    setAuthStatus(error.message);
    return;
  }

  els.authPassword.value = "";
}

async function signUp() {
  const username = normalizeUsername(els.authUsername.value);
  const password = els.authPassword.value;
  if (!username || !password) {
    setAuthStatus("Enter a username and password to sign up.");
    return;
  }

  setAuthStatus("Creating account...");
  const email = usernameToEmail(username);
  const { data, error } = await db.auth.signUp({ email, password });
  if (error) {
    setAuthStatus(error.message);
    return;
  }

  els.authPassword.value = "";
  if (!data.session) {
    setAuthStatus("Account created. If sign in does not work yet, turn off email confirmations in Supabase.");
  }
}

async function signOut() {
  setAuthStatus("Signing out...");
  await db.auth.signOut();
}

async function loadData() {
  if (state.user) {
    await loadCloudData();
  } else {
    state.authMessage = "";
    loadLocalData();
  }
  renderAuth();
}

function loadLocalData() {
  state.journals = loadLocalJournals();
  if (!state.journals.length) {
    state.journals.push(createJournalRecord("Journal"));
    persistLocal();
  }

  state.activeJournalId = state.journals[0].id;
  ensureActiveEntry();
  render();
  selectEntry(getActiveEntries()[0]?.id);
}

async function loadCloudData() {
  state.loading = true;
  render();
  setAuthStatus("Loading your journals...");

  try {
    let journals = await fetchCloudJournals();

    if (!journals.length) {
      const localJournals = loadLocalJournals().filter((journal) =>
        journal.entries.some((entry) => entry.title || entry.body) || journal.name !== "Journal"
      );

      if (localJournals.length) {
        journals = await importLocalJournals(localJournals);
        setAuthStatus("Signed in. Your browser journals were imported.");
      } else {
        const journal = createJournalRecord("Journal");
        await saveJournalToCloud(journal);
        const entry = makeEntry();
        journal.entries.unshift(entry);
        await saveEntryToCloud(journal, entry);
        journals = [journal];
        setAuthStatus("Signed in. Your journals will sync here.");
      }
    } else {
      setAuthStatus("Signed in. Your journals are synced.");
    }

    state.journals = sortJournals(journals);
    state.activeJournalId = state.journals[0].id;
    ensureActiveEntry();
    render();
    selectEntry(getActiveEntries()[0]?.id);
  } catch (error) {
    setAuthStatus(`Supabase setup needed: ${error.message}`);
    loadLocalData();
  } finally {
    state.loading = false;
  }
}

async function fetchCloudJournals() {
  const { data: journals, error: journalsError } = await db
    .from("journals")
    .select("*")
    .order("updated_at", { ascending: false });

  if (journalsError) throw journalsError;
  if (!journals.length) return [];

  const journalIds = journals.map((journal) => journal.id);
  const { data: entries, error: entriesError } = await db
    .from("entries")
    .select("*")
    .in("journal_id", journalIds)
    .order("entry_date", { ascending: false });

  if (entriesError) throw entriesError;

  return journals.map((journal) => fromCloudJournal(journal, entries || []));
}

async function importLocalJournals(localJournals) {
  const imported = [];

  for (const journal of localJournals) {
    await saveJournalToCloud(journal);
    for (const entry of journal.entries) {
      await saveEntryToCloud(journal, entry);
    }
    imported.push(journal);
  }

  return imported;
}

function renderAuth() {
  const signedIn = Boolean(state.user);
  const username = signedIn ? emailToUsername(state.user.email) : "";
  els.accountPill.textContent = signedIn ? username : "Not signed in";
  els.authStatus.textContent = state.authMessage || (signedIn
    ? `Signed in as ${username}.`
    : "Sign in with a username to save journals across devices.");
  els.signInButton.classList.toggle("hidden", signedIn);
  els.signUpButton.classList.toggle("hidden", signedIn);
  els.signOutButton.classList.toggle("hidden", !signedIn);
  els.authUsername.classList.toggle("hidden", signedIn);
  els.authPassword.classList.toggle("hidden", signedIn);
}

function setAuthStatus(message) {
  state.authMessage = message;
  els.authStatus.textContent = message;
}

function showSection(sectionName) {
  els.tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.section === sectionName);
  });

  Object.entries(els.sections).forEach(([name, section]) => {
    section.classList.toggle("active", name === sectionName);
  });
}

async function createJournal() {
  const name = els.journalNameInput.value.trim() || `Journal ${state.journals.length + 1}`;
  const journal = createJournalRecord(name);
  state.journals.unshift(journal);
  state.activeJournalId = journal.id;
  const draft = await createDraft(false);
  state.activeEntryId = draft.id;
  els.journalNameInput.value = "";
  await persistJournal(journal);
  render();
  selectEntry(state.activeEntryId);
}

async function deleteActiveJournal() {
  const journal = getActiveJournal();
  if (!journal) return;

  const confirmed = window.confirm(`Delete "${journal.name}" and all of its entries?`);
  if (!confirmed) return;

  state.journals = state.journals.filter((item) => item.id !== journal.id);
  if (state.user) {
    await db.from("journals").delete().eq("id", journal.id);
  }

  if (!state.journals.length) {
    const fallback = createJournalRecord("Journal");
    state.journals.push(fallback);
    await persistJournal(fallback);
  } else {
    persistLocal();
  }

  state.activeJournalId = state.journals[0].id;
  ensureActiveEntry();
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
    updatedAt: now,
    streak: 0,
    lastStreakDate: ""
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
    persistLocal();
  }
  state.activeEntryId = journal.entries[0].id;
}

async function createDraft(userCreated = false) {
  const journal = getActiveJournal();
  const draft = makeEntry();
  draft.userCreated = userCreated;
  journal.entries.unshift(draft);
  journal.updatedAt = draft.updatedAt;
  await persistEntry(journal, draft);
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
    updatedAt: now,
    savedAt: null,
    userCreated: false
  };
}

function selectEntry(id) {
  const entry = getActiveEntries().find((item) => item.id === id);
  if (!entry) return;

  state.activeEntryId = id;
  els.entryTitle.value = entry.title;
  els.entryDate.value = entry.date || toInputDate(entry.updatedAt);
  els.entryBody.value = entry.body;
  els.tagInput.value = entry.tags.join(", ");
  renderEntryList();
}

async function saveActiveEntry() {
  const journal = getActiveJournal();
  const entry = getActiveEntries().find((item) => item.id === state.activeEntryId);
  if (!journal || !entry) return;

  const shouldAdvanceStreak = !entry.savedAt && entry.userCreated;

  entry.title = els.entryTitle.value.trim();
  entry.date = els.entryDate.value || toInputDate(new Date());
  entry.body = els.entryBody.value.trim();
  entry.tags = els.tagInput.value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  entry.updatedAt = new Date().toISOString();
  entry.savedAt = entry.savedAt || entry.updatedAt;
  entry.userCreated = false;

  if (shouldAdvanceStreak) {
    updateJournalStreak(journal, toInputDate(entry.updatedAt));
  }

  journal.entries = sortEntries(journal.entries);
  journal.updatedAt = entry.updatedAt;
  state.journals = sortJournals(state.journals);
  await persistJournal(journal);
  await persistEntry(journal, entry);
  render();
  selectEntry(entry.id);
}

async function deleteActiveEntry() {
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
    only.savedAt = null;
    only.userCreated = false;
    journal.updatedAt = only.updatedAt;
    await persistJournal(journal);
    await persistEntry(journal, only);
    render();
    selectEntry(only.id);
    return;
  }

  const index = journal.entries.findIndex((item) => item.id === state.activeEntryId);
  journal.entries = journal.entries.filter((item) => item.id !== state.activeEntryId);
  journal.updatedAt = new Date().toISOString();
  if (state.user) {
    await db.from("entries").delete().eq("id", entry.id);
    await saveJournalToCloud(journal);
  } else {
    persistLocal();
  }

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
  els.streakCount.textContent = getActiveJournal()?.streak || 0;
}

function renderEntryList() {
  const query = els.searchInput.value.trim().toLowerCase();
  const matches = getActiveEntries().filter((entry) => {
    const haystack = [entry.title, entry.date, entry.body, ...entry.tags].join(" ").toLowerCase();
    return haystack.includes(query);
  });

  els.entryList.replaceChildren();

  if (!matches.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = state.loading ? "Loading entries." : "No matching entries.";
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
      return `${entry.title || "Untitled entry"}\nDate: ${entry.date || ""}\n${tags}\n${entry.body}`;
    })
    .join("\n\n---\n\n");

  const blob = new Blob([lines || journal.name], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slugify(journal.name)}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

async function persistJournal(journal) {
  if (state.user) {
    await saveJournalToCloud(journal);
  } else {
    persistLocal();
  }
}

async function persistEntry(journal, entry) {
  if (state.user) {
    await saveJournalToCloud(journal);
    await saveEntryToCloud(journal, entry);
  } else {
    persistLocal();
  }
}

function persistLocal() {
  if (!state.user) {
    localStorage.setItem(journalsKey, JSON.stringify(state.journals));
  }
}

async function saveJournalToCloud(journal) {
  const { error } = await db.from("journals").upsert(toCloudJournal(journal));
  if (error) throw error;
}

async function saveEntryToCloud(journal, entry) {
  const { error } = await db.from("entries").upsert(toCloudEntry(journal, entry));
  if (error) throw error;
}

function loadLocalJournals() {
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
    updatedAt: journal.updatedAt || journal.entries?.[0]?.updatedAt || new Date().toISOString(),
    streak: Number.isInteger(journal.streak) ? journal.streak : 0,
    lastStreakDate: journal.lastStreakDate || ""
  };
}

function normalizeEntry(entry) {
  const now = new Date().toISOString();
  return {
    id: entry.id || crypto.randomUUID(),
    title: entry.title || "",
    body: stripHtml(entry.body || ""),
    date: entry.date || toInputDate(entry.updatedAt || entry.createdAt || now),
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    createdAt: entry.createdAt || now,
    updatedAt: entry.updatedAt || now,
    savedAt: entry.savedAt || (entry.title || entry.body ? entry.updatedAt || now : null),
    userCreated: Boolean(entry.userCreated)
  };
}

function fromCloudJournal(journal, entries) {
  return {
    id: journal.id,
    name: journal.name || "Journal",
    createdAt: journal.created_at,
    updatedAt: journal.updated_at,
    streak: journal.streak || 0,
    lastStreakDate: journal.last_streak_date || "",
    entries: sortEntries(entries.filter((entry) => entry.journal_id === journal.id).map(fromCloudEntry))
  };
}

function fromCloudEntry(entry) {
  return {
    id: entry.id,
    title: entry.title || "",
    body: entry.body || "",
    date: entry.entry_date || toInputDate(entry.updated_at || entry.created_at),
    tags: entry.tags || [],
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
    savedAt: entry.saved_at,
    userCreated: Boolean(entry.user_created)
  };
}

function toCloudJournal(journal) {
  return {
    id: journal.id,
    user_id: state.user.id,
    name: journal.name,
    streak: journal.streak || 0,
    last_streak_date: journal.lastStreakDate || null,
    created_at: journal.createdAt,
    updated_at: journal.updatedAt
  };
}

function toCloudEntry(journal, entry) {
  return {
    id: entry.id,
    journal_id: journal.id,
    user_id: state.user.id,
    title: entry.title,
    body: entry.body,
    entry_date: entry.date,
    tags: entry.tags,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
    saved_at: entry.savedAt,
    user_created: entry.userCreated
  };
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

function getEntryMeta(entry) {
  return entry.tags.join(", ");
}

function updateJournalStreak(journal, savedDate) {
  if (journal.lastStreakDate === savedDate) return;

  const yesterday = offsetInputDate(savedDate, -1);
  journal.streak = journal.lastStreakDate === yesterday ? (journal.streak || 0) + 1 : 1;
  journal.lastStreakDate = savedDate;
}

function stripHtml(value) {
  if (!/<\/?[a-z][\s\S]*>/i.test(value || "")) return value || "";

  const template = document.createElement("template");
  template.innerHTML = value;
  return template.content.textContent || "";
}

function normalizeUsername(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
}

function usernameToEmail(username) {
  return `${username}@stillpoint.local`;
}

function emailToUsername(email) {
  return (email || "").split("@")[0] || "account";
}

function toInputDate(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function offsetInputDate(date, days) {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);
  return toInputDate(value);
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
