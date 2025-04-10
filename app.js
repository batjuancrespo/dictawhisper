// Import necessary modules
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, collection, updateDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// Initialize Firebase with config from config.js
import { firebaseConfig, userId } from './config.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Variables globales
let recognition;
let isListening = false;
let customDictionary = [];
let corrections = [];
let lastSentence = '';
let pendingSyncChanges = false;
let textJoinErrorLog = []; // Track spacing errors
let learningEnabled = true; // Enable/disable automatic learning
let learningConfidence = {}; // Track confidence in learned patterns
let patternStats = {}; // Statistical tracking of correction patterns
let userFeedback = []; // Store user feedback on corrections
let lastSpeechTimestamp = 0; // Track last time speech was detected
let silenceTimer = null; // Timer to detect prolonged silence
let reconnectAttempts = 0; // Track reconnection attempts
const MAX_RECONNECT_ATTEMPTS = 5; // Maximum number of reconnection attempts
const SILENCE_THRESHOLD = 10000; // Time in ms to consider as silence (10 seconds)
let speechQualityMetrics = { // Track speech quality metrics
    totalSegments: 0,
    clearedSegments: 0, 
    confidenceScores: [],
    noiseEvents: 0
};
let adaptiveDictionary = {}; // Dictionary that adapts based on user context
let contextualPatterns = []; // Store patterns based on document context

