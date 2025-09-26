 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/README.md b/README.md
index a0292254c13c1b0d3fdfedf0f57c2819ddbf264a..ea720cf73ac8cea1836844accf6404792a9acc9a 100644
--- a/README.md
+++ b/README.md
@@ -1,2 +1,49 @@
-# Codex
-A playground repo for building Khal's Zones of Regulation web app.
+# Khal Zones Tracker
+
+A kid-friendly, offline-ready web app to help Khal identify and log his Zone of Regulation right from an iPad. The entire app is client-side and saves data in the browser using `localStorage`.
+
+## Getting started
+
+1. Download this project.
+2. Double-click `index.html` (or open it in any modern desktop/mobile browser). No build step or server is required.
+
+## Using the app
+
+### Log a zone
+
+* Tap one of the large zone cards to instantly log how you are feeling.
+* An optional note pop-up appears—type a short note and press **Save note**, or choose **Skip** to dismiss it.
+* Notes can be up to 120 characters and attach to the entry you just logged.
+
+### Teacher view
+
+* Tap **Teacher View** to reveal the history table, filters, and data tools.
+* Filters allow you to narrow the history by date range (today, this week, all time, or a custom range) and by zone color.
+* Use the checkboxes in the table to select entries for deletion.
+
+### Export & delete
+
+* **Export CSV** downloads the currently filtered log as `khal-zones-YYYY-MM-DD.csv` with columns `timestamp,localDateTime,zone,note`.
+* **Delete selected** removes the checked entries from the table and storage.
+* **Clear all data** empties the entire log after confirming. This cannot be undone.
+
+## Data storage
+
+Entries are saved as a JSON array under the `localStorage` key `khalZonesLog`. Each entry looks like:
+
+```json
+{
+  "timestamp": "2025-09-26T14:32:10.123Z",
+  "zone": "green",
+  "note": "Recess went well"
+}
+```
+
+Because data lives in the browser, refreshing or reopening the page keeps the log intact. Clearing browser storage or opening the page in a different browser/device starts with a fresh log.
+
+## File overview
+
+* `index.html` – Single-page layout with zone cards, today summary, and teacher tools.
+* `styles.css` – Touch-friendly styling, color tokens, dark-mode support, and responsive layout.
+* `app.js` – Handles storage, logging, filtering, exporting, and accessibility helpers.
+* `README.md` – This file.
 
EOF
)
