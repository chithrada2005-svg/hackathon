import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, onSnapshot, query, orderBy, serverTimestamp, addDoc, where, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getDatabase, ref, onValue, set, onDisconnect } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// --- 1. Firebase Configuration ---
// ⚠️ REPLACE THIS CONFIGURATION WITH YOUR OWN FIREBASE PROJECT SETTINGS ⚠️
// Initialize Firebase
const firebaseConfig = {
    apiKey: "AIzaSyB7PCzX5p2KqQqleQDrf9u1Mrfur9JICAg",
    authDomain: "somanji-b1d6a.firebaseapp.com",
    projectId: "somanji-b1d6a",
    storageBucket: "somanji-b1d6a.firebasestorage.app",
    messagingSenderId: "589715097101",
    appId: "1:589715097101:web:c6a56c848d8b93feff3744",
    measurementId: "G-0DKPDQHGHF"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const rtdb = getDatabase(app);

// --- 2. DOM Elements Selection ---
const dashboardView = document.getElementById('dashboard-view');
const chatView = document.getElementById('chat-view');
const connectView = document.getElementById('connect-view');
const usersGrid = document.getElementById('users-grid');
const filterBtns = document.querySelectorAll('.filter-btn');

const themeToggle = document.getElementById('theme-toggle');
const currentRoomName = document.getElementById('current-room-name');
const leaveRoomBtn = document.getElementById('leave-room-btn');
const chatMessages = document.getElementById('chat-messages');
const typingIndicator = document.getElementById('typing-indicator');
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');

// Verify critical elements exist
console.log("🔍 DOM Element Check:");
console.log("chatMessages:", chatMessages ? "✓" : "✗");
console.log("chatForm:", chatForm ? "✓" : "✗");
console.log("messageInput:", messageInput ? "✓" : "✗");

// Modal Elements
const navAbout = document.getElementById('nav-about');
const navHowItWorks = document.getElementById('nav-howitworks');
const navSignin = document.getElementById('nav-signin');
const navSignup = document.getElementById('nav-signup');
const navConnect = document.getElementById('nav-connect');
const aboutModal = document.getElementById('about-modal');
const howItWorksModal = document.getElementById('howitworks-modal');
const signinModal = document.getElementById('signin-modal');
const signupModal = document.getElementById('signup-modal');
const connectModal = document.getElementById('connect-modal');
const closeAbout = document.getElementById('close-about');
const closeHowItWorks = document.getElementById('close-howitworks');
const closeSignin = document.getElementById('close-signin');
const closeSignup = document.getElementById('close-signup');
const closeConnect = document.getElementById('close-connect');
const heroGetStarted = document.getElementById('hero-get-started');
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const navLinks = document.getElementById('nav-links');

const profileModal = document.getElementById('profile-modal');
const closeProfileBtn = document.getElementById('close-profile');

const navInvitations = document.getElementById('nav-invitations');
const invitationBadge = document.getElementById('invitation-badge');
const invitationsModal = document.getElementById('invitations-modal');
const closeInvitations = document.getElementById('close-invitations');
const invitationsList = document.getElementById('invitations-list');

const navProfileBtn = document.getElementById('nav-profile-btn');
const editorModal = document.getElementById('editor-modal');
const closeEditor = document.getElementById('close-editor');
const cancelEditor = document.getElementById('cancel-editor');
const editorForm = document.getElementById('editor-form');

const editUsername = document.getElementById('edit-username');
const editSkill = document.getElementById('edit-skill');
const editExtraSkills = document.getElementById('edit-extra-skills');
const editGithub = document.getElementById('edit-github');
const editLinkedin = document.getElementById('edit-linkedin');

// --- 3. Application State ---
let currentUser = null;
let currentRoom = '';
let liveUsers = [];
let myInvitations = [];
let unsubscribeMessages = null;
let unsubscribeInvitations = null;

// --- 4. Initialization ---
function init() {
    console.log("🚀 Initializing PeerLix App...");
    console.log("Firebase Auth initialized:", auth ? "✓" : "✗");
    console.log("Firestore initialized:", db ? "✓" : "✗");
    
    loadThemePreferences();

    // Listen for Authentication state changes
    onAuthStateChanged(auth, async (user) => {
        console.log("Auth state changed. User:", user ? user.email : "null");
        if (user) {
            // User is signed in
            console.log("User signed in:", user.uid);
            try {
                const docSnap = await getDoc(doc(db, "users", user.uid));
                if (docSnap.exists()) {
                    currentUser = { id: user.uid, ...docSnap.data() };
                    console.log("User profile loaded from Firestore");
                } else {
                    // Rescue incomplete signups (if their DB write failed previously)
                    currentUser = { 
                        id: user.uid, 
                        username: user.email.split('@')[0],
                        email: user.email,
                        skill: 'Learner',
                        avatar: 'https://static.vecteezy.com/system/resources/previews/021/548/095/non_2x/default-profile-picture-avatar-user-avatar-icon-person-icon-head-icon-profile-picture-icons-default-anonymous-user-male-and-female-businessman-photo-placeholder-social-network-avatar-portrait-free-vector.jpg',
                        status: 'online'
                    };
                    try {
                        await setDoc(doc(db, "users", user.uid), currentUser);
                        console.log("User profile created in Firestore");
                    } catch(e) { console.error("Could not rescue user profile:", e); }
                }
                setupUIForUser();
                connectPresence(user.uid);
                listenToInvitations(user.uid);
            } catch(err) {
                console.error("Error in onAuthStateChanged:", err);
            }
        } else {
            // User is signed out
            console.log("User signed out");
            currentUser = null;
            if(unsubscribeInvitations) unsubscribeInvitations();
            setupUIForGuest();
        }
    });

    // Automatically listen to all users in Firestore to populate the grid
    listenToUsers('all');
}

function connectPresence(uid) {
    const connectedRef = ref(rtdb, '.info/connected');
    const userStatusDatabaseRef = ref(rtdb, '/status/' + uid);

    onValue(connectedRef, (snap) => {
        if (snap.val() === true) {
            // We're connected!
            const con = onDisconnect(userStatusDatabaseRef);
            con.set({ state: 'offline' }).then(() => {
                set(userStatusDatabaseRef, { state: 'online' });
                // Update Firestore as well
                setDoc(doc(db, 'users', uid), { status: 'online' }, { merge: true });
            });
        }
    });

    // Listen to RTDB status changes and sync to Firestore for real-time updates
    onValue(userStatusDatabaseRef, async (snap) => {
        if (snap.exists()) {
            const rtdbStatus = snap.val().state;
            // Only update if not in a live session (preserve 'live' status)
            try {
                const docSnap = await getDoc(doc(db, 'users', uid));
                if (docSnap.exists() && docSnap.data().status !== 'live') {
                    await setDoc(doc(db, 'users', uid), { status: rtdbStatus }, { merge: true });
                }
            } catch (err) {
                console.error("Error syncing RTDB status to Firestore:", err);
            }
        }
    });
}

function listenToUsers(filterType) {
    const usersRef = collection(db, "users");
    // Listen in real-time
    onSnapshot(usersRef, (snapshot) => {
        liveUsers = [];
        snapshot.forEach((doc) => {
            liveUsers.push({ id: doc.id, ...doc.data() });
        });
        populateSkillsDropdown();
        renderUsers(filterType);
    }, (error) => {
        console.error("Error fetching real-time users: ", error);
        if (usersGrid) {
            usersGrid.innerHTML = '<p style="text-align:center; color:red;">Failed to connect to Firebase. Did you add your config?</p>';
        }
    });
}

function populateSkillsDropdown() {
    const skillSelect = document.getElementById('edit-skill');
    if (!skillSelect) return;
    
    // Collect all unique skills from all users
    const skillsSet = new Set();
    
    liveUsers.forEach(user => {
        // Add primary skill
        if (user.skill) {
            skillsSet.add(user.skill);
        }
        // Add extra skills
        if (user.extraSkills && Array.isArray(user.extraSkills)) {
            user.extraSkills.forEach(skill => {
                if (skill) skillsSet.add(skill);
            });
        }
    });
    
    // Convert to sorted array
    const skillsArray = Array.from(skillsSet).sort();
    
    // Keep the current value if it exists
    const currentValue = skillSelect.value;
    
    // Clear existing options except the first one
    const firstOption = skillSelect.querySelector('option');
    skillSelect.innerHTML = '';
    skillSelect.appendChild(firstOption.cloneNode(true));
    
    // Add all skills as options
    skillsArray.forEach(skill => {
        const option = document.createElement('option');
        option.value = skill;
        option.textContent = skill;
        skillSelect.appendChild(option);
    });
    
    // Restore the previous value if it still exists
    if (currentValue && skillsArray.includes(currentValue)) {
        skillSelect.value = currentValue;
    }
}

function listenToInvitations(uid) {
    const invRef = collection(db, "invitations");
    const qAllMyInvites = query(invRef, where("participants", "array-contains", uid));
    
    unsubscribeInvitations = onSnapshot(qAllMyInvites, (snapshot) => {
        myInvitations = [];
        snapshot.forEach(doc => myInvitations.push({ id: doc.id, ...doc.data() }));
        
        updateInvitationsUI();
        
        const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
        if (currentUser) renderUsers(activeFilter);
    }, (error) => {
        console.error("Error fetching invitations:", error);
    });
}

function updateInvitationsUI() {
    if (!currentUser) return;
    
    // Filter pending invitations where current user is the receiver
    // AND exclude anyone we're already connected with
    const pendingReceived = myInvitations.filter(inv => {
        // Only show pending invitations where I'm the receiver
        if (inv.receiverId !== currentUser.id || inv.status !== 'pending') {
            return false;
        }
        
        // Don't show this invitation if we're already connected with this sender
        const hasAcceptedConnection = myInvitations.some(i => 
            i.participants.includes(inv.senderId) && 
            i.participants.includes(currentUser.id) && 
            i.status === 'accepted'
        );
        
        return !hasAcceptedConnection;
    });
    
    // Deduplicate: keep only the latest invitation per sender
    const uniqueInvitations = {};
    pendingReceived.forEach(inv => {
        if (!uniqueInvitations[inv.senderId] || 
            inv.timestamp > uniqueInvitations[inv.senderId].timestamp) {
            uniqueInvitations[inv.senderId] = inv;
        }
    });
    
    const deduplicatedInvites = Object.values(uniqueInvitations);
    
    if (deduplicatedInvites.length > 0) {
        invitationBadge.textContent = deduplicatedInvites.length;
        invitationBadge.classList.remove('hidden');
    } else {
        invitationBadge.classList.add('hidden');
    }
    
    if (deduplicatedInvites.length === 0) {
        invitationsList.innerHTML = '<p style="text-align: center; color: var(--system-text); font-size: 0.95rem;">No pending invitations.</p>';
        return;
    }
    
    invitationsList.innerHTML = '';
    deduplicatedInvites.forEach(inv => {
        const card = document.createElement('div');
        card.className = 'invitation-card';
        card.innerHTML = `
            <div class="invitation-info">
                <img src="${inv.senderAvatar}" alt="${inv.senderName}" class="invitation-avatar">
                <div>
                    <h4 style="margin-bottom: 0.2rem;">${inv.senderName}</h4>
                    <p style="font-size: 0.85rem; color: var(--system-text);">${inv.senderSkill || 'Learner'} • wants to connect</p>
                </div>
            </div>
            <div class="invitation-actions">
                <button class="btn-primary btn-sm" onclick="acceptInvitation('${inv.id}', '${inv.senderName}', '${inv.senderSkill || 'Topic'}')">Accept</button>
                <button class="btn-sm btn-decline" onclick="declineInvitation('${inv.id}')">Decline</button>
            </div>
        `;
        invitationsList.appendChild(card);
    });
}

function renderUsers(filterType) {
    if (!usersGrid) return; // usersGrid removed from main page
    
    usersGrid.innerHTML = '';

    let filteredUsers = liveUsers;
    if (currentUser) {
        filteredUsers = liveUsers.filter(u => u.id !== currentUser.id);
    }

    if (filterType !== 'all') {
        filteredUsers = filteredUsers.filter(user => user.status === filterType);
    }

    filteredUsers.forEach(user => {
        const card = document.createElement('div');
        card.className = 'user-card';

        let statusBadge = '';
        if (user.status === 'online') statusBadge = '<span class="status-badge status-online">Online</span>';
        if (user.status === 'live') statusBadge = '<span class="status-badge status-live">Live</span>';
        if (user.status === 'offline') statusBadge = '<span class="status-badge status-offline">Offline</span>';

        let actionButtonHTML = '';
        if (!currentUser) {
             actionButtonHTML = `<button class="connect-btn" onclick="signinModal.classList.remove('hidden')">Connect</button>`;
        } else {
             // Find any invitation (pending or accepted) between these two users
             const invitations = myInvitations.filter(inv => 
                 inv.participants.includes(user.id) && inv.participants.includes(currentUser.id)
             );
             
             // Check if there's an accepted invitation (connection established)
             const acceptedInv = invitations.find(inv => inv.status === 'accepted');
             if (acceptedInv) {
                 actionButtonHTML = `<button class="connect-btn" style="background:var(--primary-gradient); color:white; border-color:transparent;" onclick="startSession('${user.username}', '${user.skill || 'Topic'}')">Message</button>`;
             } else {
                 // Check if there's a pending invitation
                 const pendingInv = invitations.find(inv => inv.status === 'pending');
                 if (!pendingInv) {
                     // No invitation at all
                     actionButtonHTML = `<button class="connect-btn" onclick="sendInvitation('${user.id}', '${user.username}', '${user.avatar || ''}')">Connect</button>`;
                 } else if (pendingInv.senderId === currentUser.id) {
                     // I sent the invitation
                     actionButtonHTML = `<button class="connect-btn" style="background:var(--secondary-color); color:var(--text-color); cursor:not-allowed;" disabled>Pending...</button>`;
                 } else {
                     // They sent the invitation to me
                     actionButtonHTML = `<button class="connect-btn" style="background:#10b981; color:white; border-color:transparent;" onclick="invitationsModal.classList.remove('hidden')">Respond</button>`;
                 }
             }
        }

        card.innerHTML = `
            ${statusBadge}
            <img src="${user.avatar || 'https://static.vecteezy.com/system/resources/previews/021/548/095/non_2x/default-profile-picture-avatar-user-avatar-icon-person-icon-head-icon-profile-picture-icons-default-anonymous-user-male-and-female-businessman-photo-placeholder-social-network-avatar-portrait-free-vector.jpg'}" alt="${user.username}" class="user-avatar">
            <h3 class="user-name">${user.username}</h3>
            <p class="user-skill">${user.skill || 'Learner'}</p>
            
            <div class="card-actions">
                ${currentUser ? actionButtonHTML : ''}
                <button class="icon-btn info-btn" onclick="openProfileModal('${user.id}', event)" aria-label="View Profile">
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </button>
            </div>
        `;
        usersGrid.appendChild(card);
    });
}

function renderConnectUsers(filterType) {
    const connectUsersGrid = document.getElementById('connect-users-grid');
    if (!connectUsersGrid) return;
    
    connectUsersGrid.innerHTML = '';

    let filteredUsers = liveUsers;
    if (currentUser) {
        filteredUsers = liveUsers.filter(u => u.id !== currentUser.id);
    }

    if (filterType !== 'all') {
        filteredUsers = filteredUsers.filter(user => user.status === filterType);
    }

    filteredUsers.forEach(user => {
        const card = document.createElement('div');
        card.className = 'user-card';

        let statusBadge = '';
        if (user.status === 'online') statusBadge = '<span class="status-badge status-online">Online</span>';
        if (user.status === 'live') statusBadge = '<span class="status-badge status-live">Live</span>';
        if (user.status === 'offline') statusBadge = '<span class="status-badge status-offline">Offline</span>';

        let actionButtonHTML = '';
        if (!currentUser) {
             actionButtonHTML = `<button class="connect-btn" onclick="signinModal.classList.remove('hidden')">Connect</button>`;
        } else {
             // Find any invitation (pending or accepted) between these two users
             const invitations = myInvitations.filter(inv => 
                 inv.participants.includes(user.id) && inv.participants.includes(currentUser.id)
             );
             
             // Check if there's an accepted invitation (connection established)
             const acceptedInv = invitations.find(inv => inv.status === 'accepted');
             if (acceptedInv) {
                 actionButtonHTML = `<button class="connect-btn" style="background:var(--primary-gradient); color:white; border-color:transparent;" onclick="startSession('${user.username}', '${user.skill || 'Topic'}')">Message</button>`;
             } else {
                 // Check if there's a pending invitation
                 const pendingInv = invitations.find(inv => inv.status === 'pending');
                 if (!pendingInv) {
                     // No invitation at all
                     actionButtonHTML = `<button class="connect-btn" onclick="sendInvitation('${user.id}', '${user.username}', '${user.avatar || ''}')">Connect</button>`;
                 } else if (pendingInv.senderId === currentUser.id) {
                     // I sent the invitation
                     actionButtonHTML = `<button class="connect-btn" style="background:var(--secondary-color); color:var(--text-color); cursor:not-allowed;" disabled>Pending...</button>`;
                 } else {
                     // They sent the invitation to me
                     actionButtonHTML = `<button class="connect-btn" style="background:#10b981; color:white; border-color:transparent;" onclick="invitationsModal.classList.remove('hidden')">Respond</button>`;
                 }
             }
        }

        card.innerHTML = `
            ${statusBadge}
            <img src="${user.avatar || 'https://static.vecteezy.com/system/resources/previews/021/548/095/non_2x/default-profile-picture-avatar-user-avatar-icon-person-icon-head-icon-profile-picture-icons-default-anonymous-user-male-and-female-businessman-photo-placeholder-social-network-avatar-portrait-free-vector.jpg'}" alt="${user.username}" class="user-avatar">
            <h3 class="user-name">${user.username}</h3>
            <p class="user-skill">${user.skill || 'Learner'}</p>
            
            <div class="card-actions">
                ${currentUser ? actionButtonHTML : ''}
                <button class="icon-btn info-btn" onclick="openProfileModal('${user.id}', event)" aria-label="View Profile">
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </button>
            </div>
        `;
        connectUsersGrid.appendChild(card);
    });
}

if (closeProfileBtn) {
    closeProfileBtn.addEventListener('click', () => {
        profileModal.classList.add('hidden');
    });
}

window.openProfileModal = function (userId, event) {
    if (event) event.stopPropagation();
    const user = liveUsers.find(u => u.id === userId);
    if (user) {
        document.getElementById('modal-avatar').src = user.avatar || 'https://static.vecteezy.com/system/resources/previews/021/548/095/non_2x/default-profile-picture-avatar-user-avatar-icon-person-icon-head-icon-profile-picture-icons-default-anonymous-user-male-and-female-businessman-photo-placeholder-social-network-avatar-portrait-free-vector.jpg';
        document.getElementById('modal-name').textContent = user.username;
        document.getElementById('modal-skill').textContent = user.skill || 'Learner';
        document.getElementById('modal-email').textContent = user.email;
        document.getElementById('modal-github').textContent = user.github || 'Not set';
        document.getElementById('modal-linkedin').textContent = user.linkedin || 'Not set';

        const skillsContainer = document.getElementById('modal-extra-skills');
        if (skillsContainer) {
            skillsContainer.innerHTML = '';
            if (user.extraSkills && user.extraSkills.length > 0) {
                user.extraSkills.forEach(skill => {
                    const badge = document.createElement('span');
                    badge.textContent = skill;
                    badge.style.background = 'var(--secondary-color)';
                    badge.style.color = 'var(--text-color)';
                    badge.style.padding = '0.2rem 0.6rem';
                    badge.style.borderRadius = '9999px';
                    badge.style.fontSize = '0.75rem';
                    badge.style.fontWeight = '600';
                    skillsContainer.appendChild(badge);
                });
            } else {
                skillsContainer.innerHTML = '<span style="font-size:0.8rem; color: #888;">No extra skills</span>';
            }
        }

        // Check if already connected
        const msgBtn = document.getElementById('modal-msg-btn');
        const isConnected = myInvitations.some(inv => 
            inv.participants.includes(userId) && 
            inv.participants.includes(currentUser?.id) && 
            inv.status === 'accepted'
        );
        
        if (isConnected) {
            msgBtn.classList.remove('hidden');
            msgBtn.onclick = () => {
                profileModal.classList.add('hidden');
                startSession(user.username, user.skill || 'Topic');
            };
        } else {
            msgBtn.classList.add('hidden');
        }

        profileModal.classList.remove('hidden');
    }
}

// UI Setup Helpers
function setupUIForUser() {
    navSignin.textContent = "Log Out";
    navSignin.style.fontWeight = 'bold';
    navSignin.style.color = 'var(--primary-color)';
    if (navSignup) {
        navSignup.textContent = "Sign Out";
        navSignup.style.display = 'block';
    }
    if (navConnect) {
        navConnect.classList.remove('hidden');
    }
    if (navInvitations) navInvitations.classList.remove('hidden');
    if (navProfileBtn) {
        navProfileBtn.src = currentUser.avatar || 'https://static.vecteezy.com/system/resources/previews/021/548/095/non_2x/default-profile-picture-avatar-user-avatar-icon-person-icon-head-icon-profile-picture-icons-default-anonymous-user-male-and-female-businessman-photo-placeholder-social-network-avatar-portrait-free-vector.jpg';
        navProfileBtn.classList.remove('hidden');
    }
}

function setupUIForGuest() {
    navSignin.textContent = 'Log In';
    navSignin.style.fontWeight = '500';
    navSignin.style.color = 'var(--text-color)';

    if (navSignup) {
        navSignup.textContent = 'Sign Up';
        navSignup.style.display = 'block';
    }
    if (navConnect) {
        navConnect.classList.add('hidden');
    }
    if (navInvitations) navInvitations.classList.add('hidden');
    if (navProfileBtn) navProfileBtn.classList.add('hidden');
}

// Theming
function toggleTheme() {
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    if (isDark) {
        document.body.removeAttribute('data-theme');
        themeToggle.textContent = '🌙';
        localStorage.setItem('theme', 'light');
    } else {
        document.body.setAttribute('data-theme', 'dark');
        themeToggle.textContent = '☀️';
        localStorage.setItem('theme', 'dark');
    }
}

function loadThemePreferences() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        document.body.setAttribute('data-theme', 'dark');
        themeToggle.textContent = '☀️';
    }
}

filterBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        filterBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        renderUsers(e.target.dataset.filter);
    });
});

// Connect View Filter Buttons
function setupConnectFilterListeners() {
    const connectFilterBtns = document.querySelectorAll('#connect-view .filter-btn');
    connectFilterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            connectFilterBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            renderConnectUsers(e.target.dataset.filter);
        });
    });
    // Render initial users
    renderConnectUsers('all');
}

// Call this when the page loads
setTimeout(setupConnectFilterListeners, 500);

// Invitations Action Logic
window.sendInvitation = async function(receiverId, receiverName, receiverAvatar) {
    if (!currentUser) return;
    try {
        // Check if an invitation already exists between these two users
        const existingInvite = myInvitations.find(inv => 
            inv.participants.includes(currentUser.id) && 
            inv.participants.includes(receiverId)
        );
        
        if (existingInvite) {
            alert("You already have a pending invitation with this user!");
            return;
        }
        
        const invitationRef = await addDoc(collection(db, "invitations"), {
            participants: [currentUser.id, receiverId],
            senderId: currentUser.id,
            senderName: currentUser.username,
            senderAvatar: currentUser.avatar || 'https://static.vecteezy.com/system/resources/previews/021/548/095/non_2x/default-profile-picture-avatar-user-avatar-icon-person-icon-head-icon-profile-picture-icons-default-anonymous-user-male-and-female-businessman-photo-placeholder-social-network-avatar-portrait-free-vector.jpg',
            senderSkill: currentUser.skill || 'Learner',
            receiverId: receiverId,
            receiverName: receiverName,
            receiverAvatar: receiverAvatar,
            status: 'pending',
            timestamp: serverTimestamp()
        });
        
        // Add to local myInvitations array immediately for instant UI update
        myInvitations.push({
            id: invitationRef.id,
            participants: [currentUser.id, receiverId],
            senderId: currentUser.id,
            senderName: currentUser.username,
            senderAvatar: currentUser.avatar,
            senderSkill: currentUser.skill || 'Learner',
            receiverId: receiverId,
            receiverName: receiverName,
            receiverAvatar: receiverAvatar,
            status: 'pending',
            timestamp: new Date()
        });
        
        // Update UI immediately without waiting for Firebase
        const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
        renderUsers(activeFilter);
        renderConnectUsers(activeFilter);
        
        console.log("Invitation sent successfully!");
        alert("Invitation sent! Waiting for response...");
    } catch(err) {
        console.error("Error sending invitation:", err);
        alert("Error sending invitation. Please try again.");
    }
}