// Inicialización del reconocimiento de voz
function initSpeechRecognition() {
    window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!window.SpeechRecognition) {
        alert("Lo siento, tu navegador no soporta el reconocimiento de voz. Prueba con Chrome o Edge.");
        return false;
    }
    
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'es-ES';
    recognition.maxAlternatives = 3; // Get multiple alternatives for better comparison
    
    // Evento para procesar resultados
    recognition.onresult = handleRecognitionResult;
    
    // Otros eventos de reconocimiento
    recognition.onstart = () => {
        isListening = true;
        updateStatus("Escuchando...", true);
        updateButtons();
        resetSilenceDetection(); // Reset silence detection on start
        reconnectAttempts = 0; // Reset reconnection attempts counter
    };
    
    recognition.onend = () => {
        // Si aún estamos en modo escucha pero ha terminado, reiniciamos
        if (isListening) {
            try {
                if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    reconnectAttempts++;
                    console.log(`Reconexión automática ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
                    updateStatus(`Reconectando... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`, true);
                    
                    // Small increasing delay between reconnection attempts
                    setTimeout(() => {
                        if (isListening) {
                            recognition.start();
                        }
                    }, reconnectAttempts * 300);
                } else {
                    console.warn("Número máximo de reconexiones alcanzado, deteniendo dictado");
                    isListening = false;
                    updateStatus("Dictado detenido por demasiados errores. Inténtelo de nuevo.", false);
                    updateButtons();
                }
            } catch (error) {
                console.error("Error al reiniciar el reconocimiento:", error);
                updateStatus("Error en reconocimiento. Reiniciando...");
            }
        } else {
            updateStatus("Dictado detenido");
            updateButtons();
            clearSilenceDetection(); // Clear silence detection when stopped
        }
    };
    
    recognition.onerror = (event) => {
        console.error("Error en reconocimiento:", event.error, event);
        
        if (event.error === 'network' || event.error === 'service-not-allowed') {
            isListening = false;
            updateStatus("Error en el reconocimiento. Inténtalo de nuevo.");
            updateButtons();
        } else if (event.error === 'no-speech') {
            // No-speech is normal during silence periods
            console.log("No se detectó voz. Continuando la escucha...");
            // Keep the heartbeat working
            resetSilenceDetection();
        } else if (event.error === 'aborted' || event.error === 'audio-capture') {
            updateStatus(`Error en captura de audio. Reconectando...`);
            // Auto-retry for audio capture errors
            setTimeout(() => {
                if (isListening) {
                    try {
                        recognition.start();
                    } catch (e) {
                        console.warn("Error al reconectar después de error de captura:", e);
                    }
                }
            }, 1000);
        } else {
            // Para otros errores menos graves, solo mostramos el mensaje
            updateStatus(`Error temporal: ${event.error}. Continuando...`);
        }
    };
    
    // Add audio level detection if available
    if (recognition.audiostart) {
        recognition.audiostart = () => {
            console.log("Audio detectado");
            resetSilenceDetection();
            updateSpeechQualityMetrics('audioStarted');
        };
    }
    
    // Add additional handlers for better diagnostics
    if (recognition.audioend) {
        recognition.audioend = () => {
            console.log("Audio finalizado");
            updateSpeechQualityMetrics('audioEnded');
        };
    }
    
    if (recognition.soundstart) {
        recognition.soundstart = () => {
            console.log("Sonido detectado");
            updateSpeechQualityMetrics('soundStarted');
        };
    }
    
    if (recognition.soundend) {
        recognition.soundend = () => {
            console.log("Sonido finalizado");
            updateSpeechQualityMetrics('soundEnded');
        };
    }
    
    return true;
}

// Procesar comandos de puntuación
function processPunctuation(text) {
    console.log("Procesando puntuación para:", text);
    
    // Mapear comandos de voz a signos de puntuación
    const punctuationMap = {
        'punto y aparte': '.\n',
        'punto y seguido': '. ',
        'punto': '. ',
        'coma': ',',
        'dos puntos': ':',
        'punto y coma': ';',
        'interrogación': '?',
        'exclamación': '!',
        'abrir paréntesis': '(',
        'cerrar paréntesis': ')',
        'abrir comillas': '"',
        'cerrar comillas': '"',
        'nueva línea': '\n',
        'nueva línea nueva línea': '\n\n',
        'guion': '-',
    };
    
    // Reemplazar comandos con puntuación
    let processedText = text;
    
    // Crear un array ordenado de comandos para procesarlos en orden (primero los más largos)
    const sortedCommands = Object.keys(punctuationMap).sort((a, b) => b.length - a.length);
    
    sortedCommands.forEach(command => {
        // Usar una expresión regular más precisa para detectar la palabra completa
        const regex = new RegExp('\\b' + command + '\\b', 'gi');
        let matchCount = 0;
        processedText = processedText.replace(regex, function(match) {
            matchCount++;
            console.log(`Comando detectado: '${command}' -> reemplazado por '${punctuationMap[command].replace(/\n/g, '\\n')}'`);
            return punctuationMap[command];
        });
        if (matchCount > 0) {
            console.log(`Reemplazado '${command}' ${matchCount} veces con '${punctuationMap[command].replace(/\n/g, '\\n')}'`);
        }
    });
    
    // Verificar saltos de línea en el resultado final
    if (processedText.includes('\n')) {
        console.log("ATENCIÓN: El texto procesado contiene saltos de línea");
        console.log("Representación con escapes:", processedText.replace(/\n/g, '\\n'));
    }
    
    console.log("Texto final procesado:", processedText);
    return processedText;
}

// Procesar los resultados del reconocimiento
function handleRecognitionResult(event) {
    // Reset the silence detection every time we get a result
    resetSilenceDetection();
    lastSpeechTimestamp = Date.now();
    
    let interimTranscript = '';
    let finalTranscript = '';
    let bestConfidence = 0;
    let alternatives = [];
    
    // Obtener resultados
    for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        const confidence = event.results[i][0].confidence;
        console.log("Transcripción original:", transcript, "Confianza:", confidence);
        
        // Collect confidence scores for quality metrics
        updateSpeechQualityMetrics('confidenceScore', confidence);
        
        // Collect alternatives if available
        if (event.results[i].length > 1) {
            for (let j = 1; j < event.results[i].length; j++) {
                alternatives.push({
                    text: event.results[i][j].transcript,
                    confidence: event.results[i][j].confidence
                });
            }
            console.log("Alternativas disponibles:", alternatives);
        }
        
        if (event.results[i].isFinal) {
            finalTranscript += transcript;
            if (confidence > bestConfidence) {
                bestConfidence = confidence;
            }
        } else {
            interimTranscript += transcript;
        }
    }
    
    // Analyze quality and potentially use alternatives if original has low confidence
    if (finalTranscript !== '' && bestConfidence < 0.7 && alternatives.length > 0) {
        console.log("Baja confianza detectada, evaluando alternativas");
        
        // Check alternatives against our dictionaries for better match
        const bestAlternative = selectBestAlternative(finalTranscript, alternatives, customDictionary, adaptiveDictionary);
        if (bestAlternative !== finalTranscript) {
            console.log("Usando alternativa con mejor coincidencia:", bestAlternative);
            finalTranscript = bestAlternative;
        }
    }
    
    // Depuración de transcripción final
    console.log("Transcripción final completa:", finalTranscript);
    
    // Procesar el texto final
    if (finalTranscript !== '') {
        // Procesar comandos de puntuación
        const processedText = processPunctuation(finalTranscript);
        console.log("Texto después de procesamiento de puntuación:", processedText);
        console.log("Representación con escapes:", processedText.replace(/\n/g, '\\n'));
        
        // Aplicar el diccionario personalizado
        const correctedText = applyCustomDictionary(processedText);
        console.log("Texto después de aplicar diccionario:", correctedText);
        console.log("Representación final con escapes:", correctedText.replace(/\n/g, '\\n'));
        
        // Preservar saltos de línea en elemento contenteditable
        const preservedText = correctedText.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
        console.log("Texto con saltos de línea preservados:", preservedText);
        
        // Guardar la última oración para posibles correcciones
        lastSentence = correctedText;
        
        // Obtener el elemento de transcripción y su contenido actual
        const transcriptElement = document.getElementById('transcript');
        console.log("Contenido actual del transcript:", transcriptElement.innerHTML);
        
        // Comprobar si hay texto seleccionado
        const selection = window.getSelection();
        console.log("Selection:", selection);
        console.log("Selection collapsed:", selection.isCollapsed);
        console.log("Selection range count:", selection.rangeCount);
        
        const hasSelection = !selection.isCollapsed && selection.rangeCount > 0 && 
                             selection.getRangeAt(0).intersectsNode(transcriptElement);
        console.log("Has selection:", hasSelection);
        
        // Verificar si el cursor está en el transcriptElement
        let isCursorInTranscript = false;
        let cursorNode = null;
        let cursorOffset = 0;
        
        // Verificar si hay un rango válido antes de intentar acceder
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            cursorNode = range.startContainer;
            cursorOffset = range.startOffset;
            isCursorInTranscript = transcriptElement.contains(range.startContainer);
            console.log("Cursor in transcript:", isCursorInTranscript);
            console.log("Range start container:", range.startContainer);
            console.log("Range start container nodeType:", range.startContainer.nodeType);
            console.log("Range start offset:", range.startOffset);
            console.log("Transcript element contains range start:", transcriptElement.contains(range.startContainer));
        } else {
            console.log("No range available, cursor not in transcript");
        }
        
        if (hasSelection) {
            // Reemplazar el texto seleccionado
            const range = selection.getRangeAt(0);
            range.deleteContents();
            
            // Procesar el texto para asegurar espaciado correcto cuando se reemplaza selección
            const textBefore = getPreviousTextBeforeSelection(transcriptElement, range);
            const textAfter = getTextAfterSelection(transcriptElement, range);
            console.log("Reemplazo de selección - Contexto:", {
                textBefore: textBefore,
                textAfter: textAfter
            });
            
            // Procesar texto para espaciado correcto
            const formattedText = processTextForReplacingSelection(textBefore, correctedText, textAfter);
            
            // Insertar el nuevo texto
            const textNode = document.createTextNode(formattedText);
            range.insertNode(textNode);
            
            // Limpiar la selección y formatear
            selection.removeAllRanges();
            console.log("Reemplazando texto seleccionado con:", formattedText);
        } else if (isCursorInTranscript && selection.rangeCount > 0) {
            // Insertar en la posición del cursor
            const range = selection.getRangeAt(0);
            const cursorPos = range.startOffset;
            const cursorNode = range.startContainer;
            
            console.log("Inserting at cursor position. Node:", cursorNode);
            console.log("Cursor position:", cursorPos);
            console.log("Node content:", cursorNode.textContent || cursorNode.innerHTML);
            
            // Obtener texto antes y después del cursor para análisis detallado
            let textBeforeCursor = '';
            let textAfterCursor = '';
            
            if (cursorNode.nodeType === Node.TEXT_NODE) {
                textBeforeCursor = cursorNode.textContent.substring(0, cursorPos);
                textAfterCursor = cursorNode.textContent.substring(cursorPos);
                console.log("Texto antes del cursor (nodo texto):", textBeforeCursor);
                console.log("Texto después del cursor (nodo texto):", textAfterCursor);
            } else if (cursorNode.childNodes.length > 0) {
                // Si estamos en un elemento con nodos hijo, buscar el texto previo
                textBeforeCursor = getPreviousTextContent(cursorNode, cursorOffset);
                console.log("Texto antes del cursor (elemento con hijos):", textBeforeCursor);
            } else {
                // Obtener todo el texto del elemento hasta el cursor
                textBeforeCursor = getAllTextBeforeCursor(transcriptElement, cursorNode, cursorOffset);
                console.log("Texto antes del cursor (búsqueda completa):", textBeforeCursor);
            }
            
            console.log("Texto completo antes del cursor:", textBeforeCursor);
            
            // Preparar el texto a añadir con espacio si es necesario
            const needSpaceAndFormatting = processTextForInsertion(textBeforeCursor, correctedText);
            const textToAdd = needSpaceAndFormatting.text;
            
            console.log("Inserción con cursor - Texto analizado:", {
                textBeforeCursor,
                textAfterCursor,
                originalToAdd: correctedText,
                textoFinal: textToAdd,
                spaceAdded: needSpaceAndFormatting.spaceAdded,
                capitalized: needSpaceAndFormatting.capitalized
            });
            
            // Eliminar cualquier texto provisional antes
            const cleanHTML = transcriptElement.innerHTML.replace(/<span class="interim">.*?<\/span>/g, '');
            transcriptElement.innerHTML = cleanHTML;
            
            // Restaurar la selección
            selection.removeAllRanges();
            selection.addRange(range);
            
            // Insertar el texto
            document.execCommand('insertText', false, textToAdd);
            
            console.log("Texto después de insertar en cursor:", transcriptElement.innerHTML);
        } else {
            // Añadir al final como antes
            // Obtener el texto completo actual para análisis
            const elementText = transcriptElement.innerText || transcriptElement.textContent || "";
            console.log("Añadiendo al final. Texto existente:", elementText);
            
            // Procesar texto para añadir al final
            const needSpaceAndFormatting = processTextForInsertion(elementText, correctedText);
            const textToAdd = needSpaceAndFormatting.text;
            
            console.log("Añadir al final - Texto analizado:", {
                elementText,
                originalToAdd: correctedText,
                textoFinal: textToAdd,
                spaceAdded: needSpaceAndFormatting.spaceAdded,
                capitalized: needSpaceAndFormatting.capitalized
            });
            
            // Eliminar cualquier texto provisional antes
            const cleanHTML = transcriptElement.innerHTML.replace(/<span class="interim">.*?<\/span>/g, '');
            transcriptElement.innerHTML = cleanHTML;
            
            // Añadir el texto directamente al final
            transcriptElement.innerHTML += textToAdd;

            // Verificar explícitamente si hay nuevas líneas que preservar
            if (textToAdd.includes('\n\n')) {
                console.log("Detectado doble salto de línea en el texto a añadir, asegurando preservación");
                transcriptElement.innerHTML = transcriptElement.innerHTML.replace(/\n\n/g, '<br><br>');
            } else if (textToAdd.includes('\n')) {
                console.log("Detectado salto de línea simple en el texto a añadir, asegurando preservación");
                transcriptElement.innerHTML = transcriptElement.innerHTML.replace(/\n/g, '<br>');
            }

            console.log("Texto después de añadir al final:", transcriptElement.innerHTML);
        }
        
        // Formatear la puntuación y capitalización correctamente
        formatPunctuationAndCapitalization(transcriptElement);
        
        // Mantener el cursor en su posición actual si no se reemplazó texto seleccionado
        if (!hasSelection) {
            // Si el cursor estaba en el elemento, ya está en la posición correcta
            if (!isCursorInTranscript) {
                placeCursorAtEnd(transcriptElement);
            }
        }

        // Reiniciar recognition para evitar duplicación de contenido en pausas largas
        restartRecognition();
    }
    
    // Mostrar resultados intermedios
    if (interimTranscript !== '') {
        const transcriptElement = document.getElementById('transcript');
        
        // Comprobar si hay texto seleccionado
        const selection = window.getSelection();
        const hasSelection = !selection.isCollapsed && selection.rangeCount > 0 && 
                             selection.getRangeAt(0).intersectsNode(transcriptElement);
                             
        if (hasSelection) {
            // No mostrar texto intermedio cuando hay selección
            return;
        }
        
        // Determinar dónde mostrar el texto intermedio
        let isCursorInTranscript = false;
    
        // Verificar si hay un rango válido antes de intentar acceder
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            isCursorInTranscript = transcriptElement.contains(range.startContainer);
            console.log("Interim - Cursor in transcript:", isCursorInTranscript);
        } else {
            console.log("Interim - No range available for cursor position");
            isCursorInTranscript = false;
        }
        
        if (isCursorInTranscript && selection.rangeCount > 0) {
            // Eliminar cualquier texto provisional anterior
            const allInterims = transcriptElement.querySelectorAll('.interim');
            allInterims.forEach(el => el.remove());
            
            // Insertar texto provisional en la posición del cursor
            const interimSpan = document.createElement('span');
            interimSpan.className = 'interim';
            interimSpan.textContent = interimTranscript;
            
            const range = selection.getRangeAt(0);
            range.insertNode(interimSpan);
        } else {
            // Eliminar cualquier texto provisional anterior
            const currentHTML = transcriptElement.innerHTML;
            const cleanHTML = currentHTML.replace(/<span class="interim">.*?<\/span>/g, '');
            
            // Mostrar el texto provisional al final
            transcriptElement.innerHTML = cleanHTML + '<span class="interim">' + interimTranscript + '</span>';
        }
    }
}

// Procesar los resultados del reconocimiento de voz
function applyCustomDictionary(text) {
    console.log("Aplicando diccionario a:", text);
    let correctedText = text;
    
    // Primero, ordenar el diccionario para que las frases más largas se procesen primero
    const sortedDictionary = [...customDictionary].sort((a, b) => 
        b.commonMistake.length - a.commonMistake.length
    );
    
    // Aplicar cada palabra/frase del diccionario personalizado
    sortedDictionary.forEach(entry => {
        // Para frases completas, usar una expresión regular que no requiera límites de palabra
        if (entry.commonMistake.includes(' ')) {
            const phraseRegex = new RegExp(entry.commonMistake.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
            let matchCount = 0;
            correctedText = correctedText.replace(phraseRegex, function() {
                matchCount++;
                return entry.correctWord;
            });
            if (matchCount > 0) {
                console.log(`Reemplazada frase compleja '${entry.commonMistake}' con '${entry.correctWord}' ${matchCount} veces`);
            }
        } else {
            // Para palabras individuales, mantener los límites de palabra
            const wordRegex = new RegExp('\\b' + entry.commonMistake.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b', 'gi');
            let matchCount = 0;
            correctedText = correctedText.replace(wordRegex, function() {
                matchCount++;
                return entry.correctWord;
            });
            if (matchCount > 0) {
                console.log(`Reemplazada palabra '${entry.commonMistake}' con '${entry.correctWord}' ${matchCount} veces`);
            }
        }
    });
    
    console.log("Texto corregido final:", correctedText);
    return correctedText;
}

// Función para corregir texto seleccionado
function correctSelectedText() {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    if (!selectedText) {
        showTempMessage("No hay texto seleccionado para corregir", true);
        return;
    }
    
    // Pedir al usuario la corrección
    const correctedText = prompt(`Ingrese la corrección para: "${selectedText}"`);
    
    if (correctedText === null) {
        // Usuario canceló
        return;
    }
    
    if (correctedText === selectedText) {
        showTempMessage("No se realizaron cambios");
        return;
    }
    
    // Aplicar la corrección al texto
    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(correctedText));
    
    // Limpiar la selección
    selection.removeAllRanges();
    
    // Siempre añadir al diccionario, independientemente de si es una palabra o frase
    addToDictionary(selectedText, correctedText);
    showTempMessage(`Corrección añadida al diccionario: ${selectedText} → ${correctedText}`);
    console.log(`Nueva corrección añadida: "${selectedText}" → "${correctedText}"`);
    
    // Registrar corrección para aprendizaje
    if (learningEnabled) {
        userFeedback.push({
            original: selectedText,
            corrected: correctedText,
            timestamp: Date.now(),
            type: 'manual_correction'
        });
        
        console.log(`Corrección registrada para aprendizaje: "${selectedText}" → "${correctedText}"`);
        
        pendingSyncChanges = true;
        updateSyncStatus("Cambios pendientes...");
    }
    
    // Guardar inmediatamente los cambios
    syncWithExternalDB();
}

// Nueva función para obtener el texto previo incluyendo nodos padres y hermanos
function getPreviousTextContent(node, offset) {
    // Si es un nodo de texto, obtener el texto antes del offset
    if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent.substring(0, offset);
    }
    
    // Si es un elemento, buscar en los hijos
    let textContent = '';
    if (node.childNodes.length > 0) {
        // Recorrer los hijos hasta el offset
        for (let i = 0; i < Math.min(offset, node.childNodes.length); i++) {
            const child = node.childNodes[i];
            if (child.nodeType === Node.TEXT_NODE) {
                textContent += child.textContent;
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                textContent += child.textContent;
            }
        }
    }
    
    // Si no hay texto en los hijos o no hay hijos, buscar en el contenido propio del nodo
    if (!textContent && node.textContent) {
        textContent = node.textContent.substring(0, offset);
    }
    
    return textContent;
}

// Nueva función para calcular el desplazamiento de texto en un elemento
function getTextOffset(rootElement, targetNode, targetOffset) {
    if (!rootElement.contains(targetNode)) {
        return 0;
    }
    
    let offset = 0;
    
    function traverse(node) {
        if (node === targetNode) {
            offset += targetOffset;
            return true;
        }
        
        if (node.nodeType === Node.TEXT_NODE) {
            offset += node.textContent.length;
        } else {
            for (let child of node.childNodes) {
                if (traverse(child)) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    for (let child of rootElement.childNodes) {
        if (traverse(child)) {
            break;
        }
    }
    
    return offset;
}

// Formatear la puntuación y capitalización del texto
function formatPunctuationAndCapitalization(element) {
    let content = element.innerHTML;
    console.log("Formateo de puntuación - HTML original:", content);
    
    // Preservar <br> existentes antes de procesar
    // Reemplazar <br><br> con un marcador especial para preservar su posición
    content = content.replace(/<br><br>/gi, '§DOUBLE_BREAK§');
    // Reemplazar <br> individual con un marcador
    content = content.replace(/<br>/gi, '§SINGLE_BREAK§');
    
    // Detectar saltos de línea en "punto y aparte" que se hayan perdido
    content = content.replace(/\.\s*\n\s*\n/g, '.§DOUBLE_BREAK§');
    content = content.replace(/\.\s*\n/g, '.§SINGLE_BREAK§');
    
    // 1. Corregir espacios alrededor de puntos y comas (no dentro de tags HTML)
    content = content.replace(/(\w)\s+([.,])/g, '$1$2');  // Eliminar espacios antes de punto/coma
    content = content.replace(/([.,])\s*(\w)/g, '$1 $2'); // Asegurar espacio después de punto/coma
    
    // 2. Capitalizar después de punto seguido de espacio
    content = content.replace(/\.(\s+)([a-záéíóúüñ])/gi, function(match, space, letter) {
        return '.' + space + letter.toUpperCase();
    });
    
    // 3. Capitalizar al inicio de cada línea (después de marcadores de salto o al principio)
    content = content.replace(/(^|§DOUBLE_BREAK§|§SINGLE_BREAK§)(\s*)([a-záéíóúüñ])/gi, function(match, lineBreak, space, letter) {
        return lineBreak + space + letter.toUpperCase();
    });
    
    // Restaurar los marcadores a sus respectivos <br>
    content = content.replace(/§DOUBLE_BREAK§/g, '<br><br>');
    content = content.replace(/§SINGLE_BREAK§/g, '<br>');
    
    console.log("Formateo de puntuación - HTML final:", content);
    
    // Aplicar los cambios
    element.innerHTML = content;
}

// Capitalizar correctamente el texto
function capitalizeText(currentText, newText) {
    // Si el texto anterior termina en punto o no hay texto, capitalizar
    if (!currentText || currentText.match(/[.!?]\s*$/)) {
        return currentText + newText.charAt(0).toUpperCase() + newText.slice(1);
    }
    
    // Si el texto anterior no termina con espacio, agregar uno
    if (currentText.length > 0 && !currentText.endsWith(' ')) {
        currentText += ' ';
    }
    
    return currentText + newText;
}

// Posicionar el cursor al final del elemento
function placeCursorAtEnd(element) {
    const range = document.createRange();
    const selection = window.getSelection();
    range.selectNodeContents(element);
    range.collapse(false); // Colapsar al final
    selection.removeAllRanges();
    selection.addRange(range);
    element.focus();
}

// Actualizar botones según el estado
function updateButtons() {
    const startBtn = document.getElementById('startBtn');
    
    // El botón de stop se mantiene oculto ya que usamos el botón de iniciar para ambas funciones
    document.getElementById('stopBtn').style.display = 'none';
}

// Actualizar indicador de estado
function updateStatus(message, listening = false) {
    const statusElement = document.getElementById('status');
    statusElement.textContent = message;
    
    if (listening) {
        statusElement.classList.add('listening');
    } else {
        statusElement.classList.remove('listening');
    }
}

// Iniciar dictado o detener si ya está activo
function startDictation() {
    if (!recognition && !initSpeechRecognition()) {
        return;
    }
    
    try {
        // Si ya está escuchando, detener
        if (isListening) {
            isListening = false;
            recognition.stop();
            clearSilenceDetection(); // Clear the silence detection timer
            updateStatus("Dictado detenido");
            document.getElementById('startBtn').innerHTML = `
                <svg viewBox="0 0 24 24" width="24" height="24">
                    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
                    <circle cx="12" cy="12" r="6" fill="currentColor"/>
                </svg>
                Iniciar Dictado
            `;
        } else {
            // Si no está escuchando, iniciar
            try {
                recognition.start();
                isListening = true;
                lastSpeechTimestamp = Date.now(); // Initialize the timestamp
                resetSilenceDetection(); // Start the silence detection
                reconnectAttempts = 0; // Reset reconnection counter
                document.getElementById('startBtn').innerHTML = `
                    <svg viewBox="0 0 24 24" width="24" height="24">
                        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
                        <rect x="8" y="8" width="8" height="8" fill="currentColor"/>
                    </svg>
                    Detener Dictado
                `;
            } catch (startError) {
                if (startError.name === 'InvalidStateError') {
                    console.log("El reconocimiento ya estaba activo, reiniciando");
                    try {
                        recognition.stop();
                        setTimeout(() => {
                            try {
                                recognition.start();
                                isListening = true;
                                lastSpeechTimestamp = Date.now();
                                resetSilenceDetection();
                                document.getElementById('startBtn').innerHTML = `
                                    <svg viewBox="0 0 24 24" width="24" height="24">
                                        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
                                        <rect x="8" y="8" width="8" height="8" fill="currentColor"/>
                                    </svg>
                                    Detener Dictado
                                `;
                            } catch (retryError) {
                                console.error("Error al reintentar iniciar reconocimiento:", retryError);
                                isListening = false;
                                updateStatus("Error al iniciar. Inténtalo de nuevo.");
                            }
                        }, 300);
                    } catch (stopError) {
                        console.error("Error al detener reconocimiento para reiniciar:", stopError);
                        isListening = false;
                        updateStatus("Error al reiniciar. Inténtalo de nuevo.");
                    }
                } else {
                    throw startError;
                }
            }
        }
        updateButtons();
    } catch (error) {
        console.error("Error al iniciar/detener el dictado:", error);
        isListening = false;
        clearSilenceDetection(); // Make sure to clear timer on error
        updateStatus("Error al iniciar. Inténtalo de nuevo.");
        updateButtons();
    }
}

// Pausar dictado (no utilizado en este caso)
function pauseDictation() {
    if (recognition && isListening) {
        isListening = false;
        recognition.stop();
        updateStatus("Dictado en pausa");
        updateButtons();
    }
}

// Detener dictado (mantenido por compatibilidad)
function stopDictation() {
    if (recognition) {
        isListening = false;
        recognition.stop();
        clearSilenceDetection(); // Clear silence detection when stopping
        updateStatus("Dictado detenido");
        updateButtons();
    }
}

// Gestión del diccionario personalizado
function addToDictionary(commonMistake, correctWord) {
    // Verificar si la entrada ya existe
    const existingIndex = customDictionary.findIndex(
        entry => entry.commonMistake.toLowerCase() === commonMistake.toLowerCase()
    );
    
    // Si existe, actualizar; si no, agregar
    if (existingIndex >= 0) {
        customDictionary[existingIndex].correctWord = correctWord;
    } else {
        customDictionary.push({ commonMistake, correctWord });
    }
    
    // Sincronizar con el almacenamiento
    saveDictionary();
    renderDictionary();
}

// Eliminar palabra del diccionario
function removeFromDictionary(commonMistake) {
    customDictionary = customDictionary.filter(
        entry => entry.commonMistake.toLowerCase() !== commonMistake.toLowerCase()
    );
    
    // Sincronizar con el almacenamiento
    saveDictionary();
    renderDictionary();
}

// Renderizar lista del diccionario
function renderDictionary() {
    const dictionaryList = document.getElementById('dictionaryList');
    dictionaryList.innerHTML = '';
    
    customDictionary.forEach(entry => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${entry.commonMistake} → ${entry.correctWord}</span>
            <button class="remove-word-btn" data-word="${entry.commonMistake}">×</button>
        `;
        dictionaryList.appendChild(li);
    });
    
    // Agregar event listeners para botones de eliminación
    document.querySelectorAll('.remove-word-btn').forEach(button => {
        button.addEventListener('click', function() {
            removeFromDictionary(this.getAttribute('data-word'));
        });
    });
}

// Guardar el diccionario en Firestore
async function saveDictionary() {
    try {
        console.log("Guardando diccionario en Firebase:", customDictionary);
        console.log("Número de entradas a guardar:", customDictionary.length);
        
        await setDoc(doc(db, 'users', userId, 'data', 'dictionary'), {
            dictionary: customDictionary,
            updatedAt: Date.now()
        });
        
        console.log("Diccionario guardado correctamente en Firebase");
        pendingSyncChanges = false; 
        updateSyncStatus("Sincronizado", true);
    } catch (error) {
        console.error('Error al guardar el diccionario:', error);
        alert('Error al guardar el diccionario en Firebase. Detalles en la consola.');
        pendingSyncChanges = true;
        updateSyncStatus("Error al sincronizar");
    }
}

// Cargar el diccionario desde Firestore
async function loadDictionary() {
    try {
        const docRef = doc(db, 'users', userId, 'data', 'dictionary');
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists() && docSnap.data().dictionary) {
            customDictionary = docSnap.data().dictionary;
            renderDictionary();
            console.log("Diccionario cargado desde Firebase:", customDictionary);
            console.log("Número de entradas:", customDictionary.length);
            
            // Validar cada entrada para asegurar que es correcta
            customDictionary = customDictionary.filter(entry => {
                const isValid = entry && entry.commonMistake && entry.correctWord;
                if (!isValid) {
                    console.warn("Entrada inválida en el diccionario:", entry);
                    return false;
                }
                console.log(`- Entrada cargada: "${entry.commonMistake}" → "${entry.correctWord}"`);
                return true;
            });
            
            // Asegurar que la corrección por defecto esté presente
            const hasDefaultCorrection = customDictionary.some(
                entry => entry.commonMistake === "consecuencias potenciadas"
            );
            
            if (!hasDefaultCorrection) {
                console.log("Añadiendo corrección por defecto que faltaba");
                addToDictionary("consecuencias potenciadas", "con secuencias potenciadas");
            }
        } else {
            console.log("No hay diccionario guardado en Firebase para este usuario, inicializando vacío");
            customDictionary = [];
            
            // Añadir corrección por defecto
            addToDictionary("consecuencias potenciadas", "con secuencias potenciadas");
            console.log("Añadida corrección por defecto: 'consecuencias potenciadas' → 'con secuencias potenciadas'");
        }
    } catch (error) {
        console.error('Error al cargar el diccionario:', error);
        alert('Error al cargar el diccionario desde Firebase. Detalles en la consola.');
        
        // Si hay error, inicializar con la corrección por defecto
        customDictionary = [];
        addToDictionary("consecuencias potenciadas", "con secuencias potenciadas");
    }
}

