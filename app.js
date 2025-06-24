// START OF THE ONLY APP.JS CODE YOU NEED. COPY EVERYTHING BELOW.
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
    if (this.cache.has(source)) {
      return this.cache.get(source);
    }
    if (this.loadingPromises.has(source)) {
      return this.loadingPromises.get(source);
    }
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
        return [];
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
      return results.flat();
    } catch (error) {
      console.error('Error loading selected databases:', error);
      return [];
    }
  }
}

const databaseManager = new DatabaseManager();
let currentMode = 'search';

function toggleMode() {
  const searchMode = document.getElementById('search-mode');
  const dataMode = document.getElementById('data-mode');
  const modeToggle = document.getElementById('mode-toggle');
  if (currentMode === 'search') {
    searchMode.style.display = 'none';
    dataMode.style.display = 'block';
    modeToggle.innerHTML = '<i class="fa-solid fa-search"></i>';
    currentMode = 'data';
    updateDataVisualization();
  } else {
    searchMode.style.display = 'block';
    dataMode.style.display = 'none';
    modeToggle.innerHTML = '<i class="fa-solid fa-chart-line"></i>';
    currentMode = 'search';
  }
}

async function updateDataVisualization() {
  const selectedSource = document.getElementById('source-select').value;
  const grammarPoints = await userSettingsManager.getSetting('grammarPoints');
  const allDbNames = ['aap', 'bunpro', 'donna-toki', 'dojg', 'hojgp1', 'hojgp2', 'nihongo-kyoshi', 'imabi', 'taekim', 'maggie'];
  const dataForStats = selectedSource === 'all' ?
    await databaseManager.loadSelectedDatabases(allDbNames) :
    await databaseManager.loadDatabase(selectedSource);

  updateDataHeader(selectedSource, dataForStats.length);
  const stats = calculateStats(grammarPoints, dataForStats);
  updateStatsDisplay(stats);
  updateProgressBar(stats);

  const allData = await databaseManager.loadSelectedDatabases(allDbNames);
  updateRecentPoints(grammarPoints, allData);

  // Heatmap logic
  const heatmap = document.getElementById('heatmap');
  heatmap.innerHTML = '';
  const today = getTodayWithCutoff();
  const startOfYear = new Date(today.getFullYear(), 0, 1);
  const endOfYear = new Date(today.getFullYear(), 11, 31);
  const dateMap = new Map();
  let currentDate = new Date(startOfYear);
  while (currentDate <= endOfYear) {
    dateMap.set(currentDate.toISOString().split('T')[0], 0);
    currentDate.setDate(currentDate.getDate() + 1);
  }
  const readPoints = dataForStats
    .filter(item => grammarPoints[item.id] ?.readStatus)
    .map(item => ({
      date: new Date(grammarPoints[item.id].readDate)
    }));
  readPoints.forEach(point => {
    const dateStr = formatDateAsYYYYMMDD(getLogicalDay(point.date));
    if (dateMap.has(dateStr)) {
      dateMap.set(dateStr, dateMap.get(dateStr) + 1);
    }
  });
  const maxPoints = Math.max(1, ...Array.from(dateMap.values()));
  const firstDayOfYear = startOfYear.getDay();
  const daysInYear = 365 + (startOfYear.getFullYear() % 4 === 0 ? 1 : 0);
  const totalWeeks = Math.ceil((firstDayOfYear + daysInYear) / 7);
  const heatmapData = Array(7).fill().map(() => Array(totalWeeks).fill(null));
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
  for (let day = 0; day < 7; day++) {
    const dayRow = document.createElement('div');
    dayRow.className = 'heatmap-row';
    for (let week = 0; week < totalWeeks; week++) {
      const cell = document.createElement('div');
      cell.className = 'heatmap-day';
      const data = heatmapData[day][week];
      if (data) {
        let colorClass;
        if (data.count === 0) colorClass = 'var(--heatmap-0)';
        else if (data.count <= maxPoints * 0.25) colorClass = 'var(--heatmap-1)';
        else if (data.count <= maxPoints * 0.5) colorClass = 'var(--heatmap-2)';
        else if (data.count <= maxPoints * 0.75) colorClass = 'var(--heatmap-3)';
        else colorClass = 'var(--heatmap-4)';
        cell.style.backgroundColor = colorClass;
        cell.title = `${data.date}: ${data.count} points`;
        if (data.date === formatDateAsYYYYMMDD(getTodayWithCutoff())) {
          cell.style.boxSizing = 'border-box';
          cell.style.border = '2px solid var(--main)';
        }
      } else {
        cell.style.backgroundColor = 'transparent';
      }
      dayRow.appendChild(cell);
    }
    heatmap.appendChild(dayRow);
  }
}

