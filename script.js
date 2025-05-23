document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM completamente cargado y parseado.");

    const startRecordBtn = document.getElementById('startRecordBtn');
    const pauseResumeBtn = document.getElementById('pauseResumeBtn');
    const stopRecordBtn = document.getElementById('stopRecordBtn');
    const retryProcessBtn = document.getElementById('retryProcessBtn');
    const copyPolishedTextBtn = document.getElementById('copyPolishedTextBtn'); 
    const statusDiv = document.getElementById('status');
    // const originalTextarea = document.getElementById('originalText'); // Eliminado
    const polishedTextarea = document.getElementById('polishedText');
    const audioPlayback = document.getElementById('audioPlayback');
    const themeSwitch = document.getElementById('themeSwitch');
    const volumeMeterBar = document.getElementById('volumeMeterBar');
    const recordingTimeDisplay = document.getElementById('recordingTimeDisplay'); 


    if (/*!originalTextarea ||*/ !polishedTextarea || !statusDiv || !startRecordBtn || !pauseResumeBtn || !stopRecordBtn || !retryProcessBtn || !copyPolishedTextBtn || !audioPlayback || !themeSwitch || !volumeMeterBar || !recordingTimeDisplay) {
        const errorMessage = "Error crítico: Uno o más elementos HTML no se encontraron. Revisa los IDs.";
        alert(errorMessage);
        if (statusDiv) setStatus("Error: Elementos HTML no encontrados.", "error");
        else console.error(errorMessage);
        return;
    }

    let mediaRecorder;
    let audioChunks = [];
    let currentAudioBlob = null;
    let audioContext;
    let analyser;
    let microphoneSource;
    let animationFrameId;
    let isPaused = false;
    let recordingTimerInterval; 
    let recordingSeconds = 0;  

    const userApiKey = 'AIzaSyASbB99MVIQ7dt3MzjhidgoHUlMXIeWvGc'; 

    // --- Theme Switcher Logic ---
    function applyTheme(theme) {
        document.body.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        themeSwitch.checked = theme === 'dark';
    }
    themeSwitch.addEventListener('change', () => {
        applyTheme(themeSwitch.checked ? 'dark' : 'light');
    });
    const preferredTheme = localStorage.getItem('theme') || 
                           (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(preferredTheme);
    function setAccentRGB() {
        const accentColor = getComputedStyle(document.body).getPropertyValue('--accent-color').trim();
        if (accentColor.startsWith('#')) {
            const r = parseInt(accentColor.slice(1, 3), 16);
            const g = parseInt(accentColor.slice(3, 5), 16);
            const b = parseInt(accentColor.slice(5, 7), 16);
            document.documentElement.style.setProperty('--accent-color-rgb', `${r},${g},${b}`);
        } else if (accentColor.startsWith('rgb')) {
            const parts = accentColor.match(/[\d.]+/g);
            if (parts && parts.length >=3) {
                 document.documentElement.style.setProperty('--accent-color-rgb', `${parts[0]},${parts[1]},${parts[2]}`);
            }
        }
    }
    setAccentRGB(); 
    new MutationObserver(setAccentRGB).observe(document.body, { attributes: true, attributeFilter: ['data-theme']});

    // --- Status Update Function ---
    function setStatus(message, type = "idle", duration = 0) {
        statusDiv.textContent = message;
        statusDiv.className = ''; 
        switch (type) {
            case "processing": statusDiv.classList.add('status-processing'); break;
            case "success": statusDiv.classList.add('status-success'); break;
            case "error": statusDiv.classList.add('status-error'); break;
            case "idle": default: statusDiv.classList.add('status-idle'); break;
        }
        console.log(`Status updated: ${message} (type: ${type})`);
        if (duration > 0) {
            setTimeout(() => {
                if (statusDiv.textContent === message) {
                    updateButtonStates("initial"); // Volver a estado inicial de botones y mensaje
                }
            }, duration);
        }
    }

    // --- Recording Timer Logic ---
    function startRecordingTimer() {
        stopRecordingTimer(); 
        // recordingSeconds se mantiene si se reanuda, se resetea si es nueva grabación (manejado en startRecording)
        updateRecordingTimeDisplay(); 
        recordingTimerInterval = setInterval(() => {
            if (!isPaused) { // Solo incrementar si no está pausado
                 recordingSeconds++;
                 updateRecordingTimeDisplay();
            }
        }, 1000);
    }
    function stopRecordingTimer() { clearInterval(recordingTimerInterval); }
    function updateRecordingTimeDisplay() {
        const minutes = Math.floor(recordingSeconds / 60);
        const seconds = recordingSeconds % 60;
        const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        recordingTimeDisplay.textContent = `Tiempo: ${formattedTime}`;
    }
    function resetRecordingTimerDisplay() {
        recordingTimeDisplay.textContent = ""; 
        recordingSeconds = 0; // También resetear el contador
    }

    // --- Volume Meter Logic ---
    function setupVolumeMeter(stream) {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') audioContext.resume(); 
        
        analyser = audioContext.createAnalyser();
        microphoneSource = audioContext.createMediaStreamSource(stream);
        microphoneSource.connect(analyser);
        analyser.fftSize = 256; 
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        function drawVolume() {
            if (isPaused) { 
                animationFrameId = requestAnimationFrame(drawVolume); 
                return;
            }
            animationFrameId = requestAnimationFrame(drawVolume);
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for(let i = 0; i < bufferLength; i++) sum += dataArray[i];
            let average = sum / bufferLength;
            
            // Ajuste de sensibilidad: el promedio de dataArray (0-255)
            // Hacemos que la barra reaccione más en el rango audible sin saturar rápido
            let volumePercent = 0;
            if (average > 0) { // Evitar log(0)
                 // Escala logarítmica para mejor percepción visual, ajusta el divisor para sensibilidad
                 // Un valor más alto en el divisor hace que necesite más volumen para llenar la barra.
                 volumePercent = (Math.log10(average + 1) / Math.log10(128 + 1)) * 100; // 128 como "medio-alto"
                 volumePercent = Math.min(100, Math.max(0, volumePercent * 1.2)); // Pequeño boost y clamp
            }

            volumeMeterBar.style.width = volumePercent + '%';
            volumeMeterBar.classList.remove('paused');

            // Cambiar color de la barra según el nivel
            if (volumePercent > 85) { // Rojo para muy alto
                volumeMeterBar.style.backgroundColor = 'var(--volume-bar-high)';
            } else if (volumePercent > 50) { // Amarillo para medio-alto
                volumeMeterBar.style.backgroundColor = 'var(--volume-bar-medium)';
            } else { // Verde para bajo/medio
                volumeMeterBar.style.backgroundColor = 'var(--volume-bar-low)';
            }
        }
        drawVolume();
    }

    function stopVolumeMeter() {
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        if (microphoneSource) {
            microphoneSource.disconnect();
            microphoneSource = null; 
        }
        volumeMeterBar.style.width = '0%';
        volumeMeterBar.classList.remove('paused');
        volumeMeterBar.style.backgroundColor = 'var(--volume-bar-low)'; // Reset color
    }
    
    // --- Recording and Processing Logic ---
    async function startRecording() {
        console.log("Solicitando permiso para grabar...");
        setStatus("Solicitando permiso para grabar...", "processing");
        isPaused = false;
        // originalTextarea.value = ''; // Eliminado
        polishedTextarea.value = '';
        audioChunks = [];
        currentAudioBlob = null;
        recordingSeconds = 0; // Resetear segundos para nueva grabación
        
        if (audioPlayback.src) {
            URL.revokeObjectURL(audioPlayback.src);
            audioPlayback.src = '';
            audioPlayback.removeAttribute('src');
        }
        
        if (!userApiKey) {
            alert('API Key de Gemini no está configurada en el script.');
            setStatus("Error: API Key no configurada.", "error");
            updateButtonStates("initial");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            setupVolumeMeter(stream); 
            startRecordingTimer(); 

            mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mediaRecorder.ondataavailable = event => { if (event.data.size > 0) audioChunks.push(event.data); };
            mediaRecorder.onpause = () => {
                console.log("MediaRecorder paused");
                setStatus('Grabación pausada. Presiona "Reanudar" para continuar.', 'idle');
                isPaused = true;
                // stopRecordingTimer(); // El timer ya chequea isPaused
                volumeMeterBar.classList.add('paused');
                volumeMeterBar.style.backgroundColor = 'var(--button-default-bg)'; // Color gris al pausar
            };
            mediaRecorder.onresume = () => {
                console.log("MediaRecorder resumed");
                setStatus('Grabando... (Reanudado)', 'processing');
                isPaused = false;
                // startRecordingTimer(); // El timer ya está corriendo, solo necesita isPaused=false
                volumeMeterBar.classList.remove('paused'); 
            };
            mediaRecorder.onstop = async () => {
                stopVolumeMeter(); 
                stopRecordingTimer(); 
                console.log("MediaRecorder.onstop - Grabación detenida.");
                setStatus('Grabación detenida. Procesando audio...', 'processing');
                isPaused = false;

                if (audioChunks.length === 0) {
                    setStatus("Error: No se grabó audio.", "error", 3000);
                    updateButtonStates("stopped_error");
                    return;
                }
                currentAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                if (currentAudioBlob.size === 0) {
                    setStatus("Error: El audio grabado está vacío.", "error", 3000);
                    updateButtonStates("stopped_error");
                    return;
                }
                const audioURL = URL.createObjectURL(currentAudioBlob);
                audioPlayback.src = audioURL;
                updateButtonStates("stopped_success"); 
                await processAudioBlob(currentAudioBlob);
            };
            mediaRecorder.onerror = (event) => {
                stopVolumeMeter(); stopRecordingTimer(); resetRecordingTimerDisplay(); isPaused = false;
                console.error("MediaRecorder error:", event.error);
                setStatus(`Error de MediaRecorder: ${event.error.name}`, "error", 4000);
                updateButtonStates("error");
            };

            mediaRecorder.start();
            setStatus('Grabando... Habla ahora.', "processing");
            updateButtonStates("recording");
        } catch (err) {
            isPaused = false; stopRecordingTimer(); resetRecordingTimerDisplay();
            console.error('Error al acceder al micrófono:', err);
            setStatus(`Error al acceder al micrófono: ${err.message}.`, "error", 4000);
            updateButtonStates("initial");
        }
    }

    function handlePauseResume() {
        if (!mediaRecorder) return;
        if (mediaRecorder.state === "recording") {
            mediaRecorder.pause(); 
            updateButtonStates("paused");
        } else if (mediaRecorder.state === "paused") {
            mediaRecorder.resume(); 
            updateButtonStates("recording"); 
        }
    }

    function stopRecording() {
        console.log("Botón Detener Grabación presionado.");
        if (mediaRecorder && (mediaRecorder.state === "recording" || mediaRecorder.state === "paused")) {
            mediaRecorder.stop(); 
            setStatus("Deteniendo grabación...", "processing");
        } else {
            updateButtonStates("initial"); // Resetea si no hay nada que detener
        }
    }
    
    async function processAudioBlob(audioBlob) {
        // originalTextarea.value = ''; // Eliminado
        polishedTextarea.value = '';
        setStatus('Preparando audio para enviar...', 'processing');
        updateButtonStates("processing_audio");
        
        try {
            const base64Audio = await blobToBase64(audioBlob);
            if (!base64Audio || base64Audio.length < 100) {
                throw new Error("Fallo al convertir audio a Base64 o audio demasiado corto.");
            }
            const polishedResult = await transcribeAndPolishAudio(base64Audio); // Ahora devuelve directamente el pulido
            
            polishedTextarea.value = polishedResult;
            setStatus('Proceso de transcripción y pulido completado.', 'success', 3000);
            updateButtonStates("success_processing");

        } catch (error) {
            console.error('Error procesando audio:', error);
            setStatus(`Error en procesamiento: ${error.message}`, "error", 4000);
            polishedTextarea.value = `Error en el proceso: ${error.message}`; // Aún mostrar error aquí
            updateButtonStates("error_processing"); 
        }
    }

    function updateButtonStates(state) {
        startRecordBtn.disabled = true;
        pauseResumeBtn.disabled = true;
        pauseResumeBtn.textContent = "Pausar";
        stopRecordBtn.disabled = true;
        retryProcessBtn.disabled = true;
        copyPolishedTextBtn.disabled = true; 

        switch (state) {
            case "initial":
                startRecordBtn.disabled = false;
                setStatus("Estado: Esperando para grabar...", "idle");
                resetRecordingTimerDisplay();
                break;
            case "recording":
                pauseResumeBtn.disabled = false;
                stopRecordBtn.disabled = false;
                break;
            case "paused":
                pauseResumeBtn.disabled = false;
                pauseResumeBtn.textContent = "Reanudar";
                stopRecordBtn.disabled = false; 
                // El timer y el display se manejan por separado
                break;
            case "stopped_success": 
                startRecordBtn.disabled = false;
                retryProcessBtn.disabled = !currentAudioBlob;
                break;
            case "stopped_error": 
                 startRecordBtn.disabled = false;
                 resetRecordingTimerDisplay();
                break;
            case "processing_audio": 
                retryProcessBtn.disabled = !currentAudioBlob; 
                break;
            case "error_processing": 
                startRecordBtn.disabled = false; 
                retryProcessBtn.disabled = !currentAudioBlob; 
                copyPolishedTextBtn.disabled = polishedTextarea.value.trim() === '';
                break;
            case "success_processing": 
                startRecordBtn.disabled = false;
                retryProcessBtn.disabled = !currentAudioBlob; 
                copyPolishedTextBtn.disabled = polishedTextarea.value.trim() === '';
                break;
             case "error": // MediaRecorder error or similar before blob
                startRecordBtn.disabled = false; 
                resetRecordingTimerDisplay();
                break;
            default: 
                startRecordBtn.disabled = false;
                resetRecordingTimerDisplay();
                break;
        }
    }

    retryProcessBtn.addEventListener('click', () => {
        if (currentAudioBlob) {
            console.log("Reintentando procesamiento con audio existente.");
            processAudioBlob(currentAudioBlob); 
        } else {
            alert("No hay audio grabado para reintentar.");
            setStatus("No hay audio para reintentar.", "error", 3000);
        }
    });

    copyPolishedTextBtn.addEventListener('click', async () => {
        if (polishedTextarea.value.trim() === '') {
            setStatus("Nada que copiar.", "idle", 2000);
            return;
        }
        try {
            await navigator.clipboard.writeText(polishedTextarea.value);
            setStatus("¡Texto pulido copiado!", "success", 3000);
        } catch (err) {
            console.error('Error al copiar texto: ', err);
            setStatus("Error al copiar texto. Inténtalo manualmente.", "error", 3000);
        }
    });

    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            if (!blob || blob.size === 0) return reject(new Error("Blob nulo o vacío"));
            const reader = new FileReader();
            reader.onloadend = () => {
                if (reader.result) {
                    const base64String = reader.result.toString().split(',')[1];
                    if (!base64String) return reject(new Error("Fallo al extraer Base64."));
                    resolve(base64String);
                } else reject(new Error("FileReader no produjo resultado."));
            };
            reader.onerror = (error) => reject(error);
            reader.readAsDataURL(blob);
        });
    }

    async function callGeminiAPI(promptParts, isTextOnly = false) {
        if (!userApiKey) throw new Error('API Key no configurada.');
        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${userApiKey}`;
        const body = { contents: [{ parts: promptParts }], generationConfig: { temperature: isTextOnly ? 0.2 : 0.4 } }; // Bajé un poco temp para pulido de audio
        const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Error API Gemini: ${errorData.error?.message || response.statusText} (Código: ${response.status})`);
        }
        const data = await response.json();
        if (data.candidates?.[0]?.content?.parts?.[0]?.text) return data.candidates[0].content.parts[0].text;
        if(data.promptFeedback?.blockReason) throw new Error(`Bloqueado por Gemini: ${data.promptFeedback.blockReason}. ${data.promptFeedback.blockReasonMessage || ''}`);
        if(data.candidates?.[0]?.finishReason) throw new Error(`Gemini finalizó con razón: ${data.candidates[0].finishReason}.`);
        throw new Error('Respuesta de Gemini inesperada o sin texto.');
    }

    async function transcribeAndPolishAudio(base64Audio) {
        // Ya no hay transcripción original separada. Gemini hará transcripción + pulido en un paso si es posible,
        // o mantendremos 2 pasos internos si es mejor, pero el usuario solo ve el resultado final.
        // Para este modelo, es mejor 2 pasos para control.
        
        let transcribedText = '';
        try {
            setStatus('Transcribiendo audio...', 'processing');
            const transcriptPromptParts = [
                { "text": "Transcribe el siguiente audio a texto de forma literal, incluyendo pausas como '...' si son evidentes, y palabras como 'coma', 'punto', etc.:" },
                { "inline_data": { "mime_type": "audio/webm", "data": base64Audio } }
            ];
            transcribedText = await callGeminiAPI(transcriptPromptParts, false);
            // No se muestra transcribedText al usuario
        } catch (error) {
            console.error("Error durante la transcripción interna:", error);
            throw new Error(`Fallo en transcripción interna: ${error.message}`); 
        }

        if (!transcribedText.trim()) {
            throw new Error("La transcripción interna no produjo texto.");
        }
        
        try {
            setStatus('Puliendo texto transcrito...', 'processing');
            const polishPromptParts = [
                {
                    "text": `Por favor, revisa y pule el siguiente texto.
Instrucciones importantes:
1.  Interpreta las siguientes palabras dictadas como signos de puntuación y formato:
    *   'coma' como ','
    *   'punto' como '.'
    *   'punto y aparte' como un punto (.) seguido de UN ÚNICO SALTO DE LÍNEA (NO dejes una línea en blanco).
    *   'nueva línea' o 'siguiente línea' como un único salto de línea.
    *   'dos puntos' como ':'
    *   'punto y coma' como ';'
    *   'signo de interrogación', 'interrogación' o 'pregunta' al final de una frase como '?'
    *   'signo de exclamación', 'exclamación' o 'admiración' al final de una frase como '!'
2.  Aplica estos signos.
3.  Adicionalmente, corrige gramática, ortografía y puntuación. Elimina titubeos o repeticiones innecesarias (ej. "ehh", "umm") a menos que parezcan intencionales para dar énfasis.
4.  Mejora claridad y fluidez, manteniendo el significado original y el tono del hablante.
5.  Si el texto ya parece correcto, haz correcciones mínimas.

Texto a pulir:
"${transcribedText}"`
                }
            ];
            let polishedResult = await callGeminiAPI(polishPromptParts, true);
            
            // Post-procesado
            let postProcessedText = polishedResult.replace(/\.\s*\n\s*\n/g, '.\n'); // Punto y aparte doble a sencillo
            postProcessedText = postProcessedText.replace(/\n\s*\n/g, '\n');       // Doble salto de linea general a sencillo
            return postProcessedText;

        } catch (error) {
            console.error("Error durante el pulido:", error);
            // Devolver el texto transcrito si el pulido falla, para no perder todo.
            // Opcional: podrías añadir un mensaje indicando que el pulido falló.
            setStatus(`Pulido falló: ${error.message}. Mostrando transcripción cruda.`, "error", 4000);
            return transcribedText; // Devolver el texto transcrito crudo como fallback
            // throw new Error(`Fallo en pulido: ${error.message}`); // O lanzar error y que el usuario reintente
        }
    }

    startRecordBtn.addEventListener('click', startRecording);
    pauseResumeBtn.addEventListener('click', handlePauseResume);
    stopRecordBtn.addEventListener('click', stopRecording);
    
    updateButtonStates("initial"); 
    console.log("Script inicializado y event listeners asignados.");
});