// Guardar el registro de errores en Firestore
async function saveErrorLog() {
    try {
        console.log("Guardando registro de errores en Firebase:", textJoinErrorLog);
        console.log("Número de registros a guardar:", textJoinErrorLog.length);
        
        await setDoc(doc(db, 'users', userId, 'data', 'errorLog'), {
            errorLog: textJoinErrorLog,
            updatedAt: Date.now()
        });
        
        console.log("Registro de errores guardado correctamente en Firebase");
    } catch (error) {
        console.error('Error al guardar el registro de errores:', error);
        alert('Error al guardar el registro de errores en Firebase. Detalles en la consola.');
    }
}

// Cargar registro de errores de Firestore
async function loadErrorLog() {
    try {
        const docRef = doc(db, 'users', userId, 'data', 'errorLog');
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists() && docSnap.data().errorLog) {
            textJoinErrorLog = docSnap.data().errorLog;
            console.log(`Cargados ${textJoinErrorLog.length} registros de errores desde Firebase`);
            console.log("Datos de errores:", textJoinErrorLog);
            
            // Analizar datos al cargar
            if (textJoinErrorLog.length > 5) {
                analyzeSpacingPatterns();
            }
        } else {
            console.log("No hay registro de errores en Firebase para este usuario, inicializando vacío");
            textJoinErrorLog = [];
        }
    } catch (error) {
        console.error('Error al cargar el registro de errores:', error);
        alert('Error al cargar el registro de errores desde Firebase. Detalles en la consola.');
    }
}

