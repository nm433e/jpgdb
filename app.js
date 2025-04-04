const auth = window.fbAuth;
const {
  signInWithGoogle,
  signOutUser,
  getUserData,
  updateUserData
} = window.firebaseApp;

const userSettingsManager = {
  // Helpers
  _getStorage: () => {
    return auth.currentUser ? 'firebase' : 'localStorage';
  },

  _getUserId: () => {
    return auth.currentUser ? auth.currentUser.uid : null;
  },

  // Get a specific setting (e.g., 'unreadOnly', 'filters', 'locked', 'grammarPoints')
  async getSetting(key) {
    const storage = this._getStorage();
    const userId = this._getUserId();

    if (storage === 'firebase') {
      try {
        const userData = await getUserData(userId);
        // Provide sensible defaults if the key doesn't exist
        return userData[key] ?? (key === 'grammarPoints' || key === 'filters' || key === 'locked' ? {} : false);
      } catch (error) {
        console.error(`Error getting setting '${key}' from Firebase:`, error);
        return key === 'grammarPoints' || key === 'filters' || key === 'locked' ? {} : false; // Default on error
      }
    } else {
      const value = localStorage.getItem(key);
      if (key === 'grammarPoints' || key === 'filters' || key === 'locked') {
        return value ? JSON.parse(value) : {};
      }
      return value === 'true'; // Assuming boolean for others like 'unreadOnly'
    }
  },

  // Get all relevant settings at once (useful for initialization)
  async getAllSettings() {
    const storage = this._getStorage();
    const userId = this._getUserId();

    if (storage === 'firebase') {
       try {
         // Ensure getUserData provides defaults for missing fields
         const userData = await getUserData(userId);
         return {
             filters: userData.filters ?? {},
             locked: userData.locked ?? {},
             grammarPoints: userData.grammarPoints ?? {},
             unreadOnly: userData.unreadOnly ?? false,
         };
       } catch (error) {
         console.error('Error getting all settings from Firebase:', error);
         return { filters: {}, locked: {}, grammarPoints: {}, unreadOnly: false }; // Defaults on error
       }
    } else {
        // Fetch individual items from localStorage
        return {
            filters: JSON.parse(localStorage.getItem('filters') || '{}'), // Read the single filters object
            locked: JSON.parse(localStorage.getItem('locked') || '{}'),
            grammarPoints: JSON.parse(localStorage.getItem('grammarPoints') || '{}'),
            unreadOnly: localStorage.getItem('unreadOnly') === 'true',
        };
    }
  },

  // Set a specific setting (only affects top-level keys like 'unreadOnly')
  async setSetting(key, value) {
    const storage = this._getStorage();
    const userId = this._getUserId();

    try {
      if (storage === 'firebase') {
        await updateUserData(userId, { [key]: value });
      } else {
        localStorage.setItem(key, value.toString());
      }
    } catch (error) {
      console.error(`Error setting setting '${key}':`, error);
      alert(`Failed to save setting: ${key}. Please try again.`); // User feedback
    }
  },

  // Update a specific filter checkbox state
  async setFilterState(filterId, isChecked) {
     const storage = this._getStorage();
     const userId = this._getUserId();

     try {
         if (storage === 'firebase') {
            // Fetch existing filters, update, and set
            const userData = await getUserData(userId);
            const newFilters = { ...(userData.filters ?? {}), [filterId]: isChecked };
            await updateUserData(userId, { filters: newFilters });
         } else {
            // Read existing filters object from localStorage
            const currentFilters = JSON.parse(localStorage.getItem('filters') || '{}');
            // Update the specific filter
            currentFilters[filterId] = isChecked;
            // Save the updated object back to localStorage
            localStorage.setItem('filters', JSON.stringify(currentFilters));
         }
     } catch (error) {
        console.error(`Error setting filter state '${filterId}':`, error);
        alert(`Failed to save filter: ${filterId}. Please try again.`);
     }
  },


  // Update the read status for a specific grammar point
  async setReadStatus(grammarPointId, isRead) {
    // --- ADD VALIDATION HERE ---
    if (!grammarPointId || typeof isRead !== 'boolean') {
      console.error('Invalid arguments for setReadStatus:', grammarPointId, isRead);
      return;
    }

    const storage = this._getStorage();
    const userId = this._getUserId();

    try {
      let currentReadStatus = {};
      if (storage === 'firebase') {
        const userData = await getUserData(userId);
        currentReadStatus = userData.grammarPoints ?? {};
        if (!currentReadStatus[grammarPointId]) {
          currentReadStatus[grammarPointId] = {};
        }
        currentReadStatus[grammarPointId].readStatus = isRead;
        currentReadStatus[grammarPointId].readDate = isRead ? getCorrectedDate(new Date()) : null;
        await updateUserData(userId, { grammarPoints: currentReadStatus });
      } else {
        currentReadStatus = JSON.parse(localStorage.getItem('grammarPoints') || '{}');
        if (!currentReadStatus[grammarPointId]) {
          currentReadStatus[grammarPointId] = {};
        }
        currentReadStatus[grammarPointId].readStatus = isRead;
        currentReadStatus[grammarPointId].readDate = isRead ? getCorrectedDate(new Date()) : null;
        localStorage.setItem('grammarPoints', JSON.stringify(currentReadStatus));
      }
    } catch (error) {
      console.error(`Error setting read status for '${grammarPointId}':`, error);
      alert(`Failed to update read status for item ${grammarPointId}. Please try again.`);
    }
  },

   // Update the locked state for a specific filter
   async setLockedState(lockId, isLocked) {
    const storage = this._getStorage();
    const userId = this._getUserId();

    try {
        let currentLocked = {};
        if (storage === 'firebase') {
            const userData = await getUserData(userId);
            currentLocked = userData.locked ?? {};
            currentLocked[lockId] = isLocked;
            await updateUserData(userId, { locked: currentLocked });
        } else {
            currentLocked = JSON.parse(localStorage.getItem('locked') || '{}');
            currentLocked[lockId] = isLocked;
            localStorage.setItem('locked', JSON.stringify(currentLocked));
        }
    } catch (error) {
        console.error(`Error setting locked state for '${lockId}':`, error);
        alert(`Failed to save lock state for ${lockId}. Please try again.`);
    }
   }
};

