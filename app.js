// START OF THE COMPLETE APP.JS FILE
const auth = window.fbAuth;
const {
  signInWithGoogle,
  signOutUser,
  getUserData,
  updateUserData
} = window.firebaseApp;

// --- DATABASE MANAGER ---
class DatabaseManager {
  constructor() {
    this.cache = new Map();
    this.loadingPromises = new Map();
  }

  async loadDatabase(source) {
    if (this.cache.has(source)) return this.cache.get(source);
    if (this.loadingPromises.has(source)) return this.loadingPromises.get(source);

    const loadPromise = (async () => {
      try {
        const response = await fetch(`db/${source}.json`);
        if (!response.ok) throw new Error(`Failed to load ${source}.json: ${response.status}`);
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

// --- MODE MANAGEMENT ---
const modes = ['search', 'data', 'groups'];
let currentMode = 'search';

function switchMode(newMode) {
    if (!modes.includes(newMode)) return;

    currentMode = newMode;
    modes.forEach(mode => {
        const el = document.getElementById(`${mode}-mode`);
        if (el) el.style.display = (mode === currentMode) ? 'block' : 'none';
    });

    const modeToggle = document.getElementById('mode-toggle');
    if (currentMode === 'search') {
        modeToggle.innerHTML = '<i class="fa-solid fa-chart-line"></i>'; // Icon to switch to Data
    } else if (currentMode === 'data') {
        modeToggle.innerHTML = '<i class="fa-solid fa-layer-group"></i>'; // Icon to switch to Groups
        updateDataVisualization();
    } else if (currentMode === 'groups') {
        modeToggle.innerHTML = '<i class="fa-solid fa-search"></i>'; // Icon to switch to Search
        updateGroupsView();
    }
}

function toggleMode() {
    const nextIndex = (modes.indexOf(currentMode) + 1) % modes.length;
    switchMode(modes[nextIndex]);
}


// --- USER SETTINGS MANAGER ---
const userSettingsManager = {
  _getStorage: () => auth.currentUser ? 'firebase' : 'localStorage',
  _getUserId: () => auth.currentUser ? auth.currentUser.uid : null,

  async getSetting(key) {
    const storage = this._getStorage();
    if (storage === 'firebase') {
      const userData = await getUserData(this._getUserId());
      const defaults = { unreadOnly: true, readOnly: false, grammarPoints: {}, grammarGroups: {}, filters: {}, locked: {} };
      return userData[key] ?? defaults[key];
    } else {
      const value = localStorage.getItem(key);
      if (key === 'unreadOnly') return value !== 'false';
      if (key === 'readOnly') return value === 'true';
      if (!value) return {};
      return JSON.parse(value);
    }
  },

  async getAllSettings() {
    const storage = this._getStorage();
    if (storage === 'firebase') {
        const userData = await getUserData(this._getUserId());
        return {
            filters: userData.filters ?? {},
            locked: userData.locked ?? {},
            grammarPoints: userData.grammarPoints ?? {},
            grammarGroups: userData.grammarGroups ?? {},
            unreadOnly: userData.unreadOnly ?? true,
            readOnly: userData.readOnly ?? false,
        };
    } else {
        return {
            filters: JSON.parse(localStorage.getItem('filters') || '{}'),
            locked: JSON.parse(localStorage.getItem('locked') || '{}'),
            grammarPoints: JSON.parse(localStorage.getItem('grammarPoints') || '{}'),
            grammarGroups: JSON.parse(localStorage.getItem('grammarGroups') || '{}'),
            unreadOnly: localStorage.getItem('unreadOnly') !== 'false',
            readOnly: localStorage.getItem('readOnly') === 'true',
        };
    }
  },

  async setSetting(key, value) {
    const storage = this._getStorage();
    const userId = this._getUserId();
    if (storage === 'firebase') {
        await updateUserData(userId, { [key]: value });
    } else {
        localStorage.setItem(key, typeof value === 'object' ? JSON.stringify(value) : value.toString());
    }
  },
  
  async setFilterState(filterId, isChecked) {
    const filters = await this.getSetting('filters');
    filters[filterId] = isChecked;
    await this.setSetting('filters', filters);
  },

  async setReadStatus(pointId, isRead) {
      const grammarPoints = await this.getSetting('grammarPoints');
      if (!grammarPoints[pointId]) grammarPoints[pointId] = {};
      grammarPoints[pointId].readStatus = isRead;
      grammarPoints[pointId].readDate = isRead ? new Date().toISOString() : null;
      await this.setSetting('grammarPoints', grammarPoints);
  },

  async setLockedState(lockId, isLocked) {
    const locked = await this.getSetting('locked');
    locked[lockId] = isLocked;
    await this.setSetting('locked', locked);
  },

  async setGrammarGroup(groups) {
      await this.setSetting('grammarGroups', groups);
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

async function toggleAllDatabases() { await setAllDatabases(true); }
async function untoggleAllDatabases() { await setAllDatabases(false); }


// --- SEARCH PANEL LOGIC ---
async function search() {
  const rawTerm = document.getElementById("search").value;
  let term = rawTerm, exactMatch = false;
  if ((rawTerm.startsWith('"') && rawTerm.endsWith('"')) || (rawTerm.startsWith('「') && rawTerm.endsWith('」'))) {
    term = rawTerm.substring(1, rawTerm.length - 1);
    exactMatch = true;
  }

  const [data, settings] = await Promise.all([fetchData(), userSettingsManager.getAllSettings()]);
  const { grammarPoints, unreadOnly, readOnly } = settings;
  const filteredResults = filterData(data, term, exactMatch, grammarPoints, unreadOnly, readOnly);
  renderResults(document.getElementById("results-list"), filteredResults, grammarPoints);
}

async function fetchData() {
  const selectedDbs = [];
  document.querySelectorAll('.database-filters input[type="checkbox"]').forEach(cb => {
    if (cb.checked) selectedDbs.push(cb.value);
  });
  return await databaseManager.loadSelectedDatabases(selectedDbs);
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
    if (unreadOnly && grammarPoints[d.id]?.readStatus) return false;
    if (readOnly && !grammarPoints[d.id]?.readStatus) return false;
    return true;
  });
}

function renderResults(listElement, filteredResults, grammarPoints) {
  if(!listElement) return;
  listElement.innerHTML = "";
  const fragment = document.createDocumentFragment();
  filteredResults.forEach(d => {
    fragment.appendChild(createResultElement(d, grammarPoints));
  });
  listElement.appendChild(fragment);
}

function createResultElement(d, grammarPoints) {
  const container = document.createElement("div");
  container.className = `result-container`;
  container.dataset.id = d.id;

  const link = document.createElement("a");
  link.className = `result-link ${d.shorthand}`;
  link.href = d.link;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.innerHTML = `<div class="result-title">${d.point}</div>`;

  const detailsDiv = document.createElement("div");
  detailsDiv.className = "result-details";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = grammarPoints[d.id]?.readStatus || false;
  checkbox.dataset.id = d.id;

  checkbox.onchange = async () => {
    await userSettingsManager.setReadStatus(d.id, checkbox.checked);
    const unreadOnly = document.getElementById('unseen-only-btn').getAttribute('aria-pressed') === 'true';
    const readOnly = document.getElementById('seen-only-btn').getAttribute('aria-pressed') === 'true';
    if ((unreadOnly && checkbox.checked) || (readOnly && !checkbox.checked)) {
      container.classList.add('fade-out');
      setTimeout(() => container.remove(), 500);
    }
  };

  detailsDiv.appendChild(checkbox);
  link.appendChild(detailsDiv);
  container.appendChild(link);

  container.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    container.classList.toggle('selected');
    updateActionButtonsVisibility('search-actions', '.result-container.selected');
  });

  return container;
}

async function toggleUnseenOnly() {
    const unseenBtn = document.getElementById('unseen-only-btn');
    const seenBtn = document.getElementById('seen-only-btn');
    const newValue = unseenBtn.getAttribute('aria-pressed') !== 'true';

    unseenBtn.setAttribute('aria-pressed', newValue.toString());
    await userSettingsManager.setSetting('unreadOnly', newValue);

    if (newValue && seenBtn.getAttribute('aria-pressed') === 'true') {
        seenBtn.setAttribute('aria-pressed', 'false');
        await userSettingsManager.setSetting('readOnly', false);
    }
    await search();
    updateFilterButtonStyles();
}

async function toggleSeenOnly() {
    const seenBtn = document.getElementById('seen-only-btn');
    const unseenBtn = document.getElementById('unseen-only-btn');
    const newValue = seenBtn.getAttribute('aria-pressed') !== 'true';

    seenBtn.setAttribute('aria-pressed', newValue.toString());
    await userSettingsManager.setSetting('readOnly', newValue);

    if (newValue && unseenBtn.getAttribute('aria-pressed') === 'true') {
        unseenBtn.setAttribute('aria-pressed', 'false');
        await userSettingsManager.setSetting('unreadOnly', false);
    }
    await search();
    updateFilterButtonStyles();
}

function updateFilterButtonStyles() {
    const unseenBtn = document.getElementById('unseen-only-btn');
    const seenBtn = document.getElementById('seen-only-btn');
    unseenBtn.classList.toggle('active', unseenBtn.getAttribute('aria-pressed') === 'true');
    seenBtn.classList.toggle('active', seenBtn.getAttribute('aria-pressed') === 'true');
}

// --- DATA PANEL LOGIC ---
async function updateDataVisualization() {
  const selectedSource = document.getElementById('source-select').value;
  const allDbNames = ['aap', 'bunpro', 'donna-toki', 'dojg', 'hojgp1', 'hojgp2', 'nihongo-kyoshi', 'imabi', 'taekim', 'maggie'];
  const [grammarPoints, dataForStats, allData] = await Promise.all([
      userSettingsManager.getSetting('grammarPoints'),
      databaseManager.loadSelectedDatabases(selectedSource === 'all' ? allDbNames : [selectedSource]),
      databaseManager.loadSelectedDatabases(allDbNames)
  ]);

  updateDataHeader(selectedSource, dataForStats.length);
  const stats = calculateStats(grammarPoints, dataForStats);
  updateStatsDisplay(stats);
  updateProgressBar(stats);
  updateRecentPoints(grammarPoints, allData);
  updateHeatmap(grammarPoints, dataForStats);
}

function updateDataHeader(source, totalPoints) {
    const header = document.getElementById('data-header');
    const sourceName = source === 'all' ? 'All Sources' : source.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    if(header) header.innerHTML = `<h2>${sourceName}</h2><p>Total Grammar Points: ${totalPoints}</p>`;
}

function calculateStats(grammarPoints, data) {
  const now = new Date();
  const today = getTodayWithCutoff();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const stats = { today: 0, week: 0, month: 0, last7: 0, last14: 0, last30: 0, total: 0, read: 0 };

  const readPoints = data
    .filter(item => grammarPoints[item.id]?.readStatus)
    .map(item => ({ date: new Date(grammarPoints[item.id].readDate) }));

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
    if (progressFill && progressText) {
        const percentage = stats.total > 0 ? (stats.read / stats.total) * 100 : 0;
        progressFill.style.width = `${percentage}%`;
        progressText.textContent = `${stats.read}/${stats.total} points read`;
    }
}

function updateRecentPoints(grammarPoints, allData) {
    const recentPointsList = document.getElementById('recent-points-list');
    if(!recentPointsList) return;
    recentPointsList.innerHTML = '';
    const readPoints = Object.entries(grammarPoints)
        .filter(([_, pointSetting]) => pointSetting.readStatus && pointSetting.readDate)
        .map(([id, pointSetting]) => ({ id, date: new Date(pointSetting.readDate) }))
        .sort((a, b) => b.date.getTime() - a.date.getTime());

    readPoints.forEach(point => {
        const pointData = allData.find(d => d.id === point.id);
        if (!pointData) return;
        const item = document.createElement('div');
        item.className = 'recent-point-item';
        item.dataset.pointId = point.id;
        item.dataset.link = pointData.link;
        item.innerHTML = `
            <a href="${pointData.link}" class="${pointData.shorthand}" target="_blank" rel="noopener noreferrer">
                <span class="point-name">${pointData.point}</span>
            </a>
            <span class="read-date">${point.date.toLocaleDateString()}</span>
            <button class="toggle-read-status" title="Mark as Unseen"><i class="fa-solid fa-check"></i></button>
        `;
        item.querySelector('.toggle-read-status').addEventListener('click', async (e) => {
            e.stopPropagation();
            await userSettingsManager.setReadStatus(point.id, false);
            updateDataVisualization(); // Refresh the whole data view
        });
        item.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            item.classList.toggle('selected');
            updateActionButtonsVisibility('read-points-actions', '.recent-point-item.selected');
        });
        recentPointsList.appendChild(item);
    });
}

function updateHeatmap(grammarPoints, dataForStats) {
    const heatmap = document.getElementById('heatmap');
    if(!heatmap) return;
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
        .filter(item => grammarPoints[item.id]?.readStatus)
        .map(item => ({ date: new Date(grammarPoints[item.id].readDate) }));

    readPoints.forEach(point => {
        const dateStr = formatDateAsYYYYMMDD(getLogicalDay(point.date));
        if (dateMap.has(dateStr)) {
            dateMap.set(dateStr, dateMap.get(dateStr) + 1);
        }
    });
    
    const counts = Array.from(dateMap.values());
    const maxPoints = Math.max(1, ...counts);
    
    const firstDayOfYear = startOfYear.getDay();
    const daysInYear = ((startOfYear.getFullYear() % 4 === 0 && startOfYear.getFullYear() % 100 > 0) || startOfYear.getFullYear() % 400 == 0) ? 366 : 365;
    const totalWeeks = Math.ceil((firstDayOfYear + daysInYear) / 7);
    const heatmapData = Array(7).fill().map(() => Array(totalWeeks).fill(null));
    currentDate = new Date(startOfYear);
    
    while (currentDate <= endOfYear) {
        const week = Math.floor((firstDayOfYear + (currentDate - startOfYear) / (24 * 60 * 60 * 1000)) / 7);
        const dayOfWeek = currentDate.getDay();
        const dateStr = currentDate.toISOString().split('T')[0];
        if (heatmapData[dayOfWeek]) {
            heatmapData[dayOfWeek][week] = { date: dateStr, count: dateMap.get(dateStr) || 0 };
        }
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


// --- GROUPS PANEL LOGIC ---
async function updateGroupsView() {
    const listEl = document.getElementById('groups-list');
    const sortMethod = document.getElementById('group-sort').value;
    if (!listEl) return;
    listEl.innerHTML = 'Loading groups...';

    const [allGroups, allPointData] = await Promise.all([
        userSettingsManager.getSetting('grammarGroups'),
        databaseManager.loadSelectedDatabases(['aap', 'bunpro', 'donna-toki', 'dojg', 'hojgp1', 'hojgp2', 'nihongo-kyoshi', 'imabi', 'taekim', 'maggie'])
    ]);

    if (!allGroups || Object.keys(allGroups).length === 0) {
        listEl.innerHTML = '<p>No groups created yet. Right-click grammar points in the search panel to create a group.</p>';
        return;
    }

    const sortedGroups = Object.values(allGroups).sort((a, b) => {
        switch(sortMethod) {
            case 'created-desc': return new Date(b.createdAt) - new Date(a.createdAt);
            case 'name-asc': return a.name.localeCompare(b.name);
            case 'modified-desc':
            default: return new Date(b.modifiedAt) - new Date(a.modifiedAt);
        }
    });

    listEl.innerHTML = '';
    sortedGroups.forEach(group => {
        const groupItem = document.createElement('div');
        groupItem.className = 'group-item';
        groupItem.innerHTML = `
            <div class="group-header">
                <span class="group-title">${group.name} (${group.points.length} points)</span>
                <div class="group-actions">
                    <i class="fa-solid fa-trash-can delete-group-btn" title="Delete Group"></i>
                    <i class="fa-solid fa-chevron-down expand-group-icon"></i>
                </div>
            </div>
            <div class="group-points" style="display: none;"></div>
        `;

        const pointsContainer = groupItem.querySelector('.group-points');
        group.points.forEach(pointId => {
            const pointData = allPointData.find(p => p.id === pointId);
            if(pointData) {
                const pointEl = document.createElement('a');
                pointEl.href = pointData.link;
                pointEl.target = '_blank';
                pointEl.rel = 'noopener noreferrer';
                pointEl.className = `result-link ${pointData.shorthand}`;
                pointEl.innerHTML = `<div class="result-title">${pointData.point}</div>`;
                pointsContainer.appendChild(pointEl);
            }
        });
        
        // Listener for the entire header (for expanding/collapsing)
        groupItem.querySelector('.group-header').addEventListener('click', (e) => {
            // Prevent expand/collapse if the delete icon was clicked
            if (e.target.classList.contains('delete-group-btn')) return;

            const icon = groupItem.querySelector('.expand-group-icon');
            pointsContainer.style.display = pointsContainer.style.display === 'block' ? 'none' : 'block';
            icon.classList.toggle('fa-chevron-down');
            icon.classList.toggle('fa-chevron-up');
        });

        // Listener specifically for the delete button
        groupItem.querySelector('.delete-group-btn').addEventListener('click', (e) => {
            e.stopPropagation(); // Stop the event from bubbling up to the header
            deleteGroup(group.id, group.name);
        });

        listEl.appendChild(groupItem);
    });
}

// --- MODAL & ACTIONS LOGIC ---
async function openGroupModal() {
    if (document.querySelectorAll('.result-container.selected').length === 0) {
        showToast('No items selected.', 'error');
        return;
    }
    const modal = document.getElementById('group-modal');
    const select = document.getElementById('group-select');
    select.innerHTML = '<option value="">--Choose a group--</option>';
    const groups = await userSettingsManager.getSetting('grammarGroups');
    if (groups) {
        for (const groupId in groups) {
            const option = document.createElement('option');
            option.value = groupId;
            option.textContent = groups[groupId].name;
            select.appendChild(option);
        }
    }
    modal.classList.add('show');
}

function closeGroupModal() {
    const modal = document.getElementById('group-modal');
    modal.classList.remove('show');
    document.getElementById('new-group-name').value = '';
    document.getElementById('group-select').selectedIndex = 0;
}

async function handleAddItemsToGroup() {
    const newGroupName = document.getElementById('new-group-name').value.trim();
    const selectedGroupId = document.getElementById('group-select').value;
    if (!newGroupName && !selectedGroupId) {
        showToast('Please select a group or enter a new name.', 'error');
        return;
    }
    const pointIds = Array.from(document.querySelectorAll('.result-container.selected')).map(item => item.dataset.id);
    const allGroups = await userSettingsManager.getSetting('grammarGroups') || {};
    const now = new Date().toISOString();
    let groupName = '';

    if (newGroupName) {
        const newGroupId = `group_${Date.now()}`;
        allGroups[newGroupId] = { id: newGroupId, name: newGroupName, createdAt: now, modifiedAt: now, points: pointIds };
        groupName = newGroupName;
    } else {
        const group = allGroups[selectedGroupId];
        group.points = [...new Set([...group.points, ...pointIds])];
        group.modifiedAt = now;
        groupName = group.name;
    }
    await userSettingsManager.setGrammarGroup(allGroups);
    showToast(`Added ${pointIds.length} item(s) to "${groupName}".`);
    closeGroupModal();
    clearSelection('.result-container.selected', 'search-actions');
}

async function deleteGroup(groupId, groupName) {
    if (!confirm(`Are you sure you want to delete the group "${groupName}"? This cannot be undone.`)) {
        return;
    }

    const allGroups = await userSettingsManager.getSetting('grammarGroups');
    if (allGroups && allGroups[groupId]) {
        delete allGroups[groupId];
        await userSettingsManager.setGrammarGroup(allGroups);
        showToast(`Group "${groupName}" has been deleted.`, 'success');
        await updateGroupsView(); // Refresh the view
    } else {
        showToast('Error: Group not found.', 'error');
    }
}

function copySelectedLinksToClipboard() {
    const selectedItems = document.querySelectorAll('.recent-point-item.selected');
    if (selectedItems.length === 0) return;
    const links = Array.from(selectedItems).map(item => item.dataset.link).join('\n');
    copyToClipboard(links, `${selectedItems.length} link(s) copied to clipboard!`);
}

// --- GENERAL & UTILITY FUNCTIONS ---
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => { if (document.body.contains(toast)) document.body.removeChild(toast); }, 300);
        }, 3000);
    }, 10);
}