// Guardar feedback del usuario en Firestore
async function saveUserFeedback() {
    try {
        console.log("Guardando datos de aprendizaje en Firebase:");
        console.log("- Feedback:", userFeedback.length, "entradas");
        console.log("- Confianza:", Object.keys(learningConfidence).length, "patrones");
        console.log("- Estadísticas:", patternStats);
        console.log("- Diccionario adaptativo:", adaptiveDictionary);
        console.log("- Patrones contextuales:", contextualPatterns);
        console.log("- Métricas de calidad del habla:", speechQualityMetrics);
        
        await setDoc(doc(db, 'users', userId, 'data', 'learning'), {
            userFeedback: userFeedback,
            learningConfidence: learningConfidence,
            patternStats: patternStats,
            adaptiveDictionary: adaptiveDictionary,
            contextualPatterns: contextualPatterns,
            speechQualityMetrics: speechQualityMetrics,
            updatedAt: Date.now()
        });
        
        console.log("Datos de aprendizaje guardados correctamente en Firebase");
    } catch (error) {
        console.error('Error al guardar feedback de usuario:', error);
        alert('Error al guardar el feedback de usuario en Firebase. Detalles en la consola.');
    }
}

// Cargar feedback del usuario desde Firestore
async function loadUserFeedback() {
    try {
        const docRef = doc(db, 'users', userId, 'data', 'learning');
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.userFeedback) {
                userFeedback = data.userFeedback;
                console.log(`Cargados ${userFeedback.length} registros de feedback desde Firebase`);
                console.log("Datos de feedback:", userFeedback);
            } else {
                console.log("No hay datos de feedback en el documento, inicializando vacío");
                userFeedback = [];
            }
            
            if (data.learningConfidence) {
                learningConfidence = data.learningConfidence;
                console.log(`Cargados ${Object.keys(learningConfidence).length} patrones de confianza desde Firebase`);
                console.log("Patrones de confianza:", learningConfidence);
            } else {
                console.log("No hay datos de confianza en el documento, inicializando vacío");
                learningConfidence = {};
            }
            
            if (data.patternStats) {
                patternStats = data.patternStats;
                console.log("Estadísticas de patrones cargadas desde Firebase:", patternStats);
            } else {
                console.log("No hay estadísticas de patrones en el documento, inicializando vacío");
                patternStats = {};
            }
            
            if (data.adaptiveDictionary) {
                adaptiveDictionary = data.adaptiveDictionary;
                console.log(`Cargado diccionario adaptativo con ${Object.keys(adaptiveDictionary).length} entradas`);
            } else {
                console.log("No hay diccionario adaptativo en el documento, inicializando vacío");
                adaptiveDictionary = {};
            }
            
            if (data.contextualPatterns) {
                contextualPatterns = data.contextualPatterns;
                console.log(`Cargados ${contextualPatterns.length} patrones contextuales`);
            } else {
                console.log("No hay patrones contextuales en el documento, inicializando vacío");
                contextualPatterns = [];
            }
            
            if (data.speechQualityMetrics) {
                speechQualityMetrics = data.speechQualityMetrics;
                console.log("Métricas de calidad del habla cargadas");
            } else {
                console.log("No hay métricas de calidad del habla, inicializando");
                speechQualityMetrics = {
                    totalSegments: 0,
                    clearedSegments: 0,
                    confidenceScores: [],
                    noiseEvents: 0
                };
            }
        } else {
            console.log("No hay datos de aprendizaje en Firebase para este usuario, inicializando vacíos");
            userFeedback = [];
            learningConfidence = {};
            patternStats = {};
            adaptiveDictionary = {};
            contextualPatterns = [];
            speechQualityMetrics = {
                totalSegments: 0,
                clearedSegments: 0,
                confidenceScores: [],
                noiseEvents: 0
            };
        }
    } catch (error) {
        console.error('Error al cargar feedback de usuario:', error);
        alert('Error al cargar el feedback de usuario desde Firebase. Detalles en la consola.');
    }
}

