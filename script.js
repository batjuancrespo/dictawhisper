// Bloque importador de Firebase (desde el HTML, script type="module") ya se encarga de poner
// firebaseApp, db, auth, y las funciones en el objeto window.

document.addEventListener('firebaseReady', () => {
    console.log("DEBUG: Evento firebaseReady recibido. Procediendo a inicializar Auth y App...");
    initializeAuthAndApp();
});

function initializeAuthAndApp() {
    console.log("DEBUG: initializeAuthAndApp ejecutándose.");
    const authContainer = document.getElementById('auth-container');
    const appContainer = document.getElementById('app-container');
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
    const userDisplaySpan = document.getElementById('userDisplay');
    const logoutButton = document.getElementById('logoutButton');

    if (!authContainer || !appContainer || !loginForm || !signupForm || !loginEmailInput || !loginPasswordInput || !signupEmailInput || !signupPasswordInput || !loginButton || !signupButton || !showSignupLink || !showLoginLink || !loginErrorDiv || !signupErrorDiv || !userDisplaySpan || !logoutButton) {
        console.error("Error crítico: Faltan elementos HTML para la autenticación.");
        alert("Error crítico: Faltan elementos HTML para la autenticación.");
        return;
    }
    console.log("DEBUG: Todos los elementos de autenticación encontrados.");

    const auth = window.auth;
    const createUserWithEmailAndPassword = window.createUserWithEmailAndPassword;
    const signInWithEmailAndPassword = window.signInWithEmailAndPassword;
    const signOut = window.signOut;
    const onAuthStateChanged = window.onAuthStateChanged;

    if (!auth || !createUserWithEmailAndPassword || !signInWithEmailAndPassword || !signOut || !onAuthStateChanged) {
        console.error("Error crítico: Funciones de Firebase Auth no están disponibles en window.");
        alert("Error crítico: Problema al cargar Firebase Auth.");
        return;
    }
    console.log("DEBUG: Funciones de Firebase Auth disponibles.");

    showSignupLink.addEventListener('click', (e) => { e.preventDefault(); loginForm.style.display = 'none'; signupForm.style.display = 'block'; loginErrorDiv.textContent = ''; signupErrorDiv.textContent = ''; });
    showLoginLink.addEventListener('click', (e) => { e.preventDefault(); signupForm.style.display = 'none'; loginForm.style.display = 'block'; loginErrorDiv.textContent = ''; signupErrorDiv.textContent = ''; });

    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault(); const email = signupEmailInput.value; const password = signupPasswordInput.value;
        signupErrorDiv.textContent = ''; signupButton.disabled = true; signupButton.textContent = 'Registrando...';
        try { await createUserWithEmailAndPassword(auth, email, password); }
        catch (error) { signupErrorDiv.textContent = getFirebaseErrorMessage(error); }
        finally { signupButton.disabled = false; signupButton.textContent = 'Registrarse'; }
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault(); const email = loginEmailInput.value; const password = loginPasswordInput.value;
        loginErrorDiv.textContent = ''; loginButton.disabled = true; loginButton.textContent = 'Iniciando...';
        try { await signInWithEmailAndPassword(auth, email, password); }
        catch (error) { loginErrorDiv.textContent = getFirebaseErrorMessage(error); }
        finally { loginButton.disabled = false; loginButton.textContent = 'Iniciar Sesión'; }
    });

    logoutButton.addEventListener('click', async () => {
        try { await signOut(auth); }
        catch (error) { console.error('Error al cerrar sesión:', error); alert("Error al cerrar sesión."); }
    });
    
    onAuthStateChanged(auth, (user) => {
        console.log("DEBUG: onAuthStateChanged disparado. User object:", user);
        if (user) {
            console.log("DEBUG: Usuario ESTÁ autenticado. UID:", user.uid, "Email:", user.email);
            document.body.classList.remove('logged-out'); document.body.classList.add('logged-in');
            authContainer.style.display = 'none'; appContainer.style.display = 'block'; 
            userDisplaySpan.textContent = `${user.email || 'Usuario'}`;
            
            console.log("DEBUG: Clases del body:", document.body.className);
            console.log("DEBUG: authContainer display:", authContainer.style.display);
            console.log("DEBUG: appContainer display:", appContainer.style.display);
            
            if (!window.dictationAppInitialized) {
                console.log("DEBUG: Llamando a initializeDictationAppLogic para el usuario:", user.uid);
                initializeDictationAppLogic(user.uid); 
                window.dictationAppInitialized = true;
            } else {
                console.log("DEBUG: App de dictado ya inicializada.");
                if (typeof updateButtonStates === "function") updateButtonStates("initial"); 
            }
        } else {
            console.log("DEBUG: Usuario NO está autenticado o sesión cerrada.");
            document.body.classList.remove('logged-in'); document.body.classList.add('logged-out');
            authContainer.style.display = 'block'; appContainer.style.display = 'none';
            if (userDisplaySpan) userDisplaySpan.textContent = '';
            console.log("DEBUG: Clases del body:", document.body.className);
            if (window.currentMediaRecorder && window.currentMediaRecorder.state !== "inactive") {
                try { console.log("DEBUG: Deteniendo MediaRecorder en logout."); window.currentMediaRecorder.stop(); } 
                catch(e) { console.warn("DEBUG: Error al detener MediaRecorder en logout:", e); }
            }
            window.dictationAppInitialized = false; 
        }
    });

    function getFirebaseErrorMessage(error) {
        switch (error.code) {
            case 'auth/invalid-email': return 'El formato del email no es válido.';
            case 'auth/user-disabled': return 'Esta cuenta de usuario ha sido deshabilitada.';
            case 'auth/user-not-found': return 'No se encontró usuario con este email.';
            case 'auth/wrong-password': return 'La contraseña es incorrecta.';
            case 'auth/email-already-in-use': return 'Este email ya está registrado.';
            case 'auth/weak-password': return 'La contraseña es demasiado débil.';
            default: return error.message || "Error desconocido de autenticación.";
        }
    }
} 

