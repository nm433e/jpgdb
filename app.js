const auth = window.fbAuth;
const {
  signInWithGoogle,
  signOutUser,
  getUserData,
  updateUserData
} = window.firebaseApp;

// Database Manager Class
class DatabaseManager {
  constructor() {
    this.cache = new Map();
    this.loadingPromises = new Map();
  }

  async loadDatabase(source) {
    // Return cached data if available
    if (this.cache.has(source)) {
      return this.cache.get(source);
    }

    // Return existing loading promise if the file is currently being loaded
    if (this.loadingPromises.has(source)) {
      return this.loadingPromises.get(source);
    }

    // Create new loading promise
    const loadPromise = (async () => {
      try {
        const response = await fetch(`db/${source}.json`);
        if (!response.ok) {
          throw new Error(`Failed to load ${source}.json: ${response.status}`);
        }
        const data = await response.json();
        this.cache.set(source, data);
        return data;
      } catch (error) {
        console.error(`Error loading ${source}.json:`, error);
        return []; // Return empty array on error
      } finally {
        this.loadingPromises.delete(source);
      }
    })();

    this.loadingPromises.set(source, loadPromise);
    return loadPromise;
  }

  async loadSelectedDatabases(selectedSources) {
    try {
      const loadPromises = selectedSources.map(source => this.loadDatabase(source));
      const results = await Promise.all(loadPromises);
      return results.flat(); // Merge all results into a single array
    } catch (error) {
      console.error('Error loading selected databases:', error);
      return [];
    }
  }

  clearCache() {
    this.cache.clear();
    this.loadingPromises.clear();
  }
}

// Create a single instance of DatabaseManager
const databaseManager = new DatabaseManager();

// Mode Management
let currentMode = 'search';

function toggleMode() {
  const searchMode = document.getElementById('search-mode');
  const dataMode = document.getElementById('data-mode');
  const modeToggle = document.getElementById('mode-toggle');
  const searchInput = document.getElementById('search');

  if (currentMode === 'search') {
    // Switch to data mode
    searchMode.style.display = 'none';
    dataMode.style.display = 'block';
    modeToggle.innerHTML = '<i class="fa-solid fa-search"></i>';
    currentMode = 'data';
    updateDataVisualization();
  } else {
    // Switch to search mode
    searchMode.style.display = 'block';
    dataMode.style.display = 'none';
    modeToggle.innerHTML = '<i class="fa-solid fa-chart-line"></i>';
    currentMode = 'search';
  }
}