// Cargar preferencia de tema
function loadThemePreference() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
        document.getElementById('themeToggle').checked = true;
    }
}

// Cambiar tema claro/oscuro
function toggleTheme() {
    if (document.getElementById('themeToggle').checked) {
        document.body.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
    } else {
        document.body.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
    }
}

// Función para copiar al portapapeles
function copyTranscriptToClipboard() {
    const headerText = document.getElementById('headerText').innerText;
    const transcriptText = document.getElementById('transcript').innerText;
    
    // Combinar el texto del encabezado y la transcripción si hay encabezado
    const textToCopy = headerText ? `${headerText}\n${transcriptText}` : transcriptText;
    
    navigator.clipboard.writeText(textToCopy)
        .then(() => {
            showTempMessage("Texto copiado al portapapeles");
        })
        .catch(err => {
            console.error('Error al copiar texto: ', err);
            showTempMessage("Error al copiar texto", true);
        });
}

// Mostrar mensaje temporal
function showTempMessage(message, isError = false) {
    const container = document.querySelector('.controls');
    const existingMessage = document.querySelector('.temp-message');
    
    if (existingMessage) {
        existingMessage.remove();
    }
    
    const messageElement = document.createElement('div');
    messageElement.className = 'temp-message';
    messageElement.textContent = message;
    
    if (isError) {
        messageElement.style.backgroundColor = 'var(--error-color)';
    }
    
    container.appendChild(messageElement);
    
    setTimeout(() => {
        messageElement.classList.add('fadeout');
        setTimeout(() => messageElement.remove(), 500);
    }, 2000);
}

