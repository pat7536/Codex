 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a//dev/null b/app.js
index 0000000000000000000000000000000000000000..bd5d52ddd1b1e7628ef07be2165f1bd5fef55f1d 100644
--- a//dev/null
+++ b/app.js
@@ -0,0 +1,389 @@
+(function () {
+  const STORAGE_KEY = 'khalZonesLog';
+  const zoneDetails = {
+    blue: { label: 'Blue', description: 'Sad / Tired', emoji: '🟦' },
+    green: { label: 'Green', description: 'Ready to Learn', emoji: '🟩' },
+    yellow: { label: 'Yellow', description: 'Worried / Excited', emoji: '🟨' },
+    red: { label: 'Red', description: 'Angry / Out of Control', emoji: '🟥' }
+  };
+
+  const zoneButtons = document.querySelectorAll('.zone-card');
+  const todayCountsEl = document.getElementById('todayCounts');
+  const timelineEl = document.getElementById('timeline');
+  const historyBody = document.getElementById('historyBody');
+  const teacherToggle = document.getElementById('teacherToggle');
+  const teacherPanel = document.getElementById('teacherPanel');
+  const dateFilter = document.getElementById('dateFilter');
+  const customDateInputs = document.getElementById('customDateInputs');
+  const startDateInput = document.getElementById('startDate');
+  const endDateInput = document.getElementById('endDate');
+  const zoneFilterInputs = Array.from(document.querySelectorAll('input[name="zoneFilter"]'));
+  const exportButton = document.getElementById('exportCsv');
+  const deleteSelectedButton = document.getElementById('deleteSelected');
+  const clearAllButton = document.getElementById('clearAll');
+  const noteModal = document.getElementById('noteModal');
+  const noteForm = document.getElementById('noteForm');
+  const noteTextarea = document.getElementById('noteText');
+  const skipNoteButton = document.getElementById('skipNote');
+  const liveRegion = document.getElementById('liveRegion');
+
+  let entries = loadEntries();
+  let pendingTimestamp = null;
+
+  zoneButtons.forEach((button) => {
+    button.addEventListener('click', () => {
+      const zone = button.dataset.zone;
+      const entry = addEntry(zone, '');
+      pendingTimestamp = entry.timestamp;
+      announce(`Logged ${zoneDetails[zone].label} at ${formatLocalTime(entry.timestamp)}.`);
+      openModal();
+    });
+  });
+
+  teacherToggle.addEventListener('click', () => {
+    const isActive = document.body.classList.toggle('teacher-mode');
+    teacherToggle.setAttribute('aria-pressed', String(isActive));
+    teacherToggle.textContent = isActive ? '🙈 Hide Teacher View' : '👩‍🏫 Teacher View';
+    if (isActive) {
+      teacherToggle.setAttribute('aria-expanded', 'true');
+      if (teacherPanel && typeof teacherPanel.focus === 'function') {
+        teacherPanel.focus();
+      }
+    } else {
+      teacherToggle.setAttribute('aria-expanded', 'false');
+    }
+  });
+
+  dateFilter.addEventListener('change', () => {
+    const isCustom = dateFilter.value === 'custom';
+    customDateInputs.style.display = isCustom ? 'flex' : 'none';
+    renderHistory();
+  });
+
+  [startDateInput, endDateInput].forEach((input) => {
+    input.addEventListener('change', renderHistory);
+  });
+
+  zoneFilterInputs.forEach((input) => {
+    input.addEventListener('change', renderHistory);
+  });
+
+  exportButton.addEventListener('click', () => {
+    const filtered = getFilteredEntries();
+    if (!filtered.length) {
+      alert('No entries to export for the selected filters.');
+      return;
+    }
+    const csv = buildCsv(filtered);
+    const today = new Date();
+    const filename = `khal-zones-${today.toISOString().slice(0, 10)}.csv`;
+    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
+    const url = URL.createObjectURL(blob);
+    const link = document.createElement('a');
+    link.href = url;
+    link.download = filename;
+    document.body.appendChild(link);
+    link.click();
+    document.body.removeChild(link);
+    URL.revokeObjectURL(url);
+  });
+
+  deleteSelectedButton.addEventListener('click', () => {
+    const checkboxes = historyBody.querySelectorAll('input[type="checkbox"][data-timestamp]:checked');
+    const timestamps = Array.from(checkboxes).map((cb) => cb.dataset.timestamp);
+    if (!timestamps.length) {
+      alert('Select at least one entry to delete.');
+      return;
+    }
+    if (!confirm(`Delete ${timestamps.length} selected entr${timestamps.length === 1 ? 'y' : 'ies'}?`)) {
+      return;
+    }
+    deleteEntries(timestamps);
+  });
+
+  clearAllButton.addEventListener('click', () => {
+    if (!entries.length) {
+      alert('Nothing to clear!');
+      return;
+    }
+    if (confirm('Clear all saved data? This cannot be undone.')) {
+      clearAll();
+    }
+  });
+
+  noteForm.addEventListener('submit', (event) => {
+    event.preventDefault();
+    if (!pendingTimestamp) {
+      closeModal();
+      return;
+    }
+    const note = noteTextarea.value.trim();
+    if (note) {
+      updateEntryNote(pendingTimestamp, note);
+    }
+    closeModal();
+  });
+
+  skipNoteButton.addEventListener('click', () => {
+    closeModal();
+  });
+
+  document.addEventListener('keydown', (event) => {
+    if (event.key === 'Escape' && !noteModal.classList.contains('hidden')) {
+      closeModal();
+    }
+  });
+
+  noteModal.addEventListener('click', (event) => {
+    if (event.target === noteModal) {
+      closeModal();
+    }
+  });
+
+  renderAll();
+
+  function loadEntries() {
+    try {
+      const raw = localStorage.getItem(STORAGE_KEY);
+      if (!raw) return [];
+      const parsed = JSON.parse(raw);
+      if (!Array.isArray(parsed)) return [];
+      return parsed.filter((entry) => entry && entry.timestamp && entry.zone);
+    } catch (error) {
+      console.warn('Could not load entries:', error);
+      return [];
+    }
+  }
+
+  function saveEntries() {
+    try {
+      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
+    } catch (error) {
+      console.warn('Could not save entries:', error);
+    }
+  }
+
+  function addEntry(zone, note = '') {
+    const timestamp = new Date().toISOString();
+    const entry = { timestamp, zone, note };
+    entries.push(entry);
+    saveEntries();
+    renderAll();
+    return entry;
+  }
+
+  function updateEntryNote(timestamp, note) {
+    const entry = entries.find((item) => item.timestamp === timestamp);
+    if (entry) {
+      entry.note = note;
+      saveEntries();
+      renderAll();
+    }
+  }
+
+  function deleteEntries(timestamps) {
+    entries = entries.filter((entry) => !timestamps.includes(entry.timestamp));
+    saveEntries();
+    renderAll();
+  }
+
+  function clearAll() {
+    entries = [];
+    saveEntries();
+    renderAll();
+  }
+
+  function renderAll() {
+    renderTodaySummary();
+    renderHistory();
+  }
+
+  function renderTodaySummary() {
+    const todayEntries = entries.filter((entry) => isSameDay(new Date(entry.timestamp), new Date()));
+    const counts = {
+      blue: 0,
+      green: 0,
+      yellow: 0,
+      red: 0
+    };
+    todayEntries.forEach((entry) => {
+      if (counts[entry.zone] !== undefined) {
+        counts[entry.zone] += 1;
+      }
+    });
+
+    todayCountsEl.innerHTML = '';
+    Object.keys(counts).forEach((zone) => {
+      const chip = document.createElement('div');
+      chip.className = 'count-chip';
+      chip.dataset.zone = zone;
+      chip.setAttribute('role', 'listitem');
+      chip.innerHTML = `<span>${zoneDetails[zone].emoji}</span><span>${zoneDetails[zone].label}: ${counts[zone]}</span>`;
+      todayCountsEl.appendChild(chip);
+    });
+
+    timelineEl.innerHTML = '';
+    todayEntries
+      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
+      .forEach((entry) => {
+        const chip = document.createElement('div');
+        chip.className = 'timeline-chip';
+        chip.dataset.zone = entry.zone;
+        chip.setAttribute('role', 'listitem');
+        chip.innerHTML = `<span>${zoneDetails[entry.zone].emoji}</span><span>${formatLocalTime(entry.timestamp)}</span>`;
+        timelineEl.appendChild(chip);
+      });
+  }
+
+  function renderHistory() {
+    const filtered = getFilteredEntries();
+    historyBody.innerHTML = '';
+
+    if (!filtered.length) {
+      const row = document.createElement('tr');
+      const cell = document.createElement('td');
+      cell.colSpan = 4;
+      cell.textContent = 'No entries yet.';
+      row.appendChild(cell);
+      historyBody.appendChild(row);
+      return;
+    }
+
+    filtered.forEach((entry) => {
+      const row = document.createElement('tr');
+      const selectCell = document.createElement('td');
+      selectCell.className = 'select-col';
+      const checkbox = document.createElement('input');
+      checkbox.type = 'checkbox';
+      checkbox.dataset.timestamp = entry.timestamp;
+      checkbox.setAttribute('aria-label', `Select entry from ${formatLocalDateTime(entry.timestamp)}`);
+      selectCell.appendChild(checkbox);
+
+      const dateCell = document.createElement('td');
+      dateCell.textContent = formatLocalDateTime(entry.timestamp);
+
+      const zoneCell = document.createElement('td');
+      const chip = document.createElement('span');
+      chip.className = 'zone-chip';
+      chip.dataset.zone = entry.zone;
+      chip.innerHTML = `<span aria-hidden="true">${zoneDetails[entry.zone].emoji}</span><span>${zoneDetails[entry.zone].label}</span>`;
+      zoneCell.appendChild(chip);
+
+      const noteCell = document.createElement('td');
+      noteCell.textContent = entry.note || '—';
+
+      row.appendChild(selectCell);
+      row.appendChild(dateCell);
+      row.appendChild(zoneCell);
+      row.appendChild(noteCell);
+      historyBody.appendChild(row);
+    });
+  }
+
+  function getFilteredEntries() {
+    let filtered = [...entries];
+    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
+
+    const selectedZones = zoneFilterInputs.filter((input) => input.checked).map((input) => input.value);
+    if (selectedZones.length && selectedZones.length < zoneFilterInputs.length) {
+      filtered = filtered.filter((entry) => selectedZones.includes(entry.zone));
+    }
+
+    const now = new Date();
+    if (dateFilter.value === 'today') {
+      filtered = filtered.filter((entry) => isSameDay(new Date(entry.timestamp), now));
+    } else if (dateFilter.value === 'week') {
+      filtered = filtered.filter((entry) => isSameWeek(new Date(entry.timestamp), now));
+    } else if (dateFilter.value === 'custom') {
+      const start = startDateInput.value ? new Date(startDateInput.value) : null;
+      const end = endDateInput.value ? endOfDay(new Date(endDateInput.value)) : null;
+      filtered = filtered.filter((entry) => {
+        const date = new Date(entry.timestamp);
+        if (start && date < start) return false;
+        if (end && date > end) return false;
+        return true;
+      });
+    }
+
+    return filtered;
+  }
+
+  function buildCsv(data) {
+    const header = ['timestamp', 'localDateTime', 'zone', 'note'];
+    const rows = data.map((entry) => [
+      entry.timestamp,
+      escapeCsv(formatLocalDateTime(entry.timestamp)),
+      entry.zone,
+      escapeCsv(entry.note || '')
+    ]);
+    return [header.join(','), ...rows.map((row) => row.join(','))].join('\n');
+  }
+
+  function escapeCsv(value) {
+    if (value.includes('"') || value.includes(',') || value.includes('\n')) {
+      return '"' + value.replace(/"/g, '""') + '"';
+    }
+    return value;
+  }
+
+  function formatLocalTime(timestamp) {
+    const date = new Date(timestamp);
+    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
+  }
+
+  function formatLocalDateTime(timestamp) {
+    const date = new Date(timestamp);
+    return date.toLocaleString([], {
+      year: 'numeric',
+      month: 'short',
+      day: 'numeric',
+      hour: 'numeric',
+      minute: '2-digit'
+    });
+  }
+
+  function isSameDay(a, b) {
+    return (
+      a.getFullYear() === b.getFullYear() &&
+      a.getMonth() === b.getMonth() &&
+      a.getDate() === b.getDate()
+    );
+  }
+
+  function isSameWeek(date, reference) {
+    const startOfWeek = new Date(reference);
+    startOfWeek.setHours(0, 0, 0, 0);
+    const day = startOfWeek.getDay();
+    startOfWeek.setDate(startOfWeek.getDate() - day);
+
+    const endOfWeek = new Date(startOfWeek);
+    endOfWeek.setDate(endOfWeek.getDate() + 7);
+
+    return date >= startOfWeek && date < endOfWeek;
+  }
+
+  function endOfDay(date) {
+    const end = new Date(date);
+    end.setHours(23, 59, 59, 999);
+    return end;
+  }
+
+  function openModal() {
+    noteModal.classList.remove('hidden');
+    noteTextarea.value = '';
+    noteTextarea.focus();
+  }
+
+  function closeModal() {
+    noteModal.classList.add('hidden');
+    noteTextarea.value = '';
+    pendingTimestamp = null;
+  }
+
+  function announce(message) {
+    liveRegion.textContent = '';
+    setTimeout(() => {
+      liveRegion.textContent = message;
+    }, 50);
+  }
+})();
 
EOF
)
