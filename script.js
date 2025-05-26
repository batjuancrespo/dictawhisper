// --- Variables Globales del Módulo (accesibles en todo el script) ---
let startRecordBtn, pauseResumeBtn, retryProcessBtn, copyPolishedTextBtn, correctTextSelectionBtn, 
    statusDiv, polishedTextarea, audioPlayback, audioPlaybackSection, 
    themeSwitch, volumeMeterBar, volumeMeterContainer, recordingTimeDisplay, 
    headerArea, techniqueButtonsContainer, clearHeaderButton, 
    mainTitleImage, mainTitleImageDark,
    vocabManagerModal, vocabManagerList, modalCloseButtonVocab, modalAddNewRuleButtonVocab, manageVocabButton;

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

// Variables para el Atajo de Teclado
let isProcessingShortcut = false;
const SHORTCUT_DEBOUNCE_MS = 300; 
let firstShiftIsDown = false; 
let cmdCtrlIsDown = false;    
let shortcutSequenceActive = false; 
let shortcutTimeoutId = null; 
const SHORTCUT_WINDOW_MS = 700; 

// --- FIN de Variables Globales del Módulo ---

document.addEventListener('DOMContentLoaded', () => {
    console.log("DEBUG: DOMContentLoaded event fired.");

    // Asignar elementos DOM a las variables globales
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

    const elementsMap = { /* ... (como estaba para verificación) ... */ };
    // ... (verificación de elementsMap como estaba) ...
    let allElementsFound = true;
    for (const elementName in elementsMap) {
        if (!elementsMap[elementName]) {
            console.error(`DEBUG: Elemento NO encontrado en DOMContentLoaded: ${elementName}`);
            allElementsFound = false;
        }
    }
    if (!allElementsFound) { /* ... manejo de error ... */ return; }
    console.log("DEBUG: Todos los elementos HTML principales fueron encontrados en DOMContentLoaded.");

    const preferredTheme = localStorage.getItem('theme') || 'dark'; 
    applyTheme(preferredTheme); 
    setAccentRGB(); 
    new MutationObserver(setAccentRGB).observe(document.body, { attributes: true, attributeFilter: ['data-theme']});

    if (themeSwitch) {
        themeSwitch.addEventListener('change', () => {
            applyTheme(themeSwitch.checked ? 'dark' : 'light');
        });
    } else { console.error("DEBUG: themeSwitch no fue encontrado."); }
});


document.addEventListener('firebaseReady', () => {
    console.log("DEBUG: Evento firebaseReady RECIBIDO. Llamando a initializeAuthAndApp...");
    initializeAuthAndApp();
});

function initializeAuthAndApp() {
    // ... (Lógica de initializeAuthAndApp como estaba, incluyendo la selección de elementos DOM de AUTH)
    // ... (y los listeners de formularios de AUTH y onAuthStateChanged)
    console.log("DEBUG: initializeAuthAndApp - INICIO de la función.");
    const authContainer = document.getElementById('auth-container');
    // ... (todos los selectores de elementos de auth) ...
    const logoutButton = document.getElementById('logoutButton');

    // ... (verificación de elementos de auth) ...

    const auth = window.auth;
    // ... (asignación de funciones de auth de window) ...
    const onAuthStateChanged = window.onAuthStateChanged;

    // ... (listeners de showSignupLink, showLoginLink, signupForm, loginForm, logoutButton) ...

    console.log("DEBUG: initializeAuthAndApp - Suscribiendo onAuthStateChanged listener...");
    onAuthStateChanged(auth, async (user) => { 
        console.log("DEBUG: onAuthStateChanged - CALLBACK EJECUTADO. User object:", user ? user.uid : null); 
        if (user) {
            currentUserId = user.uid; 
            console.log("DEBUG: onAuthStateChanged - Usuario ESTÁ autenticado. UID:", currentUserId);
            // ... (cambio de clases y display de contenedores) ...
            document.body.classList.remove('logged-out'); document.body.classList.add('logged-in');
            if(authContainer) authContainer.style.display = 'none'; 
            if(appContainer) appContainer.style.display = 'flex'; 
            if(userDisplaySpan) userDisplaySpan.textContent = `${user.email || 'Usuario'}`;
            
            await loadUserVocabularyFromFirestore(currentUserId); 

            if (!window.dictationAppInitialized) {
                console.log("DEBUG: onAuthStateChanged - Llamando a initializeDictationAppLogic.");
                initializeDictationAppLogic(currentUserId); // Pasar userId es buena práctica
                window.dictationAppInitialized = true;
            } else {
                console.log("DEBUG: onAuthStateChanged - App ya inicializada.");
                if (typeof updateButtonStates === "function") updateButtonStates("initial"); 
            }
        } else {
            currentUserId = null; 
            customVocabulary = {}; 
            learnedCorrections = {};
            commonMistakeNormalization = {};
            // ... (lógica de logout: cambio de clases, display, detener mediaRecorder si activo) ...
            document.body.classList.remove('logged-in'); document.body.classList.add('logged-out');
            if(authContainer) authContainer.style.display = 'block'; 
            if(appContainer) appContainer.style.display = 'none';
            if(userDisplaySpan) userDisplaySpan.textContent = '';
            if (window.currentMediaRecorder && window.currentMediaRecorder.state !== "inactive") {
                try { window.currentMediaRecorder.stop(); } 
                catch(e) { console.warn("DEBUG: onAuthStateChanged - Error al detener MediaRecorder en logout:", e); }
            }
            window.dictationAppInitialized = false; 
        }
    });
    console.log("DEBUG: initializeAuthAndApp - onAuthStateChanged listener suscrito.");

    function getFirebaseErrorMessage(error) { /* ... (como estaba) ... */ }
} 

