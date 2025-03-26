const themeToggle = document.getElementById('theme-toggle');
const root = document.documentElement;

// Debug auth initialization
console.log('Theme.js - Auth initialization:', {
    authExists: !!window.fbAuth,
    hasCurrentUser: !!window.fbAuth?.currentUser
});

async function toggleTheme() {
    const currentTheme = root.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    console.log('Theme.js - Toggle theme:', {
        from: currentTheme,
        to: newTheme,
        authState: !!window.fbAuth?.currentUser
    });

    root.setAttribute('data-theme', newTheme);
    themeToggle.innerHTML = newTheme === 'dark' ? 
        '<i class="fa-solid fa-moon"></i>' : 
        '<i class="fa-solid fa-sun"></i>';

    if (window.fbAuth?.currentUser) {
        try {
            await updateUserData(window.fbAuth.currentUser.uid, { theme: newTheme });
            console.log('Theme saved to Firestore');
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
    
    console.log('Theme.js - DOMContentLoaded:', {
        authExists: !!auth,
        hasCurrentUser: !!auth?.currentUser
    });

    auth.onAuthStateChanged(async user => {
        console.log('Theme.js - Auth state changed:', {
            isUserLoggedIn: !!user,
            userId: user?.uid
        });

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