function copyToClipboard(text, successMessage) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed"; 
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      if (successMessage) showToast(successMessage);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      showToast('Failed to copy links.', 'error');
    }
    document.body.removeChild(textArea);
}

function updateActionButtonsVisibility(containerId, selector) {
    const actionsContainer = document.getElementById(containerId);
    if(actionsContainer) {
        actionsContainer.style.display = document.querySelectorAll(selector).length > 0 ? 'flex' : 'none';
    }
}

function clearSelection(selector, actionsContainerId) {
    document.querySelectorAll(selector).forEach(item => item.classList.remove('selected'));
    updateActionButtonsVisibility(actionsContainerId, selector);
}

function getLogicalDay(dateInput) {
  const date = new Date(dateInput);
  const cutoffHour = 6;
  if (date.getHours() < cutoffHour) date.setDate(date.getDate() - 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getTodayWithCutoff() { return getLogicalDay(new Date()); }

function formatDateAsYYYYMMDD(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// --- INITIALIZATION & EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    auth.onAuthStateChanged(async user => {
        const settings = await userSettingsManager.getAllSettings();
        document.getElementById('sign-in-button').style.display = user ? 'none' : 'inline-block';
        document.getElementById('sign-out-button').style.display = user ? 'inline-block' : 'none';

        document.querySelectorAll('.database-filters input[type="checkbox"]').forEach(cb => {
            cb.checked = settings.filters[cb.id] ?? true;
        });
        document.querySelectorAll('.database-filters i[id$="-lock"]').forEach(lock => {
            lock.className = settings.locked[lock.id] ? 'fa-solid fa-lock' : 'fa-solid fa-lock-open';
        });

        const unseenBtn = document.getElementById('unseen-only-btn');
        unseenBtn.setAttribute('aria-pressed', settings.unreadOnly.toString());
        const seenBtn = document.getElementById('seen-only-btn');
        seenBtn.setAttribute('aria-pressed', settings.readOnly.toString());
        updateFilterButtonStyles();

        await search();
    });

    // --- Static Event Listeners ---
    document.getElementById('mode-toggle').addEventListener('click', toggleMode);
    document.getElementById('sign-in-button').addEventListener('click', signInWithGoogle);
    document.getElementById('sign-out-button').addEventListener('click', signOutUser);
    document.getElementById('settings-button').addEventListener('click', () => {
        const filtersEl = document.getElementById('database-filters');
        filtersEl.style.display = filtersEl.style.display === 'none' ? 'block' : 'none';
    });

    const searchInput = document.getElementById("search");
    if (window.wanakana) {
        wanakana.bind(searchInput);
    }
    searchInput.addEventListener('input', search);
    
    document.getElementById('source-select')?.addEventListener('change', updateDataVisualization);

    // Filter & DB Listeners
    document.querySelectorAll('.database-filters input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', async () => {
            await userSettingsManager.setFilterState(cb.id, cb.checked);
            await search();
        });
    });
    document.querySelectorAll('.database-filters i[id$="-lock"]').forEach(lock => {
        lock.addEventListener('click', async () => {
            const isLocked = lock.classList.contains('fa-lock');
            lock.className = !isLocked ? 'fa-solid fa-lock' : 'fa-solid fa-lock-open';
            await userSettingsManager.setLockedState(lock.id, !isLocked);
        });
    });
    document.getElementById('untoggle-all-btn')?.addEventListener('click', toggleAllDatabases);
    document.getElementById('toggle-all-btn')?.addEventListener('click', untoggleAllDatabases);


    document.getElementById('unseen-only-btn').addEventListener('click', toggleUnseenOnly);
    document.getElementById('seen-only-btn').addEventListener('click', toggleSeenOnly);

    // Groups Logic Listeners
    document.getElementById('add-to-group-btn').addEventListener('click', openGroupModal);
    document.getElementById('cancel-group-add').addEventListener('click', closeGroupModal);
    document.getElementById('confirm-group-add').addEventListener('click', handleAddItemsToGroup);
    document.getElementById('clear-search-selection-btn').addEventListener('click', () => clearSelection('.result-container.selected', 'search-actions'));
    document.getElementById('group-sort').addEventListener('change', updateGroupsView);
    
    // Data Panel Actions
    document.getElementById('copy-links-btn')?.addEventListener('click', copySelectedLinksToClipboard);
    document.getElementById('clear-selection-btn')?.addEventListener('click', () => clearSelection('.recent-point-item.selected', 'read-points-actions'));
    
    // Set initial mode
    switchMode('search');
});