function updateDataHeader(source, totalPoints) {
  const header = document.getElementById('data-header');
  const sourceName = source === 'all' ? 'All Sources' : source.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  header.innerHTML = `<h2>${sourceName}</h2><p>Total Grammar Points: ${totalPoints}</p>`;
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

  const readPoints = data
    .filter(item => grammarPoints[item.id] ?.readStatus)
    .map(item => ({
      date: new Date(grammarPoints[item.id].readDate)
    }));

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

function updateRecentPoints(grammarPoints, allData) {
  const recentPointsList = document.getElementById('recent-points-list');
  recentPointsList.innerHTML = '';
  const readPoints = Object.entries(grammarPoints)
    .filter(([_, pointSetting]) => pointSetting.readStatus && pointSetting.readDate)
    .map(([id, pointSetting]) => ({
      id,
      date: new Date(pointSetting.readDate)
    }))
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 100);

  readPoints.forEach(point => {
    const pointData = allData.find(d => d.id === point.id);
    if (!pointData) return;
    const item = document.createElement('div');
    item.className = 'recent-point-item';
    item.innerHTML = `
      <a href="${pointData.link}" class="${pointData.shorthand}" target="_blank" rel="noopener noreferrer">
        <span class="point-name">${pointData.point}</span>
      </a>
      <span class="read-date">${point.date.toLocaleDateString()}</span>`;
    recentPointsList.appendChild(item);
  });
}

const userSettingsManager = {
  _getStorage: () => auth.currentUser ? 'firebase' : 'localStorage',
  _getUserId: () => auth.currentUser ? auth.currentUser.uid : null,

  async getSetting(key) {
    const storage = this._getStorage();
    const userId = this._getUserId();
    if (storage === 'firebase') {
      const userData = await getUserData(userId);
      if (key === 'unreadOnly') return userData[key] ?? true;
      if (key === 'readOnly') return userData[key] ?? false;
      return userData[key] ?? {};
    } else {
      const value = localStorage.getItem(key);
      if (key === 'unreadOnly') return value !== 'false';
      if (key === 'readOnly') return value === 'true';
      return value ? JSON.parse(value) : {};
    }
  },

  async getAllSettings() {
    const storage = this._getStorage();
    const userId = this._getUserId();
    if (storage === 'firebase') {
      const userData = await getUserData(userId);
      return {
        filters: userData.filters ?? {},
        locked: userData.locked ?? {},
        grammarPoints: userData.grammarPoints ?? {},
        unreadOnly: userData.unreadOnly ?? true,
        readOnly: userData.readOnly ?? false,
      };
    } else {
      return {
        filters: JSON.parse(localStorage.getItem('filters') || '{}'),
        locked: JSON.parse(localStorage.getItem('locked') || '{}'),
        grammarPoints: JSON.parse(localStorage.getItem('grammarPoints') || '{}'),
        unreadOnly: localStorage.getItem('unreadOnly') !== 'false',
        readOnly: localStorage.getItem('readOnly') === 'true',
      };
    }
  },

  async setSetting(key, value) {
    const storage = this._getStorage();
    const userId = this._getUserId();
    if (storage === 'firebase') {
      await updateUserData(userId, {
        [key]: value
      });
    } else {
      localStorage.setItem(key, value.toString());
    }
  },

  async setFilterState(filterId, isChecked) {
    const storage = this._getStorage();
    const userId = this._getUserId();
    let currentFilters = {};
    if (storage === 'firebase') {
        const userData = await getUserData(userId);
        currentFilters = userData.filters ?? {};
    } else {
        currentFilters = JSON.parse(localStorage.getItem('filters') || '{}');
    }
    currentFilters[filterId] = isChecked;
    if (storage === 'firebase') {
        await updateUserData(userId, { filters: currentFilters });
    } else {
        localStorage.setItem('filters', JSON.stringify(currentFilters));
    }
  },

  async setReadStatus(grammarPointId, isRead) {
    const storage = this._getStorage();
    const userId = this._getUserId();
    let currentReadStatus = {};
    if (storage === 'firebase') {
      const userData = await getUserData(userId);
      currentReadStatus = userData.grammarPoints ?? {};
    } else {
      currentReadStatus = JSON.parse(localStorage.getItem('grammarPoints') || '{}');
    }
    if (!currentReadStatus[grammarPointId]) {
      currentReadStatus[grammarPointId] = {};
    }
    currentReadStatus[grammarPointId].readStatus = isRead;
    currentReadStatus[grammarPointId].readDate = isRead ? new Date().toISOString() : null;
    if (storage === 'firebase') {
      await updateUserData(userId, {
        grammarPoints: currentReadStatus
      });
    } else {
      localStorage.setItem('grammarPoints', JSON.stringify(currentReadStatus));
    }
  },

  async setLockedState(lockId, isLocked) {
    const storage = this._getStorage();
    const userId = this._getUserId();
    let currentLocked = {};
     if (storage === 'firebase') {
        const userData = await getUserData(userId);
        currentLocked = userData.locked ?? {};
    } else {
        currentLocked = JSON.parse(localStorage.getItem('locked') || '{}');
    }
    currentLocked[lockId] = isLocked;
    if (storage === 'firebase') {
        await updateUserData(userId, { locked: currentLocked });
    } else {
        localStorage.setItem('locked', JSON.stringify(currentLocked));
    }
  }
};

