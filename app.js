const ingredientForm = document.getElementById('ingredientForm');
const ingredientInput = document.getElementById('ingredientInput');
const ingredientListEl = document.getElementById('ingredientList');
const clearIngredientsBtn = document.getElementById('clearIngredients');
const cameraButton = document.getElementById('cameraButton');
const cameraInput = document.getElementById('cameraInput');
const imageStrip = document.getElementById('imageStrip');
const extraNotes = document.getElementById('extraNotes');
const includeImagesCheckbox = document.getElementById('includeImages');
const storePhotosCheckbox = document.getElementById('storePhotos');
const generateBtn = document.getElementById('generateBtn');
const generationStatus = document.getElementById('generationStatus');
const recipeResult = document.getElementById('recipeResult');
const settingsToggle = document.getElementById('settingsToggle');
const settingsDialog = document.getElementById('settingsDialog');
const apiKeyInput = document.getElementById('apiKeyInput');
const modelSelect = document.getElementById('modelSelect');
const systemPromptInput = document.getElementById('systemPrompt');
const saveSettingsBtn = document.getElementById('saveSettings');
const savedRecipesContainer = document.getElementById('savedRecipes');
const searchRecipesInput = document.getElementById('searchRecipes');
const exportRecipesBtn = document.getElementById('exportRecipes');
const shareLatestBtn = document.getElementById('shareLatest');

const DEFAULT_SYSTEM_PROMPT = `You are Pantry Pro, a friendly culinary assistant.
- Respond in Markdown.
- Provide a concise title, yield, prep/cook times, and serving suggestion.
- Include bullet ingredient list with precise measurements and metric conversions when possible.
- Number the cooking steps.
- Add a Chef's Tip section and variation ideas if they fit the prompt.
- Keep tone encouraging and clear.`;

let ingredients = [];
let photos = [];
let recipes = loadRecipes();
let settings = loadSettings();

applySettingsToUI();
renderIngredients();
renderPhotos();
renderSavedRecipes();

ingredientForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const raw = ingredientInput.value.trim();
  if (!raw) return;
  const items = raw.split(',').map((part) => part.trim()).filter(Boolean);
  ingredients.push(...items);
  ingredients = Array.from(new Set(ingredients));
  ingredientInput.value = '';
  renderIngredients();
});

clearIngredientsBtn.addEventListener('click', () => {
  ingredients = [];
  renderIngredients();
});

cameraButton.addEventListener('click', () => {
  cameraInput.click();
});

cameraInput.addEventListener('change', async (event) => {
  const files = Array.from(event.target.files || []);
  if (!files.length) return;
  for (const file of files) {
    const dataUrl = await readFileAsDataURL(file);
    photos.push({ id: crypto.randomUUID(), dataUrl, name: file.name, addedAt: Date.now() });
  }
  cameraInput.value = '';
  renderPhotos();
});

generateBtn.addEventListener('click', generateRecipe);

settingsToggle.addEventListener('click', () => {
  if (typeof settingsDialog.showModal === 'function') {
    settingsDialog.showModal();
    settingsToggle.setAttribute('aria-expanded', 'true');
  } else {
    alert('Your browser does not support dialog elements.');
  }
});

settingsDialog.addEventListener('close', () => {
  settingsToggle.setAttribute('aria-expanded', 'false');
});

saveSettingsBtn.addEventListener('click', () => {
  settings = {
    apiKey: apiKeyInput.value.trim(),
    model: modelSelect.value,
    systemPrompt: systemPromptInput.value.trim() || DEFAULT_SYSTEM_PROMPT,
  };
  localStorage.setItem('pantrypro:settings', JSON.stringify(settings));
  settingsDialog.close();
  toast('Settings saved.');
});

searchRecipesInput.addEventListener('input', () => {
  renderSavedRecipes(searchRecipesInput.value.trim());
});

exportRecipesBtn.addEventListener('click', () => {
  if (!recipes.length) {
    toast('No recipes to export yet.');
    return;
  }
  const blob = new Blob([JSON.stringify(recipes, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), {
    href: url,
    download: `pantry-pro-recipes-${new Date().toISOString().slice(0, 10)}.json`,
  });
  document.body.appendChild(link);
  link.click();
  requestAnimationFrame(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  });
});