// TOGGLE DATABASES FUNCTION
async function setAllDatabases(checked) {
  const checkboxes = document.querySelectorAll('.database-filters input[type="checkbox"]');
  const userId = userSettingsManager._getUserId(); // Get user ID once
  const storage = userSettingsManager._getStorage();

  if (storage === 'firebase') {
    try {
      // 1. Fetch user data *once*
      const userData = await getUserData(userId);
      const newFilters = { ...userData.filters } || {}; // Ensure filters exist

      // 2. Update filters in memory
      checkboxes.forEach(checkbox => {
        if (!document.getElementById(`${checkbox.id}-lock`).classList.contains('fa-lock')) {
          checkbox.checked = checked; // Update UI immediately
          newFilters[checkbox.id] = checked; // Update in-memory filters
        }
      });

      // 3. Update Firebase *once* with the entire filter object
      await updateUserData(userId, { filters: newFilters });
    } catch (error) {
      console.error("Error updating all filters in Firebase:", error);
      alert("Failed to update all filters. Please try again.");
    }
  } else {
    // localStorage: Read existing filters object, update in memory, write back once.
    const currentFilters = JSON.parse(localStorage.getItem('filters') || '{}');
    checkboxes.forEach(checkbox => {
      if (!document.getElementById(`${checkbox.id}-lock`).classList.contains('fa-lock')) {
        checkbox.checked = checked; // Update UI immediately
        currentFilters[checkbox.id] = checked; // Update in-memory filters
      }
    });
    // Save the updated object back to localStorage
    localStorage.setItem('filters', JSON.stringify(currentFilters));
  }

  search(); // Trigger search after updates are done
}

async function toggleAllDatabases() {
  await setAllDatabases(true);
}

async function untoggleAllDatabases() {
  await setAllDatabases(false);
}

// CHECK SELECTED DATABASES FUNCTION
function checkSelectedDatabases() {
  const selectedDatabases = [];
  const checkboxes = document.querySelectorAll('.database-filters input[type="checkbox"]');

  checkboxes.forEach(checkbox => {
    if (checkbox.checked) selectedDatabases.push(checkbox.value);
  });

  return selectedDatabases;
}

// 
async function toggleUnreadOnly() {
  const button = document.getElementById('unread-only-btn');
  const isPressed = button.getAttribute('aria-pressed') === 'true';
  const newValue = !isPressed;
  button.setAttribute('aria-pressed', newValue.toString());
  await userSettingsManager.setSetting('unreadOnly', newValue);
  search(); // Call search after setting is saved
}

// Helper function to fetch data (could be cached)
async function fetchData() {
  try {
    const response = await fetch("database.json");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Failed to fetch database.json:", error);
    return []; // Return empty array on error
  }
}

