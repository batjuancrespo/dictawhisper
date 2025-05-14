document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('apiKey');
    const saveApiKeyBtn = document.getElementById('saveApiKey');
    const startRecordBtn = document.getElementById('startRecordBtn');
    const stopRecordBtn = document.getElementById('stopRecordBtn');
    const polishBtn = document.getElementById('polishBtn');
    const statusDiv = document.getElementById('status');
    const originalTextarea = document.getElementById('originalText');
    const polishedTextarea = document.getElementById('polishedText');

    let mediaRecorder;
    let audioChunks = [];
    let userApiKey = localStorage.getItem('geminiApiKey');

    if (userApiKey) {
        apiKeyInput.value = userApiKey;
    }

    saveApiKeyBtn.addEventListener('click', () => {
        userApiKey = apiKeyInput.value.trim();
        if (userApiKey) {
            localStorage.setItem('geminiApiKey', userApiKey);
            alert('API Key guardada localmente.');
        } else {
            alert('Por favor, ingresa una API Key.');
        }
    });

    // --- Funciones de Grabación ---
    async function startRecording() {
        if (!userApiKey) {
            alert('Por favor, guarda tu API Key de Gemini primero.');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);

            mediaRecorder.ondataavailable = event => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' }); // o 'audio/ogg; codecs=opus'
                audioChunks = []; // Resetear para la próxima grabación
                statusDiv.textContent = 'Procesando audio...';
                originalTextarea.value = '';
                polishedTextarea.value = '';
                polishBtn.disabled = true;

                try {
                    const base64Audio = await blobToBase64(audioBlob);
                    await transcribeAudio(base64Audio);
                } catch (error) {
                    console.error('Error procesando audio:', error);
                    statusDiv.textContent = `Error: ${error.message}`;
                    alert(`Error procesando audio: ${error.message}`);
                } finally {
                    stopRecordBtn.disabled = true;
                    startRecordBtn.disabled = false;
                }
            };

            mediaRecorder.start();
            statusDiv.textContent = 'Grabando... Habla ahora.';
            startRecordBtn.disabled = true;
            stopRecordBtn.disabled = false;
            originalTextarea.value = '';
            polishedTextarea.value = '';
            polishBtn.disabled = true;

        } catch (err) {
            console.error('Error al acceder al micrófono:', err);
            statusDiv.textContent = 'Error al acceder al micrófono. Asegúrate de dar permiso.';
            alert('No se pudo acceder al micrófono. Por favor, verifica los permisos.');
        }
    }

    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop();
            // El procesamiento se maneja en mediaRecorder.onstop
        }
    }

    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]); // Quita el "data:audio/webm;base64,"
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    // --- Funciones de Gemini ---
    async function callGeminiAPI(promptParts, isTextOnly = false) {
        if (!userApiKey) {
            alert('API Key no configurada.');
            throw new Error('API Key no configurada.');
        }

        // Usaremos gemini-1.5-flash para transcripción y pulido por su multimodalidad y eficiencia
        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${userApiKey}`;

        const body = {
            contents: [{
                parts: promptParts
            }],
            generationConfig: { // Opcional: ajusta según necesidad
                temperature: isTextOnly ? 0.3 : 0.7, // Más determinista para pulir, más creativo para transcripción si es necesario
                // maxOutputTokens: 8192, // Ajustar si se espera texto muy largo
            }
        };

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Error API Gemini:', errorData);
                throw new Error(`Error de API Gemini: ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.length > 0) {
                return data.candidates[0].content.parts[0].text;
            } else {
                console.warn("Respuesta inesperada de Gemini:", data);
                if(data.promptFeedback && data.promptFeedback.blockReason){
                     throw new Error(`Solicitud bloqueada por Gemini: ${data.promptFeedback.blockReason}`);
                }
                throw new Error('No se recibió texto en la respuesta de Gemini.');
            }
        } catch (error) {
            console.error('Error llamando a Gemini API:', error);
            statusDiv.textContent = `Error con Gemini: ${error.message}`;
            throw error; // Re-lanzar para manejo superior
        }
    }

    async function transcribeAudio(base64Audio) {
        statusDiv.textContent = 'Transcribiendo audio con Gemini...';
        try {
            const promptParts = [
                { "text": "Transcribe el siguiente audio a texto. Si detectas pausas largas o ruido irrelevante, intenta omitirlo y enfocarte en las palabras habladas:" },
                {
                    "inline_data": {
                        "mime_type": "audio/webm", // Asegúrate que coincida con el blob type
                        "data": base64Audio
                    }
                }
            ];
            const transcribedText = await callGeminiAPI(promptParts);
            originalTextarea.value = transcribedText;
            statusDiv.textContent = 'Transcripción completada. Listo para pulir.';
            polishBtn.disabled = false;
        } catch (error) {
            originalTextarea.value = `Error en transcripción: ${error.message}`;
            statusDiv.textContent = 'Error en transcripción.';
        }
    }

    async function polishText() {
        const textToPolish = originalTextarea.value;
        if (!textToPolish.trim()) {
            alert('No hay texto original para pulir.');
            return;
        }

        statusDiv.textContent = 'Puliendo texto con Gemini...';
        polishBtn.disabled = true;
        polishedTextarea.value = '';

        try {
            const promptParts = [
                { "text": `Por favor, revisa y pule el siguiente texto. Corrige errores gramaticales, de puntuación, y mejora la claridad y fluidez, pero manteniendo el significado original. Si el texto ya es correcto, devuélvelo tal cual. El texto es:\n\n"${textToPolish}"` }
            ];
            const polishedResult = await callGeminiAPI(promptParts, true); // true para indicar que es solo texto
            polishedTextarea.value = polishedResult;
            statusDiv.textContent = 'Texto pulido.';
        } catch (error) {
            polishedTextarea.value = `Error al pulir: ${error.message}`;
            statusDiv.textContent = 'Error al pulir el texto.';
        } finally {
            polishBtn.disabled = false; // Re-habilitar incluso si hay error para reintentar
        }
    }

    // --- Event Listeners ---
    startRecordBtn.addEventListener('click', startRecording);
    stopRecordBtn.addEventListener('click', stopRecording);
    polishBtn.addEventListener('click', polishText);
});
