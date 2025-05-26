// --- Variables Globales del Módulo (accesibles en todo el script) ---
let startRecordBtn, pauseResumeBtn, retryProcessBtn, copyPolishedTextBtn, correctTextSelectionBtn, 
    statusDiv, polishedTextarea, audioPlayback, audioPlaybackSection, 
    themeSwitch, volumeMeterBar, volumeMeterContainer, recordingTimeDisplay, 
    headerArea, techniqueButtonsContainer, clearHeaderButton, 
    mainTitleImage, mainTitleImageDark,
    vocabManagerModal, vocabManagerList, modalCloseButtonVocab, modalAddNewRuleButtonVocab, manageVocabButton;

// Variables para contenedores Auth/App y elementos de usuario
let authContainer, appContainer, userDisplaySpan, logoutButton;

let mediaRecorder;
let audioChunks = [];
let currentAudioBlob = null;
let audioContext;
let analyser;
let microphoneSource;
let animationFrameId;
let isRecording = false; 
let isPaused = false;
let recordingTimerInterval; 
let recordingSeconds = 0;  
const userApiKey = 'AIzaSyASbB99MVIQ7dt3MzjhidgoHUlMXIeWvGc'; 

// Variables para el Vocabulario del Usuario
let currentUserId = null;      
let customVocabulary = {};      
let learnedCorrections = {};    
let commonMistakeNormalization = {};

// --- Variables para el Atajo de Teclado (versión con timestamps) ---
let isProcessingShortcut = false;
const SHORTCUT_DEBOUNCE_MS = 300; 
let firstShiftTime = 0;
let cmdCtrlTime = 0;
const MAX_DELAY_BETWEEN_KEYS_MS = 600; // Tiempo máximo entre pulsaciones de la secuencia


document.addEventListener('DOMContentLoaded', () => {
    console.log("DEBUG: DOMContentLoaded event fired.");

    startRecordBtn = document.getElementById('startRecordBtn');
    pauseResumeBtn = document.getElementById('pauseResumeBtn');
    retryProcessBtn = document.getElementById('retryProcessBtn');
    copyPolishedTextBtn = document.getElementById('copyPolishedTextBtn'); 
    correctTextSelectionBtn = document.getElementById('correctTextSelectionBtn');
    statusDiv = document.getElementById('status');
    polishedTextarea = document.getElementById('polishedText');
    audioPlayback = document.getElementById('audioPlayback');
    audioPlaybackSection = document.querySelector('.audio-playback-section'); 
    themeSwitch = document.getElementById('themeSwitch'); 
    volumeMeterBar = document.getElementById('volumeMeterBar');
    volumeMeterContainer = document.getElementById('volumeMeterContainer'); 
    recordingTimeDisplay = document.getElementById('recordingTimeDisplay'); 
    headerArea = document.getElementById('headerArea'); 
    techniqueButtonsContainer = document.getElementById('techniqueButtons'); 
    clearHeaderButton = document.getElementById('clearHeaderButton'); 
    mainTitleImage = document.getElementById('mainTitleImage'); 
    mainTitleImageDark = document.getElementById('mainTitleImageDark'); 
    manageVocabButton = document.getElementById('manageVocabButton'); 
    vocabManagerModal = document.getElementById('vocabManagerModal');
    vocabManagerList = document.getElementById('vocabManagerList');
    modalCloseButtonVocab = document.getElementById('modalCloseButtonVocab'); 
    modalAddNewRuleButtonVocab = document.getElementById('modalAddNewRuleButtonVocab');
    authContainer = document.getElementById('auth-container');
    appContainer = document.getElementById('app-container');
    userDisplaySpan = document.getElementById('userDisplay');
    logoutButton = document.getElementById('logoutButton');

    const elementsMap = {
        startRecordBtn, pauseResumeBtn, retryProcessBtn, copyPolishedTextBtn, correctTextSelectionBtn,
        statusDiv, polishedTextarea, audioPlayback, audioPlaybackSection, themeSwitch,
        volumeMeterBar, volumeMeterContainer, recordingTimeDisplay, headerArea,
        techniqueButtonsContainer, clearHeaderButton, mainTitleImage, mainTitleImageDark,
        manageVocabButton, vocabManagerModal, vocabManagerList, modalCloseButtonVocab, modalAddNewRuleButtonVocab,
        authContainer, appContainer, userDisplaySpan, logoutButton 
    };

    let allElementsFound = true;
    for (const elementName in elementsMap) {
        if (!elementsMap[elementName]) {
            console.error(`DEBUG: Elemento NO encontrado en DOMContentLoaded: ${elementName}`);
            allElementsFound = false;
        }
    }

    if (!allElementsFound) {
        const errorMessage = "Error crítico: Uno o más elementos HTML no se encontraron. Revisa la consola.";
        alert(errorMessage);
        if (statusDiv) { statusDiv.textContent = "Error crítico de UI."; statusDiv.className = 'status-error';}
        return; 
    }
    console.log("DEBUG: Todos los elementos HTML principales fueron encontrados en DOMContentLoaded.");

    const preferredTheme = localStorage.getItem('theme') || 'dark'; 
    applyTheme(preferredTheme); 
    setAccentRGB(); 
    new MutationObserver(setAccentRGB).observe(document.body, { attributes: true, attributeFilter: ['data-theme']});

    if (themeSwitch) {
        themeSwitch.addEventListener('change', () => {
            applyTheme(themeSwitch.checked ? 'dark' : 'light');
        });
    } else {
        console.error("DEBUG: themeSwitch no fue encontrado.");
    }
});