// Helper function to apply all filters
function filterData(data, term, exactMatch, selectedDatabases, grammarPoints, showUnreadOnly) {
    return data.filter(d => {
        // Filter 1: Source Database
        if (!selectedDatabases.includes(d.source)) {
            return false;
        }

        // Filter 2: Search Term
        const pointLower = d.point.toLowerCase();
        const termLower = term.toLowerCase(); // Ensure term is lowercased here
        const termMatch = exactMatch ? d.point === term : pointLower.includes(termLower);
        if (!termMatch) {
            return false;
        }

        // Filter 3: Read Status (only if showUnreadOnly is true)
        if (showUnreadOnly && grammarPoints[d.id]?.readStatus) {
             // If we only want unread, and this item IS read, filter it out
            return false; 
        }

        // If all filters passed
        return true;
    });
}

// Helper function to create a single result element
function createResultElement(d, grammarPoints) {
    const container = document.createElement("div");
    container.className = `result-container`;

    const link = document.createElement("a");
    link.className = `result-link  ${d.shorthand}`;
    link.href = d.link;
    link.target = "_blank";

    const titleDiv = document.createElement("div");
    titleDiv.className = "result-title";
    titleDiv.textContent = d.point;
    link.appendChild(titleDiv);

    const detailsDiv = document.createElement("div");
    detailsDiv.className = "result-details";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = (grammarPoints[d.id] || {}).readStatus || false; // Provide a default object
    checkbox.dataset.id = d.id; // Add dataset id for easier selection if needed later

    checkbox.onchange = async () => { // Make onchange handler async
      await userSettingsManager.setReadStatus(d.id, checkbox.checked);

      // Fade-out logic (keep this part if desired)
      const isUnreadOnly = document.getElementById('unread-only-btn').getAttribute('aria-pressed') === 'true';
      // Check the NEW state of the checkbox
      if (isUnreadOnly && checkbox.checked) {
        const parentDiv = checkbox.closest('.result-container');
        if (parentDiv) {
          parentDiv.classList.add('fade-out', 'hidden');
          setTimeout(() => {
            parentDiv.remove();
          }, 500);
        }
      }
    };

    detailsDiv.appendChild(checkbox);
    link.appendChild(detailsDiv);
    container.appendChild(link);
    return container;
}

// Helper function to render results to the list
function renderResults(listElement, filteredResults, grammarPoints) {
    listElement.innerHTML = ""; // Clear previous results
    const fragment = document.createDocumentFragment(); // Use fragment for efficiency
    filteredResults.forEach(d => {
        fragment.appendChild(createResultElement(d, grammarPoints));
    });
    listElement.appendChild(fragment);
}

// SEARCH FUNCTIONALITY
async function search() {
  const rawTerm = document.getElementById("search").value;
  const list = document.getElementById("resultado");

  let term = rawTerm; // Keep original case for exact match
  let exactMatch = false;
  if ((rawTerm.startsWith('"') || rawTerm.endsWith('”')) && (rawTerm.startsWith('"') || rawTerm.endsWith('”'))) {
      term = rawTerm.substring(1, rawTerm.length - 1);
      exactMatch = true;
  } else {
      term = rawTerm.toLowerCase(); // Lowercase only for non-exact match
  }

  // 1. Get Data and Settings (parallel fetching)
  const [dados, grammarPoints, settings] = await Promise.all([
      fetchData(),
      userSettingsManager.getSetting('grammarPoints'),
      userSettingsManager.getSetting('unreadOnly') // Also fetch unreadOnly setting
      // We could fetch all settings at once if more are needed here
  ]);

  // 2. Get Filter Criteria from UI
  const selectedDatabases = checkSelectedDatabases(); // This function is fine
  const showUnreadOnly = settings; // Use fetched setting


  // 3. Filter Data
  const filteredResults = filterData(dados, term, exactMatch, selectedDatabases, grammarPoints, showUnreadOnly);


  // 4. Render Results
  renderResults(list, filteredResults, grammarPoints);
}