// Data Visualization Functions
async function updateDataVisualization() {
  const selectedSource = document.getElementById('source-select').value;
  const grammarPoints = await userSettingsManager.getSetting('grammarPoints');

  // Load only the selected database file
  const data = selectedSource === 'all'
    ? await databaseManager.loadSelectedDatabases([
      'aap',
      'bunpro',
      'donna-toki',
      'dojg',
      'hojgp1',
      'hojgp2',
      'nihongo-kyoshi',
      'imabi',
      'taekim',
      'maggie'
    ])
    : await databaseManager.loadDatabase(selectedSource);

  // Update header
  updateDataHeader(selectedSource, data.length);

  // Calculate statistics
  const stats = calculateStats(grammarPoints, data);
  updateStatsDisplay(stats);
  updateProgressBar(stats);
  updateRecentPoints(grammarPoints, data);

  // Update heatmap
  const heatmap = document.getElementById('heatmap');
  heatmap.innerHTML = '';

  // Create date map for the current year
  const today = getTodayWithCutoff();
  const startOfYear = new Date(today.getFullYear(), 0, 1); // January 1st of current year
  const endOfYear = new Date(today.getFullYear(), 11, 31); // December 31st of current year
  const dateMap = new Map();

  // Fill the date map for the entire year
  let currentDate = new Date(startOfYear);
  while (currentDate <= endOfYear) {
    const dateStr = currentDate.toISOString().split('T')[0];
    dateMap.set(dateStr, 0);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Count points per day
  const readPoints = data
    .filter(item => {
      const isRead = grammarPoints[item.id]?.readStatus;
      return isRead;
    })
    .map(item => ({
      id: item.id,
      date: new Date(grammarPoints[item.id].readDate)
    }));

  readPoints.forEach(point => {
    const logicalDayForHeatmap = getLogicalDay(point.date);
    const dateStr = formatDateAsYYYYMMDD(logicalDayForHeatmap);
    if (dateMap.has(dateStr)) {
      dateMap.set(dateStr, dateMap.get(dateStr) + 1);
    }
  });

  // Find max points in a day for scaling
  const maxPoints = Math.max(...Array.from(dateMap.values()));

  // Calculate the number of weeks needed
  const firstDayOfYear = startOfYear.getDay(); // 0 = Sunday, 6 = Saturday
  const daysInYear = 365 + (startOfYear.getFullYear() % 4 === 0 ? 1 : 0); // Account for leap year
  const totalWeeks = Math.ceil((firstDayOfYear + daysInYear) / 7);

  // Create a 2D array to store the heatmap data
  const daysInWeek = 7;
  const heatmapData = Array(daysInWeek).fill().map(() => Array(totalWeeks).fill(null));

  // Fill the 2D array with the data
  currentDate = new Date(startOfYear);
  while (currentDate <= endOfYear) {
    const week = Math.floor((firstDayOfYear + (currentDate - startOfYear) / (24 * 60 * 60 * 1000)) / 7);
    const dayOfWeek = currentDate.getDay();
    const dateStr = currentDate.toISOString().split('T')[0];

    heatmapData[dayOfWeek][week] = {
      date: dateStr,
      count: dateMap.get(dateStr) || 0
    };

    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Create heatmap cells
  for (let day = 0; day < daysInWeek; day++) {
    const dayRow = document.createElement('div');
    dayRow.className = 'heatmap-row';
    dayRow.style.display = 'flex';
    dayRow.style.flexDirection = 'row';
    dayRow.style.gap = '3px';

    for (let week = 0; week < totalWeeks; week++) {
      const cell = document.createElement('div');
      cell.className = 'heatmap-day';

      const data = heatmapData[day][week];
      if (data) {
        // Calculate color intensity
        let colorClass;
        if (data.count === 0) colorClass = 'var(--heatmap-0)';
        else if (data.count <= maxPoints * 0.25) colorClass = 'var(--heatmap-1)';
        else if (data.count <= maxPoints * 0.5) colorClass = 'var(--heatmap-2)';
        else if (data.count <= maxPoints * 0.75) colorClass = 'var(--heatmap-3)';
        else colorClass = 'var(--heatmap-4)';

        cell.style.backgroundColor = colorClass;
        cell.title = `${data.date}: ${data.count} points`;

        // Add border for current day
        if (data.date === formatDateAsYYYYMMDD(getTodayWithCutoff())) {
          cell.style.boxSizing = 'border-box';
          cell.style.border = '2px solid var(--main)';
        }
      } else {
        // Check if this cell is before January 1st
        const cellDate = new Date(startOfYear);
        cellDate.setDate(cellDate.getDate() - (firstDayOfYear - (week * 7 + day)));
        if (cellDate < startOfYear) {
          cell.style.backgroundColor = 'var(--bg)';
        } else {
          // Only show cells up to December 31st
          const futureDate = new Date(startOfYear);
          futureDate.setDate(futureDate.getDate() + (week * 7 + day - firstDayOfYear));
          if (futureDate <= endOfYear) {
            cell.style.backgroundColor = 'var(--heatmap-0)';
            cell.title = `${futureDate.toISOString().split('T')[0]}: 0 points`;
          } else {
            cell.style.display = 'none';
          }
        }
      }

      dayRow.appendChild(cell);
    }
    heatmap.appendChild(dayRow);
  }
}

function updateDataHeader(source, totalPoints) {
  const header = document.getElementById('data-header');
  const sourceName = source === 'all' ? 'All Sources' : source.split('-').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');

  header.innerHTML = `
        <h2>${sourceName}</h2>
        <p>Total Grammar Points: ${totalPoints}</p>
    `;
}

function calculateStats(grammarPoints, data) {
  const now = new Date();
  const today = getTodayWithCutoff();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const stats = {
    today: 0,
    week: 0,
    month: 0,
    last7: 0,
    last14: 0,
    last30: 0,
    total: 0,
    read: 0
  };

  // console.log('Data in calculateStats:', data);
  // console.log('Grammar points in calculateStats:', grammarPoints);

  // Get read points with dates, but only for the filtered data
  const readPoints = data
    .filter(item => {
      const isRead = grammarPoints[item.id]?.readStatus;
      // console.log(`Item ${item.id} read status:`, isRead);
      return isRead;
    })
    .map(item => ({
      id: item.id,
      date: new Date(grammarPoints[item.id].readDate)
    }));

  // console.log('Read points:', readPoints);

  // Calculate time-based stats
  readPoints.forEach(point => {
    const actualReadTime = point.date;
    const logicalReadDay = getLogicalDay(actualReadTime);

    if (logicalReadDay.getTime() === today.getTime()) stats.today++;
    if (logicalReadDay >= weekStart) stats.week++;
    if (logicalReadDay >= monthStart) stats.month++;

    if (actualReadTime >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)) stats.last7++;
    if (actualReadTime >= new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)) stats.last14++;
    if (actualReadTime >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)) stats.last30++;
  });

  // Calculate total and read counts
  stats.total = data.length;
  stats.read = readPoints.length;

  return stats;
}

