// --- Variables Globales de la App de Dictado (declaradas una vez) ---
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
let currentUserVocabulary = {}; 
let currentUserId = null;      

// --- Variables para el Atajo de Teclado (globales) ---
let isProcessingShortcut = false;
const SHORTCUT_DEBOUNCE_MS = 300; 
let firstShiftIsDown = false;
let cmdCtrlIsDown = false;
let shortcutSequenceActive = false; 
let shortcutTimeoutId = null; 
const SHORTCUT_WINDOW_MS = 700; 
let globalShortcutListenerAttached = false; // Bandera para los listeners globales del atajo

document.addEventListener('DOMContentLoaded', () => {
    console.log("DEBUG: DOMContentLoaded event fired.");

    // --- Selección de Elementos DOM ---
    startRecordBtn = document.getElementById('startRecordBtn');
    // ... (resto de las asignaciones de getElementById como estaban) ...
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

    const elementsMap = { /* ... como estaba ... */ };
    // ... (verificación de elementsMap como estaba) ...
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
    console.log("DEBUG: Todos los elementos HTML principales fueron encontrados.");


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

    // --- AÑADIR LISTENERS GLOBALES PARA EL ATAJO AQUÍ ---
    // Solo se añaden una vez cuando el DOM está listo.
    // La lógica interna verificará si el usuario está logueado (window.dictationAppInitialized).
    if (!globalShortcutListenerAttached) {
        console.log("DEBUG: DOMContentLoaded - Añadiendo listeners GLOBALES para atajo Shift+Cmd/Ctrl+Shift (versión revisada)");
        document.addEventListener('keydown', handleGlobalShortcutKeyDown);
        document.addEventListener('keyup', handleGlobalShortcutKeyUp);
        window.addEventListener('blur', resetShortcutKeys); // Resetear si se pierde el foco
        globalShortcutListenerAttached = true;
    }

}); // Fin de DOMContentLoaded


document.addEventListener('firebaseReady', () => {
    console.log("DEBUG: Evento firebaseReady RECIBIDO. Llamando a initializeAuthAndApp...");
    initializeAuthAndApp();
});

// --- Funciones del Atajo de Teclado (ahora globales) ---
function resetShortcutKeys() {
    // console.log("DEBUG_SC: Estado de teclas de atajo reseteado.");
    firstShiftIsDown = false;
    cmdCtrlIsDown = false;
    shortcutSequenceActive = false;
    clearTimeout(shortcutTimeoutId);
}

function handleGlobalShortcutKeyDown(event) {
    if (!window.dictationAppInitialized) { // Solo procesar si la app de dictado está lista (usuario logueado)
        // console.log("DEBUG_SC: KeyDown - App de dictado no inicializada. Ignorando.");
        return;
    }

    const targetTagName = event.target.tagName.toLowerCase();
    if (['input', 'textarea'].includes(targetTagName) && !event.target.readOnly) {
        // console.log("DEBUG_SC: KeyDown - Foco en input/textarea editable. Ignorando atajo.");
        return;
    }
    
    // console.log(`DEBUG_SC KeyDown: Key: ${event.key}, Shift: ${event.shiftKey}, Ctrl: ${event.ctrlKey}, Meta: ${event.metaKey} | States: firstS:${firstShiftIsDown}, cmdCtrl:${cmdCtrlIsDown}, activeS:${shortcutSequenceActive}`);

    if (event.key === 'Shift') {
        if (!isRecording && !isPaused && !shortcutSequenceActive && !firstShiftIsDown) { 
            firstShiftIsDown = true;
            shortcutSequenceActive = false; 
            cmdCtrlIsDown = false;
            // console.log("DEBUG_SC: Primer Shift detectado. Esperando Cmd/Ctrl.");
            clearTimeout(shortcutTimeoutId);
            shortcutTimeoutId = setTimeout(resetShortcutKeys, SHORTCUT_WINDOW_MS);
            return; 
        }
        
        if (shortcutSequenceActive && firstShiftIsDown && cmdCtrlIsDown) {
            event.preventDefault();
            console.log("DEBUG_SC: Atajo Shift+Cmd/Ctrl+Shift COMPLETADO!");

            if (!startRecordBtn || startRecordBtn.disabled || isProcessingShortcut) {
                console.warn("DEBUG_SC: Atajo ignorado (Botón deshabilitado o atajo en proceso).");
                resetShortcutKeys();
                return;
            }
            
            isProcessingShortcut = true;
            toggleRecordingState();
            setTimeout(() => { isProcessingShortcut = false; }, SHORTCUT_DEBOUNCE_MS);
            resetShortcutKeys(); 
        }
    } else if (event.metaKey || event.ctrlKey) {
        if (firstShiftIsDown && !cmdCtrlIsDown) { 
            cmdCtrlIsDown = true;
            shortcutSequenceActive = true; 
            // console.log("DEBUG_SC: Cmd/Ctrl detectado después del primer Shift. Esperando SEGUNDO Shift.");
            clearTimeout(shortcutTimeoutId); 
            shortcutTimeoutId = setTimeout(resetShortcutKeys, SHORTCUT_WINDOW_MS);
        } else if (!firstShiftIsDown) {
            resetShortcutKeys();
        }
    } else {
        if (firstShiftIsDown || cmdCtrlIsDown) {
            resetShortcutKeys();
        }
    }
}