// INITIALIZATION
document.addEventListener('DOMContentLoaded', async () => {

  // Auth setup
  auth.onAuthStateChanged(async user => {
    if (user) {
      // update sign-in/out buttons
      document.getElementById('sign-in-button').style.display = 'none';
      document.getElementById('sign-out-button').style.display = 'inline-block';

      // load user data from Firestore
      const userData = await getUserData(user.uid);

      // restore filters from Firestore
      const checkboxes = document.querySelectorAll('.database-filters input[type="checkbox"]');
      checkboxes.forEach(checkbox => {
        checkbox.checked = userData.filters?.[checkbox.id] ?? true;
      });

      // restore locks from Firestore
      const locks = document.querySelectorAll('.database-filters i');
      locks.forEach(lock => {
        lock.className = userData.locked?.[lock.id] ? 'fa-solid fa-lock' : 'fa-solid fa-lock-open';
      });

    const unreadBtn = document.getElementById('unread-only-btn');
    unreadBtn.setAttribute('aria-pressed', userData.unreadOnly?.toString() ?? 'false');

    } else {
      // fallback to localStorage
      // update sign-in/out buttons
      document.getElementById('sign-in-button').style.display = 'inline-block';
      document.getElementById('sign-out-button').style.display = 'none';

      // Restore settings from localStorage using the manager
      const settings = await userSettingsManager.getAllSettings();

      // restore filters from localStorage
      const checkboxes = document.querySelectorAll('.database-filters input[type="checkbox"]');
      checkboxes.forEach(checkbox => {
          checkbox.checked = settings.filters?.[checkbox.id] ?? true; // Default to true if not found?
      });

      // restore locks from localStorage
      const locks = document.querySelectorAll('.database-filters i');
      locks.forEach(lock => {
        lock.className = settings.locked?.[lock.id] ? 'fa-solid fa-lock' : 'fa-solid fa-lock-open';
      });

      // restore unreadOnly state from localStorage
      const unreadBtn = document.getElementById('unread-only-btn');
      unreadBtn.setAttribute('aria-pressed', settings.unreadOnly?.toString() ?? 'false');
    }

    search(); // Initial search after settings are loaded
  });

  // Event Listeners initialization
  // butons
  document.getElementById('sign-in-button').addEventListener('click', signInWithGoogle);
  document.getElementById('sign-out-button').addEventListener('click', signOutUser);
  // databases checkboxes
  document.querySelectorAll('.database-filters input').forEach(checkbox => {
    checkbox.addEventListener('change', async () => {
      await userSettingsManager.setFilterState(checkbox.id, checkbox.checked);
      search();
    });
  });
  // databases locks
  document.querySelectorAll('.database-filters i').forEach
  (lock => {
    lock.addEventListener('click', async () => {
      const isCurrentlyLocked = lock.classList.contains('fa-lock');
      const newState = !isCurrentlyLocked;
      lock.className = newState ? 'fa-solid fa-lock' : 'fa-solid fa-lock-open'; // Update UI immediately
      await userSettingsManager.setLockedState(lock.id, newState);
      // Note: Search might not be needed here unless locking affects filtering directly
    });
  });
});

// RESPONSIVENESS
function handleResponsiveChanges() {
  const signInButton = document.getElementById('sign-in-button');
  const signOutButton = document.getElementById('sign-out-button');
  const filtersElement = document.getElementById('database-filters');
  
  if (window.innerWidth <= 768) {

    // filters
    filtersElement.style.display = 'none';

    // sign in/out buttons
    signInButton.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i>';
    signInButton.className = 'nav-icon';
    signOutButton.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i>';
    signOutButton.className = 'nav-icon';
  } else {
    filtersElement.style.display = 'block';
    signInButton.innerHTML = 'Sign in';
    signInButton.className = 'sign-btn';
    signOutButton.innerHTML = 'Sign out';
    signOutButton.className = 'sign-btn';
  }
}
window.addEventListener('resize', handleResponsiveChanges);
window.addEventListener('DOMContentLoaded', handleResponsiveChanges);

function getCorrectedDate(date) {
  const correctionHour = 5;

  // Create a new date object with the local time
  const localDate = new Date(date.getTime() - 60 * 1000);
  console.log("localDate:", localDate);

  // Get the local hour
  const localHour = localDate.getHours();
  console.log("localHour:", localHour);

  // Correct the date if the local hour is before the correction hour
  let correctedDate = new Date(localDate);
  if (localHour < correctionHour) {
    correctedDate.setDate(localDate.getDate() - 1);
    console.log("Date corrected:", correctedDate);
  } else {
    console.log("Date not corrected");
  }
  console.log("correctedDate before formatting:", correctedDate);

  // Format the corrected date as a string (YYYY-MM-DD)
  const year = correctedDate.getFullYear();
  const month = String(correctedDate.getMonth() + 1).padStart(2, '0');
  const day = String(correctedDate.getDate()).padStart(2, '0');
  const formattedDate = `${year}-${month}-${day}`;
  console.log("formattedDate:", formattedDate);

  return formattedDate;
}

// SETTINGS BUTTON
const openSettings = () => {
  const filtersElement = document.getElementById('database-filters');
  filtersElement.style.display = filtersElement.style.display === 'none' ? 'block' : 'none';
}
document.getElementById('settings-button').addEventListener('click', openSettings);