async function setAllDatabases(checked) {
  document.querySelectorAll('.database-filters input[type="checkbox"]').forEach(async (checkbox) => {
    if (!document.getElementById(`${checkbox.id}-lock`).classList.contains('fa-lock')) {
      checkbox.checked = checked;
      await userSettingsManager.setFilterState(checkbox.id, checked);
    }
  });
  await search();
}

async function toggleAllDatabases() {
  await setAllDatabases(true);
}
async function untoggleAllDatabases() {
  await setAllDatabases(false);
}

function checkSelectedDatabases() {
  const selectedDatabases = [];
  document.querySelectorAll('.database-filters input[type="checkbox"]').forEach(cb => {
    if (cb.checked) selectedDatabases.push(cb.value);
  });
  return selectedDatabases;
}

async function toggleUnreadOnly() {
  const unreadBtn = document.getElementById('unread-only-btn');
  const readBtn = document.getElementById('read-only-btn');
  const newValue = unreadBtn.getAttribute('aria-pressed') !== 'true';

  unreadBtn.setAttribute('aria-pressed', newValue.toString());
  await userSettingsManager.setSetting('unreadOnly', newValue);

  if (newValue && readBtn.getAttribute('aria-pressed') === 'true') {
    readBtn.setAttribute('aria-pressed', 'false');
    await userSettingsManager.setSetting('readOnly', false);
  }
  await search();
}

async function toggleReadOnly() {
  const readBtn = document.getElementById('read-only-btn');
  const unreadBtn = document.getElementById('unread-only-btn');
  const newValue = readBtn.getAttribute('aria-pressed') !== 'true';

  readBtn.setAttribute('aria-pressed', newValue.toString());
  await userSettingsManager.setSetting('readOnly', newValue);

  if (newValue && unreadBtn.getAttribute('aria-pressed') === 'true') {
    unreadBtn.setAttribute('aria-pressed', 'false');
    await userSettingsManager.setSetting('unreadOnly', false);
  }
  await search();
}

async function fetchData() {
  const selectedDatabases = checkSelectedDatabases();
  return await databaseManager.loadSelectedDatabases(selectedDatabases);
}

function filterData(data, term, exactMatch, grammarPoints, unreadOnly, readOnly) {
  return data.filter(d => {
    let termMatch = true;
    if (term) {
      const pointLower = d.point.toLowerCase();
      const hiraganaPoint = window.wanakana ? wanakana.toHiragana(pointLower) : pointLower;
      termMatch = exactMatch ? d.point === term : hiraganaPoint.includes(term);
    }
    if (!termMatch) return false;
    if (unreadOnly && grammarPoints[d.id] ?.readStatus) return false;
    if (readOnly && !grammarPoints[d.id] ?.readStatus) return false;
    return true;
  });
}

function createResultElement(d, grammarPoints) {
  const container = document.createElement("div");
  container.className = `result-container`;
  const link = document.createElement("a");
  link.className = `result-link ${d.shorthand}`;
  link.href = d.link;
  link.target = "_blank";
  link.innerHTML = `<div class="result-title">${d.point}</div>`;
  const detailsDiv = document.createElement("div");
  detailsDiv.className = "result-details";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = grammarPoints[d.id] ?.readStatus || false;
  checkbox.dataset.id = d.id;
  checkbox.onchange = async () => {
    await userSettingsManager.setReadStatus(d.id, checkbox.checked);
    const unreadOnly = document.getElementById('unread-only-btn').getAttribute('aria-pressed') === 'true';
    const readOnly = document.getElementById('read-only-btn').getAttribute('aria-pressed') === 'true';
    if ((unreadOnly && checkbox.checked) || (readOnly && !checkbox.checked)) {
      container.classList.add('fade-out', 'hidden');
      setTimeout(() => container.remove(), 500);
    }
  };
  detailsDiv.appendChild(checkbox);
  link.appendChild(detailsDiv);
  container.appendChild(link);
  return container;
}

