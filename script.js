import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, onSnapshot, query, orderBy, serverTimestamp, addDoc, where, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getDatabase, ref, onValue, set, onDisconnect } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { Analytics } from "@vercel/analytics/next"

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
const usersGrid = document.getElementById('users-grid');
const filterBtns = document.querySelectorAll('.filter-btn');

const themeToggle = document.getElementById('theme-toggle');
const currentRoomName = document.getElementById('current-room-name');
const leaveRoomBtn = document.getElementById('leave-room-btn');
const chatMessages = document.getElementById('chat-messages');
const typingIndicator = document.getElementById('typing-indicator');
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');

// Modal Elements
const navAbout = document.getElementById('nav-about');
const navHowItWorks = document.getElementById('nav-howitworks');
const navSignin = document.getElementById('nav-signin');
const navSignup = document.getElementById('nav-signup');
const aboutModal = document.getElementById('about-modal');
const howItWorksModal = document.getElementById('howitworks-modal');
const signinModal = document.getElementById('signin-modal');
const signupModal = document.getElementById('signup-modal');
const closeAbout = document.getElementById('close-about');
const closeHowItWorks = document.getElementById('close-howitworks');
const closeSignin = document.getElementById('close-signin');
const closeSignup = document.getElementById('close-signup');
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
    loadThemePreferences();

    // Listen for Authentication state changes
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // User is signed in
            const docSnap = await getDoc(doc(db, "users", user.uid));
            if (docSnap.exists()) {
                currentUser = { id: user.uid, ...docSnap.data() };
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
                } catch(e) { console.error("Could not rescue user profile:", e); }
            }
            setupUIForUser();
            connectPresence(user.uid);
            listenToInvitations(user.uid);
        } else {
            // User is signed out
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
        usersGrid.innerHTML = '<p style="text-align:center; color:red;">Failed to connect to Firebase. Did you add your config?</p>';
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
    
    const pendingReceived = myInvitations.filter(inv => inv.receiverId === currentUser.id && inv.status === 'pending');
    
    if (pendingReceived.length > 0) {
        invitationBadge.textContent = pendingReceived.length;
        invitationBadge.classList.remove('hidden');
    } else {
        invitationBadge.classList.add('hidden');
    }
    
    if (pendingReceived.length === 0) {
        invitationsList.innerHTML = '<p style="text-align: center; color: var(--system-text); font-size: 0.95rem;">No pending invitations.</p>';
        return;
    }
    
    invitationsList.innerHTML = '';
    pendingReceived.forEach(inv => {
        const card = document.createElement('div');
        card.className = 'invitation-card';
        card.innerHTML = `
            <div class="invitation-info">
                <img src="${inv.senderAvatar}" alt="${inv.senderName}" class="invitation-avatar">
                <div>
                    <h4 style="margin-bottom: 0.2rem;">${inv.senderName}</h4>
                    <p style="font-size: 0.85rem; color: var(--system-text);">wants to connect</p>
                </div>
            </div>
            <div class="invitation-actions">
                <button class="btn-primary btn-sm" onclick="acceptInvitation('${inv.id}', '${inv.senderName}')">Accept</button>
                <button class="btn-sm btn-decline" onclick="declineInvitation('${inv.id}')">Decline</button>
            </div>
        `;
        invitationsList.appendChild(card);
    });
}