// Sincronizar con base de datos externa (ahora real con Firebase)
async function syncWithExternalDB() {
    updateSyncStatus("Sincronizando...");
    console.log("Iniciando sincronización con Firebase...");
    
    try {
        // Save all data to Firebase
        await saveDictionary();
        await saveErrorLog();
        await saveUserFeedback();
        
        pendingSyncChanges = false;
        updateSyncStatus("Sincronizado", true);
        console.log("Sincronización completada correctamente");
    } catch (error) {
        console.error('Error al sincronizar con Firebase:', error);
        updateSyncStatus("Error al sincronizar");
        alert('Error de sincronización con Firebase. Detalles en la consola.');
    }
}

// Función para obtener el texto antes de la selección
function getPreviousTextBeforeSelection(container, range) {
    if (!container || !range) return '';
    
    // Clonar el rango para no modificar el original
    const tempRange = range.cloneRange();
    tempRange.setStart(container, 0);
    tempRange.setEnd(range.startContainer, range.startOffset);
    
    return tempRange.toString();
}

// Función para obtener el texto después de la selección
function getTextAfterSelection(container, range) {
    if (!container || !range) return '';
    
    // Clonar el rango para no modificar el original
    const tempRange = range.cloneRange();
    tempRange.setStart(range.endContainer, range.endOffset);
    
    // Encontrar el último nodo de texto en el contenedor
    let lastNode = container;
    while (lastNode.lastChild) {
        lastNode = lastNode.lastChild;
    }
    
    // Establecer el final en el último nodo
    tempRange.setEnd(lastNode, lastNode.length || 0);
    
    return tempRange.toString();
}

// Función para procesar texto para reemplazar selección
function processTextForReplacingSelection(before, text, after) {
    console.log("Procesando texto para reemplazo de selección:", {before, text, after});
    
    // Verificar si el texto anterior termina con espacio
    const endsWithSpace = before.match(/\s$/);
    // Verificar si el texto posterior comienza con espacio
    const startsWithSpace = after.match(/^\s/);
    
    // Ajustar espacios según sea necesario
    let formattedText = text;
    
    // Eliminar espacios al inicio si el texto anterior ya tiene uno
    if (endsWithSpace && formattedText.startsWith(' ')) {
        formattedText = formattedText.trimStart();
    }
    
    // Eliminar espacios al final si el texto posterior ya tiene uno
    if (startsWithSpace && formattedText.endsWith(' ')) {
        formattedText = formattedText.trimEnd();
    }
    
    // Asegurar que haya un espacio entre el texto y lo que sigue si no lo hay
    if (!startsWithSpace && !formattedText.endsWith(' ') && after.length > 0) {
        formattedText += ' ';
    }
    
    // Asegurar que haya un espacio entre el texto anterior y el nuevo si no lo hay
    if (!endsWithSpace && !formattedText.startsWith(' ') && before.length > 0) {
        formattedText = ' ' + formattedText;
    }
    
    console.log("Texto formateado para reemplazo:", formattedText);
    return formattedText;
}

// Función para procesar texto para inserción
function processTextForInsertion(existingText, newText) {
    console.log("Procesando texto para inserción:", {existingText, newText});
    
    // Variables para seguimiento de cambios
    let spaceAdded = false;
    let capitalized = false;
    
    // Verificar si el texto existente termina con espacio
    const endsWithSpace = existingText.match(/\s$/);
    // Verificar si el texto existente termina con puntuación
    const endsWithPunctuation = existingText.match(/[.!?]\s*$/);
    
    // Ajustar espacios y capitalización según sea necesario
    let formattedText = newText;
    
    // Aplicar capitalización después de punto
    if (endsWithPunctuation && formattedText.length > 0) {
        formattedText = formattedText.charAt(0).toUpperCase() + formattedText.slice(1);
        capitalized = true;
    }
    
    // Asegurar espacio al inicio si no lo hay y no es comienzo de texto
    if (!endsWithSpace && existingText.length > 0 && !formattedText.startsWith(' ')) {
        formattedText = ' ' + formattedText;
        spaceAdded = true;
        console.log("Añadido espacio al inicio:", formattedText);
    }
    
    // Registrar esta operación para aprendizaje
    if (spaceAdded || capitalized) {
        textJoinErrorLog.push({
            existingText: existingText.slice(-20), // Últimos 20 caracteres
            newText: newText.slice(0, 20),         // Primeros 20 caracteres
            spaceAdded: spaceAdded,
            capitalized: capitalized,
            timestamp: Date.now()
        });
        
        pendingSyncChanges = true;
        updateSyncStatus("Cambios pendientes...");
    }
    
    console.log("Texto formateado para inserción:", formattedText);
    return {
        text: formattedText,
        spaceAdded: spaceAdded,
        capitalized: capitalized
    };
}

