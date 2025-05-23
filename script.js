document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM completamente cargado y parseado.");

    const startRecordBtn = document.getElementById('startRecordBtn');
    const stopRecordBtn = document.getElementById('stopRecordBtn');
    const retryProcessBtn = document.getElementById('retryProcessBtn');
    const statusDiv = document.getElementById('status');
    const originalTextarea = document.getElementById('originalText');
    const polishedTextarea = document.getElementById('polishedText');
    const audioPlayback = document.getElementById('audioPlayback');
    const themeSwitch = document.getElementById('themeSwitch');
    const volumeMeterBar = document.getElementById('volumeMeterBar');

    console.log({ startRecordBtn, stopRecordBtn, retryProcessBtn, statusDiv, originalTextarea, polishedTextarea, audioPlayback, themeSwitch, volumeMeterBar });

    if (!originalTextarea || !polishedTextarea || !statusDiv || !startRecordBtn || !stopRecordBtn || !retryProcessBtn || !audioPlayback || !themeSwitch || !volumeMeterBar) {
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
    // Establecer el estado --accent-color-rgb para el box-shadow de focus
    function setAccentRGB() {
        const accentColor = getComputedStyle(document.body).getPropertyValue('--accent-color').trim();
        if (accentColor.startsWith('#')) {
            const r = parseInt(accentColor.slice(1, 3), 16);
            const g = parseInt(accentColor.slice(3, 5), 16);
            const b = parseInt(accentColor.slice(5, 7), 16);
            document.documentElement.style.setProperty('--accent-color-rgb', `${r},${g},${b}`);
        } else if (accentColor.startsWith('rgb')) { // rgb(r, g, b)
            const parts = accentColor.match(/[\d.]+/g);
            if (parts && parts.length >=3) {
                 document.documentElement.style.setProperty('--accent-color-rgb', `${parts[0]},${parts[1]},${parts[2]}`);
            }
        }
    }
    setAccentRGB(); // Inicial
    new MutationObserver(setAccentRGB).observe(document.body, { attributes: true, attributeFilter: ['data-theme']});


    // --- Status Update Function ---
    function setStatus(message, type = "idle") {
        statusDiv.textContent = message;
        statusDiv.className = ''; // Reset classes
        switch (type) {
            case "processing": statusDiv.classList.add('status-processing'); break;
            case "success": statusDiv.classList.add('status-success'); break;
            case "error": statusDiv.classList.add('status-error'); break;
            case "idle": default: statusDiv.classList.add('status-idle'); break;
        }
        console.log(`Status updated: ${message} (type: ${type})`);
    }

    // --- Volume Meter Logic ---
    function setupVolumeMeter(stream) {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        microphoneSource = audioContext.createMediaStreamSource(stream);
        microphoneSource.connect(analyser);
        analyser.fftSize = 256; // Smaller FFT size for faster response
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        function drawVolume() {
            animationFrameId = requestAnimationFrame(drawVolume);
            analyser.getByteFrequencyData(dataArray); // or getByteTimeDomainData
            
            let sum = 0;
            for(let i = 0; i < bufferLength; i++) {
                sum += dataArray[i];
            }
            let average = sum / bufferLength;
            // Scale a bit differently for better visual feedback. Max average is 255.
            // Let's say anything above 100 is "loud". Max bar width is 100%.
            let volumePercent = Math.min(100, (average / 128) * 100 * 1.5); // Scale up for sensitivity
            volumeMeterBar.style.width = volumePercent + '%';
        }
        drawVolume();
    }

    function stopVolumeMeter() {
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        if (microphoneSource) microphoneSource.disconnect();
        // analyser can be reused or closed if audioContext is closed
        volumeMeterBar.style.width = '0%';
    }
    
    // --- Recording and Processing Logic ---
    async function startRecording() {
        console.log("Solicitando permiso para grabar...");
        setStatus("Solicitando permiso para grabar...", "processing");
        originalTextarea.value = '';
        polishedTextarea.value = '';
        audioChunks = [];
        currentAudioBlob = null;
        retryProcessBtn.disabled = true;

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
            setupVolumeMeter(stream); // Start volume meter

            mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

            mediaRecorder.ondataavailable = event => {
                if (event.data.size > 0) audioChunks.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                stopVolumeMeter(); // Stop volume meter
                console.log("MediaRecorder.onstop - Grabación detenida.");
                setStatus('Grabación detenida. Procesando audio...', 'processing');

                if (audioChunks.length === 0) {
                    setStatus("Error: No se grabó audio. Revisa permisos/micrófono.", "error");
                    alert("No se detectó audio.");
                    stopRecordBtn.disabled = true;
                    startRecordBtn.disabled = false;
                    return;
                }

                currentAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                console.log(`Blob de audio creado. Tamaño: ${currentAudioBlob.size} bytes.`);

                if (currentAudioBlob.size === 0) {
                    setStatus("Error: El audio grabado está vacío.", "error");
                    alert("El audio grabado parece estar vacío.");
                    stopRecordBtn.disabled = true;
                    startRecordBtn.disabled = false;
                    return;
                }

                const audioURL = URL.createObjectURL(currentAudioBlob);
                audioPlayback.src = audioURL;
                retryProcessBtn.disabled = false; // Enable retry now that we have a blob

                await processAudioBlob(currentAudioBlob); // Extracted processing logic
            };

            mediaRecorder.onerror = (event) => {
                stopVolumeMeter();
                console.error("MediaRecorder error:", event.error);
                setStatus(`Error de MediaRecorder: ${event.error.name}`, "error");
                alert(`Ocurrió un error con el grabador de audio: ${event.error.message}`);
                stopRecordBtn.disabled = true;
                startRecordBtn.disabled = false;
                retryProcessBtn.disabled = !!currentAudioBlob; // Enable if blob exists
            };

            mediaRecorder.start();
            setStatus('Grabando... Habla ahora.', "processing");
            startRecordBtn.disabled = true;
            stopRecordBtn.disabled = false;
            retryProcessBtn.disabled = true;

        } catch (err) {
            console.error('Error al acceder al micrófono:', err);
            setStatus(`Error al acceder al micrófono: ${err.message}.`, "error");
            alert(`No se pudo acceder al micrófono: ${err.message}.`);
            startRecordBtn.disabled = false;
            stopRecordBtn.disabled = true;
        }
    }

    function stopRecording() {
        console.log("Botón Detener Grabación presionado.");
        if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop(); // This will trigger onstop
            setStatus("Deteniendo grabación...", "processing");
            stopRecordBtn.disabled = true;
        } else {
            setStatus("Nada que detener.", "idle");
            stopRecordBtn.disabled = true;
            startRecordBtn.disabled = false;
        }
    }

    // New function to handle processing, can be called by onstop or retry
    async function processAudioBlob(audioBlob) {
        originalTextarea.value = '';
        polishedTextarea.value = '';
        setStatus('Preparando audio para enviar...', 'processing');
        
        try {
            console.log("Convirtiendo Blob a Base64...");
            const base64Audio = await blobToBase64(audioBlob);
            if (!base64Audio || base64Audio.length < 100) {
                throw new Error("Fallo al convertir audio a Base64 o audio demasiado corto.");
            }
            await transcribeAndPolishAudio(base64Audio);
        } catch (error) {
            console.error('Error procesando audio:', error);
            setStatus(`Error: ${error.message}`, "error");
            polishedTextarea.value = `Error en el proceso: ${error.message}`;
        } finally {
            // Enable start button for new recording, retry button remains enabled if blob exists
            startRecordBtn.disabled = false;
            stopRecordBtn.disabled = true; // Stop should be disabled after processing
            retryProcessBtn.disabled = !currentAudioBlob; // Keep enabled if there's a blob
             if (!statusDiv.classList.contains('status-error') && !statusDiv.classList.contains('status-success')) {
                setStatus("Listo para una nueva grabación o reintentar.", "idle");
            }
        }
    }

    retryProcessBtn.addEventListener('click', () => {
        if (currentAudioBlob) {
            console.log("Reintentando procesamiento con audio existente.");
            setStatus("Reintentando procesamiento...", "processing");
            processAudioBlob(currentAudioBlob);
        } else {
            alert("No hay audio grabado para reintentar.");
            setStatus("No hay audio para reintentar.", "error");
        }
    });


    function blobToBase64(blob) {
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
        let transcribedText = '';
        try {
            setStatus('Transcribiendo audio con Gemini... (puede tardar)', 'processing');
            const transcriptPromptParts = [
                { "text": "Transcribe el siguiente audio a texto. Es importante que transcribas literalmente las palabras dictadas, incluyendo si el usuario dice 'coma', 'punto', 'punto y aparte', 'nueva línea', 'dos puntos', 'punto y coma', 'signo de interrogación', 'signo de exclamación', etc.:" },
                { "inline_data": { "mime_type": "audio/webm", "data": base64Audio } }
            ];
            transcribedText = await callGeminiAPI(transcriptPromptParts, false);
            originalTextarea.value = "Transcripción original:\n" + transcribedText;
        } catch (error) {
            originalTextarea.value = `Error en transcripción: ${error.message}`;
            polishedTextarea.value = `Error en transcripción: ${error.message}`;
            // No cambiamos estado aquí, se hará en el 'finally' de processAudioBlob o el catch allí
            throw error; // Re-throw para que processAudioBlob lo capture
        }

        if (!transcribedText.trim()) {
            polishedTextarea.value = "No se transcribió texto para pulir.";
            setStatus("Proceso completado (sin texto para pulir).", "success");
            return;
        }
        
        try {
            setStatus('Puliendo texto con Gemini...', 'processing');
            const polishPromptParts = [
                {
                    "text": `Por favor, revisa y pule el siguiente texto.
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
"${transcribedText}"`
                }
            ];
            let polishedResult = await callGeminiAPI(polishPromptParts, true);
            
            setStatus('Texto pulido recibido. Ajustes finales...', 'processing');
            let postProcessedText = polishedResult.replace(/\.\s*\n\s*\n/g, '.\n');
            postProcessedText = postProcessedText.replace(/\n\s*\n/g, '\n');

            polishedTextarea.value = postProcessedText;
            setStatus('Proceso de transcripción y pulido completado.', 'success');
        } catch (error) {
            polishedTextarea.value = `Error al pulir: ${error.message}\n\n(Transcripción original arriba)`;
            // No cambiamos estado aquí, se hará en el 'finally' de processAudioBlob o el catch allí
            throw error; // Re-throw
        }
    }

    startRecordBtn.addEventListener('click', startRecording);
    stopRecordBtn.addEventListener('click', stopRecording);

    setStatus("Estado: Esperando para grabar...", "idle"); // Estado inicial
    console.log("Script inicializado y event listeners asignados.");
});