shareLatestBtn.addEventListener('click', async () => {
  if (!recipes.length) {
    toast('Generate and save a recipe first.');
    return;
  }
  const latest = recipes[0];
  const shareText = formatRecipeForSharing(latest);
  try {
    await navigator.clipboard.writeText(shareText);
    toast('Latest recipe copied to clipboard.');
  } catch (error) {
    console.error(error);
    toast('Could not copy to clipboard. Here is the recipe text in a prompt.');
    alert(shareText);
  }
});

function renderIngredients() {
  ingredientListEl.innerHTML = '';
  ingredients.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'chip';
    li.innerHTML = `${escapeHtml(item)} <button type="button" aria-label="Remove ${escapeHtml(item)}">×</button>`;
    li.querySelector('button').addEventListener('click', () => {
      ingredients = ingredients.filter((ing) => ing !== item);
      renderIngredients();
    });
    ingredientListEl.appendChild(li);
  });
  if (!ingredients.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No ingredients yet. Try "tomatoes", "fresh basil", "parmesan"...';
    empty.className = 'helper-text';
    ingredientListEl.appendChild(empty);
  }
}

function renderPhotos() {
  imageStrip.innerHTML = '';
  photos.forEach((photo) => {
    const figure = document.createElement('figure');
    const img = document.createElement('img');
    img.src = photo.dataUrl;
    img.alt = photo.name || 'Ingredient photo';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      photos = photos.filter((p) => p.id !== photo.id);
      renderPhotos();
    });
    figure.append(img, removeBtn);
    imageStrip.appendChild(figure);
  });
  if (!photos.length) {
    const helper = document.createElement('p');
    helper.textContent = 'No ingredient photos yet.';
    helper.className = 'helper-text';
    imageStrip.appendChild(helper);
  }
}

async function generateRecipe() {
  if (!settings.apiKey) {
    toast('Add your OpenAI API key in Settings first.');
    settingsDialog.showModal();
    return;
  }
  if (!ingredients.length) {
    toast('Add at least one ingredient.');
    return;
  }

  const notes = extraNotes.value.trim();
  generationStatus.textContent = 'Cooking up ideas...';
  generateBtn.disabled = true;

  try {
    const userPrompt = buildUserPrompt(notes);
    const body = buildRequestBody(userPrompt);
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorPayload = await safeJson(response);
      throw new Error(errorPayload.error?.message || response.statusText);
    }

    const payload = await response.json();
    const text = extractTextFromResponse(payload);
    if (!text) {
      throw new Error('AI response did not include recipe text.');
    }

    displayGeneratedRecipe(text);
    generationStatus.textContent = 'Recipe ready!';
  } catch (error) {
    console.error(error);
    generationStatus.textContent = '';
    toast(`Generation failed: ${error.message}`);
  } finally {
    generateBtn.disabled = false;
  }
}

function buildUserPrompt(notes) {
  const ingredientText = ingredients.map((item) => `- ${item}`).join('\n');
  let prompt = `Here are the ingredients I currently have:\n${ingredientText}\n`;
  if (notes) {
    prompt += `\nAdditional notes from the cook: ${notes}\n`;
  }
  prompt +=
    '\nCreate a complete recipe that fits the context. Provide sections for Title, Yield, Prep Time, Cook Time, Ingredients, Steps, Chef\'s Tips, and Suggested Pairings. Use approachable language for home cooks.';
  return prompt;
}

function buildRequestBody(userPrompt) {
  const systemContent = settings.systemPrompt || DEFAULT_SYSTEM_PROMPT;
  const messages = [
    {
      role: 'system',
      content: [
        {
          type: 'input_text',
          text: systemContent,
        },
      ],
    },
    {
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: userPrompt,
        },
      ],
    },
  ];

  if (includeImagesCheckbox.checked && photos.length) {
    const userContent = messages[1].content;
    photos.forEach((photo) => {
      userContent.push({
        type: 'input_image',
        image_url: {
          url: photo.dataUrl,
        },
      });
    });
  }

  return {
    model: settings.model || 'gpt-4o-mini',
    input: messages,
    max_output_tokens: 900,
  };
}

