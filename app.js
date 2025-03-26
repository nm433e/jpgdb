const auth = window.fbAuth;
console.log('Initial auth object:', auth);
console.log('Auth methods available:', {
  onAuthStateChanged: !!auth?.onAuthStateChanged,
  currentUser: !!auth?.currentUser,
  signIn: !!auth?.signInWithPopup
});

const {
  signInWithGoogle,
  signOutUser,
  getUserData,
  updateUserData
} = window.firebaseApp;


function toggleAllDatabases() {
  const checkboxes = document.querySelectorAll('.database-filters input[type="checkbox"]');
  const allChecked = Array.from(checkboxes).every(checkbox => checkbox.checked);

  checkboxes.forEach(checkbox => {
    checkbox.checked = !allChecked;
    saveFilterStateToFirebase(checkbox);
  });

  search();
}

function checkSelectedDatabases() {
  const selectedDatabases = [];
  const checkboxes = document.querySelectorAll('.database-filters input[type="checkbox"]');

  checkboxes.forEach(checkbox => {
    if (checkbox.checked) selectedDatabases.push(checkbox.value);
  });

  return selectedDatabases;
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
  }

  const selectedDatabases = checkSelectedDatabases();

  const filtered = dados.filter(d =>
    d.point.toLowerCase().includes(term) &&
    selectedDatabases.includes(d.source)
  );

  filtered.forEach(d => {
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
    const sourceText = document.createTextNode(`${d.source} `);
    //checkbox
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = readStatus[d.id] || false;
    checkbox.onchange = () => update(d.id, checkbox.checked);

    // Assemble details
    detailsDiv.appendChild(sourceText);
    detailsDiv.appendChild(checkbox);

    // Assemble container
    link.appendChild(detailsDiv);
    container.appendChild(link);

    // Add to list
    list.appendChild(container);
  });
}

// Unified update function
async function update(id, checked) {
  if (!auth.currentUser) {
    alert('Sign in to save progress');
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

// Initialize with both Firebase and localStorage fallback
document.addEventListener('DOMContentLoaded', async () => {
  // Auth setup
  console.log('Before auth state change setup:', {
    auth: !!auth,
    currentUser: auth?.currentUser
  });
  // Auth setup
  auth.onAuthStateChanged(async user => {
    console.log('Auth state changed:', {
      isUserLoggedIn: !!user,
      userId: user?.uid,
      userEmail: user?.email
    });
    if (user) {
      // When a user is signed in:
      document.getElementById('sign-in-button').style.display = 'none';
      document.getElementById('sign-out-button').style.display = 'inline-block';

      // Restore filters from Firestore
      const checkboxes = document.querySelectorAll('.database-filters input[type="checkbox"]');
      const userData = await getUserData(user.uid);
      checkboxes.forEach(checkbox => {
        checkbox.checked = userData.filters?.[checkbox.id] ?? true;
      });
    } else {
      // When no user is signed in:
      document.getElementById('sign-in-button').style.display = 'inline-block';
      document.getElementById('sign-out-button').style.display = 'none';

      // Fallback to localStorage
      const checkboxes = document.querySelectorAll('.database-filters input[type="checkbox"]');
      checkboxes.forEach(checkbox => {
        const saved = localStorage.getItem(checkbox.id);
        if (saved) checkbox.checked = saved === "true";
      });
    }

    search();
  });

  // Event listeners
  document.getElementById('sign-in-button').addEventListener('click', signInWithGoogle);
  document.getElementById('sign-out-button').addEventListener('click', signOutUser);

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
});

// Helper functions
async function saveFilterStateToFirebase(checkbox) {
  const user = auth.currentUser;
  if (!user) return;

  const userData = await getUserData(user.uid);
  const newFilters = { ...userData.filters, [checkbox.id]: checkbox.checked };

  await updateUserData(user.uid, {
    filters: newFilters
  });
}

// Sign in/out button resposiveness
function handleResponsiveChanges() {
  const signInButton = document.getElementById('sign-in-button');
  const signOutButton = document.getElementById('sign-out-button');
  const settingsButton = document.getElementById('settings-button');

  if (window.innerWidth <= 768) {

    // settings !! IMPLEMENTAR !!
    const filtersElement = document.getElementById('database-filters');
    filtersElement.style.display = 'none';

    // sign
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

const openSettings = () => {
  const filtersElement = document.getElementById('database-filters');
  filtersElement.style.display = filtersElement.style.display === 'none' ? 'block' : 'none';
}
document.getElementById('settings-button').addEventListener('click', openSettings);

window.addEventListener('resize', handleResponsiveChanges);
window.addEventListener('DOMContentLoaded', handleResponsiveChanges);


