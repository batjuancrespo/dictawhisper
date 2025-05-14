document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM completamente cargado y parseado.");

    const startRecordBtn = document.getElementById('startRecordBtn');
    const stopRecordBtn = document.getElementById('stopRecordBtn');
    const statusDiv = document.getElementById('status');
    const originalTextarea = document.getElementById('originalText');
    const polishedTextarea = document.getElementById('polishedText');
    const audioPlayback = document.getElementById('audioPlayback'); // Elemento para reproducir audio

    console.log({ startRecordBtn, stopRecordBtn, statusDiv, originalTextarea, polishedTextarea, audioPlayback });

    if (!originalTextarea || !polishedTextarea || !statusDiv || !startRecordBtn || !stopRecordBtn || !audioPlayback) {
        const errorMessage = "Error crítico: Uno o más elementos HTML no se encontraron. Revisa los IDs en index.html y script.js.";
        alert(errorMessage);
        if (statusDiv) statusDiv.textContent = "Error: Elementos HTML no encontrados.";
        else console.error(errorMessage);
        return;
    }

    let mediaRecorder;
    let audioChunks = [];
    let currentAudioBlob = null; // Para almacenar el blob actual

    // ¡¡¡IMPORTANTE!!! API Key integrada directamente.
    const userApiKey = 'AIzaSyASbB99MVIQ7dt3MzjhidgoHUlMXIeWvGc'; // Tu API Key

    async function startRecording() {
        console.log("Solicitando permiso para grabar...");
        statusDiv.textContent = "Solicitando permiso para grabar...";
        originalTextarea.value = '';
        polishedTextarea.value = '';
        audioChunks = []; // Limpiar chunks de grabaciones anteriores
        if (audioPlayback.src) {
            URL.revokeObjectURL(audioPlayback.src); // Liberar URL de objeto anterior
            audioPlayback.src = '';
            audioPlayback.removeAttribute('src'); // Asegurar que se limpie
            console.log("Audio playback source limpiado.");
        }
        currentAudioBlob = null;


        if (!userApiKey) {
            alert('API Key de Gemini no está configurada en el script.');
            statusDiv.textContent = "Error: API Key no configurada.";
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log("Permiso de micrófono concedido. Stream obtenido:", stream);
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' }); // Especificar mimeType
            console.log("MediaRecorder instanciado:", mediaRecorder);

            mediaRecorder.ondataavailable = event => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                    console.log(`Chunk de audio recibido. Tamaño: ${event.data.size} bytes. Total chunks: ${audioChunks.length}`);
                } else {
                    console.log("Chunk de audio vacío recibido.");
                }
            };

            mediaRecorder.onstop = async () => {
                console.log("MediaRecorder.onstop - Grabación detenida.");
                if (audioChunks.length === 0) {
                    console.error("No se grabaron chunks de audio.");
                    statusDiv.textContent = "Error: No se grabó audio. Revisa los permisos del micrófono o si hay algún problema con el dispositivo de entrada.";
                    alert("No se detectó audio. Por favor, asegúrate de que tu micrófono funciona y has concedido los permisos.");
                    stopRecordBtn.disabled = true;
                    startRecordBtn.disabled = false;
                    return;
                }

                currentAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                console.log(`Blob de audio creado. Tamaño: ${currentAudioBlob.size} bytes. Tipo: ${currentAudioBlob.type}`);

                if (currentAudioBlob.size === 0) {
                    console.error("El Blob de audio está vacío después de la grabación.");
                    statusDiv.textContent = "Error: El audio grabado está vacío.";
                    alert("El audio grabado parece estar vacío. Inténtalo de nuevo.");
                    stopRecordBtn.disabled = true;
                    startRecordBtn.disabled = false;
                    return;
                }

                // Configurar reproductor de audio
                const audioURL = URL.createObjectURL(currentAudioBlob);
                audioPlayback.src = audioURL;
                console.log("Audio listo para reproducción en:", audioURL);
                audioPlayback.oncanplaythrough = () => console.log("El audio se puede reproducir completamente.");
                audioPlayback.onerror = (e) => console.error("Error al cargar audio para reproducción:", e);


                statusDiv.textContent = 'Procesando audio...';
                originalTextarea.value = '';
                polishedTextarea.value = '';

                try {
                    console.log("Convirtiendo Blob a Base64...");
                    const base64Audio = await blobToBase64(currentAudioBlob);
                    if (!base64Audio || base64Audio.length < 100) { // Un audio muy corto podría ser un problema
                        console.error("La conversión a Base64 resultó en una cadena vacía o muy corta:", base64Audio ? base64Audio.substring(0,50) + '...' : 'null');
                        throw new Error("Fallo al convertir audio a Base64 o audio demasiado corto.");
                    }
                    console.log(`Audio convertido a Base64. Longitud (aprox): ${base64Audio.length} caracteres. Primeros 50: ${base64Audio.substring(0,50)}...`);
                    await transcribeAndPolishAudio(base64Audio);
                } catch (error) {
                    console.error('Error procesando audio (onstop):', error);
                    statusDiv.textContent = `Error: ${error.message}`;
                    polishedTextarea.value = `Error en el proceso: ${error.message}`;
                } finally {
                    stopRecordBtn.disabled = true;
                    startRecordBtn.disabled = false;
                }
            };

            mediaRecorder.onerror = (event) => {
                console.error("MediaRecorder error:", event.error);
                statusDiv.textContent = `Error de MediaRecorder: ${event.error.name} - ${event.error.message}`;
                alert(`Ocurrió un error con el grabador de audio: ${event.error.message}`);
                stopRecordBtn.disabled = true;
                startRecordBtn.disabled = false;
            };

            mediaRecorder.start();
            console.log("MediaRecorder.start() llamado. Estado:", mediaRecorder.state);
            statusDiv.textContent = 'Grabando... Habla ahora (puedes dictar "coma", "punto", "punto y aparte").';
            startRecordBtn.disabled = true;
            stopRecordBtn.disabled = false;

        } catch (err) {
            console.error('Error al acceder al micrófono o iniciar MediaRecorder:', err);
            statusDiv.textContent = `Error al acceder al micrófono: ${err.message}. Asegúrate de dar permiso.`;
            alert(`No se pudo acceder al micrófono: ${err.message}. Por favor, verifica los permisos.`);
        }
    }

    function stopRecording() {
        console.log("Botón Detener Grabación presionado.");
        if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop();
            console.log("MediaRecorder.stop() llamado. Estado actual:", mediaRecorder.state);
            // El resto del procesamiento ocurre en mediaRecorder.onstop
        } else {
            console.warn("Se intentó detener la grabación, pero MediaRecorder no estaba grabando o no existía.");
            statusDiv.textContent = "Nada que detener.";
            stopRecordBtn.disabled = true;
            startRecordBtn.disabled = false;
        }
    }

    function blobToBase64(blob) {
        console.log("Iniciando blobToBase64 para blob de tamaño:", blob.size);
        return new Promise((resolve, reject) => {
            if (!blob || blob.size === 0) {
                console.error("blobToBase64: Blob nulo o vacío proporcionado.");
                return reject(new Error("Blob nulo o vacío proporcionado a blobToBase64"));
            }
            const reader = new FileReader();
            reader.onloadend = () => {
                if (reader.result) {
                    const base64String = reader.result.toString().split(',')[1];
                    if (!base64String) {
                         console.error("blobToBase64: La cadena Base64 es nula o indefinida después del split.");
                         return reject(new Error("Fallo al extraer cadena Base64 del resultado del FileReader."));
                    }
                    console.log(`blobToBase64: Conversión completada. Longitud de cadena Base64: ${base64String.length}`);
                    resolve(base64String);
                } else {
                    console.error("blobToBase64: reader.result es nulo o indefinido.");
                    reject(new Error("FileReader no produjo un resultado."));
                }
            };
            reader.onerror = (error) => {
                console.error("blobToBase64: Error de FileReader:", error);
                reject(error);
            };
            reader.readAsDataURL(blob);
            console.log("blobToBase64: readAsDataURL llamado.");
        });
    }

    async function callGeminiAPI(promptParts, isTextOnly = false) {
        console.log("Llamando a Gemini API. Es solo texto:", isTextOnly);
        if (!isTextOnly) {
            console.log("Prompt para Gemini (con audio):", JSON.stringify(promptParts, null, 2).substring(0, 500) + "..."); // Muestra parte del prompt
        } else {
            console.log("Prompt para Gemini (solo texto):", JSON.stringify(promptParts, null, 2));
        }


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
                temperature: isTextOnly ? 0.2 : 0.7,
            }
        };

        try {
            console.log("Enviando solicitud a Gemini API...");
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            console.log(`Respuesta de Gemini API recibida. Estado: ${response.status}`);

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Error API Gemini (datos):', errorData);
                throw new Error(`Error de API Gemini: ${errorData.error?.message || response.statusText} (Código: ${response.status})`);
            }

            const data = await response.json();
            console.log("Datos de respuesta de Gemini:", JSON.stringify(data, null, 2).substring(0,500) + "...");
            if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.length > 0) {
                const textResult = data.candidates[0].content.parts[0].text;
                console.log("Texto extraído de la respuesta de Gemini:", textResult);
                return textResult;
            } else {
                console.warn("Respuesta inesperada de Gemini o sin texto candidato:", data);
                if(data.promptFeedback && data.promptFeedback.blockReason){
                     throw new Error(`Solicitud bloqueada por Gemini: ${data.promptFeedback.blockReason}. Detalles: ${data.promptFeedback.blockReasonMessage || ''}`);
                }
                if(data.candidates && data.candidates.length > 0 && data.candidates[0].finishReason) {
                    throw new Error(`Gemini finalizó con razón: ${data.candidates[0].finishReason}. Esto puede indicar un problema con el prompt o el contenido.`);
                }
                throw new Error('No se recibió texto válido en la respuesta de Gemini.');
            }
        } catch (error) {
            console.error('Excepción al llamar a Gemini API:', error);
            statusDiv.textContent = `Error con Gemini: ${error.message}`;
            throw error;
        }
    }

    async function transcribeAndPolishAudio(base64Audio) {
        console.log("Iniciando transcribeAndPolishAudio...");
        // Paso 1: Transcripción
        statusDiv.textContent = 'Transcribiendo audio con Gemini...';
        let transcribedText = '';
        try {
            const transcriptPromptParts = [
                { "text": "Transcribe el siguiente audio a texto. Es importante que transcribas literalmente las palabras dictadas, incluyendo si el usuario dice 'coma', 'punto', 'punto y aparte', 'nueva línea', 'dos puntos', 'punto y coma', 'signo de interrogación', 'signo de exclamación', etc.:" },
                {
                    "inline_data": {
                        "mime_type": "audio/webm", // Coincide con el tipo de Blob
                        "data": base64Audio
                    }
                }
            ];
            transcribedText = await callGeminiAPI(transcriptPromptParts, false); // false porque incluye audio
            originalTextarea.value = "Transcripción original:\n" + transcribedText;
            statusDiv.textContent = 'Transcripción completada. Puliendo texto...';
        } catch (error) {
            console.error("Error durante la transcripción:", error);
            originalTextarea.value = `Error en transcripción: ${error.message}`;
            polishedTextarea.value = `Error en transcripción: ${error.message}`;
            statusDiv.textContent = 'Error en transcripción.';
            return;
        }

        // Paso 2: Pulido del texto transcrito
        if (!transcribedText.trim()) {
            console.log("No hay texto transcrito para pulir.");
            polishedTextarea.value = "No se transcribió texto para pulir.";
            statusDiv.textContent = "Proceso completado (sin texto para pulir).";
            return;
        }
        console.log("Iniciando pulido de texto...");
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
            console.log("Pulido completado.");
        } catch (error) {
            console.error("Error durante el pulido:", error);
            polishedTextarea.value = `Error al pulir el texto: ${error.message}\n\n(Transcripción original arriba)`;
            statusDiv.textContent = 'Error al pulir el texto.';
        }
    }

    startRecordBtn.addEventListener('click', startRecording);
    stopRecordBtn.addEventListener('click', stopRecording);

    console.log("Script inicializado y event listeners asignados.");
});