// --- Elementos DOM de la App de Dictado (globales para acceso desde initializeDictationAppLogic y otras funciones) ---
const startRecordBtn = document.getElementById('startRecordBtn');
const pauseResumeBtn = document.getElementById('pauseResumeBtn');
const retryProcessBtn = document.getElementById('retryProcessBtn');
const copyPolishedTextBtn = document.getElementById('copyPolishedTextBtn'); 
const statusDiv = document.getElementById('status');
const polishedTextarea = document.getElementById('polishedText');
const audioPlayback = document.getElementById('audioPlayback');
const audioPlaybackSection = document.querySelector('.audio-playback-section'); 
const themeSwitch = document.getElementById('themeSwitch');
const volumeMeterBar = document.getElementById('volumeMeterBar');
const volumeMeterContainer = document.getElementById('volumeMeterContainer'); 
const recordingTimeDisplay = document.getElementById('recordingTimeDisplay'); 
const headerArea = document.getElementById('headerArea'); 
const techniqueButtonsContainer = document.getElementById('techniqueButtons'); 
const clearHeaderButton = document.getElementById('clearHeaderButton'); 
const mainTitleImage = document.getElementById('mainTitleImage'); 
const mainTitleImageDark = document.getElementById('mainTitleImageDark'); 

// --- Variables Globales de la App de Dictado ---
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
const userApiKey = 'AIzaSyASbB99MVIQ7dt3MzjhidgoHUlMXIeWvGc'; // API Key de Gemini

