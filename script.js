document.addEventListener('DOMContentLoaded', () => {
    console.log("DEBUG: DOMContentLoaded event fired.");

    // --- Selección de Elementos DOM con Logs ---
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

    // --- Verificación de Elementos Requeridos con Log Detallado ---
    const elementsMap = {
        startRecordBtn, pauseResumeBtn, retryProcessBtn, copyPolishedTextBtn,
        statusDiv, polishedTextarea, audioPlayback, audioPlaybackSection, themeSwitch,
        volumeMeterBar, volumeMeterContainer, recordingTimeDisplay, headerArea,
        techniqueButtonsContainer, clearHeaderButton, mainTitleImage, mainTitleImageDark
    };

    let allElementsFound = true;
    for (const elementName in elementsMap) {
        if (!elementsMap[elementName]) {
            console.error(`DEBUG: Elemento NO encontrado: ${elementName}`);
            allElementsFound = false;
        } else {
            // console.log(`DEBUG: Elemento ENCONTRADO: ${elementName}`); // Descomentar para log exhaustivo
        }
    }

    if (!allElementsFound) {
        const errorMessage = "Error crítico: Uno o más elementos HTML no se encontraron. Revisa la consola para ver cuáles faltan y verifica los IDs en index.html y script.js.";
        console.error(errorMessage, "Estado de los elementos:", elementsMap);
        alert(errorMessage);
        if (statusDiv) {
            statusDiv.textContent = "Error: Elementos HTML no encontrados.";
            statusDiv.className = 'status-error';
        }
        return; 
    }
    console.log("DEBUG: Todos los elementos HTML requeridos fueron encontrados.");


    // --- Variables Globales ---
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
    const preferredTheme = localStorage.getItem('theme') || 'dark'; 
    applyTheme(preferredTheme); 
    
    function setAccentRGB() { 
        try {
            const bodyStyle = getComputedStyle(document.body);
            if (!bodyStyle) return;
            const accentColor = bodyStyle.getPropertyValue('--accent-color').trim();
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
        } catch (e) {
            console.warn("No se pudo establecer --accent-color-rgb:", e);
        }
    }
    setAccentRGB(); 
    new MutationObserver(setAccentRGB).observe(document.body, { attributes: true, attributeFilter: ['data-theme']});

    // --- Status Update Function ---
    function setStatus(message, type = "idle", duration = 0) { 
        if (!statusDiv) {
            console.error("DEBUG: statusDiv no está disponible para setStatus. Mensaje:", message);
            return;
        }
        statusDiv.textContent = message;
        statusDiv.className = ''; 
        statusDiv.classList.add(`status-${type}`);
        if (duration > 0) {
            setTimeout(() => {
                if (statusDiv.textContent === message) { 
                    updateButtonStates("initial"); 
                }
            }, duration);
        }
    }

    // --- Recording Timer Logic ---
    function startRecordingTimer() { stopRecordingTimer(); updateRecordingTimeDisplay(); recordingTimerInterval = setInterval(() => { if (!isPaused) { recordingSeconds++; updateRecordingTimeDisplay();}}, 1000); }
    function stopRecordingTimer() { clearInterval(recordingTimerInterval); }
    function updateRecordingTimeDisplay() { const m = Math.floor(recordingSeconds / 60); const s = recordingSeconds % 60; recordingTimeDisplay.textContent = isRecording || isPaused ? `Tiempo: ${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : ""; }
    function resetRecordingTimerDisplay() { recordingTimeDisplay.textContent = ""; recordingSeconds = 0; }

    // --- Volume Meter Logic ---
    function setupVolumeMeter(stream) { volumeMeterContainer.style.display = 'block'; if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)(); if (audioContext.state === 'suspended') audioContext.resume(); analyser = audioContext.createAnalyser(); microphoneSource = audioContext.createMediaStreamSource(stream); microphoneSource.connect(analyser); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.3; const bufferLength = analyser.frequencyBinCount; const dataArray = new Uint8Array(bufferLength); function drawVolume() { if (!isRecording || isPaused) { if(isPaused) volumeMeterBar.classList.add('paused'); else volumeMeterBar.classList.remove('paused'); animationFrameId = requestAnimationFrame(drawVolume); return; } animationFrameId = requestAnimationFrame(drawVolume); analyser.getByteFrequencyData(dataArray); let sum = 0; for(let i = 0; i < bufferLength; i++) { sum += dataArray[i]; } let average = sum / bufferLength; let volumePercent = (average / 150) * 100; volumePercent = Math.min(100, Math.max(0, volumePercent)); volumeMeterBar.style.width = volumePercent + '%'; volumeMeterBar.classList.remove('paused');} drawVolume(); }
    function stopVolumeMeter() { if (animationFrameId) cancelAnimationFrame(animationFrameId); if (microphoneSource) { microphoneSource.disconnect(); microphoneSource = null; } volumeMeterBar.style.width = '0%'; volumeMeterBar.classList.remove('paused'); volumeMeterContainer.style.display = 'none';  }
    
    // --- Recording and Processing Logic ---
    function toggleRecordingState() { 
        if (isRecording) { 
            if (mediaRecorder && (mediaRecorder.state === "recording" || mediaRecorder.state === "paused")) {
                mediaRecorder.stop(); 
                setStatus("Deteniendo grabación...", "processing");
            } else {
                isRecording = false; isPaused = false;
                updateButtonStates("initial");
            }
        } else { 
            startActualRecording();
        }
    }
    
    async function startActualRecording() { 
        setStatus("Solicitando permiso...", "processing");
        isPaused = false;
        polishedTextarea.value = ''; 
        audioChunks = [];
        currentAudioBlob = null;
        recordingSeconds = 0; 
        audioPlaybackSection.style.display = 'none'; 
        
        if (audioPlayback.src) { URL.revokeObjectURL(audioPlayback.src); audioPlayback.src = ''; audioPlayback.removeAttribute('src');}
        if (!userApiKey) {
            alert('API Key de Gemini no configurada.'); setStatus("Error: API Key.", "error");
            updateButtonStates("initial"); return; 
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            isRecording = true; 
            setupVolumeMeter(stream); 
            startRecordingTimer(); 

            mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            mediaRecorder.ondataavailable = event => { if (event.data.size > 0) audioChunks.push(event.data); };
            mediaRecorder.onpause = () => {
                setStatus('Grabación pausada.', 'idle');
                isPaused = true; volumeMeterBar.classList.add('paused');
                volumeMeterBar.style.background = 'var(--button-default-bg)'; 
                updateButtonStates("paused"); 
            };
            mediaRecorder.onresume = () => {
                setStatus('Grabando... (Reanudado)', 'processing');
                isPaused = false; volumeMeterBar.classList.remove('paused'); 
                volumeMeterBar.style.background = 'var(--volume-bar-gradient)'; 
                updateButtonStates("recording"); 
            };
            mediaRecorder.onstop = async () => {
                isRecording = false; isPaused = false; 
                stopVolumeMeter(); stopRecordingTimer(); 
                setStatus('Grabación detenida. Procesando...', 'processing');
                if (audioChunks.length === 0) { setStatus("Error: No se grabó audio.", "error", 3000); updateButtonStates("stopped_error"); return; }
                currentAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                if (currentAudioBlob.size === 0) { setStatus("Error: Audio grabado vacío.", "error", 3000); updateButtonStates("stopped_error"); return; }
                const audioURL = URL.createObjectURL(currentAudioBlob);
                audioPlayback.src = audioURL; 
                audioPlaybackSection.style.display = 'block'; 
                updateButtonStates("stopped_success"); 
                await processAudioBlob(currentAudioBlob);
            };
            mediaRecorder.onerror = (event) => {
                isRecording = false; isPaused = false;
                stopVolumeMeter(); stopRecordingTimer(); resetRecordingTimerDisplay();
                setStatus(`Error MediaRecorder: ${event.error.name}`, "error", 4000);
                updateButtonStates("error");
            };
            mediaRecorder.start();
            setStatus('Grabando...', "processing"); 
            updateButtonStates("recording");      
        } catch (err) {
            isRecording = false; isPaused = false; 
            stopVolumeMeter(); stopRecordingTimer(); resetRecordingTimerDisplay();
            setStatus(`Error Mic: ${err.message}.`, "error", 4000);
            updateButtonStates("initial");
        }
    }

    function handlePauseResume() { 
        if (!mediaRecorder || !isRecording) return; 
        if (mediaRecorder.state === "recording") { mediaRecorder.pause();  }
        else if (mediaRecorder.state === "paused") { mediaRecorder.resume();  }
    }
        
    async function processAudioBlob(audioBlob) { 
        polishedTextarea.value = ''; 
        setStatus('Preparando audio...', 'processing');
        updateButtonStates("processing_audio");
        try {
            const base64Audio = await blobToBase64(audioBlob);
            if (!base64Audio || base64Audio.length < 100) throw new Error("Fallo Base64.");
            const polishedResult = await transcribeAndPolishAudio(base64Audio); 
            polishedTextarea.value = polishedResult;
            setStatus('Proceso completado.', 'success', 3000);
            updateButtonStates("success_processing");
        } catch (error) {
            setStatus(`Error Proc: ${error.message}`, "error", 4000);
            polishedTextarea.value = `Error: ${error.message}`; 
            updateButtonStates("error_processing"); 
        }
    }

    function updateButtonStates(state) {
        startRecordBtn.disabled = true; 
        pauseResumeBtn.disabled = true;
        retryProcessBtn.disabled = true; 
        copyPolishedTextBtn.disabled = false; 
        startRecordBtn.textContent = "Empezar Dictado";
        startRecordBtn.classList.remove("stop-style");
        pauseResumeBtn.textContent = "Pausar";

        switch (state) {
            case "initial":
                startRecordBtn.disabled = false;
                setStatus("Listo", "idle");
                resetRecordingTimerDisplay();
                stopVolumeMeter(); 
                audioPlaybackSection.style.display = currentAudioBlob ? 'block' : 'none'; 
                retryProcessBtn.disabled = !currentAudioBlob; 
                break;
            case "recording":
                startRecordBtn.disabled = false; 
                startRecordBtn.textContent = "Detener Dictado";
                startRecordBtn.classList.add("stop-style");
                pauseResumeBtn.disabled = false;
                retryProcessBtn.disabled = true; 
                audioPlaybackSection.style.display = 'none';
                break;
            case "paused":
                startRecordBtn.disabled = false; 
                startRecordBtn.textContent = "Detener Dictado"; 
                startRecordBtn.classList.add("stop-style");
                pauseResumeBtn.disabled = false;
                pauseResumeBtn.textContent = "Reanudar";
                retryProcessBtn.disabled = true; 
                break;
            case "stopped_success": 
                startRecordBtn.disabled = false; 
                retryProcessBtn.disabled = !currentAudioBlob;
                audioPlaybackSection.style.display = 'block';
                break;
            case "stopped_error": 
                 startRecordBtn.disabled = false;
                 resetRecordingTimerDisplay();
                 stopVolumeMeter();
                 audioPlaybackSection.style.display = 'none';
                 retryProcessBtn.disabled = !currentAudioBlob; 
                break;
            case "processing_audio": 
                startRecordBtn.disabled = true; 
                pauseResumeBtn.disabled = true;
                retryProcessBtn.disabled = true; 
                break;
            case "error_processing": 
                startRecordBtn.disabled = false; 
                retryProcessBtn.disabled = !currentAudioBlob; 
                audioPlaybackSection.style.display = currentAudioBlob ? 'block' : 'none';
                break;
            case "success_processing": 
                startRecordBtn.disabled = false;
                retryProcessBtn.disabled = !currentAudioBlob; 
                audioPlaybackSection.style.display = currentAudioBlob ? 'block' : 'none';
                break;
             case "error": 
                startRecordBtn.disabled = false; 
                resetRecordingTimerDisplay();
                stopVolumeMeter();
                audioPlaybackSection.style.display = 'none';
                retryProcessBtn.disabled = !currentAudioBlob; 
                break;
            default: 
                startRecordBtn.disabled = false;
                resetRecordingTimerDisplay();
                stopVolumeMeter();
                audioPlaybackSection.style.display = currentAudioBlob ? 'block' : 'none';
                retryProcessBtn.disabled = !currentAudioBlob;
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
    });

    copyPolishedTextBtn.addEventListener('click', async () => { 
        const headerText = headerArea.value.trim(); 
        const reportText = polishedTextarea.value.trim();
        let textToCopy = "";
        if (headerText) { textToCopy += headerText; }
        if (reportText) { if (textToCopy) { textToCopy += "\n\n"; } textToCopy += reportText; }
        if (textToCopy === '') { setStatus("Nada que copiar.", "idle", 2000); return; }
        try { await navigator.clipboard.writeText(textToCopy); setStatus("¡Texto copiado!", "success", 2000); }
        catch (err) { console.error('Error copia:', err); setStatus("Error al copiar.", "error", 3000); }
    });

    techniqueButtonsContainer.addEventListener('click', (event) => { 
        if (event.target.tagName === 'BUTTON' && event.target.dataset.techniqueText) {
            headerArea.value = event.target.dataset.techniqueText; headerArea.focus(); 
        }
    });
    clearHeaderButton.addEventListener('click', () => { 
        headerArea.value = ""; headerArea.focus(); 
    });

    function blobToBase64(blob) { return new Promise((resolve, reject) => { if (!blob || blob.size === 0) return reject(new Error("Blob nulo o vacío")); const reader = new FileReader(); reader.onloadend = () => { if (reader.result) { const base64String = reader.result.toString().split(',')[1]; if (!base64String) return reject(new Error("Fallo al extraer Base64.")); resolve(base64String); } else reject(new Error("FileReader no produjo resultado.")); }; reader.onerror = (error) => reject(error); reader.readAsDataURL(blob); }); }
    
    async function callGeminiAPI(promptParts, isTextOnly = false) { 
        if (!userApiKey) throw new Error('API Key no configurada.'); 
        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${userApiKey}`; 
        const temperature = isTextOnly ? 0.1 : 0.2;  
        const body = { contents: [{ parts: promptParts }], generationConfig: { temperature: temperature } };  
        console.log(`Llamando a Gemini API (isTextOnly: ${isTextOnly}, temp: ${temperature}). Prompt (inicio):`, JSON.stringify(promptParts[0]).substring(0, 200) + "..."); 
        const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); 
        if (!response.ok) { const errorData = await response.json(); console.error("Error data de Gemini API:", errorData); throw new Error(`Error API Gemini: ${errorData.error?.message || response.statusText} (Código: ${response.status})`); } 
        const data = await response.json(); 
        if (data.candidates?.[0]?.content?.parts?.[0]?.text) return data.candidates[0].content.parts[0].text; 
        if (data.promptFeedback?.blockReason) throw new Error(`Bloqueado por Gemini: ${data.promptFeedback.blockReason}. ${data.promptFeedback.blockReasonMessage || ''}`); 
        if (data.candidates?.[0]?.finishReason && data.candidates[0].finishReason !== "STOP") throw new Error(`Gemini finalizó con razón: ${data.candidates[0].finishReason}.`); 
        if (data.candidates?.[0]?.finishReason === "STOP" && !data.candidates?.[0]?.content?.parts?.[0]?.text) return ""; 
        throw new Error('Respuesta de Gemini inesperada o sin texto, y sin razón de bloqueo clara.'); 
    }

    function capitalizeSentencesProperly(text) {
        if (!text || text.trim() === "") return "";
        let result = text.trimStart();
        if (result.length > 0) {
            result = result.charAt(0).toUpperCase() + result.slice(1);
        }
        result = result.replace(/([.!?])(\s*\n*|\s+)([a-záéíóúüñ])/g, (match, punctuation, whitespace, letter) => {
            return punctuation + whitespace + letter.toUpperCase();
        });
        return result;
    }

    async function transcribeAndPolishAudio(base64Audio) { 
        let transcribedText = ''; 
        try { 
            setStatus('Transcribiendo audio...', 'processing'); 
            const transcriptPromptParts = [ { "text": "Transcribe el siguiente audio a texto con la MÁXIMA LITERALIDAD POSSIBLE. No corrijas errores de habla, repeticiones menores, ni cambies palabras. Si el hablante dice 'coma', 'punto', etc., transcríbelo tal cual como texto. El objetivo es una transcripción fiel palabra por palabra de lo que se oye:" }, { "inline_data": { "mime_type": "audio/webm", "data": base64Audio } } ]; 
            transcribedText = await callGeminiAPI(transcriptPromptParts, false);  
            console.log("--- Transcripción Original (Consola) ---"); console.log(transcribedText); console.log("---------------------------------------"); 
        } catch (error) { 
            console.error("Error durante la transcripción interna:", error); 
            throw new Error(`Fallo en transcripción interna: ${error.message}`);  
        } 
        if (!transcribedText || transcribedText.trim() === "") throw new Error("La transcripción interna no produjo texto o está vacía.");  
        try { 
            setStatus('Aplicando formato y puntuación...', 'processing'); 
            const polishPromptParts = [ { "text": `Por favor, revisa el siguiente texto y aplica ÚNICAMENTE las siguientes modificaciones:\n1. Interpreta y reemplaza las siguientes palabras dictadas como signos de puntuación y formato EXACTAMENTE como se indica:\n    * 'coma' -> ','\n    * 'punto' -> '.'\n    * 'punto y aparte' -> '.' seguido de UN ÚNICO SALTO DE LÍNEA (\\n). NO insertes líneas en blanco adicionales.\n    * 'nueva línea' o 'siguiente línea' -> un único salto de línea (\\n).\n    * 'dos puntos' -> ':'\n    * 'punto y coma' -> ';'\n    * 'signo de interrogación', 'interrogación' o 'pregunta' (al final de una frase) -> '?'\n    * 'signo de exclamación', 'exclamación' o 'admiración' (al final de una frase) -> '!'\n2. Corrige ÚNICAMENTE errores ortográficos evidentes.\n3. Corrige ÚNICAMENTE errores gramaticales OBJETIVOS Y CLAROS que impidan la comprensión.\n4. NO CAMBIES la elección de palabras del hablante si son gramaticalmente correctas y comprensibles.\n5. NO REESTRUCTURES frases si son gramaticalmente correctas.\n6. PRESERVA el estilo y las expresiones exactas del hablante tanto como sea posible. El objetivo NO es "mejorar" el texto, sino formatearlo según lo dictado y corregir solo errores flagrantes.\n7. Si el texto ya contiene puntuación (ej. el hablante dictó "hola punto"), no la dupliques. Simplemente asegúrate de que el formato sea correcto.\n8. Asegúrate de que la primera letra de cada oración (después de un punto, signo de interrogación, o exclamación seguido de un espacio o salto de línea, y al inicio del texto) esté en mayúscula. \n\nTexto a procesar:\n"${transcribedText}"` } ]; 
            let polishedResult = await callGeminiAPI(polishPromptParts, true);  
            let capitalizedText = capitalizeSentencesProperly(polishedResult);
            let postProcessedText = capitalizedText.replace(/\.\s*\n\s*\n/g, '.\n');  
            postProcessedText = postProcessedText.replace(/\n\s*\n/g, '\n');       
            return postProcessedText; 
        } catch (error) { 
            console.error("Error durante el pulido/formato:", error); 
            setStatus(`Formato falló: ${error.message}. Mostrando transcripción cruda.`, "error", 4000); 
            return capitalizeSentencesProperly(transcribedText);  
        } 
    }

    // --- Inicialización de Event Listeners y Estado ---
    startRecordBtn.addEventListener('click', toggleRecordingState);
    pauseResumeBtn.addEventListener('click', handlePauseResume);
    
    updateButtonStates("initial"); 
    console.log("DEBUG: Script completamente inicializado.");
});