document.addEventListener('firebaseReady', () => {
    console.log("DEBUG: Evento firebaseReady RECIBIDO. Llamando a initializeAuthAndApp...");
    initializeAuthAndApp();
});

function initializeAuthAndApp() {
    console.log("DEBUG: initializeAuthAndApp - INICIO de la función.");
    // authContainer, appContainer, etc., ya están asignados globalmente desde DOMContentLoaded
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const loginEmailInput = document.getElementById('login-email');
    const loginPasswordInput = document.getElementById('login-password');
    const signupEmailInput = document.getElementById('signup-email');
    const signupPasswordInput = document.getElementById('signup-password');
    const loginButton = document.getElementById('loginButton'); 
    const signupButton = document.getElementById('signupButton'); 
    const showSignupLink = document.getElementById('showSignupLink');
    const showLoginLink = document.getElementById('showLoginLink');
    const loginErrorDiv = document.getElementById('login-error');
    const signupErrorDiv = document.getElementById('signup-error');
    // userDisplaySpan y logoutButton ya son globales

    const authFormElements = {loginForm, signupForm, loginEmailInput, loginPasswordInput, signupEmailInput, signupPasswordInput, loginButton, signupButton, showSignupLink, showLoginLink, loginErrorDiv, signupErrorDiv};
    for (const elName in authFormElements) {
        if (!authFormElements[elName]) {
            console.error(`DEBUG: initializeAuthAndApp - Elemento de Formulario Auth NO encontrado: ${elName}`);
            return; 
        }
    }
    console.log("DEBUG: initializeAuthAndApp - Elementos de Formularios Auth DOM seleccionados correctamente.");

    const auth = window.auth;
    const createUserWithEmailAndPassword = window.createUserWithEmailAndPassword;
    const signInWithEmailAndPassword = window.signInWithEmailAndPassword;
    const signOut = window.signOut;
    const onAuthStateChanged = window.onAuthStateChanged;

    if (!auth || !onAuthStateChanged) { console.error("DEBUG: Firebase Auth no disponible."); return; }

    showSignupLink.addEventListener('click', (e) => { e.preventDefault(); loginForm.style.display = 'none'; signupForm.style.display = 'block'; loginErrorDiv.textContent = ''; signupErrorDiv.textContent = ''; });
    showLoginLink.addEventListener('click', (e) => { e.preventDefault(); signupForm.style.display = 'none'; loginForm.style.display = 'block'; loginErrorDiv.textContent = ''; signupErrorDiv.textContent = ''; });
    signupForm.addEventListener('submit', async (e) => { e.preventDefault(); const email = signupEmailInput.value; const password = signupPasswordInput.value; signupErrorDiv.textContent = ''; signupButton.disabled = true; signupButton.textContent = 'Registrando...'; try { await createUserWithEmailAndPassword(auth, email, password); } catch (error) { signupErrorDiv.textContent = getFirebaseErrorMessage(error); } finally { signupButton.disabled = false; signupButton.textContent = 'Registrarse'; } });
    loginForm.addEventListener('submit', async (e) => { e.preventDefault(); const email = loginEmailInput.value; const password = loginPasswordInput.value; loginErrorDiv.textContent = ''; loginButton.disabled = true; loginButton.textContent = 'Iniciando...'; try { await signInWithEmailAndPassword(auth, email, password); } catch (error) { loginErrorDiv.textContent = getFirebaseErrorMessage(error); } finally { loginButton.disabled = false; loginButton.textContent = 'Iniciar Sesión'; } });
    if (logoutButton) { logoutButton.addEventListener('click', async () => { try { await signOut(auth); } catch (error) { console.error('DEBUG: Error logout:', error); } }); }
    
    onAuthStateChanged(auth, async (user) => { 
        console.log("DEBUG: onAuthStateChanged. User:", user ? user.uid : null); 
        if (user) {
            currentUserId = user.uid; 
            document.body.classList.remove('logged-out'); document.body.classList.add('logged-in');
            if (authContainer) authContainer.style.display = 'none'; 
            if (appContainer) appContainer.style.display = 'flex'; 
            if (userDisplaySpan) userDisplaySpan.textContent = `${user.email || 'Usuario'}`;
            await loadUserVocabularyFromFirestore(currentUserId); 
            if (!window.dictationAppInitialized) {
                initializeDictationAppLogic(currentUserId); 
                window.dictationAppInitialized = true;
            } else { if (typeof updateButtonStates === "function") updateButtonStates("initial"); }
        } else {
            currentUserId = null; customVocabulary = {}; learnedCorrections = {}; commonMistakeNormalization = {};
            document.body.classList.remove('logged-in'); document.body.classList.add('logged-out');
            if (authContainer) authContainer.style.display = 'block'; 
            if (appContainer) appContainer.style.display = 'none';
            if (userDisplaySpan) userDisplaySpan.textContent = '';
            if (window.currentMediaRecorder && window.currentMediaRecorder.state !== "inactive") { try { window.currentMediaRecorder.stop(); } catch(e) {} }
            window.dictationAppInitialized = false; 
            resetShortcutState(); // Resetear estado del atajo en logout
        }
    });

    function getFirebaseErrorMessage(error) { /* ... (como estaba) ... */ }
} 

