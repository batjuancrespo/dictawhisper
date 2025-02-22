// Firebase configuration at the top of the file
const firebaseConfig = {
  apiKey: "AIzaSyA_VQH1y-px8-QF3gMw3VOPjiiU1OefDBo",
  authDomain: "almacena-correcciones-dictado.firebaseapp.com",
  projectId: "almacena-correcciones-dictado",
  storageBucket: "almacena-correcciones-dictado.appspot.com",
  messagingSenderId: "209194920272",
  appId: "1:209194920272:web:ccbec69d0a5aa88789e455",
  measurementId: "G-6PQSKYMDP0"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
console.log("Firebase initialized successfully");

// Store corrections map
let corrections = new Map();

document.addEventListener('DOMContentLoaded', async () => {
  const recordButton = document.getElementById('recordButton');
  const correctButton = document.getElementById('correctButton');
  const statusElement = document.getElementById('status');
  const loadingElement = document.getElementById('loading');
  const transcriptionElement = document.getElementById('transcription');
  const copyButton = document.getElementById('copyButton');
  const themeSwitch = document.getElementById('themeSwitch');
  let selectedButton = null; // To track the currently selected button
  const saveAudioButton = document.createElement('button'); // Create Save Audio button

  // Function to handle side button clicks
  function handleSideButtonClick(event) {
    const button = event.target;
    const text = button.dataset.text;

    // If a button is already selected, clear its style
    if (selectedButton) {
      selectedButton.classList.remove('selected');
    }

    // If the clicked button was already selected, clear the transcription text
    if (selectedButton === button) {
      transcriptionElement.textContent = '';
      selectedButton = null;
    } else {
      // Otherwise, update the selected button and transcription text
      selectedButton = button;
      selectedButton.classList.add('selected');
      transcriptionElement.textContent = text;
    }
  }

  // Add click listeners to side buttons
  const sideButtons = document.querySelectorAll('.side-button');
  sideButtons.forEach(button => {
    button.addEventListener('click', handleSideButtonClick);
  });

  // Theme Switch Logic
  themeSwitch.addEventListener('change', (e) => {
    document.body.classList.toggle('night-theme', e.target.checked);
  });

  let mediaRecorder;
  let audioChunks = [];
  let isRecording = false;
  let recordingStartTime;
  let timerInterval;
  const chunkDuration = 30 * 1000;
  const overlapDuration = 2 * 1000;
  let combinedTranscription = '';
  let chunkCount = 0;
  let previousTranscription = '';
  let totalAudioBlob; // To store the complete audio blob

  const API_URL = 'https://api-inference.huggingface.co/models/openai/whisper-large-v3-turbo?language=spanish';
  const API_KEY = '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';

  // Load existing corrections from Firebase
  try {
    const snapshot = await db.collection('corrections').get();
    console.log("Successfully loaded corrections from Firebase");
    snapshot.forEach(doc => {
      const data = doc.data();
      corrections.set(data.original.toLowerCase(), data.correction);
    });
    console.log(`Loaded ${corrections.size} corrections from database`);
  } catch (error) {
    console.error("Error loading corrections:", error);
  }

  correctButton.addEventListener('click', async () => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    if (!selectedText) {
      alert('Por favor, seleccione el texto que desea corregir');
      return;
    }

    const correction = prompt('¿Cuál es la corrección para "' + selectedText + '"?');
    if (!correction) return;

    try {
      // Store in Firebase
      await db.collection('corrections').add({
        original: selectedText,
        correction: correction,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });

      console.log(`Stored correction in Firebase: "${selectedText}" -> "${correction}"`);

      // Update local corrections map
      corrections.set(selectedText.toLowerCase(), correction);

      // Apply correction to selected text
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(correction));

      // Clear selection
      selection.removeAllRanges();
    } catch (error) {
      console.error("Error storing correction:", error);
      alert('Error al guardar la corrección');
    }
  });

  recordButton.addEventListener('click', () => {
    if (!isRecording) {
      startRecording();
    } else {
      stopRecording();
    }
  });

  copyButton.addEventListener('click', () => {
    const textToCopy = transcriptionElement.textContent;

    if (!textToCopy) {
      alert('No hay texto para copiar.');
      return;
    }

    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        statusElement.textContent = 'Texto copiado al portapapeles.';
        setTimeout(() => {
          statusElement.textContent = 'Listo.'; // Revert status message after a delay
        }, 2000); // Clear message after 2 seconds
      })
      .catch(err => {
        console.error('Error al copiar el texto: ', err);
        statusElement.textContent = 'Error al copiar el texto al portapapeles.';
      });
  });

  // Save Audio Button functionality
  saveAudioButton.textContent = '💾 Guardar Audio'; 
  saveAudioButton.id = 'saveAudioButton';
  saveAudioButton.addEventListener('click', saveAudio);
  copyButton.parentNode.insertBefore(saveAudioButton, copyButton.nextSibling); // Insert after copyButton

  function saveAudio() {
    if (!totalAudioBlob) {
      alert('No hay audio grabado para guardar.');
      return;
    }

    const url = URL.createObjectURL(totalAudioBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'grabacion_audio.wav'; // Suggest a filename
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    statusElement.textContent = 'Audio guardado.';
    setTimeout(() => {
      statusElement.textContent = 'Listo.';
    }, 2000);
  }

  function updateTimer() {
    // Removed
  }

  async function startRecording() {
    if (isRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      chunkCount = 0;
      previousTranscription = '';
      combinedTranscription = '';

      mediaRecorder.ondataavailable = event => {
        audioChunks.push(event.data);
      };

      mediaRecorder.onstart = () => {
        isRecording = true;
        recordButton.textContent = 'Detener';
        statusElement.textContent = 'Grabando...';
        recordingStartTime = Date.now();
        recordButton.classList.add('recording'); // Add class to indicate recording
      };

      mediaRecorder.onstop = async () => {
        isRecording = false;
        statusElement.textContent = 'Procesando grabación...';

        const existingText = transcriptionElement.textContent;
        totalAudioBlob = new Blob(audioChunks, { type: 'audio/wav' }); // Store the complete audio blob
        await processAndTranscribeChunks(existingText);

        stream.getTracks().forEach(track => track.stop());
        audioChunks = [];
        statusElement.textContent = 'Grabación finalizada.';
        recordingStartTime = null;
        recordButton.classList.remove('recording'); // Remove class when stopped
      };

      mediaRecorder.start();
      mediaRecorder.dispatchEvent(new Event('start'));

    } catch (error) {
      console.error('Error al iniciar la grabación:', error);
      statusElement.textContent = 'Error al iniciar la grabación de audio.';
      isRecording = false;
      recordButton.textContent = 'Grabar';
      recordButton.classList.remove('recording'); // Ensure class is removed in case of error
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      recordButton.textContent = 'Grabar';
      statusElement.textContent = 'Deteniendo grabación...';
      mediaRecorder.stop();
    }
  }

  async function processAndTranscribeChunks(existingText = '') {
    totalAudioBlob = new Blob(audioChunks, { type: 'audio/wav' }); // Ensure totalAudioBlob is set here as well
    const audioBuffer = await totalAudioBlob.arrayBuffer();
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const audioData = await audioContext.decodeAudioData(audioBuffer);
    const totalDuration = audioData.duration;
    let startTime = 0;
    let allChunks = [];

    // Get selection/cursor info before processing
    const selection = window.getSelection();
    let selectionStart, selectionEnd, textBeforeSelection, textAfterSelection;

    if (selection.type === 'Range') {
      // Handle selected text case
      const selectedText = selection.toString();
      selectionStart = transcriptionElement.textContent.indexOf(selectedText);
      selectionEnd = selectionStart + selectedText.length;
    } else if (selection.type === 'Caret') {
      // Handle cursor position case
      const range = selection.getRangeAt(0);
      selectionStart = selectionEnd = getTextOffset(transcriptionElement, range.startContainer, range.startOffset);
    }

    textBeforeSelection = transcriptionElement.textContent.substring(0, selectionStart || 0);
    textAfterSelection = transcriptionElement.textContent.substring(selectionEnd || transcriptionElement.textContent.length);

    // Process audio chunks as before
    for (let i = 0; startTime < totalDuration; i++) { // Modified loop to use index i
      const chunkStartTime = Math.max(0, startTime - (overlapDuration / 1000));
      const chunkEndTime = Math.min(totalDuration, startTime + (chunkDuration / 1000));
      const chunkLength = chunkEndTime - chunkStartTime;

      console.log(`Generando chunk desde ${chunkStartTime} hasta ${chunkEndTime}, duración ${chunkLength} segundos.`);

      const chunkBuffer = audioContext.createBuffer(audioData.numberOfChannels, audioContext.sampleRate * chunkLength, audioContext.sampleRate);
      for (let channel = 0; channel < audioData.numberOfChannels; channel++) {
        const sourceData = audioData.getChannelData(channel);
        const targetData = chunkBuffer.getChannelData(channel);
        const startSample = Math.round(chunkStartTime * audioContext.sampleRate);
        for (let j = 0; j < targetData.length; j++) { // Corrected variable name to j
          targetData[j] = sourceData[startSample + j] || 0; // Corrected variable name to j
        }
      }

      const chunkBlob = await audioBufferToWav(chunkBuffer);
      const chunkText = await transcribeChunk(chunkBlob, i + 1); // Pass chunk index for logging
      allChunks.push(chunkText);
      startTime += (chunkDuration / 1000) - (overlapDuration / 1000);
      await delay(1000); // Introduce 1 second delay between chunks
    }

    console.log("\n=== PROCESAMIENTO FINAL DE CHUNKS ===");
    let finalText = allChunks[0];
    console.log("Texto inicial:", finalText);

    for (let i = 1; i < allChunks.length; i++) {
      const prevChunk = allChunks[i - 1];
      const currentChunk = allChunks[i];

      console.log(`\n=== Procesando overlap entre chunk ${i - 1} y chunk ${i} ===`);
      console.log("Chunk anterior:", prevChunk);
      console.log("Chunk actual:", currentChunk);

      const overlapResult = findCharacterOverlap(prevChunk, currentChunk);

      if (overlapResult.overlap) {
        console.log(`Overlap encontrado: "${overlapResult.overlap}"`);
        finalText = finalText.slice(0, finalText.lastIndexOf(overlapResult.overlap)) + currentChunk;
      } else {
        console.log("No se encontró overlap - añadiendo texto completo");
        finalText += " " + currentChunk;
      }

      console.log("Texto combinado actual:", finalText);
    }

    console.log("\n=== PROCESAMIENTO FINAL DEL TEXTO ===");
    console.log("Texto antes de procesamiento:", finalText);
    const processedText = processTranscribedText(finalText);
    console.log("Texto después de procesamiento:", processedText);

    let newText = processedText;

    // Handle text insertion/replacement
    if (selectionStart !== undefined) {
      // Get more context from the previous text
      const previousContext = textBeforeSelection.slice(-3); // Get last 3 characters for better context

      // Determine if we need spaces around the new text
      const needSpaceBefore = textBeforeSelection &&
        !textBeforeSelection.endsWith(' ') &&
        !textBeforeSelection.endsWith('\n');
      const needSpaceAfter = textAfterSelection &&
        !textAfterSelection.startsWith(' ') &&
        !textAfterSelection.startsWith('\n');

      // Enhanced capitalization check
      const shouldCapitalize = !textBeforeSelection ||
        /[.!?]\s*$/.test(previousContext) ||
        textBeforeSelection.endsWith('\n');

      if (shouldCapitalize) {
        newText = newText.charAt(0).toUpperCase() + newText.slice(1);
      } else {
        newText = newText.charAt(0).toLowerCase() + newText.slice(1);
      }

      // Combine text with appropriate spacing
      newText = textBeforeSelection +
        (needSpaceBefore ? ' ' : '') +
        newText +
        (needSpaceAfter ? ' ' : '') +
        textAfterSelection;
    }
    // If no selection/cursor position, append to existing text
    else {
      if (existingText) {
        const needSpace = !existingText.endsWith(' ') &&
          !existingText.endsWith('.') &&
          !existingText.endsWith('\n');

        // Check if the new text should start with a capital letter
        const lastThreeChars = existingText.slice(-3);
        const shouldCapitalize = /[.!?]\s*$/.test(lastThreeChars) ||
          existingText.endsWith('\n') ||
          !existingText.trim();

        if (shouldCapitalize) {
          newText = newText.charAt(0).toUpperCase() + newText.slice(1);
        } else {
          newText = newText.charAt(0).toLowerCase() + newText.slice(1);
        }

        newText = existingText + (needSpace ? ' ' : '') + newText;
      }
    }

    // Asegurarnos de que no empieza con punto
    newText = newText.replace(/^\.?\s*/, '');

    // Apply punctuation correction after text insertion
    newText = correctPunctuation(newText);
    transcriptionElement.textContent = newText;

    // Clear selection after replacing text
    if (selection.removeAllRanges) {
      selection.removeAllRanges();
    }
  }

  // Delay function
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function transcribeChunk(audioBlob, chunkIndex) {
    // Modify the existing transcribeChunk function to apply corrections
    const originalTranscribeChunk = async (audioBlob, chunkIndex) => { // Added chunkIndex
      loadingElement.classList.remove('hidden');
      statusElement.textContent = `Transcribiendo fragmento de audio ${chunkIndex}...`; // Use chunkIndex in status message
      chunkCount++;

      try {
        const response = await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'audio/wav'
          },
          body: audioBlob
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Error en la transcripción: ${response.status} ${errorText}`);
        }

        const result = await response.json();
        const rawText = result.text || 'No se detectó texto en el audio';
        console.log(`=== TRANSCRIPCIÓN CHUNK ${chunkIndex} ===`); // Use chunkIndex in log
        console.log("Texto raw:", rawText);

        return rawText;

      } catch (error) {
        console.error(`Error en la transcripción del chunk ${chunkIndex}:`, error); // Use chunkIndex in error log
        statusElement.textContent = `Error en la transcripción: ${error.message}`;
        return 'Error en la transcripción';
      } finally {
        loadingElement.classList.add('hidden');
        statusElement.textContent = 'Listo.';
      }
    };

    let text = await originalTranscribeChunk(audioBlob, chunkIndex); // Pass chunkIndex to originalTranscribeChunk

    // Apply corrections
    for (const [original, correction] of corrections) {
      const regex = new RegExp('\\b' + original + '\\b', 'gi');
      text = text.replace(regex, correction);
    }

    return text;
  }

  function audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;

    const dataLength = buffer.length * blockAlign;
    const bufferLength = 44 + dataLength;

    const arrayBuffer = new ArrayBuffer(bufferLength);
    const view = new DataView(arrayBuffer);

    // RIFF identifier
    writeString(view, 0, 'RIFF');
    // file length minus RIFF identifier length and file description length
    view.setUint32(4, bufferLength - 8, true);
    // RIFF type
    writeString(view, 8, 'WAVE');
    // format chunk identifier
    writeString(view, 12, 'fmt ');
    // format chunk length
    view.setUint32(16, 16, true);
    // sample format (raw)
    view.setUint16(20, format, true);
    // channel count
    view.setUint16(22, numChannels, true);
    // sample rate
    view.setUint32(24, sampleRate, true);
    // byte rate (sample rate * block align)
    view.setUint32(28, sampleRate * blockAlign, true);
    // block align (channel count * bytes per sample)
    view.setUint16(32, blockAlign, true);
    // bits per sample
    view.setUint16(34, bitDepth, true);
    // data chunk identifier
    writeString(view, 36, 'data');
    // data chunk length
    view.setUint32(40, dataLength, true);

    // write the PCM samples
    const offset = 44;
    const channels = [];
    for (let i = 0; i < numChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < numChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, channels[channel][i]));
        const value = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset + (i * blockAlign) + (channel * bytesPerSample), value, true);
      }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  function findCharacterOverlap(s1, s2) {
    if (!s1 || !s2) return { overlap: '', startIndexPrevious: -1, endIndexPrevious: -1, startIndexNew: -1, endIndexNew: -1 };

    const minOverlap = 10;
    const maxOverlap = 40;

    console.log("=== BÚSQUEDA DE OVERLAP ===");
    console.log("Texto anterior:", s1);
    console.log("Texto nuevo:", s2);

    let bestOverlap = '';
    let bestStartIndexPrevious = -1;
    let bestEndIndexPrevious = -1;
    let bestStartIndexNew = -1;
    let bestEndIndexNew = -1;

    for (let i = 0; i < s1.length - minOverlap; i++) {
      for (let len = maxOverlap; len >= minOverlap; len--) {
        if (i + len > s1.length) continue;

        const substr = s1.substring(i, i + len);
        const indexInNew = s2.indexOf(substr);

        if (indexInNew !== -1 && len > bestOverlap.length) {
          bestOverlap = substr;
          bestStartIndexPrevious = i;
          bestEndIndexPrevious = i + len;
          bestStartIndexNew = indexInNew;
          bestEndIndexNew = indexInNew + len;
          console.log(`Overlap encontrado: "${bestOverlap}" (longitud: ${bestOverlap.length})`);
        }
      }
    }

    if (bestOverlap.length >= minOverlap) {
      console.log("=== OVERLAP DETECTADO ===");
      console.log(`Overlap: "${bestOverlap}"`);
      console.log(`Posición en texto anterior: ${bestStartIndexPrevious} - ${bestEndIndexPrevious}`);
      console.log(`Posición en texto nuevo: ${bestStartIndexNew} - ${bestEndIndexNew}`);
      return {
        overlap: bestOverlap,
        startIndexPrevious: bestStartIndexPrevious,
        endIndexPrevious: bestEndIndexPrevious,
        startIndexNew: bestStartIndexNew,
        endIndexNew: bestEndIndexNew
      };
    }

    console.log("No se encontró overlap significativo");
    return { overlap: '', startIndexPrevious: -1, endIndexPrevious: -1, startIndexNew: -1, endIndexNew: -1 };
  }

  function processTranscribedText(text) {
    console.log("=== PROCESAMIENTO DE TEXTO ===");
    console.log("Texto original:", text);

    let processed = text.toLowerCase();
    console.log("Paso 1 - Texto en minúsculas:", processed);

    processed = processed.replace(/(\d),(\d)/g, '$1__COMMA__$2');
    processed = processed.replace(/[.,¿?¡!]/g, '');
    processed = processed.replace(/__COMMA__/g, ',');
    console.log("Paso 2 - Después de procesar puntos, comas y signos de interrogación/exclamación:", processed);

    processed = processed.replace(/\s+/g, ' ').trim();
    console.log("Paso 3 - Después de eliminar espacios:", processed);

    processed = processed.replace(/^punto y aparte\s*/i, '.\n');
    processed = processed.replace(/\s+punto y aparte$/i, '.\n');
    processed = processed.replace(/\s+punto y aparte\s+/g, '.\n');
    console.log("Paso 4 - Después de procesar punto y aparte:", processed);

    processed = processed.replace(/^punto y seguido\s*/i, '. ');
    processed = processed.replace(/\s+punto y seguido$/i, '.');
    processed = processed.replace(/\s+punto y seguido\s+/g, '. ');
    processed = processed.replace(/^punto\s+/g, '. ');
    processed = processed.replace(/\s+punto\s+/g, '. ');
    processed = processed.replace(/\s+punto$/, '.');
    console.log("Paso 5 - Después de procesar punto:", processed);

    processed = processed.replace(/^coma\s*/g, ', ');
    processed = processed.replace(/\s+coma$/g, ',');
    processed = processed.replace(/\s+coma\s+/g, ', ');
    console.log("Paso 6 - Después de procesar coma:", processed);

    processed = processed.split('\n').map(paragraph => {
      return paragraph.split(/(?<=\.)\s*/).map(sentence => {
        sentence = sentence.trim();
        if (!sentence) return '';
        return sentence.charAt(0).toUpperCase() + sentence.slice(1);
      }).join(' ');
    }).join('\n');
    console.log("Paso 7 - Después de capitalización:", processed);

    processed = processed.trim();

    return processed;
  }

  function correctPunctuation(text) {
    console.log("=== CORRECCIÓN DE PUNTUACIÓN ===");
    console.log("Texto antes de corrección:", text);

    // Split text into paragraphs while preserving line breaks
    let paragraphs = text.split('\n');

    // Process each paragraph
    paragraphs = paragraphs.map(paragraph => {
      // Fix spaces around periods
      paragraph = paragraph.replace(/\s*\.\s*/g, '. ');

      // Fix spaces around commas
      paragraph = paragraph.replace(/\s*,\s*/g, ', ');

      // Remove extra spaces
      paragraph = paragraph.replace(/\s+/g, ' ').trim();

      // Split into sentences for capitalization
      let sentences = paragraph.split(/(?<=\.)\s+/);
      sentences = sentences.map(sentence => {
        sentence = sentence.trim();
        if (!sentence) return '';
        // Capitalize first letter of each sentence
        return sentence.charAt(0).toUpperCase() + sentence.slice(1);
      });

      return sentences.join(' ');
    });

    // Join paragraphs back with line breaks
    let processedText = paragraphs.join('\n');

    // Remove multiple consecutive line breaks
    processedText = processedText.replace(/\n\s*\n/g, '\n');

    // Ensure no spaces at the start/end of the text
    processedText = processedText.trim();

    // Capitalize first character of the entire text if it's a letter
    if (/^[a-záéíóúñ]/i.test(processedText)) {
      processedText = processedText.charAt(0).toUpperCase() + processedText.slice(1);
    }

    console.log("Texto después de corrección:", processedText);
    return processedText;
  }

  function getTextOffset(root, node, offset) {
    if (node === root) {
      return offset;
    }

    let textOffset = 0;
    let currentNode = root.firstChild;

    while (currentNode) {
      if (currentNode === node) {
        return textOffset + offset;
      }

      if (currentNode.nodeType === Node.TEXT_NODE) {
        if (currentNode.textContent) {
          textOffset += currentNode.textContent.length;
        }
      } else {
        const containsTargetNode = node.compareDocumentPosition(currentNode) & Node.DOCUMENT_POSITION_CONTAINS ||
          currentNode.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_CONTAINED_BY;

        if (containsTargetNode) {
          return textOffset + getTextOffset(currentNode, node, offset);
        } else {
          textOffset += currentNode.textContent.length;
        }
      }
      currentNode = currentNode.nextSibling;
    }

    return textOffset;
  }
});