window.acceptInvitation = async function(inviteId, senderName, senderSkill) {
    try {
        await setDoc(doc(db, "invitations", inviteId), { status: 'accepted' }, { merge: true });
        
        // Update local array
        const invitation = myInvitations.find(inv => inv.id === inviteId);
        if (invitation) {
            invitation.status = 'accepted';
        }
        
        // Refresh UI
        const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
        renderUsers(activeFilter);
        renderConnectUsers(activeFilter);
        updateInvitationsUI();
        
        invitationsModal.classList.add('hidden');
        startSession(senderName, senderSkill || 'Topic');
    } catch(err) {
        console.error("Error accepting invitation:", err);
        alert("Error accepting invitation. Please try again.");
    }
}

window.declineInvitation = async function(inviteId) {
    try {
        await deleteDoc(doc(db, "invitations", inviteId));
        
        // Remove from local array
        myInvitations = myInvitations.filter(inv => inv.id !== inviteId);
        
        // Refresh UI
        updateInvitationsUI();
        const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';
        renderUsers(activeFilter);
        renderConnectUsers(activeFilter);
        
        console.log("Invitation declined successfully!");
    } catch(err) {
        console.error("Error declining invitation:", err);
        alert("Error declining invitation. Please try again.");
    }
}

// Chat Sessions
let shownMessageTimestamps = new Set();