function initializeDictationAppLogic(userIdPassedIn) { 
    console.log(`DEBUG: initializeDictationAppLogic para ${userIdPassedIn}.`);
    if (startRecordBtn && !startRecordBtn.dataset.listenerAttached) { startRecordBtn.addEventListener('click', toggleRecordingState); startRecordBtn.dataset.listenerAttached = 'true';}
    if (pauseResumeBtn && !pauseResumeBtn.dataset.listenerAttached) { pauseResumeBtn.addEventListener('click', handlePauseResume); pauseResumeBtn.dataset.listenerAttached = 'true';}
    if (retryProcessBtn && !retryProcessBtn.dataset.listenerAttached) { retryProcessBtn.addEventListener('click', () => { if (currentAudioBlob) { if (isRecording || isPaused) { alert("Detén grabación actual."); return; } processAudioBlob(currentAudioBlob); }}); retryProcessBtn.dataset.listenerAttached = 'true';}
    if (copyPolishedTextBtn && !copyPolishedTextBtn.dataset.listenerAttached) { copyPolishedTextBtn.addEventListener('click', async () => { const h=headerArea.value.trim(), r=polishedTextarea.value.trim(); let t=""; if(h)t+=h; if(r){if(t)t+="\n\n"; t+=r;} if(t===''){setStatus("Nada que copiar.","idle",2000);return;} try{await navigator.clipboard.writeText(t);setStatus("¡Texto copiado!","success",2000);}catch(e){console.error('Error copia:',e);setStatus("Error copia.","error",3000);}}); copyPolishedTextBtn.dataset.listenerAttached = 'true';}
    if (correctTextSelectionBtn && !correctTextSelectionBtn.dataset.listenerAttached) { correctTextSelectionBtn.addEventListener('click', handleCorrectTextSelection); correctTextSelectionBtn.dataset.listenerAttached = 'true';}
    if (techniqueButtonsContainer && !techniqueButtonsContainer.dataset.listenerAttached) { techniqueButtonsContainer.addEventListener('click', (e) => { if (e.target.tagName === 'BUTTON' && e.target.dataset.techniqueText) { headerArea.value = e.target.dataset.techniqueText; headerArea.focus(); }}); techniqueButtonsContainer.dataset.listenerAttached = 'true';}
    if (clearHeaderButton && !clearHeaderButton.dataset.listenerAttached) { clearHeaderButton.addEventListener('click', () => { headerArea.value = ""; headerArea.focus(); }); clearHeaderButton.dataset.listenerAttached = 'true';}
    if (manageVocabButton && !manageVocabButton.dataset.listenerAttached) { manageVocabButton.addEventListener('click', openVocabManager); manageVocabButton.dataset.listenerAttached = 'true'; manageVocabButton.disabled = false; }
    if (modalCloseButtonVocab && !modalCloseButtonVocab.dataset.listenerAttached) { modalCloseButtonVocab.addEventListener('click', closeVocabManager); modalCloseButtonVocab.dataset.listenerAttached = 'true'; }
    if (modalAddNewRuleButtonVocab && !modalAddNewRuleButtonVocab.dataset.listenerAttached) { modalAddNewRuleButtonVocab.addEventListener('click', handleAddNewVocabRule); modalAddNewRuleButtonVocab.dataset.listenerAttached = 'true'; }
    if (vocabManagerModal && !vocabManagerModal.dataset.listenerAttached) { vocabManagerModal.addEventListener('click', (e) => { if (e.target === vocabManagerModal) closeVocabManager(); }); vocabManagerModal.dataset.listenerAttached = 'true'; }
    
    if (!document.dataset.dictationGlobalShortcutListenerAttached) {
        console.log("DEBUG_SC: Añadiendo listeners GLOBALES para atajo Shift+Cmd/Ctrl+Shift (timestamp)");
        document.addEventListener('keydown', function(event) {
            if (!window.dictationAppInitialized) return;
            const targetTagName = event.target.tagName.toLowerCase();
            if (['input', 'textarea'].includes(targetTagName) && !event.target.readOnly) return;
            if (event.repeat) return;

            if (event.key === 'Shift') {
                if (!firstShiftTime) { 
                    firstShiftTime = Date.now(); cmdCtrlTime = 0; 
                } else if (firstShiftTime && cmdCtrlTime && (Date.now() - cmdCtrlTime < MAX_DELAY_BETWEEN_KEYS_MS)) {
                    event.preventDefault(); console.log("DEBUG_SC: ATARJO Shift+Cmd/Ctrl+Shift COMPLETADO!");
                    if (!startRecordBtn || startRecordBtn.disabled || isProcessingShortcut) {
                        console.warn("DEBUG_SC: Atajo COMPLETADO pero ignorado.");
                        firstShiftTime = 0; cmdCtrlTime = 0; return;
                    }
                    isProcessingShortcut = true; toggleRecordingState();
                    setTimeout(() => { isProcessingShortcut = false; }, SHORTCUT_DEBOUNCE_MS);
                    firstShiftTime = 0; cmdCtrlTime = 0; 
                } else { firstShiftTime = Date.now(); cmdCtrlTime = 0; }
            } else if (event.metaKey || event.ctrlKey) {
                if (firstShiftTime && !cmdCtrlTime && (Date.now() - firstShiftTime < MAX_DELAY_BETWEEN_KEYS_MS)) {
                    cmdCtrlTime = Date.now();
                } else { firstShiftTime = 0; cmdCtrlTime = 0; }
            } else { firstShiftTime = 0; cmdCtrlTime = 0; }
        });
        window.addEventListener('blur', () => { firstShiftTime = 0; cmdCtrlTime = 0; });
        document.dataset.dictationGlobalShortcutListenerAttached = 'true';
    }
    updateButtonStates("initial"); 
} 

