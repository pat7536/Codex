# PantryPal AI

PantryPal AI is a single-page web app that helps you discover what to cook. Generate recipes with a quick prompt, scan pantry photos for ingredient suggestions, and save favourites for later. When you sign in with Google, your saved recipes sync across every device.

## Features
- **AI-inspired recipes:** Craft detailed dishes from a handful of ingredients, moods, cuisines, or meal types.
- **Pantry scanning:** Use MobileNet to identify ingredients from a photo and instantly load tailored recipe ideas.
- **Saved library:** Keep a personal cookbook that works offline with local storage and optionally syncs through Firebase when signed in with Google.
- **Responsive UI:** Optimised layout for phones, tablets, and desktops with dark-mode support.

## Getting started
1. Download or clone this repository.
2. Open `index.html` in any modern desktop or mobile browser. No build step is required.

## Enable Google sign-in sync
To sync the recipe library across devices you need a Firebase project:

1. Create a Firebase project and register a web app.
2. Enable the **Google** provider under **Build → Authentication → Sign-in method**.
3. Enable **Cloud Firestore** (production or test mode works).
4. Copy your Firebase web app configuration and either replace **every** placeholder value inside `index.html` where `window.PANTRYPAL_FIREBASE_CONFIG` is defined **or** click the **Configure Firebase** button in the account bar. In the modal you can paste the full `const firebaseConfig = { ... }` snippet to auto-fill the fields (or type each value manually). The form stores them in your browser (local storage) so you can keep private keys out of the repository.
5. Run the app from an `http://` or `https://` origin—Firebase blocks Google sign-in on `file://` URLs. The quickest path is `npx serve` (or any static file server) from the project folder and then visiting `http://localhost:3000`.
6. Add each domain you use to open PantryPal (including `localhost` for local testing) under **Authentication → Settings → Authorized domains** so the Google popup or redirect is allowed to load.
7. Reload the app. The "Sign in with Google" button should now start the sign-in flow and recipes will sync via Firestore. If something still fails, the app surfaces a helpful error explaining what to fix, and you can revisit the **Configure Firebase** dialog to update or clear saved credentials.

When no Firebase configuration is supplied, PantryPal falls back to storing recipes locally so the experience still works offline.

## Project structure
- `index.html` – Application markup, hero sections, and Firebase configuration placeholder.
- `styles.css` – Visual theme, layout, responsive grid, and account bar styling.
- `app.js` – Recipe generator logic, pantry scanning, local storage, and Firebase authentication/Firestore sync.

## License
This project is provided as-is for demo purposes.