// --- Funciones de la App de Dictado ---
function applyTheme(theme) { 
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    if (themeSwitch) themeSwitch.checked = theme === 'dark'; // Verificar si themeSwitch existe
    if (mainTitleImage && mainTitleImageDark) { // Verificar si existen
        mainTitleImage.style.display = theme === 'light' ? 'inline-block' : 'none';
        mainTitleImageDark.style.display = theme === 'dark' ? 'inline-block' : 'none';
    }
}
function setAccentRGB() { 
    try {
        const bodyStyle = getComputedStyle(document.body); if (!bodyStyle) return;
        const accentColor = bodyStyle.getPropertyValue('--accent-color').trim();
        if (accentColor.startsWith('#')) { const r = parseInt(accentColor.slice(1, 3), 16); const g = parseInt(accentColor.slice(3, 5), 16); const b = parseInt(accentColor.slice(5, 7), 16); document.documentElement.style.setProperty('--accent-color-rgb', `${r},${g},${b}`); }
        else if (accentColor.startsWith('rgb')) { const parts = accentColor.match(/[\d.]+/g); if (parts && parts.length >=3) document.documentElement.style.setProperty('--accent-color-rgb', `${parts[0]},${parts[1]},${parts[2]}`);}
    } catch (e) { console.warn("No se pudo establecer --accent-color-rgb:", e); }
}
function setStatus(message, type = "idle", duration = 0) { 
    if (!statusDiv) { console.error("DEBUG: statusDiv no disponible para setStatus. Mensaje:", message); return; }
    statusDiv.textContent = message; statusDiv.className = ''; statusDiv.classList.add(`status-${type}`);
    if (duration > 0) { setTimeout(() => { if (statusDiv.textContent === message) updateButtonStates("initial"); }, duration); }
}
function startRecordingTimer() { stopRecordingTimer(); updateRecordingTimeDisplay(); recordingTimerInterval = setInterval(() => { if (!isPaused) { recordingSeconds++; updateRecordingTimeDisplay();}}, 1000); }
function stopRecordingTimer() { clearInterval(recordingTimerInterval); }
function updateRecordingTimeDisplay() { const m = Math.floor(recordingSeconds / 60); const s = recordingSeconds % 60; recordingTimeDisplay.textContent = isRecording || isPaused ? `Tiempo: ${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : ""; }
function resetRecordingTimerDisplay() { recordingTimeDisplay.textContent = ""; recordingSeconds = 0; }
function setupVolumeMeter(stream) { volumeMeterContainer.style.display = 'block'; if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)(); if (audioContext.state === 'suspended') audioContext.resume(); analyser = audioContext.createAnalyser(); microphoneSource = audioContext.createMediaStreamSource(stream); microphoneSource.connect(analyser); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.3; const bufferLength = analyser.frequencyBinCount; const dataArray = new Uint8Array(bufferLength); function drawVolume() { if (!isRecording || isPaused) { if(isPaused) {volumeMeterBar.classList.add('paused'); volumeMeterBar.style.background = 'var(--button-default-bg)';} else {volumeMeterBar.classList.remove('paused'); volumeMeterBar.style.background = 'var(--volume-bar-gradient)';} animationFrameId = requestAnimationFrame(drawVolume); return; } animationFrameId = requestAnimationFrame(drawVolume); analyser.getByteFrequencyData(dataArray); let sum = 0; for(let i = 0; i < bufferLength; i++) { sum += dataArray[i]; } let average = sum / bufferLength; let volumePercent = (average / 130) * 100; volumePercent = Math.min(100, Math.max(0, volumePercent)); volumeMeterBar.style.width = volumePercent + '%'; volumeMeterBar.classList.remove('paused'); volumeMeterBar.style.background = 'var(--volume-bar-gradient)';} drawVolume(); }
function stopVolumeMeter() { if (animationFrameId) cancelAnimationFrame(animationFrameId); if (microphoneSource) { microphoneSource.disconnect(); microphoneSource = null; } volumeMeterBar.style.width = '0%'; volumeMeterBar.classList.remove('paused'); volumeMeterContainer.style.display = 'none';  }
function toggleRecordingState() { if (isRecording) { if (mediaRecorder && (mediaRecorder.state === "recording" || mediaRecorder.state === "paused")) { mediaRecorder.stop(); setStatus("Deteniendo grabación...", "processing"); } else { isRecording = false; isPaused = false; updateButtonStates("initial"); } } else { startActualRecording(); } }
async function startActualRecording() { setStatus("Solicitando permiso...", "processing"); isPaused = false; polishedTextarea.value = ''; audioChunks = []; currentAudioBlob = null; recordingSeconds = 0; audioPlaybackSection.style.display = 'none'; if (audioPlayback.src) { URL.revokeObjectURL(audioPlayback.src); audioPlayback.src = ''; audioPlayback.removeAttribute('src');} if (!userApiKey) { alert('API Key de Gemini no configurada.'); setStatus("Error: API Key.", "error"); updateButtonStates("initial"); return; } try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); isRecording = true; setupVolumeMeter(stream); startRecordingTimer(); mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' }); window.currentMediaRecorder = mediaRecorder; mediaRecorder.ondataavailable = event => { if (event.data.size > 0) audioChunks.push(event.data); }; mediaRecorder.onpause = () => { setStatus('Grabación pausada.', 'idle'); isPaused = true; volumeMeterBar.classList.add('paused'); volumeMeterBar.style.background = 'var(--button-default-bg)'; updateButtonStates("paused"); }; mediaRecorder.onresume = () => { setStatus('Grabando... (Reanudado)', 'processing'); isPaused = false; volumeMeterBar.classList.remove('paused'); volumeMeterBar.style.background = 'var(--volume-bar-gradient)'; updateButtonStates("recording"); }; mediaRecorder.onstop = async () => { isRecording = false; isPaused = false; stopVolumeMeter(); stopRecordingTimer(); setStatus('Grabación detenida. Procesando...', 'processing'); if (audioChunks.length === 0) { setStatus("Error: No se grabó audio.", "error", 3000); updateButtonStates("stopped_error"); return; } currentAudioBlob = new Blob(audioChunks, { type: 'audio/webm' }); if (currentAudioBlob.size === 0) { setStatus("Error: Audio grabado vacío.", "error", 3000); updateButtonStates("stopped_error"); return; } const audioURL = URL.createObjectURL(currentAudioBlob); audioPlayback.src = audioURL; audioPlaybackSection.style.display = 'block'; updateButtonStates("stopped_success"); await processAudioBlob(currentAudioBlob); }; mediaRecorder.onerror = (event) => { isRecording = false; isPaused = false; stopVolumeMeter(); stopRecordingTimer(); resetRecordingTimerDisplay(); setStatus(`Error MediaRecorder: ${event.error.name}`, "error", 4000); updateButtonStates("error"); }; mediaRecorder.start(); setStatus('Grabando...', "processing"); updateButtonStates("recording"); } catch (err) { isRecording = false; isPaused = false; stopVolumeMeter(); stopRecordingTimer(); resetRecordingTimerDisplay(); setStatus(`Error Mic: ${err.message}.`, "error", 4000); updateButtonStates("initial"); } }
function handlePauseResume() { if (!mediaRecorder || !isRecording) return; if (mediaRecorder.state === "recording") { mediaRecorder.pause();  } else if (mediaRecorder.state === "paused") { mediaRecorder.resume();  } }
async function processAudioBlob(audioBlob) { polishedTextarea.value = ''; setStatus('Preparando audio...', 'processing'); updateButtonStates("processing_audio"); try { const base64Audio = await blobToBase64(audioBlob); if (!base64Audio || base64Audio.length < 100) throw new Error("Fallo Base64."); const polishedResult = await transcribeAndPolishAudio(base64Audio); polishedTextarea.value = polishedResult; setStatus('Proceso completado.', 'success', 3000); updateButtonStates("success_processing"); } catch (error) { setStatus(`Error Proc: ${error.message}`, "error", 4000); polishedTextarea.value = `Error: ${error.message}`; updateButtonStates("error_processing"); } }
function updateButtonStates(state) { startRecordBtn.disabled = true; pauseResumeBtn.disabled = true; retryProcessBtn.disabled = true; copyPolishedTextBtn.disabled = false; startRecordBtn.textContent = "Empezar Dictado"; startRecordBtn.classList.remove("stop-style"); pauseResumeBtn.textContent = "Pausar"; let showAudioPlayer = false; if (currentAudioBlob) { if (["initial", "stopped_success", "error_processing", "success_processing", "stopped_error"].includes(state)) { showAudioPlayer = true; } } if(audioPlaybackSection) audioPlaybackSection.style.display = showAudioPlayer ? 'block' : 'none'; else console.warn("DEBUG: audioPlaybackSection es null en updateButtonStates"); switch (state) { case "initial": startRecordBtn.disabled = false; setStatus("Listo", "idle"); resetRecordingTimerDisplay(); stopVolumeMeter(); retryProcessBtn.disabled = !currentAudioBlob; break; case "recording": startRecordBtn.disabled = false; startRecordBtn.textContent = "Detener Dictado"; startRecordBtn.classList.add("stop-style"); pauseResumeBtn.disabled = false; retryProcessBtn.disabled = true; break; case "paused": startRecordBtn.disabled = false; startRecordBtn.textContent = "Detener Dictado"; startRecordBtn.classList.add("stop-style"); pauseResumeBtn.disabled = false; pauseResumeBtn.textContent = "Reanudar"; retryProcessBtn.disabled = true; break; case "stopped_success": startRecordBtn.disabled = false; retryProcessBtn.disabled = !currentAudioBlob; break; case "stopped_error": startRecordBtn.disabled = false; resetRecordingTimerDisplay(); stopVolumeMeter(); retryProcessBtn.disabled = !currentAudioBlob; break; case "processing_audio": startRecordBtn.disabled = true; pauseResumeBtn.disabled = true; retryProcessBtn.disabled = true; break; case "error_processing": startRecordBtn.disabled = false; retryProcessBtn.disabled = !currentAudioBlob; break; case "success_processing": startRecordBtn.disabled = false; retryProcessBtn.disabled = !currentAudioBlob; break; case "error": startRecordBtn.disabled = false; resetRecordingTimerDisplay(); stopVolumeMeter(); retryProcessBtn.disabled = !currentAudioBlob; break; default: startRecordBtn.disabled = false; resetRecordingTimerDisplay(); stopVolumeMeter(); retryProcessBtn.disabled = !currentAudioBlob; break; } }
function blobToBase64(blob) { return new Promise((resolve, reject) => { if (!blob || blob.size === 0) return reject(new Error("Blob nulo o vacío")); const reader = new FileReader(); reader.onloadend = () => { if (reader.result) { const base64String = reader.result.toString().split(',')[1]; if (!base64String) return reject(new Error("Fallo al extraer Base64.")); resolve(base64String); } else reject(new Error("FileReader no produjo resultado.")); }; reader.onerror = (error) => reject(error); reader.readAsDataURL(blob); }); }
async function callGeminiAPI(promptParts, isTextOnly = false) { if (!userApiKey) throw new Error('API Key no configurada.'); const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${userApiKey}`; const temperature = isTextOnly ? 0.1 : 0.2;  const body = { contents: [{ parts: promptParts }], generationConfig: { temperature: temperature } };  console.log(`Llamando a Gemini API (isTextOnly: ${isTextOnly}, temp: ${temperature}). Prompt (inicio):`, JSON.stringify(promptParts[0]).substring(0, 200) + "..."); const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!response.ok) { const errorData = await response.json(); console.error("Error data de Gemini API:", errorData); throw new Error(`Error API Gemini: ${errorData.error?.message || response.statusText} (Código: ${response.status})`); } const data = await response.json(); if (data.candidates?.[0]?.content?.parts?.[0]?.text) return data.candidates[0].content.parts[0].text; if (data.promptFeedback?.blockReason) throw new Error(`Bloqueado por Gemini: ${data.promptFeedback.blockReason}. ${data.promptFeedback.blockReasonMessage || ''}`); if (data.candidates?.[0]?.finishReason && data.candidates[0].finishReason !== "STOP") throw new Error(`Gemini finalizó con razón: ${data.candidates[0].finishReason}.`); if (data.candidates?.[0]?.finishReason === "STOP" && !data.candidates?.[0]?.content?.parts?.[0]?.text) return ""; throw new Error('Respuesta de Gemini inesperada o sin texto, y sin razón de bloqueo clara.'); }
function capitalizeSentencesProperly(text) { if (!text || text.trim() === "") return ""; let result = text.trimStart(); if (result.length > 0) result = result.charAt(0).toUpperCase() + result.slice(1); result = result.replace(/([.!?])(\s*\n*|\s+)([a-záéíóúüñ])/g, (match, punctuation, whitespace, letter) => { return punctuation + whitespace + letter.toUpperCase(); }); return result; }
async function transcribeAndPolishAudio(base64Audio) { let transcribedText = ''; try { setStatus('Transcribiendo audio...', 'processing'); const transcriptPromptParts = [ { "text": "Transcribe el siguiente audio a texto con la MÁXIMA LITERALIDAD POSIBLE. No corrijas errores de habla, repeticiones menores, ni cambies palabras. Si el hablante dice 'coma', 'punto', etc., transcríbelo tal cual como texto. El objetivo es una transcripción fiel palabra por palabra de lo que se oye:" }, { "inline_data": { "mime_type": "audio/webm", "data": base64Audio } } ]; transcribedText = await callGeminiAPI(transcriptPromptParts, false);  console.log("--- Transcripción Original (Consola) ---"); console.log(transcribedText); console.log("---------------------------------------"); } catch (error) { console.error("Error durante la transcripción interna:", error); throw new Error(`Fallo en transcripción interna: ${error.message}`);  } if (!transcribedText || transcribedText.trim() === "") throw new Error("La transcripción interna no produjo texto o está vacía.");  try { setStatus('Aplicando formato y puntuación...', 'processing'); const polishPromptParts = [ { "text": `Por favor, revisa el siguiente texto y aplica ÚNICAMENTE las siguientes modificaciones:\n1. Interpreta y reemplaza las siguientes palabras dictadas como signos de puntuación y formato EXACTAMENTE como se indica:\n    * 'coma' -> ','\n    * 'punto' -> '.'\n    * 'punto y aparte' -> '.' seguido de UN ÚNICO SALTO DE LÍNEA (\\n). NO insertes líneas en blanco adicionales.\n    * 'nueva línea' o 'siguiente línea' -> un único salto de línea (\\n).\n    * 'dos puntos' -> ':'\n    * 'punto y coma' -> ';'\n    * 'signo de interrogación', 'interrogación' o 'pregunta' (al final de una frase) -> '?'\n    * 'signo de exclamación', 'exclamación' o 'admiración' (al final de una frase) -> '!'\n2. Corrige ÚNICAMENTE errores ortográficos evidentes.\n3. Corrige ÚNICAMENTE errores gramaticales OBJETIVOS Y CLAROS que impidan la comprensión.\n4. NO CAMBIES la elección de palabras del hablante si son gramaticalmente correctas y comprensibles.\n5. NO REESTRUCTURES frases si son gramaticalmente correctas.\n6. PRESERVA el estilo y las expresiones exactas del hablante tanto como sea posible. El objetivo NO es "mejorar" el texto, sino formatearlo según lo dictado y corregir solo errores flagrantes.\n7. Si el texto ya contiene puntuación (ej. el hablante dictó "hola punto"), no la dupliques. Simplemente asegúrate de que el formato sea correcto.\n8. Asegúrate de que la primera letra de cada oración (después de un punto, signo de interrogación, o exclamación seguido de un espacio o salto de línea, y al inicio del texto) esté en mayúscula. \n\nTexto a procesar:\n"${transcribedText}"` } ]; let polishedResult = await callGeminiAPI(polishPromptParts, true);  let capitalizedText = capitalizeSentencesProperly(polishedResult); let postProcessedText = capitalizedText.replace(/\.\s*\n\s*\n/g, '.\n');  postProcessedText = postProcessedText.replace(/\n\s*\n/g, '\n');       return postProcessedText; } catch (error) { console.error("Error durante el pulido/formato:", error); setStatus(`Formato falló: ${error.message}. Mostrando transcripción más cruda.`, "error", 4000); return capitalizeSentencesProperly(transcribedText);  } }