function renderResults(listElement, filteredResults, grammarPoints) {
  listElement.innerHTML = "";
  const fragment = document.createDocumentFragment();
  filteredResults.forEach(d => {
    fragment.appendChild(createResultElement(d, grammarPoints));
  });
  listElement.appendChild(fragment);
}

async function search() {
  const rawTerm = document.getElementById("search").value;
  let term = rawTerm,
    exactMatch = false;
  if ((rawTerm.startsWith('"') && rawTerm.endsWith('"')) || (rawTerm.startsWith('「') && rawTerm.endsWith('」'))) {
    term = rawTerm.substring(1, rawTerm.length - 1);
    exactMatch = true;
  }

  const [dados, settings] = await Promise.all([
    fetchData(),
    userSettingsManager.getAllSettings()
  ]);

  const {
    grammarPoints,
    unreadOnly,
    readOnly
  } = settings;
  const filteredResults = filterData(dados, term, exactMatch, grammarPoints, unreadOnly, readOnly);
  renderResults(document.getElementById("results-list"), filteredResults, grammarPoints);
}

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const searchTerm = urlParams.get('search');
  if (searchTerm) document.getElementById('search').value = searchTerm;

  auth.onAuthStateChanged(async user => {
    const settings = await userSettingsManager.getAllSettings();

    if (user) {
      document.getElementById('sign-in-button').style.display = 'none';
      document.getElementById('sign-out-button').style.display = 'inline-block';
    } else {
      document.getElementById('sign-in-button').style.display = 'inline-block';
      document.getElementById('sign-out-button').style.display = 'none';
    }

    document.querySelectorAll('.database-filters input[type="checkbox"]').forEach(cb => {
      cb.checked = settings.filters[cb.id] ?? true;
    });
    document.querySelectorAll('.database-filters i').forEach(lock => {
      lock.className = settings.locked[lock.id] ? 'fa-solid fa-lock' : 'fa-solid fa-lock-open';
    });
    document.getElementById('unread-only-btn').setAttribute('aria-pressed', settings.unreadOnly.toString());
    document.getElementById('read-only-btn').setAttribute('aria-pressed', settings.readOnly.toString());

    await search();
  });

  document.getElementById('sign-in-button').addEventListener('click', signInWithGoogle);
  document.getElementById('sign-out-button').addEventListener('click', signOutUser);
  document.getElementById('mode-toggle').addEventListener('click', toggleMode);
  document.getElementById('source-select').addEventListener('change', updateDataVisualization);
  const searchInput = document.getElementById("search");
  if (window.wanakana && searchInput) {
    wanakana.bind(searchInput);
    searchInput.addEventListener('input', search);
  }
  document.querySelectorAll('.database-filters input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', async () => {
      await userSettingsManager.setFilterState(cb.id, cb.checked);
      await search();
    });
  });
  document.querySelectorAll('.database-filters i').forEach(lock => {
    lock.addEventListener('click', async () => {
      const isLocked = lock.classList.contains('fa-lock');
      lock.className = !isLocked ? 'fa-solid fa-lock' : 'fa-solid fa-lock-open';
      await userSettingsManager.setLockedState(lock.id, !isLocked);
    });
  });
  document.getElementById('settings-button').addEventListener('click', () => {
    const filtersElement = document.getElementById('database-filters');
    filtersElement.style.display = filtersElement.style.display === 'none' ? 'block' : 'none';
  });
});

function handleResponsiveChanges() {
  const signInButton = document.getElementById('sign-in-button');
  const signOutButton = document.getElementById('sign-out-button');
  const filtersElement = document.getElementById('database-filters');

  if (window.innerWidth <= 768) {
    filtersElement.style.display = 'none';
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

function getLogicalDay(dateInput) {
  const date = new Date(dateInput);
  const cutoffHour = 6;
  if (date.getHours() < cutoffHour) {
    date.setDate(date.getDate() - 1);
  }
  date.setHours(0, 0, 0, 0);
  return date;
}

function getTodayWithCutoff() {
  return getLogicalDay(new Date());
}

function formatDateAsYYYYMMDD(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function purgeData() {
  const storage = userSettingsManager._getStorage();
  const userId = userSettingsManager._getUserId();
  const clearedData = {
    filters: {},
    locked: {},
    grammarPoints: {},
    unreadOnly: true,
    readOnly: false
  };

  if (storage === 'firebase') {
    await updateUserData(userId, clearedData);
    alert("Firebase data purged.");
  } else {
    localStorage.clear();
    // After clearing, set the defaults back
    Object.keys(clearedData).forEach(key => {
        const value = typeof clearedData[key] === 'object' ? JSON.stringify(clearedData[key]) : clearedData[key];
        localStorage.setItem(key, value);
    });
    alert("LocalStorage data purged.");
  }
  window.location.reload();
}
// END OF THE COMPLETE APP.JS FILE