window.startSession = async function (peerName, skillContext) {
    if (!currentUser) {
        alert("Please log in first to chat!");
        signinModal.classList.remove('hidden');
        return;
    }

    // Find peer user info
    const peerUser = liveUsers.find(u => u.username === peerName);

    currentRoom = [currentUser.username, peerName].sort().join('-');
    
    // Update header with peer information
    currentRoomName.textContent = peerName;
    document.getElementById('peer-avatar').src = peerUser?.avatar || 'https://static.vecteezy.com/system/resources/previews/021/548/095/non_2x/default-profile-picture-avatar-user-avatar-icon-person-icon-head-icon-profile-picture-icons-default-anonymous-user-male-and-female-businessman-photo-placeholder-social-network-avatar-portrait-free-vector.jpg';
    document.getElementById('peer-skill').textContent = peerUser?.skill || skillContext;
    
    // Set status indicator
    const statusIndicator = document.getElementById('peer-status-indicator');
    const statusText = document.getElementById('peer-status-text');
    if (peerUser?.status === 'live') {
        statusIndicator.className = 'status-indicator live';
        statusText.textContent = 'In Live Session';
    } else if (peerUser?.status === 'online') {
        statusIndicator.className = 'status-indicator online';
        statusText.textContent = 'Online';
    } else {
        statusIndicator.className = 'status-indicator';
        statusText.textContent = 'Offline';
    }
    
    chatMessages.innerHTML = '';
    shownMessageTimestamps.clear();

    // Update our status in Firebase to "live"
    await setDoc(doc(db, 'users', currentUser.id), { status: 'live' }, { merge: true });

    addSystemMessage(`👋 Connected to **${peerName}** (Topic: ${skillContext})`);

    dashboardView.classList.remove('active');
    setTimeout(() => {
        dashboardView.classList.add('hidden');
        chatView.classList.remove('hidden');
        chatView.classList.add('active');
        messageInput.focus();
    }, 300);

    // Listen to real-time chat messages
    const messagesRef = collection(db, "rooms", currentRoom, "messages");
    const q = query(messagesRef, orderBy("timestamp", "asc"));

    unsubscribeMessages = onSnapshot(q, (snapshot) => {
        console.log("📨 Received snapshot with", snapshot.size, "messages");
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                const data = change.doc.data();
                const messageKey = `${data.sender}-${data.timestamp?.seconds || ''}`;
                
                console.log("Message from Firestore:", data.sender, "- Already shown:", shownMessageTimestamps.has(messageKey));
                
                // Avoid showing duplicate messages
                if (!shownMessageTimestamps.has(messageKey)) {
                    shownMessageTimestamps.add(messageKey);
                    const isMine = data.sender === currentUser.username;
                    addChatMessage(data.sender, data.text, isMine, data.time);
                    console.log("✅ Message displayed:", data.sender, data.text.substring(0, 30));
                }
            }
        });
    }, (error) => {
        console.error("❌ Error listening to messages:", error);
    });
}