function renderUsers(filterType) {
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
             const invite = myInvitations.find(inv => inv.participants.includes(user.id) && inv.participants.includes(currentUser.id));
             
             if (!invite) {
                 actionButtonHTML = `<button class="connect-btn" onclick="sendInvitation('${user.id}', '${user.username}', '${user.avatar || ''}')">Connect</button>`;
             } else if (invite.status === 'pending') {
                 if (invite.senderId === currentUser.id) {
                     actionButtonHTML = `<button class="connect-btn" style="background:var(--secondary-color); color:var(--text-color); cursor:not-allowed;" disabled>Pending...</button>`;
                 } else {
                     actionButtonHTML = `<button class="connect-btn" style="background:#10b981; color:white; border-color:transparent;" onclick="invitationsModal.classList.remove('hidden')">Respond</button>`;
                 }
             } else if (invite.status === 'accepted') {
                 actionButtonHTML = `<button class="connect-btn" style="background:var(--primary-gradient); color:white; border-color:transparent;" onclick="startSession('${user.username}', '${user.skill || 'Topic'}')">Message</button>`;
             }
        }

        card.innerHTML = `
            ${statusBadge}
            <img src="${user.avatar || 'https://static.vecteezy.com/system/resources/previews/021/548/095/non_2x/default-profile-picture-avatar-user-avatar-icon-person-icon-head-icon-profile-picture-icons-default-anonymous-user-male-and-female-businessman-photo-placeholder-social-network-avatar-portrait-free-vector.jpg'}" alt="${user.username}" class="user-avatar">
            <h3 class="user-name">${user.username}</h3>
            <p class="user-skill">${user.skill || 'Learner'}</p>
            
            <div class="card-actions">
                ${actionButtonHTML}
                <button class="icon-btn info-btn" onclick="openProfileModal('${user.id}', event)" aria-label="View Profile">
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </button>
            </div>
        `;
        usersGrid.appendChild(card);
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

        const msgBtn = document.getElementById('modal-msg-btn');
        msgBtn.onclick = () => {
            profileModal.classList.add('hidden');
            startSession(user.username, user.skill || 'Topic');
        };

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
    if (navInvitations) navInvitations.classList.remove('hidden');
    if (navProfileBtn) {
        navProfileBtn.src = currentUser.avatar || 'https://static.vecteezy.com/system/resources/previews/021/548/095/non_2x/default-profile-picture-avatar-user-avatar-icon-person-icon-head-icon-profile-picture-icons-default-anonymous-user-male-and-female-businessman-photo-placeholder-social-network-avatar-portrait-free-vector.jpg';
        navProfileBtn.classList.remove('hidden');
    }

    const networkSection = document.getElementById('network-section');
    if (networkSection) {
        networkSection.classList.remove('hidden');
        networkSection.scrollIntoView({ behavior: 'smooth' });
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
    if (navInvitations) navInvitations.classList.add('hidden');
    if (navProfileBtn) navProfileBtn.classList.add('hidden');

    const networkSection = document.getElementById('network-section');
    if (networkSection) networkSection.classList.add('hidden');
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

// Invitations Action Logic
window.sendInvitation = async function(receiverId, receiverName, receiverAvatar) {
    if (!currentUser) return;
    try {
        await addDoc(collection(db, "invitations"), {
            participants: [currentUser.id, receiverId],
            senderId: currentUser.id,
            senderName: currentUser.username,
            senderAvatar: currentUser.avatar || 'https://static.vecteezy.com/system/resources/previews/021/548/095/non_2x/default-profile-picture-avatar-user-avatar-icon-person-icon-head-icon-profile-picture-icons-default-anonymous-user-male-and-female-businessman-photo-placeholder-social-network-avatar-portrait-free-vector.jpg',
            receiverId: receiverId,
            status: 'pending',
            timestamp: serverTimestamp()
        });
    } catch(err) {
        console.error("Error sending invitation:", err);
    }
}

window.acceptInvitation = async function(inviteId, senderName) {
    try {
        await setDoc(doc(db, "invitations", inviteId), { status: 'accepted' }, { merge: true });
        invitationsModal.classList.add('hidden');
        startSession(senderName, 'Topic');
    } catch(err) {
        console.error("Error accepting invitation:", err);
    }
}

window.declineInvitation = async function(inviteId) {
    try {
        await deleteDoc(doc(db, "invitations", inviteId));
    } catch(err) {
        console.error("Error declining invitation:", err);
    }
}

// Chat Sessions
window.startSession = async function (peerName, skillContext) {
    if (!currentUser) {
        alert("Please log in first to chat!");
        signinModal.classList.remove('hidden');
        return;
    }

    currentRoom = [currentUser.username, peerName].sort().join('-');
    currentRoomName.textContent = `Session with ${peerName}`;
    chatMessages.innerHTML = '';

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
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                const data = change.doc.data();
                if (data.sender !== currentUser.username) {
                    addChatMessage(data.sender, data.text, false, data.time);
                }
            }
        });
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
    scrollToBottom();
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function handleSendMessage(e) {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text || !currentUser || !currentRoom) return;

    const time = getFormattedTime();
    // Show my message immediately locally for visual speed
    addChatMessage(currentUser.username, text, true, time);
    messageInput.value = '';

    // Add to Firestore
    addDoc(collection(db, "rooms", currentRoom, "messages"), {
        sender: currentUser.username,
        text: text,
        timestamp: serverTimestamp(),
        time: time
    });
}

// --- 6. Event Listeners ---
themeToggle.addEventListener('click', toggleTheme);
leaveRoomBtn.addEventListener('click', leaveRoom);
chatForm.addEventListener('submit', handleSendMessage);
window.addEventListener('DOMContentLoaded', init);

heroGetStarted?.addEventListener('click', () => {
    if (currentUser) {
        document.querySelector('#network-section').scrollIntoView({ behavior: 'smooth' });
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

    try {
        signinError.classList.add('hidden');
        await signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
        signinModal.classList.add('hidden');
        emailInput.value = '';
        passwordInput.value = '';
    } catch (err) {
        console.error(err);
        // Check if it's a password-related error
        if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
            signinError.textContent = 'Please Enter the Correct Password';
            signinError.classList.remove('hidden');
        } else if (err.code === 'auth/user-not-found') {
            signinError.textContent = 'User not found. Please check your email.';
            signinError.classList.remove('hidden');
        } else {
            signinError.textContent = err.message || 'Login failed';
            signinError.classList.remove('hidden');
        }
        console.error(err);
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
