document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM completamente cargado y parseado.");

    const startRecordBtn = document.getElementById('startRecordBtn');
    const pauseResumeBtn = document.getElementById('pauseResumeBtn');
    const stopRecordBtn = document.getElementById('stopRecordBtn');
    const retryProcessBtn = document.getElementById('retryProcessBtn');
    const copyPolishedTextBtn = document.getElementById('copyPolishedTextBtn'); 
    const statusDiv = document.getElementById('status');
    const polishedTextarea = document.getElementById('polishedText');
    const audioPlayback = document.getElementById('audioPlayback');
    const themeSwitch = document.getElementById('themeSwitch');
    const volumeMeterBar = document.getElementById('volumeMeterBar');
    const recordingTimeDisplay = document.getElementById('recordingTimeDisplay'); 
    const headerArea = document.getElementById('headerArea'); 
    const techniqueButtonsContainer = document.getElementById('techniqueButtons'); 
    const clearHeaderButton = document.getElementById('clearHeaderButton'); 
    const mainTitleImage = document.getElementById('mainTitleImage');
    const mainTitleImageDark = document.getElementById('mainTitleImageDark');


    if (!polishedTextarea || !statusDiv || !startRecordBtn || !pauseResumeBtn || !stopRecordBtn || !retryProcessBtn || !copyPolishedTextBtn || !audioPlayback || !themeSwitch || !volumeMeterBar || !recordingTimeDisplay || !headerArea || !techniqueButtonsContainer || !clearHeaderButton || !mainTitleImage || !mainTitleImageDark) {
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
        mainTitleImage.style.display = theme === 'light' ? 'inline-block' : 'none';
        mainTitleImageDark.style.display = theme === 'dark' ? 'inline-block' : 'none';
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
                    updateButtonStates("initial"); 
                }
            }, duration);
        }
    }

    // --- Recording Timer Logic ---
    function startRecordingTimer() {
        stopRecordingTimer(); 
        updateRecordingTimeDisplay(); 
        recordingTimerInterval = setInterval(() => {
            if (!isPaused) { 
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
        recordingSeconds = 0; 
    }

    // --- Volume Meter Logic ---
    function setupVolumeMeter(stream) {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') audioContext.resume(); 
        
        analyser = audioContext.createAnalyser();
        microphoneSource = audioContext.createMediaStreamSource(stream);
        microphoneSource.connect(analyser);
        analyser.fftSize = 512; 
        analyser.smoothingTimeConstant = 0.6;
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
            for(let i = 0; i < bufferLength; i++) { sum += dataArray[i]; }
            let average = sum / bufferLength; 
            
            let volumePercent = 0;
            const sensitivityDivisor = 2.0; 
            const minThreshold = 3; 

            if (average > minThreshold) {
                 volumePercent = (average / 255) * 100 / sensitivityDivisor;
            }
            volumePercent = Math.min(100, Math.max(0, volumePercent));

            volumeMeterBar.style.width = volumePercent + '%';
            volumeMeterBar.classList.remove('paused');

            if (volumePercent > 80) { volumeMeterBar.style.backgroundColor = 'var(--volume-bar-high)'; }
            else if (volumePercent > 45) { volumeMeterBar.style.backgroundColor = 'var(--volume-bar-medium)'; }
            else { volumeMeterBar.style.backgroundColor = 'var(--volume-bar-low)'; }
        }
        drawVolume();
    }

    function stopVolumeMeter() {
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        if (microphoneSource) { microphoneSource.disconnect(); microphoneSource = null; }
        volumeMeterBar.style.width = '0%';
        volumeMeterBar.classList.remove('paused');
        volumeMeterBar.style.backgroundColor = 'var(--volume-bar-low)'; 
    }
    
    // --- Recording and Processing Logic ---
    async function startRecording() {
        console.log("Solicitando permiso para grabar...");
        setStatus("Solicitando permiso para grabar...", "processing");
        isPaused = false;
        polishedTextarea.value = ''; 
        audioChunks = [];
        currentAudioBlob = null;
        recordingSeconds = 0; 
        
        if (audioPlayback.src) { URL.revokeObjectURL(audioPlayback.src); audioPlayback.src = ''; audioPlayback.removeAttribute('src');}
        
        if (!userApiKey) {
            alert('API Key de Gemini no configurada.');
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
                volumeMeterBar.classList.add('paused');
                volumeMeterBar.style.backgroundColor = 'var(--button-default-bg)'; 
            };
            mediaRecorder.onresume = () => {
                console.log("MediaRecorder resumed");
                setStatus('Grabando... (Reanudado)', 'processing');
                isPaused = false;
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
        if (mediaRecorder.state === "recording") { mediaRecorder.pause(); updateButtonStates("paused"); }
        else if (mediaRecorder.state === "paused") { mediaRecorder.resume(); updateButtonStates("recording"); }
    }

    function stopRecording() {
        console.log("Botón Detener Grabación presionado.");
        if (mediaRecorder && (mediaRecorder.state === "recording" || mediaRecorder.state === "paused")) {
            mediaRecorder.stop(); setStatus("Deteniendo grabación...", "processing");
        } else { updateButtonStates("initial"); }
    }
    
    async function processAudioBlob(audioBlob) {
        polishedTextarea.value = ''; 
        setStatus('Preparando audio para enviar...', 'processing');
        updateButtonStates("processing_audio");
        
        try {
            const base64Audio = await blobToBase64(audioBlob);
            if (!base64Audio || base64Audio.length < 100) throw new Error("Fallo al convertir audio a Base64 o audio demasiado corto.");
            
            const polishedResult = await transcribeAndPolishAudio(base64Audio); 
            
            polishedTextarea.value = polishedResult;
            setStatus('Proceso de transcripción y pulido completado.', 'success', 3000);
            updateButtonStates("success_processing");

        } catch (error) {
            console.error('Error procesando audio:', error);
            setStatus(`Error en procesamiento: ${error.message}`, "error", 4000);
            polishedTextarea.value = `Error en el proceso: ${error.message}`; 
            updateButtonStates("error_processing"); 
        }
    }

    function updateButtonStates(state) {
        startRecordBtn.disabled = true;
        pauseResumeBtn.disabled = true;
        pauseResumeBtn.textContent = "Pausar";
        stopRecordBtn.disabled = true;
        retryProcessBtn.disabled = true;
        copyPolishedTextBtn.disabled = false; 

        switch (state) {
            case "initial":
                startRecordBtn.disabled = false;
                setStatus("Estado: Esperando para grabar...", "idle");
                resetRecordingTimerDisplay();
                break;
            case "recording": pauseResumeBtn.disabled = false; stopRecordBtn.disabled = false; break;
            case "paused": pauseResumeBtn.disabled = false; pauseResumeBtn.textContent = "Reanudar"; stopRecordBtn.disabled = false; break;
            case "stopped_success": startRecordBtn.disabled = false; retryProcessBtn.disabled = !currentAudioBlob; break;
            case "stopped_error": startRecordBtn.disabled = false; resetRecordingTimerDisplay(); break;
            case "processing_audio": retryProcessBtn.disabled = !currentAudioBlob; break;
            case "error_processing": startRecordBtn.disabled = false; retryProcessBtn.disabled = !currentAudioBlob; break;
            case "success_processing": startRecordBtn.disabled = false; retryProcessBtn.disabled = !currentAudioBlob; break;
             case "error": startRecordBtn.disabled = false; resetRecordingTimerDisplay(); break;
            default: startRecordBtn.disabled = false; resetRecordingTimerDisplay(); break;
        }
    }

    retryProcessBtn.addEventListener('click', () => {
        if (currentAudioBlob) { console.log("Reintentando procesamiento..."); processAudioBlob(currentAudioBlob); }
        else { alert("No hay audio grabado para reintentar."); setStatus("No hay audio para reintentar.", "error", 3000); }
    });

    copyPolishedTextBtn.addEventListener('click', async () => {
        const headerText = headerArea.value.trim();
        const reportText = polishedTextarea.value.trim();
        let textToCopy = "";

        if (headerText && reportText) { textToCopy = headerText + "\n\n" + reportText; }
        else if (reportText) { textToCopy = reportText; }
        else if (headerText) { textToCopy = headerText; }

        if (textToCopy === '') { setStatus("Nada que copiar. Ambas áreas de texto están vacías.", "idle", 3000); return; }
        try { await navigator.clipboard.writeText(textToCopy); setStatus("¡Texto completo copiado!", "success", 3000); }
        catch (err) { console.error('Error al copiar texto: ', err); setStatus("Error al copiar texto. Inténtalo manualmente.", "error", 3000); }
    });

    techniqueButtonsContainer.addEventListener('click', (event) => {
        if (event.target.tagName === 'BUTTON' && event.target.dataset.techniqueText) {
            headerArea.value = event.target.dataset.techniqueText; headerArea.focus(); 
        }
    });
    clearHeaderButton.addEventListener('click', () => { headerArea.value = ""; headerArea.focus(); });

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
        const temperature = isTextOnly ? 0.1 : 0.2; 
        const body = { contents: [{ parts: promptParts }], generationConfig: { temperature: temperature } }; 
        console.log(`Llamando a Gemini API (isTextOnly: ${isTextOnly}, temp: ${temperature}). Prompt (inicio):`, JSON.stringify(promptParts[0]).substring(0, 200) + "...");
        const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!response.ok) {
            const errorData = await response.json(); console.error("Error data de Gemini API:", errorData);
            throw new Error(`Error API Gemini: ${errorData.error?.message || response.statusText} (Código: ${response.status})`);
        }
        const data = await response.json();
        if (data.candidates?.[0]?.content?.parts?.[0]?.text) return data.candidates[0].content.parts[0].text;
        if (data.promptFeedback?.blockReason) throw new Error(`Bloqueado por Gemini: ${data.promptFeedback.blockReason}. ${data.promptFeedback.blockReasonMessage || ''}`);
        if (data.candidates?.[0]?.finishReason && data.candidates[0].finishReason !== "STOP") throw new Error(`Gemini finalizó con razón: ${data.candidates[0].finishReason}.`);
        if (data.candidates?.[0]?.finishReason === "STOP" && !data.candidates?.[0]?.content?.parts?.[0]?.text) return "";
        throw new Error('Respuesta de Gemini inesperada o sin texto, y sin razón de bloqueo clara.');
    }

    async function transcribeAndPolishAudio(base64Audio) {
        let transcribedText = '';
        try {
            setStatus('Transcribiendo audio...', 'processing');
            const transcriptPromptParts = [
                { "text": "Transcribe el siguiente audio a texto con la MÁXIMA LITERALIDAD POSIBLE. No corrijas errores de habla, repeticiones menores, ni cambies palabras. Si el hablante dice 'coma', 'punto', etc., transcríbelo tal cual como texto. El objetivo es una transcripción fiel palabra por palabra de lo que se oye:" },
                { "inline_data": { "mime_type": "audio/webm", "data": base64Audio } }
            ];
            transcribedText = await callGeminiAPI(transcriptPromptParts, false); 
            console.log("--- Transcripción Original (Consola) ---"); console.log(transcribedText); console.log("---------------------------------------");
        } catch (error) {
            console.error("Error durante la transcripción interna:", error);
            throw new Error(`Fallo en transcripción interna: ${error.message}`); 
        }

        if (!transcribedText || transcribedText.trim() === "") throw new Error("La transcripción interna no produjo texto o está vacía.");
        
        try {
            setStatus('Aplicando formato y puntuación...', 'processing');
            const polishPromptParts = [
                { "text": `Por favor, revisa el siguiente texto y aplica ÚNICAMENTE las siguientes modificaciones:\n1. Interpreta y reemplaza las siguientes palabras dictadas como signos de puntuación y formato EXACTAMENTE como se indica:\n    * 'coma' -> ','\n    * 'punto' -> '.'\n    * 'punto y aparte' -> '.' seguido de UN ÚNICO SALTO DE LÍNEA (\\n). NO insertes líneas en blanco adicionales.\n    * 'nueva línea' o 'siguiente línea' -> un único salto de línea (\\n).\n    * 'dos puntos' -> ':'\n    * 'punto y coma' -> ';'\n    * 'signo de interrogación', 'interrogación' o 'pregunta' (al final de una frase) -> '?'\n    * 'signo de exclamación', 'exclamación' o 'admiración' (al final de una frase) -> '!'\n2. Corrige ÚNICAMENTE errores ortográficos evidentes.\n3. Corrige ÚNICAMENTE errores gramaticales OBJETIVOS Y CLAROS que impidan la comprensión.\n4. NO CAMBIES la elección de palabras del hablante si son gramaticalmente correctas y comprensibles.\n5. NO REESTRUCTURES frases si son gramaticalmente correctas.\n6. PRESERVA el estilo y las expresiones exactas del hablante tanto como sea posible. El objetivo NO es "mejorar" el texto, sino formatearlo según lo dictado y corregir solo errores flagrantes.\n7. Si el texto ya contiene puntuación (ej. el hablante dictó "hola punto"), no la dupliques. Simplemente asegúrate de que el formato sea correcto.\n\nTexto a procesar:\n"${transcribedText}"` }
            ];
            let polishedResult = await callGeminiAPI(polishPromptParts, true); 
            let postProcessedText = polishedResult.replace(/\.\s*\n\s*\n/g, '.\n'); 
            postProcessedText = postProcessedText.replace(/\n\s*\n/g, '\n');      
            return postProcessedText;
        } catch (error) {
            console.error("Error durante el pulido/formato:", error);
            setStatus(`Formato falló: ${error.message}. Mostrando transcripción más cruda.`, "error", 4000);
            return transcribedText; 
        }
    }

    startRecordBtn.addEventListener('click', startRecording);
    pauseResumeBtn.addEventListener('click', handlePauseResume);
    stopRecordBtn.addEventListener('click', stopRecording);
    
    updateButtonStates("initial"); 
    console.log("Script inicializado y event listeners asignados.");
});
