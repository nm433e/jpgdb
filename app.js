const auth = window.fbAuth;
const {
  signInWithGoogle,
  signOutUser,
  getUserData,
  updateUserData
} = window.firebaseApp;

// TOGGLE DATABASES FUNCTION
async function toggleAllDatabases() {
  const checkboxes = document.querySelectorAll('.database-filters input[type="checkbox"]');
  const user = auth.currentUser;
  
  if (user) {
    const userData = await getUserData(user.uid);
    const newFilters = { ...userData.filters };

    checkboxes.forEach(checkbox => {
      if (document.getElementById(`${checkbox.id}-lock`).classList.contains('fa-lock')) return;
      checkbox.checked = true;
      newFilters[checkbox.id] = true;
    });

    await updateUserData(user.uid, {
      filters: newFilters
    });
  } else {
    // Save to localStorage for non-logged in users
    checkboxes.forEach(checkbox => {
      if (document.getElementById(`${checkbox.id}-lock`).classList.contains('fa-lock')) return;
      checkbox.checked = true;
      localStorage.setItem(checkbox.id, "true");
    });
  }

  search();
}

// UNTOGGLE DATABASES FUNCTION	
async function untoggleAllDatabases() {
  const checkboxes = document.querySelectorAll('.database-filters input[type="checkbox"]');
  const user = auth.currentUser;
  
  if (user) {
    const userData = await getUserData(user.uid);
    const newFilters = { ...userData.filters };

    checkboxes.forEach(checkbox => {
      if (document.getElementById(`${checkbox.id}-lock`).classList.contains('fa-lock')) return;
      checkbox.checked = false;
      newFilters[checkbox.id] = false;
    });

    await updateUserData(user.uid, {
      filters: newFilters
    });
  } else {
    // Save to localStorage for non-logged in users
    checkboxes.forEach(checkbox => {
      if (document.getElementById(`${checkbox.id}-lock`).classList.contains('fa-lock')) return;
      checkbox.checked = false;
      localStorage.setItem(checkbox.id, "false");
    });
  }

  search();
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
  const term = document.getElementById("search").value.toLowerCase();
  const dados = await fetch("database.json").then(r => r.json());
  const list = document.getElementById("resultado");
  list.innerHTML = "";

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
  const filtered = dados.filter(d =>
    d.point.toLowerCase().includes(term) &&
    selectedDatabases.includes(d.source)
  );

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
    checkbox.onchange = () => update(d.id, checkbox.checked);

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


// ==== UPDATE FUNCTION ==== //
async function update(id, checked) {
  if (!auth.currentUser) {
    // Save to localStorage for non-logged in users
    const readStatus = JSON.parse(localStorage.getItem('readStatus') || '{}');
    readStatus[id] = checked;
    localStorage.setItem('readStatus', JSON.stringify(readStatus));
    return;
  }

  try {
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

  if (window.innerWidth <= 768) {

    // filters
    const filtersElement = document.getElementById('database-filters');
    filtersElement.style.display = 'none';

    // sign in/out buttons
    signInButton.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i>';
    signInButton.className = 'nav-icon';
    signOutButton.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i>';
    signOutButton.className = 'nav-icon';
  } else {
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