function updateStatsDisplay(stats) {
  document.getElementById('today-count').textContent = stats.today;
  document.getElementById('week-count').textContent = stats.week;
  document.getElementById('month-count').textContent = stats.month;
  document.getElementById('last7-count').textContent = stats.last7;
  document.getElementById('last14-count').textContent = stats.last14;
  document.getElementById('last30-count').textContent = stats.last30;
}

function updateProgressBar(stats) {
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  const percentage = stats.total > 0 ? (stats.read / stats.total) * 100 : 0;

  progressFill.style.width = `${percentage}%`;
  progressText.textContent = `${stats.read}/${stats.total} points read`;
}

function updateRecentPoints(grammarPoints, data) {
  const recentPointsList = document.getElementById('recent-points-list');
  recentPointsList.innerHTML = '';

  // Get read points with dates and sort by date
  const readPoints = Object.entries(grammarPoints)
    .filter(([_, pointSetting]) => pointSetting.readStatus && pointSetting.readDate)
    .map(([id, pointSetting]) => ({
      id,
      date: new Date(pointSetting.readDate)
    }))
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 100);

  // Create elements for each recent point
  readPoints.forEach(point => {
    const pointData = data.find(d => d.id === point.id);
    if (!pointData) return;

    const item = document.createElement('div');
    item.className = 'recent-point-item';
    item.innerHTML = `
            <a href=${pointData.link}>
            <span class="point-name">${pointData.point}</span>
            </a>
            <span class="read-date">${point.date.toLocaleDateString()}</span>
        `;
    recentPointsList.appendChild(item);
  });
}

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
        currentReadStatus[grammarPointId].readDate = isRead ? new Date().toISOString() : null;
        await updateUserData(userId, { grammarPoints: currentReadStatus });
      } else {
        currentReadStatus = JSON.parse(localStorage.getItem('grammarPoints') || '{}');
        if (!currentReadStatus[grammarPointId]) {
          currentReadStatus[grammarPointId] = {};
        }
        currentReadStatus[grammarPointId].readStatus = isRead;
        currentReadStatus[grammarPointId].readDate = isRead ? new Date().toISOString() : null;
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
  const selectedDatabases = checkSelectedDatabases();
  return await databaseManager.loadSelectedDatabases(selectedDatabases);
}

