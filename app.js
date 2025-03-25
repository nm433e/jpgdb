const auth = window.fbAuth;
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
    // Create container div
    const container = document.createElement("div");
    container.className = `result-container ${d.shorthand}`;

    // Create title section
    const titleDiv = document.createElement("div");
    titleDiv.className = "result-title";
    const link = document.createElement("a");
    link.href = d.link;
    link.target = "_blank";
    link.textContent = d.point;
    titleDiv.appendChild(link);

    // Create details section
    const detailsDiv = document.createElement("div");
    detailsDiv.className = "result-details";

    // Source text
    const sourceText = document.createTextNode(`${d.source} `);

    // Checkbox
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = readStatus[d.id] || false;
    checkbox.onchange = () => update(d.id, checkbox.checked);

    // Assemble details
    detailsDiv.appendChild(sourceText);
    detailsDiv.appendChild(checkbox);

    // Assemble container
    container.appendChild(titleDiv);
    container.appendChild(detailsDiv);

    // Add to list
    list.appendChild(container);
  });
}

// Unified update function
async function update(id, checked) {
  if (!auth.currentUser) {
    alert('Please sign in to save progress');
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
  auth.onAuthStateChanged(async user => {
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