// Función para obtener todo el texto antes del cursor
function getAllTextBeforeCursor(container, cursorNode, cursorOffset) {
    if (!container || !cursorNode) return '';
    
    // Crear un nuevo rango que comience al inicio del contenedor
    const range = document.createRange();
    range.setStart(container, 0);
    
    // Establecer el final en el nodo del cursor
    range.setEnd(cursorNode, cursorOffset);
    
    return range.toString();
}

// Actualizar estado de sincronización
function updateSyncStatus(message, success = false) {
    const statusElement = document.getElementById('syncStatus');
    statusElement.textContent = message;
    
    if (success) {
        statusElement.style.color = 'var(--success-color)';
    } else {
        statusElement.style.color = 'var(--text-color)';
    }
    
    // Update the duplicate element if it exists (for backward compatibility)
    const duplicateElement = document.getElementById('syncStatus-duplicate');
    if (duplicateElement) {
        duplicateElement.textContent = message;
        if (success) {
            duplicateElement.style.color = 'var(--success-color)';
        } else {
            duplicateElement.style.color = 'var(--text-color)';
        }
    }
}

// Reiniciar reconocimiento para evitar duplicación
function restartRecognition() {
    if (recognition && isListening) {
        try {
            recognition.stop();
            // Pequeña pausa antes de reiniciar
            setTimeout(() => {
                if (isListening) {
                    try {
                        recognition.start();
                    } catch (error) {
                        console.error("Error al reiniciar el reconocimiento:", error);
                        if (error.name === 'InvalidStateError') {
                            console.log("Reconocimiento ya estaba iniciado, continuando normalmente");
                        } else {
                            // Solo reiniciar si no es un error de estado inválido
                            setTimeout(() => {
                                if (isListening) recognition.start();
                            }, 300);
                        }
                    }
                }
            }, 200);
        } catch (error) {
            console.error("Error al reiniciar el reconocimiento:", error);
        }
    }
}

// New function to update speech quality metrics
function updateSpeechQualityMetrics(type, value = null) {
    switch(type) {
        case 'confidenceScore':
            speechQualityMetrics.confidenceScores.push(value);
            speechQualityMetrics.totalSegments++;
            if (value > 0.8) {
                speechQualityMetrics.clearedSegments++;
            }
            break;
        case 'noiseEvent':
            speechQualityMetrics.noiseEvents++;
            break;
        case 'audioStarted':
        case 'audioEnded':
        case 'soundStarted':
        case 'soundEnded':
            // Log events for pattern analysis
            console.log(`Speech event: ${type} at ${new Date().toISOString()}`);
            break;
    }
    
    // Analyze metrics periodically to adjust recognition parameters
    if (speechQualityMetrics.totalSegments % 10 === 0) {
        analyzeAndOptimizeSpeechRecognition();
    }
}

// New function to select best alternative based on context and dictionaries
function selectBestAlternative(original, alternatives, dictionary, adaptiveDictionary) {
    // Calculate base scores for each alternative
    const scores = alternatives.map(alt => {
        let score = alt.confidence;
        
        // Boost score if words match our dictionaries
        for (const entry of dictionary) {
            if (alt.text.includes(entry.correctWord)) {
                score += 0.1;
            }
        }
        
        // Check against adaptive dictionary
        for (const [key, value] of Object.entries(adaptiveDictionary)) {
            if (alt.text.includes(key)) {
                score += value.confidence * 0.1;
            }
        }
        
        // Consider context from recent text
        const transcriptElement = document.getElementById('transcript');
        const recentText = transcriptElement.innerText.slice(-100);
        
        // Check for topical consistency
        const topics = extractTopics(recentText);
        for (const topic of topics) {
            if (alt.text.includes(topic)) {
                score += 0.05;
            }
        }
        
        return { text: alt.text, score };
    });
    
    // Find alternative with highest score
    scores.push({ text: original, score: 1.0 }); // Include original for comparison
    const bestMatch = scores.reduce((prev, current) => 
        (current.score > prev.score) ? current : prev, { text: original, score: 0 });
    
    return bestMatch.text;
}

// Extract potential topics from text
function extractTopics(text) {
    // Simple implementation - extract nouns and multi-word terms
    const words = text.toLowerCase().split(/\s+/);
    const topics = [];
    
    // Extract single words that might be important (nouns)
    for (let word of words) {
        word = word.replace(/[.,;:!?]/g, '').trim();
        if (word.length > 4 && !['pero', 'como', 'para', 'aunque', 'cuando'].includes(word)) {
            topics.push(word);
        }
    }
    
    // Look for repeated word combinations that might be important terms
    for (let i = 0; i < words.length - 1; i++) {
        const bigram = `${words[i]} ${words[i+1]}`.replace(/[.,;:!?]/g, '').trim();
        if (bigram.length > 6) {
            topics.push(bigram);
        }
    }
    
    return [...new Set(topics)]; // Return unique topics
}

// New function to analyze and optimize speech recognition
function analyzeAndOptimizeSpeechRecognition() {
    if (speechQualityMetrics.totalSegments < 10) return; // Need enough data
    
    // Calculate average confidence
    const avgConfidence = speechQualityMetrics.confidenceScores.reduce((a, b) => a + b, 0) / 
                          speechQualityMetrics.confidenceScores.length;
    
    // Calculate clear speech percentage
    const clearPercentage = (speechQualityMetrics.clearedSegments / speechQualityMetrics.totalSegments) * 100;
    
    console.log(`Métricas de calidad del habla: Confianza promedio ${avgConfidence.toFixed(2)}, 
                Claridad ${clearPercentage.toFixed(1)}%, Eventos de ruido ${speechQualityMetrics.noiseEvents}`);
    
    // Make recommendations or adjustments
    if (avgConfidence < 0.6 || clearPercentage < 70) {
        console.log("Calidad del habla subóptima detectada");
        
        // Show suggestions to user
        if (speechQualityMetrics.noiseEvents > 5) {
            showTempMessage("Recomendación: Reduce el ruido ambiental para mejorar el reconocimiento", false);
        } else if (avgConfidence < 0.5) {
            showTempMessage("Recomendación: Habla más claramente y a ritmo constante", false);
        }
        
        // Could dynamically adjust recognition parameters here if API allowed
    }
    
    // Update learning system with this data
    updateLearningSystem({
        avgConfidence,
        clearPercentage,
        noiseEvents: speechQualityMetrics.noiseEvents,
        timestamp: Date.now()
    });
}