// ESTA FUNCIÓN AHORA ESTÁ EN EL SCOPE GLOBAL DEL SCRIPT Y USA LAS VARIABLES GLOBALES
function initializeDictationAppLogic(userIdPassedIn) { // userIdPassedIn para claridad, aunque currentUserId global también estaría disponible
    console.log(`DEBUG: initializeDictationAppLogic para usuario: ${userIdPassedIn} - Asignando listeners.`);
    
    // Los elementos DOM ya están definidos globalmente (startRecordBtn, etc.)
    // Los listeners solo se deben añadir una vez.
    if (startRecordBtn && !startRecordBtn.dataset.listenerAttached) { startRecordBtn.addEventListener('click', toggleRecordingState); startRecordBtn.dataset.listenerAttached = 'true';}
    if (pauseResumeBtn && !pauseResumeBtn.dataset.listenerAttached) { pauseResumeBtn.addEventListener('click', handlePauseResume); pauseResumeBtn.dataset.listenerAttached = 'true';}
    if (retryProcessBtn && !retryProcessBtn.dataset.listenerAttached) { retryProcessBtn.addEventListener('click', () => { if (currentAudioBlob) { if (isRecording || isPaused) { alert("Detén la grabación actual antes de reenviar."); return; } processAudioBlob(currentAudioBlob); }}); retryProcessBtn.dataset.listenerAttached = 'true';}
    if (copyPolishedTextBtn && !copyPolishedTextBtn.dataset.listenerAttached) { copyPolishedTextBtn.addEventListener('click', async () => { const h = headerArea.value.trim(); const r = polishedTextarea.value.trim(); let t = ""; if(h){t+=h;} if(r){if(t){t+="\n\n";} t+=r;} if(t===''){setStatus("Nada que copiar.", "idle", 2000); return;} try{await navigator.clipboard.writeText(t); setStatus("¡Texto copiado!", "success", 2000);}catch(e){console.error('Error copia:',e);setStatus("Error copia.", "error", 3000);}}); copyPolishedTextBtn.dataset.listenerAttached = 'true';}
    if (correctTextSelectionBtn && !correctTextSelectionBtn.dataset.listenerAttached) { correctTextSelectionBtn.addEventListener('click', handleCorrectTextSelection); correctTextSelectionBtn.dataset.listenerAttached = 'true';}
    if (techniqueButtonsContainer && !techniqueButtonsContainer.dataset.listenerAttached) { techniqueButtonsContainer.addEventListener('click', (e) => { if (e.target.tagName === 'BUTTON' && e.target.dataset.techniqueText) { headerArea.value = e.target.dataset.techniqueText; headerArea.focus(); }}); techniqueButtonsContainer.dataset.listenerAttached = 'true';}
    if (clearHeaderButton && !clearHeaderButton.dataset.listenerAttached) { clearHeaderButton.addEventListener('click', () => { headerArea.value = ""; headerArea.focus(); }); clearHeaderButton.dataset.listenerAttached = 'true';}
    if (manageVocabButton && !manageVocabButton.dataset.listenerAttached) { manageVocabButton.addEventListener('click', openVocabManager); manageVocabButton.dataset.listenerAttached = 'true'; manageVocabButton.disabled = false; }
    if (modalCloseButtonVocab && !modalCloseButtonVocab.dataset.listenerAttached) { modalCloseButtonVocab.addEventListener('click', closeVocabManager); modalCloseButtonVocab.dataset.listenerAttached = 'true'; }
    if (modalAddNewRuleButtonVocab && !modalAddNewRuleButtonVocab.dataset.listenerAttached) { modalAddNewRuleButtonVocab.addEventListener('click', handleAddNewVocabRule); modalAddNewRuleButtonVocab.dataset.listenerAttached = 'true'; }
    if (vocabManagerModal && !vocabManagerModal.dataset.listenerAttached) { vocabManagerModal.addEventListener('click', (e) => { if (e.target === vocabManagerModal) closeVocabManager(); }); vocabManagerModal.dataset.listenerAttached = 'true'; }
    
    // --- Listener para el Atajo de Teclado Global (REPLICADO DE TU index (2).html) ---
    if (!document.dataset.dictationGlobalShortcutListenerAttached) {
        console.log("DEBUG: initializeDictationAppLogic - Añadiendo listener GLOBAL para atajo Shift+Cmd/Ctrl+Shift (estilo index(2).html)");
        document.addEventListener('keydown', function(event) {
            if (!window.dictationAppInitialized) return;
            if (event.shiftKey && (event.metaKey || event.ctrlKey) && event.key === 'Shift') {
                const targetTagName = event.target.tagName.toLowerCase();
                if (['input', 'textarea'].includes(targetTagName) && !event.target.readOnly) { return; } // Evitar en inputs
                event.preventDefault(); 
                console.log("DEBUG_SC: Atajo GLOBAL Shift+Cmd/Ctrl+Shift detectado.");
                if (!startRecordBtn || startRecordBtn.disabled || isProcessingShortcut) {
                    console.warn("DEBUG_SC: Atajo ignorado (Botón deshabilitado o atajo en proceso).");
                    return;
                }
                isProcessingShortcut = true;
                toggleRecordingState(); 
                setTimeout(() => { isProcessingShortcut = false; }, SHORTCUT_DEBOUNCE_MS);
            }
        });
        document.dataset.dictationGlobalShortcutListenerAttached = 'true';
    } else {
        console.log("DEBUG: initializeDictationAppLogic - Listener de atajo global YA EXISTE.");
    }
    
    updateButtonStates("initial"); 
} 

// --- TODAS LAS DEMÁS FUNCIONES (applyTheme, setAccentRGB, setStatus, etc.) ---
// --- DEBEN ESTAR AQUÍ, EN EL SCOPE GLOBAL DEL SCRIPT ---

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
async function loadUserVocabularyFromFirestore(userId) { /* ... (como estaba, usando variables globales customVocabulary, etc.) ... */ }
async function saveUserVocabularyToFirestore() { /* ... (como estaba, usando variables globales) ... */ }
function applyAllUserCorrections(text) { /* ... (como estaba, usando variables globales) ... */ }
function escapeRegExp(string) { /* ... (como estaba) ... */ }
function openVocabManager() { /* ... (como estaba) ... */ }
function closeVocabManager() { /* ... (como estaba) ... */ }
function populateVocabManagerList() { /* ... (como estaba) ... */ }
async function handleAddNewVocabRule() { /* ... (como estaba) ... */ }
async function handleEditVocabRule(keyToEdit) { /* ... (como estaba) ... */ }
async function handleDeleteVocabRule(keyToDelete) { /* ... (como estaba) ... */ }

console.log("DEBUG: Script principal (fuera de DOMContentLoaded y firebaseReady) evaluado. Esperando firebaseReady...");
