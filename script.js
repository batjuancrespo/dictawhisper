document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM completamente cargado y parseado.");

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

    const requiredElements = [ /* ... (sin cambios) ... */ ];
    if (requiredElements.some(el => !el)) { /* ... (sin cambios en el manejo de error) ... */ }

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

    // --- Theme Switcher Logic ---
    function applyTheme(theme) { /* ... (sin cambios) ... */ }
    themeSwitch.addEventListener('change', () => { applyTheme(themeSwitch.checked ? 'dark' : 'light'); });
    const preferredTheme = localStorage.getItem('theme') || 'dark'; applyTheme(preferredTheme); 
    function setAccentRGB() { /* ... (sin cambios) ... */ }
    setAccentRGB(); new MutationObserver(setAccentRGB).observe(document.body, { attributes: true, attributeFilter: ['data-theme']});

    // --- Status Update Function ---
    function setStatus(message, type = "idle", duration = 0) { /* ... (sin cambios) ... */ }

    // --- Recording Timer Logic ---
    function startRecordingTimer() { /* ... (sin cambios) ... */ }
    function stopRecordingTimer() { /* ... (sin cambios) ... */ }
    function updateRecordingTimeDisplay() { /* ... (sin cambios) ... */ }
    function resetRecordingTimerDisplay() { /* ... (sin cambios) ... */ }

    // --- Volume Meter Logic ---
    function setupVolumeMeter(stream) { /* ... (sin cambios, ya ajustado) ... */ }
    function stopVolumeMeter() { /* ... (sin cambios) ... */ }
    
    // --- Recording and Processing Logic ---
    function toggleRecordingState() { /* ... (sin cambios) ... */ }
    async function startActualRecording() { /* ... (sin cambios) ... */ }
    function handlePauseResume() { /* ... (sin cambios) ... */ }
    
    async function processAudioBlob(audioBlob) { /* ... (sin cambios) ... */ }

    function updateButtonStates(state) {
        startRecordBtn.disabled = false; 
        pauseResumeBtn.disabled = true;
        pauseResumeBtn.textContent = "Pausar";
        retryProcessBtn.disabled = !currentAudioBlob; // Habilitar si hay blob, excepto si está procesando
        copyPolishedTextBtn.disabled = false; 

        startRecordBtn.textContent = "Empezar Dictado";
        startRecordBtn.classList.remove("stop-style");

        switch (state) {
            case "initial":
                setStatus("Listo", "idle");
                resetRecordingTimerDisplay();
                stopVolumeMeter(); 
                audioPlaybackSection.style.display = currentAudioBlob ? 'block' : 'none'; 
                break;
            case "recording":
                startRecordBtn.textContent = "Detener Dictado";
                startRecordBtn.classList.add("stop-style");
                pauseResumeBtn.disabled = false;
                retryProcessBtn.disabled = true; // Deshabilitar reintento mientras graba
                setStatus('Grabando...', 'processing');
                audioPlaybackSection.style.display = 'none';
                break;
            case "paused":
                startRecordBtn.textContent = "Detener Dictado"; 
                startRecordBtn.classList.add("stop-style");
                pauseResumeBtn.disabled = false;
                pauseResumeBtn.textContent = "Reanudar";
                retryProcessBtn.disabled = true; // Deshabilitar reintento mientras está pausado
                setStatus('Grabación pausada.', 'idle');
                break;
            case "stopped_success": 
                startRecordBtn.disabled = false; 
                // retryProcessBtn ya se maneja por !currentAudioBlob arriba
                audioPlaybackSection.style.display = 'block';
                break;
            case "stopped_error": 
                 startRecordBtn.disabled = false;
                 resetRecordingTimerDisplay();
                 stopVolumeMeter();
                 audioPlaybackSection.style.display = 'none';
                break;
            case "processing_audio": 
                startRecordBtn.disabled = true; 
                pauseResumeBtn.disabled = true;
                retryProcessBtn.disabled = true; // Deshabilitar reintento mientras procesa
                break;
            case "error_processing": 
                startRecordBtn.disabled = false; 
                // retryProcessBtn ya se maneja por !currentAudioBlob arriba
                audioPlaybackSection.style.display = currentAudioBlob ? 'block' : 'none';
                break;
            case "success_processing": 
                startRecordBtn.disabled = false;
                // retryProcessBtn ya se maneja por !currentAudioBlob arriba
                audioPlaybackSection.style.display = currentAudioBlob ? 'block' : 'none';
                break;
             case "error": 
                startRecordBtn.disabled = false; 
                resetRecordingTimerDisplay();
                stopVolumeMeter();
                audioPlaybackSection.style.display = 'none';
                break;
            default: 
                startRecordBtn.disabled = false;
                resetRecordingTimerDisplay();
                stopVolumeMeter();
                audioPlaybackSection.style.display = currentAudioBlob ? 'block' : 'none';
                break;
        }
    }

    retryProcessBtn.addEventListener('click', () => { 
        if (currentAudioBlob) { 
            if (isRecording || isPaused) {
                alert("Por favor, detén la grabación actual antes de reenviar un audio previo.");
                return;
            }
            console.log("Reenviando audio..."); 
            processAudioBlob(currentAudioBlob); 
        }
        // No mostramos alerta si no hay audio, ya que el botón debería estar deshabilitado.
    });

    copyPolishedTextBtn.addEventListener('click', async () => {
        const headerText = headerArea.value.trim(); 
        const reportText = polishedTextarea.value.trim();
        let textToCopy = "";

        if (headerText) {
            textToCopy += headerText;
        }
        if (reportText) {
            if (textToCopy) { // Si ya hay headerText, añadir saltos de línea
                textToCopy += "\n\n";
            }
            textToCopy += reportText;
        }

        if (textToCopy === '') { 
            setStatus("Nada que copiar.", "idle", 2000); 
            return; 
        }
        try { 
            await navigator.clipboard.writeText(textToCopy); 
            setStatus("¡Texto copiado!", "success", 2000); 
        }
        catch (err) { 
            console.error('Error copia:', err); 
            setStatus("Error al copiar.", "error", 3000); 
        }
    });

    techniqueButtonsContainer.addEventListener('click', (event) => { /* ... (sin cambios) ... */ });
    clearHeaderButton.addEventListener('click', () => { /* ... (sin cambios) ... */ });

    function blobToBase64(blob) { /* ... (sin cambios) ... */ }
    async function callGeminiAPI(promptParts, isTextOnly = false) { /* ... (sin cambios) ... */ }
    async function transcribeAndPolishAudio(base64Audio) { /* ... (sin cambios) ... */ }

    startRecordBtn.addEventListener('click', toggleRecordingState);
    pauseResumeBtn.addEventListener('click', handlePauseResume);
    
    updateButtonStates("initial"); 
    console.log("Script inicializado y event listeners asignados.");
});