window.leaveRoom = async function () {
    if (unsubscribeMessages) unsubscribeMessages(); // Stop listening to messages

    currentRoom = '';

    // Switch status back to online
    if (currentUser) {
        await setDoc(doc(db, 'users', currentUser.id), { status: 'online' }, { merge: true });
    }

    chatView.classList.remove('active');
    setTimeout(() => {
        chatView.classList.add('hidden');
        dashboardView.classList.remove('hidden');
        dashboardView.classList.add('active');
    }, 300);
}

function switchToConnectView() {
    console.log("Switching to Connect View");
    renderConnectUsers('all');
    
    dashboardView.classList.remove('active');
    setTimeout(() => {
        dashboardView.classList.add('hidden');
        connectView.classList.remove('hidden');
        connectView.classList.add('active');
    }, 300);
}

function switchBackToDashboard() {
    console.log("Switching back to Dashboard");
    connectView.classList.remove('active');
    setTimeout(() => {
        connectView.classList.add('hidden');
        dashboardView.classList.remove('hidden');
        dashboardView.classList.add('active');
    }, 300);
}

function getFormattedTime() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function addSystemMessage(text) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message system';
    msgDiv.innerHTML = `<p>${text}</p>`;
    chatMessages.appendChild(msgDiv);
    scrollToBottom();
}