// Enhanced learning system
function updateLearningSystem(metrics) {
    // Store performance metrics
    if (!patternStats.performance) {
        patternStats.performance = [];
    }
    patternStats.performance.push(metrics);
    
    // Analyze user corrections to find patterns
    if (userFeedback.length > 5) {
        // Find commonly corrected patterns
        const correctionPatterns = findCorrectionPatterns(userFeedback);
        
        // Update adaptive dictionary based on patterns
        for (const pattern of correctionPatterns) {
            if (!adaptiveDictionary[pattern.from]) {
                adaptiveDictionary[pattern.from] = {
                    to: pattern.to,
                    confidence: 0.5,
                    occurrences: 1
                };
            } else {
                adaptiveDictionary[pattern.from].occurrences++;
                // Increase confidence with repeated corrections
                adaptiveDictionary[pattern.from].confidence = 
                    Math.min(0.9, adaptiveDictionary[pattern.from].confidence + 0.1);
            }
        }
        
        console.log("Diccionario adaptativo actualizado:", adaptiveDictionary);
        
        // Analyze document context to improve future recognition
        analyzeDocumentContext();
    }
    
    // Flag for sync
    pendingSyncChanges = true;
}

// Find patterns in user corrections
function findCorrectionPatterns(feedback) {
    const patterns = [];
    
    // Group similar corrections
    const groupedCorrections = {};
    
    for (const item of feedback) {
        if (!item.original || !item.corrected) continue;
        
        const key = `${item.original.toLowerCase()} -> ${item.corrected.toLowerCase()}`;
        
        if (!groupedCorrections[key]) {
            groupedCorrections[key] = 1;
        } else {
            groupedCorrections[key]++;
        }
    }
    
    // Extract patterns with multiple occurrences
    for (const [key, count] of Object.entries(groupedCorrections)) {
        if (count >= 2) { // Pattern must appear at least twice
            const [from, to] = key.split(' -> ');
            patterns.push({ from, to, count });
        }
    }
    
    return patterns;
}

// Analyze document context for better recognition
function analyzeDocumentContext() {
    const transcriptElement = document.getElementById('transcript');
    const headerElement = document.getElementById('headerText');
    
    const fullText = `${headerElement.innerText} ${transcriptElement.innerText}`;
    
    // Extract key terms and topic indicators
    const topics = extractTopics(fullText);
    const medicalTerms = extractMedicalTerms(fullText);
    
    contextualPatterns = [...topics, ...medicalTerms];
    console.log("Contexto del documento analizado:", contextualPatterns);
    
    // This context can be used to improve recognition accuracy
}

// Extract medical terms based on common prefixes/suffixes
function extractMedicalTerms(text) {
    const medicalTerms = [];
    const words = text.toLowerCase().split(/\s+/);
    
    // Common medical prefixes and suffixes
    const medicalPrefixes = ['cardio', 'neuro', 'gastro', 'hepato', 'nefro', 'dermato'];
    const medicalSuffixes = ['itis', 'osis', 'oma', 'patía', 'algia', 'ectomía'];
    
    for (let word of words) {
        word = word.replace(/[.,;:!?]/g, '').trim();
        
        // Check for medical prefixes
        if (medicalPrefixes.some(prefix => word.startsWith(prefix))) {
            medicalTerms.push(word);
        }
        
        // Check for medical suffixes
        if (medicalSuffixes.some(suffix => word.endsWith(suffix))) {
            medicalTerms.push(word);
        }
    }
    
    return [...new Set(medicalTerms)]; // Return unique terms
}

// Reset the silence detection timer
function resetSilenceDetection() {
    // Clear any existing timer
    clearSilenceDetection();
    
    // Set a new timer to detect silence
    silenceTimer = setTimeout(() => {
        console.warn("Silencio prolongado detectado, comprobando estado del reconocedor...");
        
        // Update status to inform user
        updateStatus("Verificando conexión de audio...", true);
        
        // If we're still supposed to be listening but haven't had speech for a while
        if (isListening) {
            // Check how long since last speech
            const timeSinceLastSpeech = Date.now() - lastSpeechTimestamp;
            
            if (timeSinceLastSpeech > SILENCE_THRESHOLD) {
                console.warn(`Sin audio detectado durante ${Math.round(timeSinceLastSpeech/1000)} segundos, reiniciando reconocimiento...`);
                
                // Force a restart of the recognition
                try {
                    recognition.stop();
                    updateStatus("Reconectando servicio de dictado...", true);
                    
                    // Short delay before restart
                    setTimeout(() => {
                        if (isListening) {
                            try {
                                recognition.start();
                                updateStatus("Reconexión completada, continúe dictando", true);
                            } catch (e) {
                                console.error("Error al reiniciar tras silencio:", e);
                                updateStatus("Error al reconectar. Intente de nuevo.");
                            }
                        }
                    }, 500);
                } catch (e) {
                    console.error("Error al detener reconocimiento para reinicio:", e);
                }
            } else {
                // If silence hasn't reached threshold yet, just reset the timer
                resetSilenceDetection();
            }
        }
    }, SILENCE_THRESHOLD);
}

// Clear the silence detection timer
function clearSilenceDetection() {
    if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
    }
}

// Event listeners al cargar la página
document.addEventListener('DOMContentLoaded', () => {
    console.log("Iniciando aplicación de dictado...");
    
    // Inicializar reconocimiento de voz
    initSpeechRecognition();
    
    // Cargar datos en orden específico para asegurar dependencias
    Promise.all([
        loadDictionary(),
        loadErrorLog(),
        loadUserFeedback()
    ]).then(() => {
        console.log("Todos los datos cargados correctamente desde Firebase");
        console.log("Diccionario final cargado:", customDictionary);
        
        // Verificar explícitamente la corrección de "consecuencias potenciadas"
        const hasDefaultCorrection = customDictionary.some(
            entry => entry.commonMistake === "consecuencias potenciadas"
        );
        
        if (!hasDefaultCorrection) {
            console.warn("¡Alerta! La corrección por defecto no está presente después de cargar datos");
            addToDictionary("consecuencias potenciadas", "con secuencias potenciadas");
            console.log("Añadida corrección por defecto nuevamente");
        }
    }).catch(error => {
        console.error("Error al cargar datos:", error);
    });
    
    // Cargar preferencia de tema
    loadThemePreference();
    
    // Añadir listener para teclas de acceso rápido (Shift+Meta+Shift)
    document.addEventListener('keydown', function(event) {
        if (event.shiftKey && event.metaKey && event.key === 'Shift') {
            event.preventDefault();
            document.getElementById('startBtn').click();
        }
    });
    
    // Event listeners para botones
    document.getElementById('startBtn').addEventListener('click', startDictation);
    document.getElementById('stopBtn').addEventListener('click', stopDictation); // Keep for backward compatibility
    document.getElementById('copyBtn').addEventListener('click', copyTranscriptToClipboard);
    document.getElementById('correctionBtn').addEventListener('click', correctSelectedText);
    document.getElementById('themeToggle').addEventListener('change', toggleTheme);
    
    // Event listeners para botones de encabezado
    document.querySelectorAll('.header-btn-red, .header-btn-yellow, .header-btn-blue').forEach(button => {
        button.addEventListener('click', function() {
            const headerText = this.getAttribute('data-header');
            document.getElementById('headerText').textContent = headerText;
        });
    });
    
    // Event listener para botón de limpiar encabezado
    document.getElementById('clearHeaderBtn').addEventListener('click', function() {
        document.getElementById('headerText').textContent = '';
    });
    
    console.log("Componentes inicializados correctamente");
    
    // Simular sincronización periódica - ahora real con Firebase
    setInterval(() => {
        if (pendingSyncChanges) {
            console.log("Detectados cambios pendientes, iniciando sincronización automática");
            syncWithExternalDB();
        }
    }, 60000); // Cada minuto
});
