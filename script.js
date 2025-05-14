document.addEventListener('DOMContentLoaded', () => {
    const startRecordBtn = document.getElementById('startRecordBtn');
    const stopRecordBtn = document.getElementById('stopRecordBtn');
    // const polishBtn = document.getElementById('polishBtn'); // Eliminado
    const statusDiv = document.getElementById('status');
    const originalTextarea = document.getElementById('originalText');
    const polishedTextarea = document.getElementById('polishedText');

    let mediaRecorder;
    let audioChunks = [];

    // ¡¡¡IMPORTANTE!!! API Key integrada directamente.
    // ¡¡¡RECUERDA QUITARLA ANTES DE SUBIR A GITHUB PÚBLICO!!!
    const userApiKey = 'AIzaSyASbB99MVIQ7dt3MzjhidgoHUlMXIeWvGc'; // Mantén tu API Key aquí por ahora

    async function startRecording() {
        if (!userApiKey) {
            alert('API Key de Gemini no está configurada en el script.');
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);

            mediaRecorder.ondataavailable = event => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                audioChunks = [];
                statusDiv.textContent = 'Procesando audio...';
                originalTextarea.value = '';
                polishedTextarea.value = '';
                // polishBtn.disabled = true; // Eliminado

                try {
                    const base64Audio = await blobToBase64(audioBlob);
                    // Iniciar el proceso de transcripción y luego pulido
                    await transcribeAndPolishAudio(base64Audio);
                } catch (error) {
                    console.error('Error procesando audio:', error);
                    statusDiv.textContent = `Error: ${error.message}`;
                    alert(`Error procesando audio: ${error.message}`);
                    polishedTextarea.value = `Error en el proceso: ${error.message}`;
                } finally {
                    stopRecordBtn.disabled = true;
                    startRecordBtn.disabled = false;
                }
            };

            mediaRecorder.start();
            statusDiv.textContent = 'Grabando... Habla ahora (puedes dictar "coma", "punto", "punto y aparte").';
            startRecordBtn.disabled = true;
            stopRecordBtn.disabled = false;
            originalTextarea.value = '';
            polishedTextarea.value = '';
            // polishBtn.disabled = true; // Eliminado

        } catch (err) {
            console.error('Error al acceder al micrófono:', err);
            statusDiv.textContent = 'Error al acceder al micrófono. Asegúrate de dar permiso.';
            alert('No se pudo acceder al micrófono. Por favor, verifica los permisos.');
        }
    }

    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop();
        }
    }

    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    async function callGeminiAPI(promptParts, isTextOnly = false) {
        if (!userApiKey) {
            alert('API Key no configurada.');
            throw new Error('API Key no configurada.');
        }

        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${userApiKey}`;

        const body = {
            contents: [{
                parts: promptParts
            }],
            generationConfig: {
                temperature: isTextOnly ? 0.2 : 0.7, // Más determinista para pulir
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
            throw error;
        }
    }

    async function transcribeAndPolishAudio(base64Audio) {
        // Paso 1: Transcripción
        statusDiv.textContent = 'Transcribiendo audio con Gemini...';
        let transcribedText = '';
        try {
            const transcriptPromptParts = [
                { "text": "Transcribe el siguiente audio a texto. Es importante que transcribas literalmente las palabras dictadas, incluyendo si el usuario dice 'coma', 'punto', 'punto y aparte', 'signo de interrogación', 'signo de exclamación', etc.:" },
                {
                    "inline_data": {
                        "mime_type": "audio/webm",
                        "data": base64Audio
                    }
                }
            ];
            transcribedText = await callGeminiAPI(transcriptPromptParts);
            originalTextarea.value = "Transcripción original:\n" + transcribedText; // Mostrar transcripción intermedia
            statusDiv.textContent = 'Transcripción completada. Puliendo texto...';
        } catch (error) {
            originalTextarea.value = `Error en transcripción: ${error.message}`;
            polishedTextarea.value = `Error en transcripción: ${error.message}`;
            statusDiv.textContent = 'Error en transcripción.';
            // polishBtn.disabled = true; // Eliminado
            return; // Detener si la transcripción falla
        }

        // Paso 2: Pulido del texto transcrito
        if (!transcribedText.trim()) {
            polishedTextarea.value = "No se transcribió texto para pulir.";
            statusDiv.textContent = "Proceso completado (sin texto para pulir).";
            // polishBtn.disabled = true; // Eliminado
            return;
        }

        try {
            const polishPromptParts = [
                {
                    "text": `Por favor, revisa y pule el siguiente texto.
Instrucciones importantes:
1.  Interpreta las siguientes palabras dictadas como signos de puntuación:
    *   'coma' como ','
    *   'punto' como '.'
    *   'punto y aparte' como un nuevo párrafo (dos saltos de línea).
    *   'nueva línea' como un salto de línea simple.
    *   'dos puntos' como ':'
    *   'punto y coma' como ';'
    *   'signo de interrogación' o 'pregunta' al final de una frase como '?'
    *   'signo de exclamación' o 'admiración' al final de una frase como '!'
2.  Aplica estos signos de puntuación dictados.
3.  Adicionalmente, corrige otros errores gramaticales, de ortografía y de puntuación que no hayan sido dictados explícitamente.
4.  Mejora la claridad y la fluidez del texto.
5.  Es crucial que mantengas el significado original del texto.
6.  Si el texto ya parece correcto después de aplicar la puntuación dictada, solo haz las correcciones mínimas necesarias.

Texto a pulir:
"${transcribedText}"`
                }
            ];
            const polishedResult = await callGeminiAPI(polishPromptParts, true); // true para isTextOnly
            polishedTextarea.value = polishedResult;
            statusDiv.textContent = 'Proceso de transcripción y pulido completado.';
        } catch (error) {
            polishedTextarea.value = `Error al pulir el texto: ${error.message}\n\n(Transcripción original arriba)`;
            statusDiv.textContent = 'Error al pulir el texto.';
        }
        // polishBtn.disabled = true; // Ya no existe, pero el proceso ha terminado
    }

    // --- Event Listeners ---
    startRecordBtn.addEventListener('click', startRecording);
    stopRecordBtn.addEventListener('click', stopRecording);
    // El listener para polishBtn ha sido eliminado
});