function initializeDictationAppLogic(userId) {
    console.log(`DEBUG: initializeDictationAppLogic para usuario: ${userId} - Asignando listeners.`);
    // Los elementos DOM ya están definidos globalmente.
    // Los listeners solo se deben añadir una vez.
    if (!startRecordBtn.dataset.listenerAttached) {
        startRecordBtn.addEventListener('click', toggleRecordingState);
        startRecordBtn.dataset.listenerAttached = 'true';
    }
    if (!pauseResumeBtn.dataset.listenerAttached) {
        pauseResumeBtn.addEventListener('click', handlePauseResume);
        pauseResumeBtn.dataset.listenerAttached = 'true';
    }
    if (!retryProcessBtn.dataset.listenerAttached) {
        retryProcessBtn.addEventListener('click', () => { 
            if (currentAudioBlob) { 
                if (isRecording || isPaused) { alert("Detén la grabación actual antes de reenviar."); return; }
                console.log("Reenviando audio..."); processAudioBlob(currentAudioBlob); 
            }
        });
        retryProcessBtn.dataset.listenerAttached = 'true';
    }
    if (!copyPolishedTextBtn.dataset.listenerAttached) {
        copyPolishedTextBtn.addEventListener('click', async () => { 
            const headerText = headerArea.value.trim(); const reportText = polishedTextarea.value.trim();
            let textToCopy = "";
            if (headerText) textToCopy += headerText;
            if (reportText) { if (textToCopy) textToCopy += "\n\n"; textToCopy += reportText; }
            if (textToCopy === '') { setStatus("Nada que copiar.", "idle", 2000); return; }
            try { await navigator.clipboard.writeText(textToCopy); setStatus("¡Texto copiado!", "success", 2000); }
            catch (err) { console.error('Error copia:', err); setStatus("Error al copiar.", "error", 3000); }
        });
        copyPolishedTextBtn.dataset.listenerAttached = 'true';
    }
    if (!techniqueButtonsContainer.dataset.listenerAttached) {
        techniqueButtonsContainer.addEventListener('click', (event) => { 
            if (event.target.tagName === 'BUTTON' && event.target.dataset.techniqueText) {
                headerArea.value = event.target.dataset.techniqueText; headerArea.focus(); 
            }
        });
        techniqueButtonsContainer.dataset.listenerAttached = 'true';
    }
    if (!clearHeaderButton.dataset.listenerAttached) {
        clearHeaderButton.addEventListener('click', () => { 
            headerArea.value = ""; headerArea.focus(); 
        });
        clearHeaderButton.dataset.listenerAttached = 'true';
    }
    if (!themeSwitch.dataset.listenerAttachedDictation) { // Usar un dataset diferente para el listener de tema dentro de la app
        themeSwitch.addEventListener('change', () => { // Este listener ya estaba global, no necesitamos duplicarlo
            // applyTheme(themeSwitch.checked ? 'dark' : 'light'); // La función global applyTheme ya lo hace
        });
        // themeSwitch.dataset.listenerAttachedDictation = 'true'; // Marcado globalmente
    }
    
    updateButtonStates("initial"); 
    console.log("DEBUG: Lógica de la app de dictado inicializada y listeners asignados.");
}

console.log("DEBUG: Script principal (fuera de DOMContentLoaded y firebaseReady) evaluado.");
// No llamar a updateButtonStates("initial") aquí, se llama dentro de initializeDictationAppLogic o onAuthStateChanged.
