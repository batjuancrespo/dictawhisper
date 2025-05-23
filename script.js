document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM completamente cargado y parseado.");

    const startRecordBtn = document.getElementById('startRecordBtn');
    const pauseResumeBtn = document.getElementById('pauseResumeBtn');
    const stopRecordBtn = document.getElementById('stopRecordBtn');
    const retryProcessBtn = document.getElementById('retryProcessBtn');
    const statusDiv = document.getElementById('status');
    const originalTextarea = document.getElementById('originalText');
    const polishedTextarea = document.getElementById('polishedText');
    const audioPlayback = document.getElementById('audioPlayback');
    const themeSwitch = document.getElementById('themeSwitch');
    const volumeMeterBar = document.getElementById('volumeMeterBar');
    const recordingTimeDisplay = document.getElementById('recordingTimeDisplay'); // Nuevo
    const copyPolishedTextBtn = document.getElementById('copyPolishedTextBtn'); // Nuevo


    if (!originalTextarea || !polishedTextarea || !statusDiv || !startRecordBtn || !pauseResumeBtn || !stopRecordBtn || !retryProcessBtn || !audioPlayback || !themeSwitch || !volumeMeterBar || !recordingTimeDisplay || !copyPolishedTextBtn) {
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
    let recordingTimerInterval; // Nuevo para el temporizador
    let recordingSeconds = 0;   // Nuevo para el temporizador


    // ¡¡¡IMPORTANTE!!! API Key integrada directamente.
    const userApiKey = 'AIzaSyASbB99MVIQ7dt3MzjhidgoHUlMXIeWvGc'; // TU API KEY AQUÍ

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
                // Solo limpia si el mensaje sigue siendo el mismo (para evitar sobrescribir mensajes nuevos)
                if (statusDiv.textContent === message) {
                    setStatus("Estado: Esperando para grabar...", "idle"); 
                }
            }, duration);
        }
    }

    // --- Recording Timer Logic ---
    function startRecordingTimer() {
        stopRecordingTimer(); // Asegura que no haya timers duplicados
        recordingSeconds = 0;
        updateRecordingTimeDisplay(); // Mostrar 00:00 inmediatamente
        recordingTimerInterval = setInterval(() => {
            recordingSeconds++;
            updateRecordingTimeDisplay();
        }, 1000);
    }

    function stopRecordingTimer() {
        clearInterval(recordingTimerInterval);
    }

    function updateRecordingTimeDisplay() {
        const minutes = Math.floor(recordingSeconds / 60);
        const seconds = recordingSeconds % 60;
        const formattedTime = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        recordingTimeDisplay.textContent = `Tiempo: ${formattedTime}`;
    }

    function resetRecordingTimerDisplay() {
        recordingTimeDisplay.textContent = ""; // O "Tiempo: 00:00" si se prefiere
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
            let volumePercent = Math.min(100, (average / 128) * 100 * 1.5);
            volumeMeterBar.style.width = volumePercent + '%';
            volumeMeterBar.classList.remove('paused');
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
    }
    
    // --- Recording and Processing Logic ---
    async function startRecording() {
        console.log("Solicitando permiso para grabar...");
        setStatus("Solicitando permiso para grabar...", "processing");
        isPaused = false;
        originalTextarea.value = '';
        polishedTextarea.value = '';
        audioChunks = [];
        currentAudioBlob = null;
        
        if (audioPlayback.src) {
            URL.revokeObjectURL(audioPlayback.src);
            audioPlayback.src = '';
            audioPlayback.removeAttribute('src');
        }
        
        if (!userApiKey) {
            alert('API Key de Gemini no está configurada en el script.');
            setStatus("Error: API Key no configurada.", "error");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            setupVolumeMeter(stream); 
            startRecordingTimer(); // Iniciar temporizador

            mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

            mediaRecorder.ondataavailable = event => {
                if (event.data.size > 0) audioChunks.push(event.data);
            };

            mediaRecorder.onpause = () => {
                console.log("MediaRecorder paused");
                setStatus('Grabación pausada. Presiona "Reanudar" para continuar.', 'idle');
                isPaused = true;
                stopRecordingTimer(); // Pausar el contador
                volumeMeterBar.classList.add('paused');
            };

            mediaRecorder.onresume = () => {
                console.log("MediaRecorder resumed");
                setStatus('Grabando... (Reanudado)', 'processing');
                isPaused = false;
                startRecordingTimer(); // Reanudar el contador (continúa desde donde se quedó)
                volumeMeterBar.classList.remove('paused');
            };

            mediaRecorder.onstop = async () => {
                stopVolumeMeter(); 
                stopRecordingTimer(); // Detener temporizador final
                console.log("MediaRecorder.onstop - Grabación detenida.");
                setStatus('Grabación detenida. Procesando audio...', 'processing');
                isPaused = false;

                if (audioChunks.length === 0) {
                    setStatus("Error: No se grabó audio. Revisa permisos/micrófono.", "error");
                    alert("No se detectó audio.");
                    updateButtonStates("stopped_error");
                    resetRecordingTimerDisplay();
                    return;
                }

                currentAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                console.log(`Blob de audio creado. Tamaño: ${currentAudioBlob.size} bytes.`);

                if (currentAudioBlob.size === 0) {
                    setStatus("Error: El audio grabado está vacío.", "error");
                    alert("El audio grabado parece estar vacío.");
                    updateButtonStates("stopped_error");
                    resetRecordingTimerDisplay();
                    return;
                }

                const audioURL = URL.createObjectURL(currentAudioBlob);
                audioPlayback.src = audioURL;
                updateButtonStates("stopped_success"); // Antes de processAudioBlob
                await processAudioBlob(currentAudioBlob);
            };

            mediaRecorder.onerror = (event) => {
                stopVolumeMeter();
                stopRecordingTimer();
                resetRecordingTimerDisplay();
                isPaused = false;
                console.error("MediaRecorder error:", event.error);
                setStatus(`Error de MediaRecorder: ${event.error.name}`, "error");
                alert(`Ocurrió un error con el grabador de audio: ${event.error.message}`);
                updateButtonStates("error");
            };

            mediaRecorder.start();
            setStatus('Grabando... Habla ahora.', "processing");
            updateButtonStates("recording");

        } catch (err) {
            isPaused = false;
            stopRecordingTimer(); // Asegurarse que se detiene si hay error
            resetRecordingTimerDisplay();
            console.error('Error al acceder al micrófono:', err);
            setStatus(`Error al acceder al micrófono: ${err.message}.`, "error");
            alert(`No se pudo acceder al micrófono: ${err.message}.`);
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
            // No resetear el timer display aquí, se hace en onstop o si hay error antes
        } else {
            setStatus("Nada que detener.", "idle");
            updateButtonStates("initial");
            resetRecordingTimerDisplay();
        }
    }
    
    async function processAudioBlob(audioBlob) {
        originalTextarea.value = '';
        polishedTextarea.value = '';
        setStatus('Preparando audio para enviar...', 'processing');
        updateButtonStates("processing_audio");
        
        try {
            const base64Audio = await blobToBase64(audioBlob);
            if (!base64Audio || base64Audio.length < 100) {
                throw new Error("Fallo al convertir audio a Base64 o audio demasiado corto.");
            }
            await transcribeAndPolishAudio(base64Audio);
        } catch (error) {
            console.error('Error procesando audio:', error);
            setStatus(`Error: ${error.message}`, "error");
            polishedTextarea.value = `Error en el proceso: ${error.message}`;
            updateButtonStates("error_processing"); 
        } finally {
            if (!statusDiv.classList.contains('status-error') && !statusDiv.classList.contains('status-success')) {
                 setStatus("Listo. Puedes grabar de nuevo o reintentar el procesamiento.", "idle");
            }
             // Habilitar botón de copiar si hay texto pulido
            copyPolishedTextBtn.disabled = polishedTextarea.value.trim() === '';
        }
    }

    function updateButtonStates(state) {
        startRecordBtn.disabled = true;
        pauseResumeBtn.disabled = true;
        pauseResumeBtn.textContent = "Pausar";
        stopRecordBtn.disabled = true;
        retryProcessBtn.disabled = true;
        copyPolishedTextBtn.disabled = polishedTextarea.value.trim() === ''; // Default a deshabilitado

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
                break;
            case "stopped_success": 
                startRecordBtn.disabled = false;
                retryProcessBtn.disabled = !currentAudioBlob;
                // El timer display se queda con el tiempo final
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
             case "error": 
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
            setStatus("No hay audio para reintentar.", "error");
        }
    });

    copyPolishedTextBtn.addEventListener('click', async () => {
        if (polishedTextarea.value.trim() === '') {
            setStatus("Nada que copiar.", "idle", 2000);
            return;
        }
        try {
            await navigator.clipboard.writeText(polishedTextarea.value);
            setStatus("¡Texto pulido copiado al portapapeles!", "success", 3000);
        } catch (err) {
            console.error('Error al copiar texto: ', err);
            setStatus("Error al copiar texto. Inténtalo manualmente.", "error", 3000);
            // Fallback por si navigator.clipboard no está disponible o falla (raro en HTTPS)
            try {
                polishedTextarea.select();
                document.execCommand('copy');
                setStatus("¡Texto pulido copiado! (Fallback)", "success", 3000);
            } catch (fallbackErr) {
                console.error('Error en fallback de copia: ', fallbackErr);
                alert("No se pudo copiar el texto. Por favor, cópialo manualmente.");
            }
        }
    });


    function blobToBase64(blob) {
        // ... (sin cambios)
        return new Promise((resolve, reject) => {
            if (!blob || blob.size === 0) {
                return reject(new Error("Blob nulo o vacío proporcionado a blobToBase64"));
            }
            const reader = new FileReader();
            reader.onloadend = () => {
                if (reader.result) {
                    const base64String = reader.result.toString().split(',')[1];
                    if (!base64String) {
                         return reject(new Error("Fallo al extraer cadena Base64."));
                    }
                    resolve(base64String);
                } else {
                    reject(new Error("FileReader no produjo un resultado."));
                }
            };
            reader.onerror = (error) => reject(error);
            reader.readAsDataURL(blob);
        });
    }

    async function callGeminiAPI(promptParts, isTextOnly = false) {
        // ... (sin cambios)
        if (!userApiKey) throw new Error('API Key no configurada.');

        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${userApiKey}`;
        const body = {
            contents: [{ parts: promptParts }],
            generationConfig: { temperature: isTextOnly ? 0.2 : 0.7 }
        };

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Error API Gemini: ${errorData.error?.message || response.statusText} (Código: ${response.status})`);
        }

        const data = await response.json();
        if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
            return data.candidates[0].content.parts[0].text;
        } else {
            if(data.promptFeedback?.blockReason) {
                throw new Error(`Bloqueado por Gemini: ${data.promptFeedback.blockReason}. ${data.promptFeedback.blockReasonMessage || ''}`);
            }
            if(data.candidates?.[0]?.finishReason) {
                throw new Error(`Gemini finalizó con razón: ${data.candidates[0].finishReason}.`);
            }
            throw new Error('Respuesta de Gemini inesperada o sin texto.');
        }
    }

    async function transcribeAndPolishAudio(base64Audio) {
        // ... (sin cambios significativos, solo asegurarse que updateButtonStates se llama correctamente)
        let transcribedText = '';
        try {
            setStatus('Transcribiendo audio con Gemini... (puede tardar)', 'processing');
            updateButtonStates("processing_audio");
            const transcriptPromptParts = [ /* ... */ ]; // Mismo prompt
             transcriptPromptParts[0] = { "text": "Transcribe el siguiente audio a texto. Es importante que transcribas literalmente las palabras dictadas, incluyendo si el usuario dice 'coma', 'punto', 'punto y aparte', 'nueva línea', 'dos puntos', 'punto y coma', 'signo de interrogación', 'signo de exclamación', etc.:" };
             transcriptPromptParts[1] = { "inline_data": { "mime_type": "audio/webm", "data": base64Audio } };
            transcribedText = await callGeminiAPI(transcriptPromptParts, false);
            originalTextarea.value = "Transcripción original:\n" + transcribedText;
        } catch (error) {
            originalTextarea.value = `Error en transcripción: ${error.message}`;
            polishedTextarea.value = `Error en transcripción: ${error.message}`;
            updateButtonStates("error_processing");
            throw error; 
        }

        if (!transcribedText.trim()) {
            polishedTextarea.value = "No se transcribió texto para pulir.";
            setStatus("Proceso completado (sin texto para pulir).", "success");
            updateButtonStates("success_processing");
            return;
        }
        
        try {
            setStatus('Puliendo texto con Gemini...', 'processing');
            updateButtonStates("processing_audio");
            const polishPromptParts = [ /* ... */ ]; // Mismo prompt
            polishPromptParts[0] = { "text": `Por favor, revisa y pule el siguiente texto.
Instrucciones importantes:
1.  Interpreta las siguientes palabras dictadas como signos de puntuación y formato:
    *   'coma' como ','
    *   'punto' como '.'
    *   'punto y aparte' como un punto (.) seguido de UN ÚNICO SALTO DE LÍNEA (NO dejes una línea en blanco).
    *   'nueva línea' como un único salto de línea.
    *   'dos puntos' como ':'
    *   'punto y coma' como ';'
    *   'signo de interrogación' o 'pregunta' al final de una frase como '?'
    *   'signo de exclamación' o 'admiración' al final de una frase como '!'
2.  Aplica estos signos.
3.  Adicionalmente, corrige gramática, ortografía y puntuación.
4.  Mejora claridad y fluidez, manteniendo el significado original.
5.  Si el texto ya parece correcto, haz correcciones mínimas.

Texto a pulir:
"${transcribedText}"`};

            let polishedResult = await callGeminiAPI(polishPromptParts, true);
            
            setStatus('Texto pulido recibido. Ajustes finales...', 'processing');
            let postProcessedText = polishedResult.replace(/\.\s*\n\s*\n/g, '.\n');
            postProcessedText = postProcessedText.replace(/\n\s*\n/g, '\n');

            polishedTextarea.value = postProcessedText;
            setStatus('Proceso de transcripción y pulido completado.', 'success');
            updateButtonStates("success_processing");
        } catch (error) {
            polishedTextarea.value = `Error al pulir: ${error.message}\n\n(Transcripción original arriba)`;
            updateButtonStates("error_processing");
            throw error;
        }
    }

    startRecordBtn.addEventListener('click', startRecording);
    pauseResumeBtn.addEventListener('click', handlePauseResume);
    stopRecordBtn.addEventListener('click', stopRecording);
    
    updateButtonStates("initial"); 
    console.log("Script inicializado y event listeners asignados.");
});