// No necesitamos resetShortcutKeys para la lógica de timestamp del atajo
// function resetShortcutKeys() { ... } 

function applyTheme(theme) { /* ... (como estaba) ... */ }
function setAccentRGB() { /* ... (como estaba) ... */ }
function setStatus(message, type = "idle", duration = 0) { /* ... (como estaba) ... */ }
function startRecordingTimer() { /* ... (como estaba) ... */ }
function stopRecordingTimer() { /* ... (como estaba) ... */ }
function updateRecordingTimeDisplay() { /* ... (como estaba) ... */ }
function resetRecordingTimerDisplay() { /* ... (como estaba) ... */ }
function setupVolumeMeter(stream) { /* ... (como estaba) ... */ }
function stopVolumeMeter() { /* ... (como estaba) ... */ }
function toggleRecordingState() { /* ... (como estaba) ... */ }
async function startActualRecording() { /* ... (como estaba) ... */ }
function handlePauseResume() { /* ... (como estaba) ... */ }
async function processAudioBlob(audioBlob) { /* ... (como estaba) ... */ }
function updateButtonStates(state) { /* ... (como estaba, con la corrección para startRecordBtn) ... */ }
async function handleCorrectTextSelection(){ /* ... (como estaba) ... */ }
function blobToBase64(b){ /* ... (como estaba) ... */ }
async function callGeminiAPI(p,isTxt=false){ /* ... (como estaba) ... */ }
function capitalizeSentencesProperly(t){ /* ... (como estaba) ... */ }
async function transcribeAndPolishAudio(b){ /* ... (como estaba) ... */ }
async function loadUserVocabularyFromFirestore(userId) { /* ... (como estaba) ... */ }
async function saveUserVocabularyToFirestore() { /* ... (como estaba) ... */ }
function applyAllUserCorrections(text) { /* ... (como estaba) ... */ }
function escapeRegExp(string) { /* ... (como estaba) ... */ }
function openVocabManager() { /* ... (como estaba) ... */ }
function closeVocabManager() { /* ... (como estaba) ... */ }
function populateVocabManagerList() { /* ... (como estaba, con la corrección de data-key) ... */ 
    vocabManagerList = vocabManagerList || document.getElementById('vocabManagerList'); 
    if (!vocabManagerList) { console.error("DEBUG_VOCAB: Lista del modal de vocabulario no encontrada en populate."); return; }
    vocabManagerList.innerHTML = ''; 
    const keys = Object.keys(customVocabulary).sort(); 
    if (keys.length === 0) { vocabManagerList.innerHTML = '<li>No hay reglas personalizadas (rulesMap).</li>'; return; }
    keys.forEach(key => {
        const value = customVocabulary[key]; const listItem = document.createElement('li');
        listItem.innerHTML = `<span class="vocab-key">${key}</span> <span class="vocab-arrow">➔</span> <span class="vocab-value">${value}</span> <div class="vocab-actions"><button class="edit-vocab-btn" data-key="${key}">Editar</button><button class="delete-vocab-btn" data-key="${key}">Borrar</button></div>`;
        const editBtn = listItem.querySelector('.edit-vocab-btn'); const deleteBtn = listItem.querySelector('.delete-vocab-btn');
        if (editBtn) { editBtn.addEventListener('click', (e) => { const k=e.target.dataset.key; if(k) handleEditVocabRule(k); else console.error("DEBUG_VOCAB: No key to edit.");}); }
        if (deleteBtn) { deleteBtn.addEventListener('click', (e) => { const k=e.target.dataset.key; if(k) handleDeleteVocabRule(k); else console.error("DEBUG_VOCAB: No key to delete.");}); }
        vocabManagerList.appendChild(listItem);
    });
}
async function handleAddNewVocabRule() { /* ... (como estaba) ... */ }
async function handleEditVocabRule(keyToEdit) { /* ... (como estaba) ... */ }
async function handleDeleteVocabRule(keyToDelete) { /* ... (como estaba) ... */ }

console.log("DEBUG: Script principal (fuera de DOMContentLoaded y firebaseReady) evaluado. Esperando firebaseReady...");