function handleGlobalShortcutKeyUp(event) {
    if (!window.dictationAppInitialized) {
        return;
    }
    // console.log(`DEBUG_SC KeyUp: Key: ${event.key}, Shift: ${event.shiftKey}, Ctrl: ${event.ctrlKey}, Meta: ${event.metaKey} | States: firstS:${firstShiftIsDown}, cmdCtrl:${cmdCtrlIsDown}, activeS:${shortcutSequenceActive}`);
    if (event.key === 'Shift') {
        if (firstShiftIsDown && !cmdCtrlIsDown) { 
            resetShortcutKeys();
        }
    } else if ((event.key === 'Meta' || event.key === 'Control')) {
        // Si se sueltan Cmd o Ctrl, y cmdCtrlIsDown era true, la secuencia se considera rota.
        // Esto es importante porque event.metaKey y event.ctrlKey pueden ser false en keyup
        // incluso si otra tecla modificadora sigue presionada.
        if (cmdCtrlIsDown) {
            resetShortcutKeys();
        }
    }
}


function initializeAuthAndApp() {
    // ... (MISMA LÓGICA DE initializeAuthAndApp que antes, incluyendo onAuthStateChanged) ...
    // ... onAuthStateChanged llamará a initializeDictationAppLogic ...
    console.log("DEBUG: initializeAuthAndApp - INICIO de la función.");
    const authContainer = document.getElementById('auth-container');
    const appContainer = document.getElementById('app-container');
    const loginForm = document.getElementById('login-form');
    // ... (resto de selectores auth)
    const logoutButton = document.getElementById('logoutButton');
    // ... (verificación de authElements)
    const auth = window.auth;
    const onAuthStateChanged = window.onAuthStateChanged;
    // ... (listeners de formularios auth y logoutButton)
    showSignupLink.addEventListener('click', (e) => { /* ... */ });
    showLoginLink.addEventListener('click', (e) => { /* ... */ });
    signupForm.addEventListener('submit', async (e) => { /* ... */ });
    loginForm.addEventListener('submit', async (e) => { /* ... */ });
    logoutButton.addEventListener('click', async () => { /* ... */ });

    onAuthStateChanged(auth, async (user) => { 
        console.log("DEBUG: onAuthStateChanged - CALLBACK EJECUTADO. User object:", user ? user.uid : null); 
        if (user) {
            currentUserId = user.uid; 
            console.log("DEBUG: onAuthStateChanged - Usuario ESTÁ autenticado. UID:", currentUserId, "Email:", user.email);
            document.body.classList.remove('logged-out'); document.body.classList.add('logged-in');
            authContainer.style.display = 'none'; appContainer.style.display = 'flex'; 
            userDisplaySpan.textContent = `${user.email || 'Usuario'}`;
            
            await loadUserVocabularyFromFirestore(currentUserId); 

            if (!window.dictationAppInitialized) {
                console.log("DEBUG: onAuthStateChanged - Llamando a initializeDictationAppLogic para el usuario:", currentUserId);
                initializeDictationAppLogic(currentUserId); 
                window.dictationAppInitialized = true;
            } else {
                console.log("DEBUG: onAuthStateChanged - App de dictado ya inicializada. Refrescando estado inicial de botones.");
                if (typeof updateButtonStates === "function") updateButtonStates("initial"); 
            }
        } else {
            currentUserId = null; customVocabulary = {}; learnedCorrections = {}; commonMistakeNormalization = {};
            console.log("DEBUG: onAuthStateChanged - Usuario NO está autenticado o sesión cerrada.");
            document.body.classList.remove('logged-in'); document.body.classList.add('logged-out');
            authContainer.style.display = 'block'; appContainer.style.display = 'none';
            if (userDisplaySpan) userDisplaySpan.textContent = '';
            if (window.currentMediaRecorder && window.currentMediaRecorder.state !== "inactive") {
                try { window.currentMediaRecorder.stop(); } 
                catch(e) { console.warn("DEBUG: onAuthStateChanged - Error al detener MediaRecorder en logout:", e); }
            }
            window.dictationAppInitialized = false; 
        }
    });
} 