// Helper function to apply all filters
function filterData(data, term, exactMatch, selectedDatabases, grammarPoints, showUnreadOnly) {
  // For non-exact matches, 'term' is already Hiragana due to wanakana.bind() in the input field.
  // For exact matches, 'term' is the raw string from within the quotes.

  return data.filter(d => {
    // Filter 1: Source Database (This was commented out, ensure it's correct for your logic)
    // if (!selectedDatabases.includes(d.source)) {
    //     return false;
    // }

    // Filter 2: Search Term
    let termMatch = false;
    if (exactMatch) {
      // Direct comparison for exact matches (term can be Romaji, Kana, Kanji, etc.)
      termMatch = d.point === term;
    } else {
      // Non-exact match: convert d.point to Hiragana and compare with the Hiragana search term.
      const pointLower = d.point.toLowerCase();
      // Use wanakana if available, otherwise use the lowercased point directly.
      const hiraganaPoint = window.wanakana ? wanakana.toHiragana(pointLower) : pointLower;
      // term is already Hiragana from the input field, and wanakana usually makes it lowercase.
      const hiraganaSearchTerm = term; 

      termMatch = hiraganaPoint.includes(hiraganaSearchTerm);
    }

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
  const list = document.getElementById("results-list");

  let term = rawTerm; 
  let exactMatch = false;

  // Check for standard or Japanese quotes for exact match
  if ((rawTerm.startsWith('"') && rawTerm.endsWith('"')) || (rawTerm.startsWith('「') && rawTerm.endsWith('」'))) {
    term = rawTerm.substring(1, rawTerm.length - 1);
    exactMatch = true;
  } else {
    // For non-exact matches, wanakana.bind() has already converted the input to Hiragana in the search bar.
    // We just need to ensure it's lowercase for consistency if wanakana wasn't active for some reason.
    // No, wanakana.bind() handles the conversion directly in the input field. The value from getElementById("search").value will already be Hiragana.
    // We should ensure the search term is what's in the input field, which should be Hiragana.
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
  // buttons
  document.getElementById('sign-in-button').addEventListener('click', signInWithGoogle);
  document.getElementById('sign-out-button').addEventListener('click', signOutUser);
  document.getElementById('mode-toggle').addEventListener('click', toggleMode);

  // Source select dropdown
  document.getElementById('source-select').addEventListener('change', updateDataVisualization);

  // Wanakana input listener for search bar AND search triggering
  const searchInput = document.getElementById("search");
  if (window.wanakana && searchInput) {
    wanakana.bind(searchInput); // Let Wanakana handle the input conversion (IME mode)
    
    // After Wanakana converts the input, the 'input' event will fire with the new (Hiragana) value.
    // We then call our search function.
    // A short debounce can prevent too many rapid searches if Wanakana fires events mid-conversion for complex inputs,
    // but for typical usage, direct listening is often fine. Let's start direct.
    searchInput.addEventListener('input', search); 
  }

  // databases checkboxes
  document.querySelectorAll('.database-filters input').forEach(checkbox => {
    checkbox.addEventListener('change', async () => {
      await userSettingsManager.setFilterState(checkbox.id, checkbox.checked);
      search();
    });
  });
  // databases locks
  document.querySelectorAll('.database-filters i').forEach(lock => {
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

// Helper function to determine the logical day based on 6 AM cutoff
function getLogicalDay(dateInput) {
    const date = new Date(dateInput); // Handles Date objects and ISO strings
    const cutoffHour = 6;
    const localHour = date.getHours();

    let logicalDayDate = new Date(date); // Start with a copy
    if (localHour < cutoffHour) {
        logicalDayDate.setDate(date.getDate() - 1); // Go to previous calendar day
    }
    logicalDayDate.setHours(0, 0, 0, 0); // Normalize to the beginning of that logical day
    return logicalDayDate;
}

// Helper function to get today's date (start of day) considering 6 AM cutoff
function getTodayWithCutoff() {
    return getLogicalDay(new Date());
}

// Helper function to format date as YYYY-MM-DD
function formatDateAsYYYYMMDD(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// SETTINGS BUTTON
const openSettings = () => {
  const filtersElement = document.getElementById('database-filters');
  filtersElement.style.display = filtersElement.style.display === 'none' ? 'block' : 'none';
}
document.getElementById('settings-button').addEventListener('click', openSettings);


const purgeData = async () => {
  const storage = userSettingsManager._getStorage();
  const userId = userSettingsManager._getUserId();

  if (storage === 'firebase') {
    try {
      await updateUserData(userId, {
        filters: {},
        locked: {},
        grammarPoints: {},
        unreadOnly: false
      });
      alert("Firebase data purged.");
    } catch (error) {
      console.error("Error purging Firebase data:", error);
      alert("Failed to purge Firebase data. Check the console for errors.");
    }
  } else {
    localStorage.clear();
    alert("LocalStorage data purged.");
  }
  window.location.reload(); // Refresh the page to reflect the changes
};

// Attach the event listener to the button
// document.getElementById('purge-button').addEventListener('click', purgeData);