function addChatMessage(sender, text, isMine, timeSent = null) {
    console.log("Adding message:", { sender, text, isMine, chatMessagesExists: !!chatMessages });
    
    if (!chatMessages) {
        console.error("❌ chatMessages element not found!");
        return;
    }
    
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${isMine ? 'mine' : 'other'}`;
    const time = timeSent || getFormattedTime();
    msgDiv.innerHTML = `
        ${!isMine ? `<div class="message-sender">${sender}</div>` : ''}
        <div class="message-bubble">
            <div class="message-text">${text}</div>
            <div class="message-time">${time}</div>
        </div>
    `;
    chatMessages.appendChild(msgDiv);
    console.log("✅ Message added to DOM");
    
    // Ensure message is visible
    setTimeout(() => {
        msgDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        scrollToBottom();
    }, 0);
}

function scrollToBottom() {
    if (chatMessages) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
        console.log("📍 Scrolled to bottom");
    }
}

function handleSendMessage(e) {
    e.preventDefault();
    console.log("📤 Send message triggered");
    console.log({
        currentUser: currentUser?.username,
        currentRoom: currentRoom,
        messageInputExists: !!messageInput
    });
    
    const text = messageInput.value.trim();
    console.log("Message text:", text);
    
    if (!text) {
        console.warn("❌ Message is empty");
        return;
    }
    if (!currentUser) {
        console.warn("❌ currentUser is null");
        return;
    }
    if (!currentRoom) {
        console.warn("❌ currentRoom is null");
        return;
    }

    const time = getFormattedTime();
    console.log("📝 Sending message from", currentUser.username, "to room", currentRoom);
    
    // Show my message immediately locally for visual speed
    addChatMessage(currentUser.username, text, true, time);
    messageInput.value = '';

    // Add to Firestore
    addDoc(collection(db, "rooms", currentRoom, "messages"), {
        sender: currentUser.username,
        text: text,
        timestamp: serverTimestamp(),
        time: time
    }).then(() => {
        console.log("✅ Message saved to Firestore");
    }).catch(err => {
        console.error("❌ Error saving message:", err);
        alert("Failed to send message: " + err.message);
    });
}

// --- 6. Event Listeners ---
themeToggle.addEventListener('click', toggleTheme);
leaveRoomBtn.addEventListener('click', leaveRoom);
document.getElementById('back-to-dashboard-btn')?.addEventListener('click', switchBackToDashboard);

console.log("Setting up form listener...");
console.log("chatForm element:", chatForm);
console.log("messageInput element:", messageInput);

if (chatForm) {
    chatForm.addEventListener('submit', handleSendMessage);
    console.log("✅ Chat form submit listener attached");
} else {
    console.error("❌ chatForm not found!");
}

if (messageInput) {
    console.log("✅ messageInput found");
} else {
    console.error("❌ messageInput not found!");
}

// Chat action buttons
document.getElementById('video-call-btn')?.addEventListener('click', () => {
    alert('📹 Video call feature coming soon!');
});

document.getElementById('voice-call-btn')?.addEventListener('click', () => {
    alert('☎️ Voice call feature coming soon!');
});

document.getElementById('share-btn')?.addEventListener('click', () => {
    alert('🖥️ Screen share feature coming soon!');
});

document.getElementById('emoji-btn')?.addEventListener('click', () => {
    const emojiList = '😊😂🥰😍😎🎉🔥💯✨🌟👍';
    messageInput.value += emojiList.charAt(Math.floor(Math.random() * emojiList.length));
    messageInput.focus();
});

document.getElementById('attachment-btn')?.addEventListener('click', () => {
    alert('📎 File attachment feature coming soon!');
});

window.addEventListener('DOMContentLoaded', init);

heroGetStarted?.addEventListener('click', () => {
    if (currentUser) {
        switchToConnectView();
    } else {
        signinModal.classList.remove('hidden');
    }
});

navAbout?.addEventListener('click', (e) => { e.preventDefault(); aboutModal.classList.remove('hidden'); });
navHowItWorks?.addEventListener('click', (e) => { e.preventDefault(); howItWorksModal.classList.remove('hidden'); });

navSignin?.addEventListener('click', (e) => {
    if (navSignin.textContent.toLowerCase() === 'log out') {
        e.preventDefault();
        performLogout();
    } else {
        e.preventDefault();
        signinModal.classList.remove('hidden');
    }
});

navSignup?.addEventListener('click', (e) => {
    if (navSignup.textContent.toLowerCase() === 'sign out') {
        e.preventDefault();
        performLogout();
    } else {
        e.preventDefault();
        signupModal.classList.remove('hidden');
    }
});

async function performLogout() {
    if (currentUser) {
        // Mark as offline in Firestore explicitly before signing out
        await setDoc(doc(db, 'users', currentUser.id), { status: 'offline' }, { merge: true });
        await signOut(auth);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

closeAbout?.addEventListener('click', () => aboutModal.classList.add('hidden'));
closeHowItWorks?.addEventListener('click', () => howItWorksModal.classList.add('hidden'));
closeSignin?.addEventListener('click', () => signinModal.classList.add('hidden'));
closeSignup?.addEventListener('click', () => signupModal.classList.add('hidden'));
closeInvitations?.addEventListener('click', () => invitationsModal.classList.add('hidden'));
navInvitations?.addEventListener('click', (e) => { e.preventDefault(); invitationsModal.classList.remove('hidden'); });
navConnect?.addEventListener('click', (e) => { 
    e.preventDefault();
    switchToConnectView();
});
closeEditor?.addEventListener('click', () => editorModal.classList.add('hidden'));
cancelEditor?.addEventListener('click', () => editorModal.classList.add('hidden'));

navProfileBtn?.addEventListener('click', () => {
    if (!currentUser) return;
    editUsername.value = currentUser.username || '';
    editSkill.value = currentUser.skill || '';
    
    // Set selected extra skills in multi-select
    const extraSkillsArray = currentUser.extraSkills || [];
    Array.from(editExtraSkills.options).forEach(option => {
        option.selected = extraSkillsArray.includes(option.value);
    });
    
    editGithub.value = currentUser.github || '';
    editLinkedin.value = currentUser.linkedin || '';
    
    editorModal.classList.remove('hidden');
});

window.addEventListener('click', (e) => {
    if (e.target === aboutModal) aboutModal.classList.add('hidden');
    if (e.target === howItWorksModal) howItWorksModal.classList.add('hidden');
    if (e.target === signinModal) signinModal.classList.add('hidden');
    if (e.target === signupModal) signupModal.classList.add('hidden');
    if (e.target === invitationsModal) invitationsModal.classList.add('hidden');
    if (e.target === editorModal) editorModal.classList.add('hidden');
    if (!e.target.closest('.main-nav') && navLinks?.classList.contains('active')) {
        navLinks.classList.remove('active');
    }
});

mobileMenuBtn?.addEventListener('click', () => {
    navLinks.classList.toggle('active');
});

// Handle Login Form Submit
document.getElementById('signin-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailInput = document.getElementById('userid');
    const passwordInput = document.getElementById('password');
    const signinError = document.getElementById('signin-error');

    // Validation
    if (!emailInput || !passwordInput) {
        console.error("Form inputs not found!");
        alert("Error: Form fields not found. Please refresh the page.");
        return;
    }

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
        if (signinError) {
            signinError.textContent = 'Please enter email and password';
            signinError.classList.remove('hidden');
        }
        return;
    }

    try {
        if (signinError) signinError.classList.add('hidden');
        console.log("Attempting to sign in with:", email);
        await signInWithEmailAndPassword(auth, email, password);
        console.log("Sign in successful!");
        signinModal.classList.add('hidden');
        emailInput.value = '';
        passwordInput.value = '';
    } catch (err) {
        console.error("Login error:", err.code, err.message);
        // Check if it's a password-related error
        if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
            if (signinError) {
                signinError.textContent = 'Please Enter the Correct Password';
                signinError.classList.remove('hidden');
            }
        } else if (err.code === 'auth/user-not-found') {
            if (signinError) {
                signinError.textContent = 'User not found. Please check your email.';
                signinError.classList.remove('hidden');
            }
        } else {
            if (signinError) {
                signinError.textContent = err.message || 'Login failed';
                signinError.classList.remove('hidden');
            }
        }
    }
});

// Handle Forgot Password
document.getElementById('forgot-password-link')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const emailInput = document.getElementById('userid');
    const email = emailInput.value.trim();

    if (!email) {
        alert('Please enter your email address first');
        return;
    }

    try {
        await sendPasswordResetEmail(auth, email);
        alert('Password reset email has been sent to ' + email + '. Please check your email inbox.');
        document.getElementById('userid').value = '';
        document.getElementById('password').value = '';
    } catch (err) {
        console.error(err);
        if (err.code === 'auth/user-not-found') {
            alert('No account found with this email address.');
        } else {
            alert('Error sending password reset email: ' + err.message);
        }
    }
});

// Handle Signup Form Submit
document.getElementById('signup-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const usernameInput = document.getElementById('signup-username').value.trim();
    const emailInput = document.getElementById('signup-email').value.trim();
    const passwordInput = document.getElementById('signup-password').value;
    const confirmPasswordInput = document.getElementById('signup-confirm-password').value;
    const errorMsg = document.getElementById('signup-error');

    if (!usernameInput || !emailInput || !passwordInput || !confirmPasswordInput) {
        errorMsg.textContent = "Fill all the Required details";
        errorMsg.classList.remove('hidden');
        return;
    }
    if (passwordInput !== confirmPasswordInput) {
        errorMsg.textContent = "Passwords do not match";
        errorMsg.classList.remove('hidden');
        return;
    }

    try {
        errorMsg.classList.add('hidden');

        // Create user in Auth
        const userCredential = await createUserWithEmailAndPassword(auth, emailInput, passwordInput);
        const userUid = userCredential.user.uid;

        // Save extra data into Firestore "users" collection
        await setDoc(doc(db, "users", userUid), {
            username: usernameInput,
            email: emailInput,
            skill: 'Learner', // Default
            avatar: 'https://static.vecteezy.com/system/resources/previews/021/548/095/non_2x/default-profile-picture-avatar-user-avatar-icon-person-icon-head-icon-profile-picture-icons-default-anonymous-user-male-and-female-businessman-photo-placeholder-social-network-avatar-portrait-free-vector.jpg',
            status: 'online',
            createdAt: serverTimestamp()
        });

        signupModal.classList.add('hidden');
        document.getElementById('signup-form').reset();

    } catch (err) {
        errorMsg.textContent = err.message || 'Signup failed';
        errorMsg.classList.remove('hidden');
        console.error(err);
    }
});

// Handle Profile Editor Form Submit
editorForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    
    // Get selected extra skills from multi-select
    const selectedOptions = Array.from(editExtraSkills.selectedOptions).map(option => option.value);
    const rawSkills = selectedOptions.filter(s => s.length > 0);
    
    const updatedData = {
        username: editUsername.value.trim(),
        skill: editSkill.value.trim(),
        extraSkills: rawSkills,
        github: editGithub.value.trim(),
        linkedin: editLinkedin.value.trim()
    };
    
    try {
        await setDoc(doc(db, "users", currentUser.id), updatedData, { merge: true });
        // Update local object
        Object.assign(currentUser, updatedData);
        // Update nav avatar immediately
        navProfileBtn.src = currentUser.avatar || 'https://static.vecteezy.com/system/resources/previews/021/548/095/non_2x/default-profile-picture-avatar-user-avatar-icon-person-icon-head-icon-profile-picture-icons-default-anonymous-user-male-and-female-businessman-photo-placeholder-social-network-avatar-portrait-free-vector.jpg';
        editorModal.classList.add('hidden');
    } catch(err) {
        console.error("Error updating profile:", err);
        alert("Failed to update profile.");
    }
});