function getFirebaseErrorMessage(error) { /* ... (como antes) ... */ }

function initializeDictationAppLogic(userId) {
    console.log(`DEBUG: initializeDictationAppLogic para usuario: ${userId} - Asignando listeners específicos de la app.`);
    
    // Los listeners de los botones de la app se añaden aquí como antes
    if (!startRecordBtn.dataset.listenerAttached) { startRecordBtn.addEventListener('click', toggleRecordingState); startRecordBtn.dataset.listenerAttached = 'true';}
    // ... (resto de listeners: pause, retry, copy, correct, technique, clear, modal) ...
    if (!pauseResumeBtn.dataset.listenerAttached) { pauseResumeBtn.addEventListener('click', handlePauseResume); pauseResumeBtn.dataset.listenerAttached = 'true';}
    if (!retryProcessBtn.dataset.listenerAttached) { retryProcessBtn.addEventListener('click', () => { if (currentAudioBlob) { if (isRecording || isPaused) { alert("Detén la grabación actual antes de reenviar."); return; } processAudioBlob(currentAudioBlob); }}); retryProcessBtn.dataset.listenerAttached = 'true';}
    if (!copyPolishedTextBtn.dataset.listenerAttached) { copyPolishedTextBtn.addEventListener('click', async () => { const h = headerArea.value.trim(); const r = polishedTextarea.value.trim(); let t = ""; if(h){t+=h;} if(r){if(t){t+="\n\n";} t+=r;} if(t===''){setStatus("Nada que copiar.", "idle", 2000); return;} try{await navigator.clipboard.writeText(t); setStatus("¡Texto copiado!", "success", 2000);}catch(e){console.error('Error copia:',e);setStatus("Error copia.", "error", 3000);}}); copyPolishedTextBtn.dataset.listenerAttached = 'true';}
    if (correctTextSelectionBtn && !correctTextSelectionBtn.dataset.listenerAttached) { correctTextSelectionBtn.addEventListener('click', handleCorrectTextSelection); correctTextSelectionBtn.dataset.listenerAttached = 'true';}
    if (techniqueButtonsContainer && !techniqueButtonsContainer.dataset.listenerAttached) { techniqueButtonsContainer.addEventListener('click', (e) => { if (e.target.tagName === 'BUTTON' && e.target.dataset.techniqueText) { headerArea.value = e.target.dataset.techniqueText; headerArea.focus(); }}); techniqueButtonsContainer.dataset.listenerAttached = 'true';}
    if (clearHeaderButton && !clearHeaderButton.dataset.listenerAttached) { clearHeaderButton.addEventListener('click', () => { headerArea.value = ""; headerArea.focus(); }); clearHeaderButton.dataset.listenerAttached = 'true';}
    if (manageVocabButton && !manageVocabButton.dataset.listenerAttached) { manageVocabButton.addEventListener('click', openVocabManager); manageVocabButton.dataset.listenerAttached = 'true'; manageVocabButton.disabled = false; }
    if (modalCloseButtonVocab && !modalCloseButtonVocab.dataset.listenerAttached) { modalCloseButtonVocab.addEventListener('click', closeVocabManager); modalCloseButtonVocab.dataset.listenerAttached = 'true'; }
    if (modalAddNewRuleButtonVocab && !modalAddNewRuleButtonVocab.dataset.listenerAttached) { modalAddNewRuleButtonVocab.addEventListener('click', handleAddNewVocabRule); modalAddNewRuleButtonVocab.dataset.listenerAttached = 'true'; }
    if (vocabManagerModal && !vocabManagerModal.dataset.listenerAttached) { vocabManagerModal.addEventListener('click', (e) => { if (e.target === vocabManagerModal) closeVocabManager(); }); vocabManagerModal.dataset.listenerAttached = 'true'; }
    
    updateButtonStates("initial"); 
    console.log("DEBUG: Lógica de la app de dictado inicializada y listeners específicos asignados.");
} 

