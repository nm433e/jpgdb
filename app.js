const auth = window.fbAuth;
const {
  signInWithGoogle,
  signOutUser,
  getUserData,
  updateUserData
} = window.firebaseApp;

// TOGGLE DATABASES FUNCTION
async function setAllDatabases(checked) {
  const checkboxes = document.querySelectorAll('.database-filters input[type="checkbox"]');
  const user = auth.currentUser;

  const updateFilters = (filters) => {
    checkboxes.forEach(checkbox => {
      if (document.getElementById(`${checkbox.id}-lock`).classList.contains('fa-lock')) return;
      checkbox.checked = checked;
      filters[checkbox.id] = checked;
    });
  };

  if (user) {
    const userData = await getUserData(user.uid);
    const newFilters = { ...userData.filters };
    updateFilters(newFilters);
    await updateUserData(user.uid, { filters: newFilters });
  } else {
    checkboxes.forEach(checkbox => {
      if (document.getElementById(`${checkbox.id}-lock`).classList.contains('fa-lock')) return;
      checkbox.checked = checked;
      localStorage.setItem(checkbox.id, checked.toString());
    });
  }

  search();
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

async function toggleUnreadOnly() {
  const button = document.getElementById('unread-only-btn');
  const isPressed = button.getAttribute('aria-pressed') === 'true';
  button.setAttribute('aria-pressed', (!isPressed).toString());

  if (auth.currentUser) {
    const userData = await getUserData(auth.currentUser.uid);
    await updateUserData(auth.currentUser.uid, {
      unreadOnly: !isPressed
    });
  } else {
    localStorage.setItem('unreadOnly', (!isPressed).toString());
  }

  search();
}

// SAVE FILTERS FUNCTION
async function saveFilterStateToFirebase(checkbox) {
  const user = auth.currentUser;
  if (!user) {
    // Save to localStorage for non-logged in users
    localStorage.setItem(checkbox.id, checkbox.checked.toString());
    return;
  }

  const userData = await getUserData(user.uid);
  const newFilters = { ...userData.filters, [checkbox.id]: checkbox.checked };

  await updateUserData(user.uid, {
    filters: newFilters
  });
}

// SEARCH FUNCTIONALITY
async function search() {
  const rawTerm = document.getElementById("search").value;
  const list = document.getElementById("resultado");
  list.innerHTML = "";

  let term = rawTerm.toLowerCase();
  let exactMatch = false;

  // Check for exact match quotes
  if ((rawTerm.startsWith('"') && rawTerm.endsWith('"')) || (rawTerm.startsWith('"') && rawTerm.endsWith('"'))) {
    term = rawTerm.substring(1, rawTerm.length - 1); // Extract term without quotes
    exactMatch = true;
  }

  const dados = await fetch("database.json").then(r => r.json());

  // get user read status
  let readStatus = {};
  if (auth.currentUser) {
    const userData = await getUserData(auth.currentUser.uid);
    readStatus = userData.readStatus || {};
  } else {
    readStatus = JSON.parse(localStorage.getItem('readStatus') || '{}');
  }

  // filter according to db
  const selectedDatabases = checkSelectedDatabases();
  const filtered = dados.filter(d => {
    const point = d.point;
    const sourceMatch = selectedDatabases.includes(d.source);

    if (exactMatch) {
      return point === term && sourceMatch; // Case-sensitive exact match
    } else {
      return point.toLowerCase().includes(term) && sourceMatch; // Case-insensitive includes match
    }
  });

  // filter by read status
  const showUnreadOnly = document.getElementById('unread-only-btn').getAttribute('aria-pressed') === 'true';
  const filteredByRead = showUnreadOnly 
    ? filtered.filter(d => !readStatus[d.id])
    : filtered;


  filteredByRead.forEach(d => {
    // filter by read
    
    //container div
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

    //details
    const detailsDiv = document.createElement("div");
    detailsDiv.className = "result-details";
    //source
    // const sourceText = document.createTextNode(`${d.source} `);
    //checkbox
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = readStatus[d.id] || false;
    checkbox.onchange = () => {
      updateGrammarPoint(d.id, checkbox.checked);

      // Check if unreadOnly is true
      const isUnreadOnly = localStorage.getItem('unreadOnly') === 'true';
      if (isUnreadOnly) {
        // Remove the entire parent div of the checkbox
        const parentDiv = checkbox.closest('.result-container'); // Assuming .result-container is the class of the parent div
        if (parentDiv) {
          parentDiv.classList.add('fade-out');
          parentDiv.classList.add('hidden');
          // Add fade-out class
          // Wait for the transition to complete before removing the element
          setTimeout(() => {
            parentDiv.remove();
          }, 500); // Match this duration with the CSS transition duration
        }
      }
    };
    // Assemble details
    // detailsDiv.appendChild(sourceText);
    detailsDiv.appendChild(checkbox);
    // Assemble container
    link.appendChild(detailsDiv);
    container.appendChild(link);
    // Add to list
    list.appendChild(container);
  });
}

// This updates the read of status of a grammar point of unique id
// It is triggered by the change in a checkbox
// Local and Cloud storage format is {id1: true/false, id2: true/false, ...}
// arguments: id (string) = grammar point id, checked (boolean) = checkbox status
async function updateGrammarPoint(id, checked) {
  if (!auth.currentUser) {
    // Save to localStorage for non-logged in users 
    const readStatus = JSON.parse(localStorage.getItem('readStatus') || '{}');
    readStatus[id] = checked;
    localStorage.setItem('readStatus', JSON.stringify(readStatus));
    return;
  }

  try {
    // Firebase format is {id1: true/false, id2: true/false, ...}
    const userData = await getUserData(auth.currentUser.uid);
    const newStatus = { ...userData.readStatus, [id]: checked };
    await updateUserData(auth.currentUser.uid, { readStatus: newStatus });
  } catch (error) {
    console.error('Update failed:', error);
  }
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

      // restore filters from localStorage
      const checkboxes = document.querySelectorAll('.database-filters input[type="checkbox"]');
      checkboxes.forEach(checkbox => {
        const saved = localStorage.getItem(checkbox.id);
        if (saved) checkbox.checked = saved === "true";
      });

      // restore locks from localStorage
      const locks = document.querySelectorAll('.database-filters i');
      const savedLocks = JSON.parse(localStorage.getItem('locked') || '{}');
      locks.forEach(lock => {
        lock.className = savedLocks[lock.id] ? 'fa-solid fa-lock' : 'fa-solid fa-lock-open';
      });

      // restore unreadOnly state from localStorage
      const unreadBtn = document.getElementById('unread-only-btn');
      const savedUnreadOnly = localStorage.getItem('unreadOnly') === 'true';
      unreadBtn.setAttribute('aria-pressed', savedUnreadOnly.toString());
    }

    search();
  });

  // Event Listeners initialization
  // butons
  document.getElementById('sign-in-button').addEventListener('click', signInWithGoogle);
  document.getElementById('sign-out-button').addEventListener('click', signOutUser);
  // databases checkboxes
  document.querySelectorAll('.database-filters input').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      if (auth.currentUser) {
        saveFilterStateToFirebase(checkbox);
      } else {
        localStorage.setItem(checkbox.id, checkbox.checked);
      }
      search();
    });
  });
  // databases locks
  document.querySelectorAll('.database-filters i').forEach
  (lock => {
    lock.addEventListener('click', () => {
      if (lock.classList.contains('fa-lock')) {
        lock.className = 'fa-solid fa-lock-open';
        saveLockedFilterStateToFirebase(lock, false);
      } else {
        lock.className = 'fa-solid fa-lock';
        saveLockedFilterStateToFirebase(lock, true);
      }
    }
    )
  });
});


// SAVE LOCKED FILTERS TO FIREBASE
async function saveLockedFilterStateToFirebase(lock, state) {
  const user = auth.currentUser;
  if (!user) {
    // Save to localStorage for non-logged in users
    const savedLocks = JSON.parse(localStorage.getItem('locked') || '{}');
    savedLocks[lock.id] = state;
    localStorage.setItem('locked', JSON.stringify(savedLocks));
    return;
  }

  const userData = await getUserData(user.uid);
  const newLocked = { ...userData.locked, [lock.id]: state };

  await updateUserData(user.uid, {
    locked: newLocked
  });
}


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


// SETTINGS BUTTON
const openSettings = () => {
  const filtersElement = document.getElementById('database-filters');
  filtersElement.style.display = filtersElement.style.display === 'none' ? 'block' : 'none';
}
document.getElementById('settings-button').addEventListener('click', openSettings);


