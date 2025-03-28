const themeToggle = document.getElementById('theme-toggle');
const root = document.documentElement;

async function toggleTheme() {
    const currentTheme = root.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    root.setAttribute('data-theme', newTheme);
    themeToggle.innerHTML = newTheme === 'dark' ? 
        '<i class="fa-solid fa-moon"></i>' : 
        '<i class="fa-solid fa-sun"></i>';

    if (window.fbAuth?.currentUser) {
        try {
            await updateUserData(window.fbAuth.currentUser.uid, { theme: newTheme });
            
        } catch (error) {
            console.error('Failed to save theme:', error);
            localStorage.setItem('theme', newTheme);
        }
    } else {
        localStorage.setItem('theme', newTheme);
    }
}

// Wait for Firebase to initialize
document.addEventListener('DOMContentLoaded', () => {
    const auth = window.fbAuth;

    auth.onAuthStateChanged(async user => {

        // Load theme based on auth state
        if (user) {
            const userData = await getUserData(user.uid);
            const theme = userData?.theme || localStorage.getItem('theme') || 'dark';
            root.setAttribute('data-theme', theme);
            themeToggle.innerHTML = theme === 'dark' ? 
                '<i class="fa-solid fa-moon"></i>' : 
                '<i class="fa-solid fa-sun"></i>';
        } else {
            const theme = localStorage.getItem('theme') || 'dark';
            root.setAttribute('data-theme', theme);
            themeToggle.innerHTML = theme === 'dark' ? 
                '<i class="fa-solid fa-moon"></i>' : 
                '<i class="fa-solid fa-sun"></i>';
        }
    });
});

// Add event listener to the theme toggle button
themeToggle.addEventListener('click', toggleTheme);