// --- Funciones de la App de Dictado (definidas en el scope global del script) ---
// ... (TODAS las funciones como applyTheme, setStatus, startRecordingTimer, toggleRecordingState,
//      processAudioBlob, updateButtonStates, manejo de vocabulario, llamadas a API, etc.
//      PERMANECEN AQUÍ, igual que en la respuesta anterior completa) ...
// (Para brevedad, no las repito todas, pero deben estar aquí)
function applyTheme(theme) { /* ... */ }
function setAccentRGB() { /* ... */ }
function setStatus(message, type = "idle", duration = 0) { /* ... */ }
function startRecordingTimer() { /* ... */ }
function stopRecordingTimer() { /* ... */ }
function updateRecordingTimeDisplay() { /* ... */ }
function resetRecordingTimerDisplay() { /* ... */ }
function setupVolumeMeter(stream) { /* ... */ }
function stopVolumeMeter() { /* ... */ }
function toggleRecordingState() { /* ... */ }
async function startActualRecording() { /* ... */ }
function handlePauseResume() { /* ... */ }
async function processAudioBlob(audioBlob) { /* ... */ }
function updateButtonStates(state) { /* ... (código completo de esta función) ... */ }
async function handleCorrectTextSelection(){ /* ... (código completo de esta función) ... */ }
function blobToBase64(b){ /* ... */ }
async function callGeminiAPI(p,isTxt=false){ /* ... */ }
function capitalizeSentencesProperly(t){ /* ... */ }
async function transcribeAndPolishAudio(b){ /* ... (código completo de esta función) ... */ }
async function loadUserVocabularyFromFirestore(userId) { /* ... (código completo de esta función) ... */ }
async function saveUserVocabularyToFirestore() { /* ... (código completo de esta función) ... */ }
function applyAllUserCorrections(text) { /* ... (código completo de esta función) ... */ }
function escapeRegExp(string) { /* ... */ }
function openVocabManager() { /* ... */ }
function closeVocabManager() { /* ... */ }
function populateVocabManagerList() { /* ... (código completo de esta función) ... */ }
async function handleAddNewVocabRule() { /* ... (código completo de esta función) ... */ }
async function handleEditVocabRule(keyToEdit) { /* ... (código completo de esta función) ... */ }
async function handleDeleteVocabRule(keyToDelete) { /* ... (código completo de esta función) ... */ }


console.log("DEBUG: Script principal (fuera de DOMContentLoaded y firebaseReady) evaluado. Esperando firebaseReady...");