function displayGeneratedRecipe(markdown) {
  const recipe = parseRecipeMarkdown(markdown);
  recipeResult.classList.remove('hidden');
  recipeResult.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'recipe-header';
  const info = document.createElement('div');
  const title = document.createElement('h3');
  title.className = 'recipe-title';
  title.textContent = recipe.title;
  const meta = document.createElement('p');
  meta.className = 'recipe-meta';
  meta.textContent = recipe.meta || 'Fresh from the AI kitchen';
  info.append(title, meta);

  const actions = document.createElement('div');
  actions.className = 'recipe-actions';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'primary';
  saveBtn.type = 'button';
  saveBtn.textContent = 'Save to recipe box';
  saveBtn.addEventListener('click', () => {
    const recipeToSave = {
      id: crypto.randomUUID(),
      title: recipe.title,
      meta: recipe.meta,
      markdown,
      html: recipe.bodyHtml,
      createdAt: Date.now(),
      ingredientsSnapshot: [...ingredients],
      notes: extraNotes.value.trim(),
      photos: storePhotosCheckbox.checked ? [...photos] : [],
    };
    recipes = [recipeToSave, ...recipes];
    persistRecipes();
    renderSavedRecipes(searchRecipesInput.value.trim());
    toast('Recipe saved to your library.');
  });
  actions.appendChild(saveBtn);
  header.append(info, actions);

  const body = document.createElement('div');
  body.className = 'recipe-body';
  body.innerHTML = recipe.bodyHtml;

  const imageGroup = document.createElement('div');
  imageGroup.className = 'recipe-images';
  if (includeImagesCheckbox.checked && photos.length) {
    photos.forEach((photo) => {
      const img = document.createElement('img');
      img.src = photo.dataUrl;
      img.alt = 'Ingredient photo shared with the AI';
      imageGroup.appendChild(img);
    });
  }

  recipeResult.append(header, body, imageGroup);
}

function renderSavedRecipes(searchTerm = '') {
  savedRecipesContainer.innerHTML = '';
  const normalized = searchTerm.toLowerCase();
  const filtered = recipes.filter((recipe) => {
    if (!normalized) return true;
    return (
      recipe.title.toLowerCase().includes(normalized) ||
      recipe.markdown.toLowerCase().includes(normalized) ||
      recipe.ingredientsSnapshot.some((item) => item.toLowerCase().includes(normalized))
    );
  });

  if (!filtered.length) {
    const empty = document.createElement('p');
    empty.className = 'helper-text';
    empty.textContent = recipes.length
      ? 'No recipes match your search yet.'
      : 'Your saved recipes will live here. Generate something delicious!';
    savedRecipesContainer.appendChild(empty);
    return;
  }

  filtered.forEach((recipe) => {
    const template = document.getElementById('recipeTemplate');
    const card = template.content.firstElementChild.cloneNode(true);
    card.querySelector('.recipe-title').textContent = recipe.title;
    card.querySelector('.recipe-meta').textContent = recipe.meta || formatDate(recipe.createdAt);
    card.querySelector('.recipe-body').innerHTML = recipe.html;

    const actions = card.querySelector('.recipe-actions');
    const copyBtn = actions.querySelector('.js-copy');
    const deleteBtn = actions.querySelector('.js-delete');

    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(recipe.markdown);
        toast('Recipe copied to clipboard.');
      } catch (error) {
        console.error(error);
        toast('Unable to copy to clipboard.');
      }
    });

    deleteBtn.addEventListener('click', () => {
      if (!confirm(`Remove "${recipe.title}" from your cookbook?`)) return;
      recipes = recipes.filter((item) => item.id !== recipe.id);
      persistRecipes();
      renderSavedRecipes(searchRecipesInput.value.trim());
    });

    const imageContainer = card.querySelector('.recipe-images');
    if (recipe.photos?.length) {
      recipe.photos.forEach((photo) => {
        const img = document.createElement('img');
        img.src = photo.dataUrl;
        img.alt = 'Saved ingredient photo';
        imageContainer.appendChild(img);
      });
    }

    savedRecipesContainer.appendChild(card);
  });
}

