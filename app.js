(() => {
  const STORAGE_KEY = 'pantryPal.savedRecipes.v1';

  const recipeForm = document.getElementById('recipeForm');
  const recipeResult = document.getElementById('recipeResult');
  const resultTitle = document.getElementById('resultTitle');
  const resultDescription = document.getElementById('resultDescription');
  const resultIngredients = document.getElementById('resultIngredients');
  const resultSteps = document.getElementById('resultSteps');
  const resultTip = document.getElementById('resultTip');
  const saveRecipeButton = document.getElementById('saveRecipe');

  const accountPanel = document.getElementById('accountPanel');
  const authStatus = document.getElementById('authStatus');
  const accountName = document.getElementById('accountName');
  const signInButton = document.getElementById('signInButton');
  const signOutButton = document.getElementById('signOutButton');

  const pantryInput = document.getElementById('pantryInput');
  const previewContainer = document.getElementById('imagePreview');
  const previewImage = document.getElementById('previewImage');
  const scanButton = document.getElementById('scanButton');
  const scanStatus = document.getElementById('scanStatus');
  const recognizedContainer = document.getElementById('recognizedIngredients');
  const pantrySuggestions = document.getElementById('pantrySuggestions');
  const suggestionList = document.getElementById('suggestionList');

  const libraryList = document.getElementById('savedRecipes');
  const emptyLibrary = document.getElementById('emptyLibrary');
  const clearLibraryButton = document.getElementById('clearLibrary');
  const libraryStatus = document.getElementById('libraryStatus');
  const libraryDescription = document.getElementById('libraryDescription');

  let lastGeneratedRecipe = null;
  let mobilenetModel = null;
  let currentObjectUrl = null;

  const savedRecipes = [];
  let firebaseReady = false;
  let currentUser = null;
  let auth = null;
  let firestore = null;
  let unsubscribeFromCloud = null;
  let initialRemoteSyncComplete = false;
  let authStatusOverride = null;
  let authStatusOverrideTimer = null;

  setSavedRecipes(loadSavedRecipes());
  setupAuth();

  recipeForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(recipeForm);
    const data = {
      ingredients: formData.get('ingredients') || '',
      diet: formData.get('diet') || 'omnivore',
      mealType: formData.get('mealType') || 'dinner',
      cuisine: formData.get('cuisine') || 'fusion',
      mood: formData.get('mood') || ''
    };

    const recipe = buildRecipe(data);
    lastGeneratedRecipe = recipe;
    displayRecipe(recipe);
    saveRecipeButton.disabled = false;
  });

  saveRecipeButton.addEventListener('click', async () => {
    if (!lastGeneratedRecipe) return;
    const recipeToSave = {
      ...lastGeneratedRecipe,
      id: lastGeneratedRecipe.id || crypto.randomUUID?.() || String(Date.now()),
      createdAt: lastGeneratedRecipe.createdAt || Date.now()
    };

    saveRecipeButton.disabled = true;
    const originalLabel = saveRecipeButton.textContent;
    saveRecipeButton.textContent = 'Saving…';

    try {
      if (isCloudSyncActive()) {
        await saveRecipeToCloud(recipeToSave);
      } else {
        saveRecipeLocally(recipeToSave);
      }
      lastGeneratedRecipe = { ...recipeToSave };
      saveRecipeButton.textContent = 'Saved!';
      setTimeout(() => {
        saveRecipeButton.textContent = originalLabel;
        saveRecipeButton.disabled = false;
      }, 1800);
    } catch (error) {
      console.error('Failed to save recipe', error);
      saveRecipeButton.textContent = 'Failed — try again';
      setTimeout(() => {
        saveRecipeButton.textContent = originalLabel;
        saveRecipeButton.disabled = false;
      }, 2200);
    }
  });

  clearLibraryButton.addEventListener('click', async () => {
    if (!savedRecipes.length) {
      clearLibraryButton.textContent = 'Library already empty';
      setTimeout(() => {
        clearLibraryButton.textContent = 'Clear library';
      }, 1500);
      return;
    }

    if (confirm('Remove all saved recipes from your library?')) {
      clearLibraryButton.disabled = true;
      const originalLabel = clearLibraryButton.textContent;
      clearLibraryButton.textContent = 'Clearing…';
      try {
        if (isCloudSyncActive()) {
          await clearCloudLibrary();
        } else {
          savedRecipes.splice(0, savedRecipes.length);
          persistRecipes();
          renderSavedRecipes();
        }
        clearLibraryButton.textContent = 'Library cleared';
      } catch (error) {
        console.error('Failed to clear library', error);
        clearLibraryButton.textContent = 'Failed — try again';
      }

      setTimeout(() => {
        clearLibraryButton.textContent = originalLabel;
        clearLibraryButton.disabled = false;
      }, 2000);
    }
  });

  pantryInput.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
    }

    currentObjectUrl = URL.createObjectURL(file);
    previewImage.src = currentObjectUrl;
    previewImage.onload = () => {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    };
    previewContainer.hidden = false;
    scanStatus.textContent = 'Ready to scan';
  });

  scanButton.addEventListener('click', async () => {
    if (!previewImage.src) {
      scanStatus.textContent = 'Upload an image first.';
      return;
    }

    scanStatus.textContent = mobilenetModel ? 'Analyzing pantry…' : 'Loading AI model…';
    recognizedContainer.innerHTML = '';
    recognizedContainer.hidden = true;
    pantrySuggestions.hidden = true;

    try {
      await ensureModel();
      scanStatus.textContent = 'Analyzing pantry…';
      await tf.nextFrame();
      const predictions = await mobilenetModel.classify(previewImage, 5);
      const ingredients = translatePredictions(predictions);
      if (!ingredients.length) {
        scanStatus.textContent = "We couldn't confidently recognise ingredients. Try a clearer photo.";
        return;
      }

      renderRecognisedIngredients(ingredients);
      scanStatus.textContent = 'Here is what we spotted!';
      renderSuggestionsFromIngredients(ingredients);
    } catch (error) {
      console.error(error);
      scanStatus.textContent = 'Something went wrong while scanning. Try again.';
    }
  });

  suggestionList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-recipe]');
    if (!button) return;
    const payload = button.dataset.recipe;
    try {
      const recipe = JSON.parse(payload);
      lastGeneratedRecipe = recipe;
      displayRecipe(recipe);
      recipeForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
      saveRecipeButton.disabled = false;
    } catch (error) {
      console.error('Failed to load suggested recipe', error);
    }
  });

  libraryList.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-remove]');
    if (!button) return;
    const id = button.dataset.remove;
    try {
      if (isCloudSyncActive()) {
        await removeRecipeFromCloud(id);
      } else {
        const index = savedRecipes.findIndex((entry) => entry.id === id);
        if (index >= 0) {
          savedRecipes.splice(index, 1);
          persistRecipes();
          renderSavedRecipes();
        }
      }
    } catch (error) {
      console.error('Failed to remove recipe', error);
    }
  });

  function setSavedRecipes(list, options = {}) {
    const { persist = true } = options;
    const incoming = Array.isArray(list) ? list : [];
    const sorted = [...incoming].sort((a, b) => (b?.createdAt || 0) - (a?.createdAt || 0));
    savedRecipes.splice(0, savedRecipes.length, ...sorted);
    renderSavedRecipes();
    if (persist) {
      persistRecipes();
    }
  }

  function renderSavedRecipes() {
    libraryList.innerHTML = '';
    if (!savedRecipes.length) {
      emptyLibrary.hidden = false;
      return;
    }

    emptyLibrary.hidden = true;
    savedRecipes.forEach((recipe) => {
      const article = document.createElement('article');
      article.className = 'saved-recipe';

      const header = document.createElement('div');
      header.className = 'saved-recipe-header';

      const title = document.createElement('h3');
      title.textContent = recipe.title;

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.dataset.remove = recipe.id;
      removeButton.textContent = 'Remove';

      header.append(title, removeButton);

      const description = document.createElement('p');
      description.textContent = recipe.description;

      const ingredientsList = document.createElement('ul');
      recipe.ingredients.forEach((item) => {
        const li = document.createElement('li');
        li.textContent = item;
        ingredientsList.appendChild(li);
      });

      const stepsList = document.createElement('ol');
      recipe.steps.forEach((step) => {
        const li = document.createElement('li');
        li.textContent = step;
        stepsList.appendChild(li);
      });

      const tip = document.createElement('p');
      tip.className = 'tip';
      tip.textContent = recipe.tip;

      article.append(header, description, ingredientsList, stepsList, tip);
      libraryList.appendChild(article);
    });
  }

  function displayRecipe(recipe) {
    resultTitle.textContent = recipe.title;
    resultDescription.textContent = recipe.description;

    resultIngredients.innerHTML = '';
    recipe.ingredients.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      resultIngredients.appendChild(li);
    });

    resultSteps.innerHTML = '';
    recipe.steps.forEach((step) => {
      const li = document.createElement('li');
      li.textContent = step;
      resultSteps.appendChild(li);
    });

    resultTip.textContent = recipe.tip;
    recipeResult.hidden = false;
  }

  function renderRecognisedIngredients(ingredients) {
    recognizedContainer.innerHTML = '<h3>Detected ingredients</h3>';
    ingredients.forEach((ingredient) => {
      const span = document.createElement('span');
      span.className = 'ingredient-chip';
      span.textContent = ingredient;
      recognizedContainer.appendChild(span);
    });
    recognizedContainer.hidden = false;
  }

  function renderSuggestionsFromIngredients(ingredients) {
    suggestionList.innerHTML = '';
    const baseSeed = Date.now();
    const generated = [0, 1].map((offset) =>
      buildRecipe(
        {
          ingredients: ingredients.join(', '),
          diet: 'omnivore',
          mealType: 'dinner',
          cuisine: 'fusion',
          mood: 'resourceful weeknight'
        },
        { seed: baseSeed + offset * 177 }
      )
    );

    generated.forEach((recipe) => {
      const card = document.createElement('div');
      card.className = 'suggestion-card';

      const title = document.createElement('h4');
      title.textContent = recipe.title;
      const body = document.createElement('p');
      body.textContent = recipe.description;

      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'secondary';
      action.dataset.recipe = JSON.stringify(recipe);
      action.textContent = 'Load this recipe';

      card.append(title, body, action);
      suggestionList.appendChild(card);
    });

    pantrySuggestions.hidden = false;
  }

  function saveRecipeLocally(recipe) {
    savedRecipes.unshift({ ...recipe });
    setSavedRecipes(savedRecipes);
    updateLibraryStatus('Saved to this device', { transient: true });
  }

  async function saveRecipeToCloud(recipe) {
    if (!isCloudSyncActive()) return;
    const payload = { ...recipe };
    if (!payload.createdAt) payload.createdAt = Date.now();
    const docRef = firestore.collection('users').doc(currentUser.uid).collection('recipes').doc(payload.id);
    await docRef.set(payload, { merge: true });
    updateLibraryStatus('Saved to Google library', { transient: true });
  }

  async function removeRecipeFromCloud(id) {
    if (!isCloudSyncActive()) return;
    const docRef = firestore.collection('users').doc(currentUser.uid).collection('recipes').doc(id);
    await docRef.delete();
    updateLibraryStatus('Removed from Google library', { transient: true });
  }

  async function clearCloudLibrary() {
    if (!isCloudSyncActive()) return;
    const collectionRef = firestore.collection('users').doc(currentUser.uid).collection('recipes');
    const snapshot = await collectionRef.get();
    const batch = firestore.batch();
    snapshot.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    updateLibraryStatus('Cleared Google library', { transient: true });
  }

  function isCloudSyncActive() {
    return Boolean(firebaseReady && currentUser && firestore);
  }

  function updateLibraryStatus(message, options = {}) {
    if (!libraryStatus) return;
    if (!message) {
      libraryStatus.textContent = '';
      libraryStatus.hidden = true;
      return;
    }

    const { transient = false } = options;
    libraryStatus.hidden = false;
    libraryStatus.textContent = message;

    if (transient) {
      const stamp = Date.now().toString();
      libraryStatus.dataset.stamp = stamp;
      setTimeout(() => {
        if (libraryStatus.dataset.stamp === stamp) {
          libraryStatus.textContent = '';
          libraryStatus.hidden = true;
          delete libraryStatus.dataset.stamp;
        }
      }, 3200);
    }
  }

  function setupAuth() {
    if (!accountPanel) return;
    accountPanel.hidden = false;

    const firebaseConfig = window.PANTRYPAL_FIREBASE_CONFIG;

    if (!window.firebase || !hasValidFirebaseConfig(firebaseConfig)) {
      setAuthStatusOverride('Add your Firebase config to enable Google sync.', { tone: 'warning' });
      if (signInButton) {
        signInButton.disabled = true;
        signInButton.textContent = 'Google sync unavailable';
      }
      if (signOutButton) {
        signOutButton.hidden = true;
      }
      return;
    }

    try {
      firebase.initializeApp(firebaseConfig);
    } catch (error) {
      if (!/already exists/.test(error.message)) {
        console.error('Failed to initialise Firebase', error);
        setAuthStatusOverride('Google sync unavailable right now.', { tone: 'error' });
        return;
      }
    }

    firebaseReady = true;
    auth = firebase.auth();
    firestore = firebase.firestore();

    clearAuthStatusOverride();
    setAuthStatus('Sign in to sync your recipes across devices.', { tone: 'info' });
    if (signInButton) {
      signInButton.disabled = false;
      signInButton.hidden = false;
      signInButton.textContent = 'Sign in with Google';
      signInButton.addEventListener('click', handleSignIn);
    }
    if (signOutButton) {
      signOutButton.hidden = true;
      signOutButton.addEventListener('click', handleSignOut);
    }

    auth.onAuthStateChanged((user) => {
      currentUser = user;
      updateLibraryStatus(user ? 'Connected to Google — syncing…' : 'Browsing locally');

      if (unsubscribeFromCloud) {
        unsubscribeFromCloud();
        unsubscribeFromCloud = null;
      }

      if (user) {
        clearAuthStatusOverride();
        if (accountName) {
          accountName.textContent = user.displayName || user.email || 'Signed in';
          accountName.hidden = false;
        }
        if (signInButton) {
          signInButton.hidden = true;
        }
        if (signOutButton) {
          signOutButton.hidden = false;
        }
        setAuthStatus('Synced with Google', { tone: 'success' });
        if (libraryDescription) {
          libraryDescription.textContent = 'Your recipes sync automatically across your signed-in devices.';
        }
        initialRemoteSyncComplete = false;
        subscribeToCloudRecipes(user);
      } else {
        if (accountName) {
          accountName.hidden = true;
        }
        if (signInButton) {
          signInButton.hidden = false;
        }
        if (signOutButton) {
          signOutButton.hidden = true;
        }
        if (!hasActiveAuthStatusOverride()) {
          setAuthStatus('Connect Google to sync your library.', { tone: 'muted' });
        }
        if (libraryDescription) {
          libraryDescription.textContent = "Save favourites for weekly planning and sync them when you're signed in.";
        }
        setSavedRecipes(loadSavedRecipes());
        updateLibraryStatus('Browsing locally');
      }
    });
  }

  function subscribeToCloudRecipes(user) {
    if (!isCloudSyncActive()) return;

    const localSnapshot = loadSavedRecipes();
    let attemptedImport = false;
    updateLibraryStatus('Syncing recipes…');

    const collectionRef = firestore.collection('users').doc(user.uid).collection('recipes').orderBy('createdAt', 'desc');
    unsubscribeFromCloud = collectionRef.onSnapshot(
      (snapshot) => {
        const remoteRecipes = snapshot.docs.map((doc) => normaliseRecipeFromCloud(doc.data(), doc.id));

        if (!initialRemoteSyncComplete && !remoteRecipes.length && localSnapshot.length && !attemptedImport) {
          attemptedImport = true;
          uploadLocalRecipesToCloud(localSnapshot, firestore.collection('users').doc(user.uid).collection('recipes')).catch((error) => {
            console.error('Failed to import local recipes to cloud', error);
          });
          return;
        }

        initialRemoteSyncComplete = true;
        setSavedRecipes(remoteRecipes);
        updateLibraryStatus('Synced with Google');
      },
      (error) => {
        console.error('Failed to sync recipes', error);
        updateLibraryStatus('Unable to sync with Google right now.');
      }
    );
  }

  async function uploadLocalRecipesToCloud(recipes, collectionRef) {
    if (!isCloudSyncActive() || !Array.isArray(recipes) || !recipes.length) return;
    const batch = firestore.batch();
    recipes.forEach((recipe) => {
      const payload = { ...recipe };
      if (!payload.id) {
        payload.id = crypto.randomUUID?.() || String(Date.now());
      }
      if (!payload.createdAt) {
        payload.createdAt = Date.now();
      }
      const docRef = collectionRef.doc(payload.id);
      batch.set(docRef, payload, { merge: true });
    });
    await batch.commit();
  }

  function normaliseRecipeFromCloud(data, id) {
    const recipe = { id, ...data };
    recipe.ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
    recipe.steps = Array.isArray(recipe.steps) ? recipe.steps : [];
    if (!recipe.createdAt) {
      recipe.createdAt = Date.now();
    }
    return recipe;
  }

  async function handleSignIn() {
    if (!firebaseReady || !auth) {
      updateLibraryStatus('Google sync is not configured.');
      return;
    }

    clearAuthStatusOverride();
    setAuthStatus('Opening Google sign-in…', { tone: 'info' });
    if (signInButton) {
      signInButton.disabled = true;
      signInButton.textContent = 'Opening Google…';
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await auth.signInWithPopup(provider);
    } catch (error) {
      if (error.code === 'auth/popup-blocked') {
        try {
          await auth.signInWithRedirect(provider);
        } catch (redirectError) {
          console.error('Google sign-in failed', redirectError);
          updateLibraryStatus('Sign-in was blocked. Try again.');
          setAuthStatusOverride('Sign-in was blocked. Enable pop-ups and try again.', { tone: 'error', expiresIn: 8000 });
        }
      } else if (error.code !== 'auth/cancelled-popup-request') {
        console.error('Google sign-in failed', error);
        const friendlyMessage = getFriendlyAuthError(error);
        const statusMessage = friendlyMessage || 'Sign-in failed. Try again.';
        updateLibraryStatus(statusMessage);
        setAuthStatusOverride(statusMessage, { tone: 'error', expiresIn: 10000 });
      }
    } finally {
      if (signInButton) {
        signInButton.disabled = false;
        signInButton.textContent = 'Sign in with Google';
      }
    }
  }

  async function handleSignOut() {
    if (!firebaseReady || !auth) return;
    try {
      await auth.signOut();
    } catch (error) {
      console.error('Failed to sign out', error);
      updateLibraryStatus('Sign-out failed. Try again.');
    }
  }

  function hasValidFirebaseConfig(config) {
    if (!config || typeof config !== 'object') return false;
    const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'appId'];
    return requiredKeys.every((key) => {
      const value = config[key];
      if (typeof value !== 'string' || !value.trim()) return false;
      const normalised = value.trim().toLowerCase();
      return !normalised.startsWith('your_firebase_') && !normalised.includes('replace-with');
    });
  }

  function setAuthStatus(message, options = {}) {
    if (!authStatus) return;
    const { tone } = options;
    authStatus.textContent = message;
    if (tone) {
      authStatus.dataset.tone = tone;
    } else {
      delete authStatus.dataset.tone;
    }
  }

  function setAuthStatusOverride(message, options = {}) {
    const { tone, expiresIn = 0 } = options;
    if (authStatusOverrideTimer) {
      clearTimeout(authStatusOverrideTimer);
      authStatusOverrideTimer = null;
    }
    const override = {
      message,
      tone: tone || '',
      expiresAt: expiresIn > 0 ? Date.now() + expiresIn : 0
    };
    authStatusOverride = override;
    setAuthStatus(message, { tone });
    if (override.expiresAt) {
      const delay = override.expiresAt - Date.now();
      if (delay > 0) {
        authStatusOverrideTimer = setTimeout(() => {
          if (authStatusOverride !== override) return;
          authStatusOverride = null;
          authStatusOverrideTimer = null;
          setAuthStatus(currentUser ? 'Synced with Google' : 'Connect Google to sync your library.', {
            tone: currentUser ? 'success' : 'muted'
          });
        }, delay);
      }
    }
  }

  function clearAuthStatusOverride() {
    if (authStatusOverrideTimer) {
      clearTimeout(authStatusOverrideTimer);
      authStatusOverrideTimer = null;
    }
    authStatusOverride = null;
  }

  function hasActiveAuthStatusOverride() {
    if (!authStatusOverride) return false;
    if (authStatusOverride.expiresAt && Date.now() > authStatusOverride.expiresAt) {
      if (authStatusOverrideTimer) {
        clearTimeout(authStatusOverrideTimer);
        authStatusOverrideTimer = null;
      }
      authStatusOverride = null;
      return false;
    }
    return true;
  }

  function getFriendlyAuthError(error) {
    if (!error || typeof error !== 'object') return '';
    switch (error.code) {
      case 'auth/invalid-api-key':
        return 'Your Firebase API key looks incorrect. Double-check your Firebase config values.';
      case 'auth/invalid-client-id':
      case 'auth/invalid-credential':
        return 'The Google sign-in credentials look misconfigured. Verify your Firebase project settings.';
      case 'auth/operation-not-allowed':
        return 'Enable Google sign-in for your Firebase project before trying again.';
      case 'auth/configuration-not-found':
        return 'Firebase could not find this project configuration. Confirm your Firebase settings.';
      case 'auth/unauthorized-domain':
        return 'Add this site to the Authorized Domains list in your Firebase Authentication settings.';
      case 'auth/operation-not-supported-in-this-environment':
        return 'Google sign-in needs a secure origin. Run the app on https or localhost and try again.';
      case 'auth/network-request-failed':
        return 'We couldn’t reach Google. Check your internet connection and try again.';
      default:
        return '';
    }
  }

  function buildRecipe(data, options = {}) {
    const rng = createRng(options.seed);
    const baseIngredients = normaliseIngredients(data.ingredients, rng);
    const heroIngredient = baseIngredients[0];
    const cuisine = data.cuisine || 'fusion';
    const mealType = data.mealType || 'dinner';
    const diet = data.diet || 'omnivore';
    const moodTone = detectMoodTone(data.mood);

    const cuisineProfiles = {
      mediterranean: {
        herbs: ['oregano', 'basil', 'thyme'],
        aromatics: ['garlic and shallot', 'leek and lemon zest', 'rosemary and onion'],
        sauces: ['lemon-garlic pan sauce', 'olive tapenade glaze', 'sun-dried tomato drizzle'],
        garnishes: ['crumbled feta', 'toasted pine nuts', 'fresh parsley']
      },
      asian: {
        herbs: ['cilantro', 'Thai basil', 'mint'],
        aromatics: ['ginger and garlic', 'scallion whites', 'lemongrass paste'],
        sauces: ['soy-ginger reduction', 'miso sesame glaze', 'coconut lime broth'],
        garnishes: ['sesame seeds', 'crispy shallots', 'lime wedges']
      },
      latin: {
        herbs: ['cilantro', 'oregano', 'epazote'],
        aromatics: ['charred onion and garlic', 'chipotle paste', 'jalapeño and lime'],
        sauces: ['smoky adobo sauce', 'cilantro-lime crema', 'achiote pan jus'],
        garnishes: ['pickled red onion', 'queso fresco', 'fresh salsa']
      },
      'middle-eastern': {
        herbs: ['parsley', 'mint', 'dill'],
        aromatics: ['garlic and cumin', 'sumac onion', 'ginger and turmeric'],
        sauces: ['tahini yogurt sauce', 'pomegranate molasses glaze', 'spiced tomato broth'],
        garnishes: ['toasted sesame seeds', 'dukkah crunch', 'fresh herbs']
      },
      nordic: {
        herbs: ['dill', 'chives', 'parsley'],
        aromatics: ['shallot and fennel', 'leek and caraway', 'horseradish cream'],
        sauces: ['brown butter drizzle', 'mustard-dill sauce', 'light cider broth'],
        garnishes: ['crisp rye crumble', 'pickled mustard seeds', 'fresh microgreens']
      },
      southern: {
        herbs: ['thyme', 'sage', 'chives'],
        aromatics: ['celery, onion and pepper trio', 'garlic butter base', 'smoky paprika paste'],
        sauces: ['buttermilk pan gravy', 'maple-chili glaze', 'bourbon barbecue drizzle'],
        garnishes: ['chives', 'quick-pickled okra', 'toasted pecans']
      },
      fusion: {
        herbs: ['basil', 'cilantro', 'mint'],
        aromatics: ['garlic and ginger', 'shallot and citrus zest', 'smoked paprika and cumin'],
        sauces: ['citrus soy glaze', 'herby chimichurri', 'ginger-scallion oil'],
        garnishes: ['micro greens', 'spiced seeds', 'crisp herbs']
      }
    };

    const dietBoosters = {
      omnivore: ['free-range chicken stock', 'butter', 'parmesan shavings'],
      vegetarian: ['buttery cannellini beans', 'nutritional yeast', 'vegetable broth'],
      vegan: ['toasted chickpeas', 'coconut cream', 'smoked salt'],
      pescatarian: ['flaky salmon portions', 'seaweed flakes', 'citrus zest'],
      'gluten-free': ['millet or quinoa', 'arrowroot slurry', 'tamari']
    };

    const mealTechniques = {
      breakfast: [
        { vessel: 'non-stick skillet', action: 'softly scramble', base: 'whisked eggs or tofu', finish: 'pile onto toasted sourdough' },
        { vessel: 'sheet pan', action: 'roast until golden', base: 'mixed veggies', finish: 'serve with yogurt swirl' }
      ],
      lunch: [
        { vessel: 'wide skillet', action: 'sear then toss', base: 'protein and greens', finish: 'serve over grains or greens' },
        { vessel: 'saucepan', action: 'simmer gently', base: 'brothy mix', finish: 'ladle into bowls' }
      ],
      dinner: [
        { vessel: 'heavy skillet', action: 'sear until caramelised', base: 'main ingredient', finish: 'finish with glossy sauce' },
        { vessel: 'dutch oven', action: 'braise until tender', base: 'layered aromatics', finish: 'serve family style' },
        { vessel: 'sheet pan', action: 'roast at high heat', base: 'tossed veggies', finish: 'shower with herbs' }
      ],
      snack: [
        { vessel: 'baking tray', action: 'roast until crisp', base: 'bite-sized pieces', finish: 'serve with dipping sauce' },
        { vessel: 'mixing bowl', action: 'toss and chill', base: 'fresh produce', finish: 'serve cold' }
      ],
      dessert: [
        { vessel: 'mixing bowl', action: 'fold gently', base: 'creamy base', finish: 'chill until set' },
        { vessel: 'skillet', action: 'caramelise slowly', base: 'fruit medley', finish: 'top with crunchy crumble' }
      ]
    };

    const mealTitles = {
      breakfast: ['Sunrise Bake', 'Brunch Bowl', 'Morning Hash'],
      lunch: ['Market Bowl', 'Warm Salad', 'Hearty Toast'],
      dinner: ['Skillet Supper', 'Sheet-Pan Feast', 'Comfort Stew'],
      snack: ['Grazing Bites', 'Snack Platter', 'Crunch Mix'],
      dessert: ['Velvet Treat', 'Skillet Crisp', 'Chilled Parfait']
    };

    const adjectives = ['Vibrant', 'Cozy', 'Zesty', 'Golden', 'Garden', 'Smoky', 'Bright', 'Velvet'];

    const moodDescriptions = {
      cozy: 'a warm, hug-in-a-bowl kind of dish',
      celebratory: 'a celebratory plate with playful textures',
      light: 'a breezy, feel-good meal that stays light',
      energising: 'an energising combo packed with colour',
      bold: 'a boldly flavoured centrepiece for the table',
      default: 'a balanced plate designed for everyday cooking'
    };

    const profile = cuisineProfiles[cuisine] || cuisineProfiles.fusion;
    const technique = pick(mealTechniques[mealType] || mealTechniques.dinner, rng);
    const mealTitle = pick(mealTitles[mealType] || mealTitles.dinner, rng);
    const descriptor = pick(adjectives, rng);
    const herb = pick(profile.herbs, rng);
    const aromatic = pick(profile.aromatics, rng);
    const sauce = pick(profile.sauces, rng);
    const garnish = pick(profile.garnishes, rng);
    const boosters = pickMany(dietBoosters[diet] || dietBoosters.omnivore, 2, rng);

    const supporting = pickMany(
      baseIngredients.slice(1),
      Math.min(3, Math.max(1, baseIngredients.length - 1)),
      rng
    );

    const allIngredients = dedupe([
      heroIngredient,
      ...supporting,
      herb,
      aromatic,
      ...boosters
    ]).map(capitalise);

    const title = `${descriptor} ${capitalise(heroIngredient)} ${mealTitle} with ${sauce}`;
    const toneDescription = moodDescriptions[moodTone] || moodDescriptions.default;

    const steps = [
      `Prep the produce: chop ${listSentence(baseIngredients)} and set out ${herb}.`,
      `Heat a ${technique.vessel} and ${technique.action} the ${heroIngredient} with ${aromatic} in good olive oil.`,
      `Fold in ${supporting.length ? supporting.join(', ') : 'your prepared veggies'} along with ${boosters[0]} and simmer briefly.`,
      `Finish with ${sauce}, sprinkle ${garnish}, and ${technique.finish}.`
    ];

    const tip = `Tip: Lean into ${toneDescription} by serving alongside ${pick(
      ['buttery couscous', 'garlic flatbread', 'lemony greens', 'steamed rice', 'roasted potatoes'],
      rng
    )}.`;

    return {
      title,
      description: `This recipe is ${toneDescription} and leans on ${capitalise(heroIngredient)} with ${herb} and ${sauce}.`,
      ingredients: allIngredients,
      steps,
      tip
    };
  }

  function translatePredictions(predictions) {
    const keywordMap = [
      { ingredient: 'tomatoes', keywords: ['tomato', 'red pepper'] },
      { ingredient: 'apples', keywords: ['apple'] },
      { ingredient: 'bananas', keywords: ['banana', 'plantain'] },
      { ingredient: 'bread', keywords: ['bagel', 'loaf', 'bread', 'bun'] },
      { ingredient: 'eggs', keywords: ['egg'] },
      { ingredient: 'broccoli', keywords: ['broccoli'] },
      { ingredient: 'carrots', keywords: ['carrot'] },
      { ingredient: 'bell peppers', keywords: ['pepper', 'capsicum'] },
      { ingredient: 'potatoes', keywords: ['potato'] },
      { ingredient: 'onions', keywords: ['onion'] },
      { ingredient: 'garlic', keywords: ['garlic'] },
      { ingredient: 'lemons', keywords: ['lemon'] },
      { ingredient: 'oranges', keywords: ['orange'] },
      { ingredient: 'spinach', keywords: ['spinach', 'kale'] },
      { ingredient: 'milk', keywords: ['milk', 'yogurt'] },
      { ingredient: 'cheese', keywords: ['cheese'] },
      { ingredient: 'mushrooms', keywords: ['mushroom'] }
    ];

    const matches = new Set();
    predictions.forEach((prediction) => {
      const label = prediction.className.toLowerCase();
      keywordMap.forEach((entry) => {
        if (prediction.probability < 0.12) return;
        if (entry.keywords.some((keyword) => label.includes(keyword))) {
          matches.add(entry.ingredient);
        }
      });
    });

    if (!matches.size && predictions[0]) {
      matches.add(predictions[0].className.split(',')[0]);
    }

    return Array.from(matches).map(capitalise);
  }

  async function ensureModel() {
    if (mobilenetModel) return;
    mobilenetModel = await mobilenet.load({ version: 2, alpha: 1.0 });
  }

  function loadSavedRecipes() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      return [];
    } catch (error) {
      console.warn('Failed to load recipes from storage', error);
      return [];
    }
  }

  function persistRecipes() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedRecipes));
    } catch (error) {
      console.warn('Failed to persist recipes locally', error);
    }
  }

  function normaliseIngredients(input, rng) {
    const cleaned = (input || '')
      .split(/[\n,]/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    if (cleaned.length) {
      return cleaned;
    }

    const pantryFallbacks = [
      ['chicken thighs', 'sweet peppers', 'spinach'],
      ['chickpeas', 'tomatoes', 'kale'],
      ['salmon fillet', 'lemon', 'dill'],
      ['eggplant', 'zucchini', 'garlic'],
      ['tofu', 'broccoli', 'ginger']
    ];

    return [...pick(pantryFallbacks, rng)];
  }

  function detectMoodTone(text) {
    if (!text) return 'default';
    const mood = text.toLowerCase();
    if (mood.includes('cozy') || mood.includes('comfort') || mood.includes('snug')) return 'cozy';
    if (mood.includes('light') || mood.includes('fresh')) return 'light';
    if (mood.includes('party') || mood.includes('celebrat')) return 'celebratory';
    if (mood.includes('energy') || mood.includes('workout')) return 'energising';
    if (mood.includes('bold') || mood.includes('spice') || mood.includes('feast')) return 'bold';
    return 'default';
  }

  function pick(list, rng) {
    if (!list.length) return '';
    const source = typeof rng === 'function' ? rng() : Math.random();
    const index = Math.floor(source * list.length);
    return list[index];
  }

  function pickMany(list, count, rng) {
    if (!list.length) return [];
    const copy = [...list];
    const result = [];
    const limit = Math.min(count, copy.length);
    for (let i = 0; i < limit; i += 1) {
      const source = typeof rng === 'function' ? rng() : Math.random();
      const index = Math.floor(source * copy.length);
      result.push(copy.splice(index, 1)[0]);
    }
    return result;
  }

  function listSentence(items) {
    if (!items.length) return '';
    if (items.length === 1) return items[0];
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
  }

  function dedupe(items) {
    return Array.from(new Set(items.filter(Boolean)));
  }

  function capitalise(text) {
    if (!text) return '';
    return text
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  function createRng(seed) {
    let value = typeof seed === 'number' ? seed : Math.floor(Math.random() * 2147483646) + 1;
    value = (value % 2147483647) || 1;
    return () => {
      value = (value * 16807) % 2147483647;
      return (value - 1) / 2147483646;
    };
  }
})();
