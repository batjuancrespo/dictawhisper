document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM completamente cargado y parseado.");

    const startRecordBtn = document.getElementById('startRecordBtn');
    const stopRecordBtn = document.getElementById('stopRecordBtn');
    const statusDiv = document.getElementById('status');
    const originalTextarea = document.getElementById('originalText');
    const polishedTextarea = document.getElementById('polishedText');
    const audioPlayback = document.getElementById('audioPlayback');

    if (!originalTextarea || !polishedTextarea || !statusDiv || !startRecordBtn || !stopRecordBtn || !audioPlayback) {
        const errorMessage = "Error crítico: Uno o más elementos HTML no se encontraron. Revisa los IDs en index.html y script.js.";
        alert(errorMessage);
        if (statusDiv) statusDiv.textContent = "Error: Elementos HTML no encontrados.";
        else console.error(errorMessage);
        return;
    }

    let mediaRecorder;
    let audioChunks = [];
    let currentAudioBlob = null;

    // ¡¡¡IMPORTANTE!!! API Key integrada directamente.
    // ¡¡¡RECUERDA QUITARLA ANTES DE SUBIR A GITHUB PÚBLICO!!!
    const userApiKey = 'AIzaSyASbB99MVIQ7dt3MzjhidgoHUlMXIeWvGc'; // TU API KEY

    async function startRecording() {
        // console.log("Solicitando permiso para grabar...");
        statusDiv.textContent = "Solicitando permiso para grabar...";
        originalTextarea.value = '';
        polishedTextarea.value = '';
        audioChunks = [];
        if (audioPlayback.src) {
            URL.revokeObjectURL(audioPlayback.src);
            audioPlayback.src = '';
            audioPlayback.removeAttribute('src');
        }
        currentAudioBlob = null;

        if (!userApiKey) {
            alert('API Key de Gemini no está configurada en el script.');
            statusDiv.textContent = "Error: API Key no configurada.";
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

            mediaRecorder.ondataavailable = event => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
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

                if (currentAudioBlob.size === 0) {
                    console.error("El Blob de audio está vacío después de la grabación.");
                    statusDiv.textContent = "Error: El audio grabado está vacío.";
                    alert("El audio grabado parece estar vacío. Inténtalo de nuevo.");
                    stopRecordBtn.disabled = true;
                    startRecordBtn.disabled = false;
                    return;
                }

                const audioURL = URL.createObjectURL(currentAudioBlob);
                audioPlayback.src = audioURL;
                audioPlayback.onerror = (e) => console.error("Error al cargar audio para reproducción:", e);

                statusDiv.textContent = 'Procesando audio...';
                originalTextarea.value = '';
                polishedTextarea.value = '';

                try {
                    const base64Audio = await blobToBase64(currentAudioBlob);
                    if (!base64Audio || base64Audio.length < 100) {
                        console.error("La conversión a Base64 resultó en una cadena vacía o muy corta:", base64Audio ? base64Audio.substring(0,50) + '...' : 'null');
                        throw new Error("Fallo al convertir audio a Base64 o audio demasiado corto.");
                    }
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
        if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop();
        } else {
            statusDiv.textContent = "Nada que detener.";
            stopRecordBtn.disabled = true;
            startRecordBtn.disabled = false;
        }
    }

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
                         return reject(new Error("Fallo al extraer cadena Base64 del resultado del FileReader."));
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
        if (!userApiKey) {
            alert('API Key no configurada.');
            throw new Error('API Key no configurada.');
        }

        // Log del prompt que se envía a Gemini
        if (isTextOnly) {
            console.log("Prompt para Gemini (pulido):", JSON.stringify(promptParts, null, 2));
        } else {
            // Para no llenar la consola con el base64 del audio, solo mostrar la parte de texto
            console.log("Prompt para Gemini (transcripción - parte texto):", JSON.stringify(promptParts[0], null, 2));
        }


        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${userApiKey}`;

        const body = {
            contents: [{
                parts: promptParts
            }],
            generationConfig: {
                temperature: isTextOnly ? 0.1 : 0.7, // Temperatura baja para pulido
            }
        };

        try {
            // console.log("Enviando solicitud a Gemini API...");
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            // console.log(`Respuesta de Gemini API recibida. Estado: ${response.status}`);

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Error API Gemini (datos):', errorData);
                throw new Error(`Error de API Gemini: ${errorData.error?.message || response.statusText} (Código: ${response.status})`);
            }

            const data = await response.json();
            // console.log("Respuesta de Gemini (datos completos):", JSON.stringify(data, null, 2)); // Para depuración detallada

            if (data.candidates && data.candidates.length > 0) {
                if (data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.length > 0) {
                    const textResult = data.candidates[0].content.parts[0].text;
                    // console.log("Texto extraído de la respuesta de Gemini:", textResult);
                    return textResult;
                }
            }
            console.warn("Respuesta inesperada de Gemini o sin texto candidato:", data);
            if(data.promptFeedback && data.promptFeedback.blockReason){
                    throw new Error(`Solicitud bloqueada por Gemini: ${data.promptFeedback.blockReason}. Detalles: ${data.promptFeedback.blockReasonMessage || ''}`);
            }
            if(data.candidates && data.candidates.length > 0 && data.candidates[0].finishReason && data.candidates[0].finishReason !== "STOP") {
                throw new Error(`Gemini finalizó con razón: ${data.candidates[0].finishReason}. Esto puede indicar un problema con el prompt o el contenido.`);
            }
            throw new Error('No se recibió texto válido en la respuesta de Gemini.');

        } catch (error) {
            console.error('Excepción al llamar a Gemini API:', error);
            statusDiv.textContent = `Error con Gemini: ${error.message}`;
            throw error;
        }
    }

    async function transcribeAndPolishAudio(base64Audio) {
        statusDiv.textContent = 'Transcribiendo audio con Gemini...';
        let transcribedText = '';
        try {
            const transcriptPromptParts = [
                { "text": "Transcribe el siguiente audio a texto. Transcribe literalmente las palabras dictadas, incluyendo 'coma', 'punto', 'punto y aparte', 'nueva línea', 'dos puntos', 'punto y coma', 'signo de interrogación', 'signo de exclamación'. No interpretes estas palabras de puntuación todavía, solo transcríbelas tal cual se oyen." },
                {
                    "inline_data": {
                        "mime_type": "audio/webm",
                        "data": base64Audio
                    }
                }
            ];
            transcribedText = await callGeminiAPI(transcriptPromptParts, false);
            originalTextarea.value = "Transcripción original (antes del pulido):\n" + transcribedText;
            console.log("Texto transcrito literalmente (antes de pulir):", JSON.stringify(transcribedText)); // Log de transcripción literal
            statusDiv.textContent = 'Transcripción completada. Puliendo texto...';
        } catch (error) {
            console.error("Error durante la transcripción:", error);
            originalTextarea.value = `Error en transcripción: ${error.message}`;
            polishedTextarea.value = `Error en transcripción: ${error.message}`;
            statusDiv.textContent = 'Error en transcripción.';
            return;
        }

        if (!transcribedText.trim()) {
            polishedTextarea.value = "No se transcribió texto para pulir.";
            statusDiv.textContent = "Proceso completado (sin texto para pulir).";
            return;
        }

        try {
            const polishPromptParts = [
                {
                    "text": `Por favor, revisa y pule el siguiente texto transcrito literalmente. Tu tarea es aplicar la puntuación y formato correctos según las palabras clave dictadas, además de corregir otros errores.
Instrucciones para la puntuación y formato dictados:
1.  Reemplaza las siguientes palabras clave por sus signos/formatos:
    *   'coma': Reemplaza por ', '.
    *   'punto': Reemplaza por '.'. No añadas saltos de línea después de un 'punto' a menos que la siguiente palabra clave sea 'punto y aparte' o 'nueva línea'.
    *   'punto y aparte': Si la palabra 'punto' no precede inmediatamente, reemplaza por '.\\n'. Si 'punto' ya está antes, simplemente añade '\\n' después del punto existente. El resultado final debe ser [texto anterior].\\n[texto siguiente].
    *   'nueva línea': Reemplaza por '\\n'.
    *   'dos puntos': Reemplaza por ': '.
    *   'punto y coma': Reemplaza por '; '.
    *   'signo de interrogación' o 'pregunta': Reemplaza por '?'.
    *   'signo de exclamación' o 'admiración': Reemplaza por '!'.
2.  Asegúrate de que cada '\\n' introducido represente solo un salto a la línea siguiente, sin espacio vertical adicional.
3.  Correcciones Generales: Corrige otros errores gramaticales, de ortografía y puntuación (ej. capitalización al inicio de oración si es necesario).
4.  Mantén el significado original.
5.  Evita reescrituras extensas si no son necesarias.

Texto a pulir:
"${transcribedText}"`
                }
            ];
            let polishedResult = await callGeminiAPI(polishPromptParts, true); 

            // Log ANTES del post-procesamiento
            console.log("Texto de Gemini (ANTES del post-proceso):", JSON.stringify(polishedResult));

            // --- INICIO DEL POST-PROCESAMIENTO AGRESIVO ---
            // Paso 1: Normalizar todos los tipos de saltos de línea a \n
            polishedResult = polishedResult.replace(/\r\n|\r/g, '\n');

            // Paso 2: Reemplazar ". punto y aparte" o ".punto y aparte" (con espacios variables) por ".\\n"
            // Esto es por si Gemini no procesó bien el prompt y dejó "punto y aparte" como texto
            polishedResult = polishedResult.replace(/\.\s*(punto y aparte|Punto y aparte|PUNTO Y APARTE)/gi, '.\n');
            // Y si "punto y aparte" vino solo, también. \b para límite de palabra
            polishedResult = polishedResult.replace(/\b(punto y aparte|Punto y aparte|PUNTO Y APARTE)\b/gi, '\n'); 

            // Paso 3: Colapsar cualquier secuencia de DOS O MÁS saltos de línea en UN SOLO salto de línea.
            // ESTA ES LA REGLA MÁS IMPORTANTE PARA TU CASO.
            polishedResult = polishedResult.replace(/\n{2,}/g, '\n');

            // Paso 4: Eliminar espacios en blanco al inicio de las líneas (después de un \n)
            polishedResult = polishedResult.replace(/\n[ \t]+/g, '\n');

            // Paso 5: Eliminar espacios en blanco al final de las líneas (antes de un \n)
            polishedResult = polishedResult.replace(/[ \t]+\n/g, '\n');

            // Paso 6: Asegurar que no haya múltiples espacios entre palabras
            polishedResult = polishedResult.replace(/ {2,}/g, ' ');

            // Paso 7: Eliminar saltos de línea al principio o final del texto completo, si los hubiera.
            polishedResult = polishedResult.trim();
            
            // Paso 8: Asegurar que un punto seguido de un salto de línea no tenga espacios intermedios.
            polishedResult = polishedResult.replace(/\.\s+\n/g, '.\n');
            // --- FIN DEL POST-PROCESAMIENTO AGRESIVO ---

            // Log DESPUÉS del post-procesamiento
            console.log("Texto final (DESPUÉS del post-proceso):", JSON.stringify(polishedResult)); 

            polishedTextarea.value = polishedResult;
            statusDiv.textContent = 'Proceso de transcripción y pulido completado.';
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