function loadRecipes() {
  try {
    const stored = localStorage.getItem('pantrypro:recipes');
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Failed to parse saved recipes', error);
    return [];
  }
}

function persistRecipes() {
  localStorage.setItem('pantrypro:recipes', JSON.stringify(recipes));
}

function loadSettings() {
  try {
    const stored = localStorage.getItem('pantrypro:settings');
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        apiKey: parsed.apiKey || '',
        model: parsed.model || 'gpt-4o-mini',
        systemPrompt: parsed.systemPrompt || DEFAULT_SYSTEM_PROMPT,
      };
    }
  } catch (error) {
    console.error('Failed to parse settings', error);
  }
  return {
    apiKey: '',
    model: 'gpt-4o-mini',
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
  };
}

function applySettingsToUI() {
  apiKeyInput.value = settings.apiKey || '';
  modelSelect.value = settings.model || 'gpt-4o-mini';
  systemPromptInput.value = settings.systemPrompt || DEFAULT_SYSTEM_PROMPT;
}

function parseRecipeMarkdown(markdown) {
  const lines = markdown.trim().split(/\r?\n/);
  let title = 'AI Generated Recipe';
  let meta = '';
  const bodyLines = [];
  let inList = false;
  let listType = 'ul';

  const flushList = () => {
    if (inList) {
      bodyLines.push(`</${listType}>`);
      inList = false;
    }
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      bodyLines.push('<p></p>');
      return;
    }

    const headingMatch = /^#{1,6}\s+(.*)/.exec(trimmed);
    if (headingMatch) {
      flushList();
      const level = headingMatch[0].split(' ')[0].length;
      const text = escapeHtml(headingMatch[1].trim());
      if (level <= 2 && title === 'AI Generated Recipe') {
        title = headingMatch[1].trim();
        return;
      }
      bodyLines.push(`<h${level}>${text}</h${level}>`);
      return;
    }

    const bulletMatch = /^[-*]\s+(.*)/.exec(trimmed);
    if (bulletMatch) {
      if (!inList || listType !== 'ul') {
        flushList();
        bodyLines.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      bodyLines.push(`<li>${escapeHtml(bulletMatch[1])}</li>`);
      return;
    }

    const numberedMatch = /^(\d+)\.\s+(.*)/.exec(trimmed);
    if (numberedMatch) {
      if (!inList || listType !== 'ol') {
        flushList();
        bodyLines.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      bodyLines.push(`<li>${escapeHtml(numberedMatch[2])}</li>`);
      return;
    }

    flushList();

    const boldMatch = /\*\*(.+)\*\*/g;
    const italicMatch = /\*(.+)\*/g;
    let html = escapeHtml(trimmed)
      .replace(boldMatch, '<strong>$1</strong>')
      .replace(italicMatch, '<em>$1</em>');

    if (!meta && /servings|yield|prep|cook/i.test(trimmed)) {
      meta = trimmed;
    }

    bodyLines.push(`<p>${html}</p>`);
  });

  flushList();

  return {
    title,
    meta,
    bodyHtml: bodyLines.join('\n'),
  };
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function toast(message) {
  generationStatus.textContent = message;
  generationStatus.classList.add('active');
  setTimeout(() => {
    generationStatus.classList.remove('active');
  }, 3500);
}

function extractTextFromResponse(payload) {
  if (typeof payload.output_text === 'string') {
    return payload.output_text.trim();
  }
  if (Array.isArray(payload.output)) {
    for (const item of payload.output) {
      if (item.content) {
        const textBlock = item.content.find((content) => content.type === 'output_text');
        if (textBlock?.text) {
          return textBlock.text.trim();
        }
      }
    }
  }
  if (payload.choices?.length) {
    return payload.choices[0]?.message?.content?.trim();
  }
  return '';
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch (error) {
    return {};
  }
}

function formatDate(timestamp) {
  if (!timestamp) return 'Saved recipe';
  return new Date(timestamp).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatRecipeForSharing(recipe) {
  return `Recipe: ${recipe.title}\nSaved on: ${formatDate(recipe.createdAt)}\n\n${recipe.markdown}`;
}
