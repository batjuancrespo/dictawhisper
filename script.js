// --- Variables Globales de la App de Dictado (declaradas una vez) ---
let startRecordBtn, pauseResumeBtn, retryProcessBtn, copyPolishedTextBtn, correctTextSelectionBtn, 
    statusDiv, polishedTextarea, audioPlayback, audioPlaybackSection, 
    themeSwitch, volumeMeterBar, volumeMeterContainer, recordingTimeDisplay, 
    headerArea, techniqueButtonsContainer, clearHeaderButton, 
    mainTitleImage, mainTitleImageDark,
    vocabManagerModal, vocabManagerList, modalCloseButtonVocab, modalAddNewRuleButtonVocab, manageVocabButton;

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
const userApiKey = 'AIzaSyASbB99MVIQ7dt3MzjhidgoHUlMXIeWvGc'; // API Key de Gemini
let currentUserVocabulary = {}; 
let currentUserId = null;      

// --- Variables para el Atajo de Teclado ---
let isProcessingShortcut = false; // Para debounce del atajo
const SHORTCUT_DEBOUNCE_MS = 300; // Debounce para el atajo
// Ya no necesitamos firstShiftDown, cmdCtrlDown, shortcutTimeoutId para esta versión del atajo


document.addEventListener('DOMContentLoaded', () => {
    // ... (MISMA SELECCIÓN DOM Y VERIFICACIÓN DE DOMContentLoaded que antes) ...
    console.log("DEBUG: DOMContentLoaded event fired.");
    startRecordBtn = document.getElementById('startRecordBtn');
    // ... (todos los demás getElementById)
    mainTitleImageDark = document.getElementById('mainTitleImageDark'); 
    manageVocabButton = document.getElementById('manageVocabButton'); 
    vocabManagerModal = document.getElementById('vocabManagerModal');
    vocabManagerList = document.getElementById('vocabManagerList');
    modalCloseButtonVocab = document.getElementById('modalCloseButtonVocab'); 
    modalAddNewRuleButtonVocab = document.getElementById('modalAddNewRuleButtonVocab');
    // ... (verificación de elementsMap)
    console.log("DEBUG: Todos los elementos HTML principales fueron encontrados en DOMContentLoaded.");
    const preferredTheme = localStorage.getItem('theme') || 'dark'; 
    applyTheme(preferredTheme); 
    setAccentRGB(); 
    new MutationObserver(setAccentRGB).observe(document.body, { attributes: true, attributeFilter: ['data-theme']});
    if (themeSwitch) {
        themeSwitch.addEventListener('change', () => {
            applyTheme(themeSwitch.checked ? 'dark' : 'light');
        });
    }
});


document.addEventListener('firebaseReady', () => {
    console.log("DEBUG: Evento firebaseReady RECIBIDO. Llamando a initializeAuthAndApp...");
    initializeAuthAndApp();
});

function initializeAuthAndApp() {
    // ... (MISMA LÓGICA DE initializeAuthAndApp que antes, incluyendo onAuthStateChanged) ...
    console.log("DEBUG: initializeAuthAndApp - INICIO de la función.");
    const authContainer = document.getElementById('auth-container');
    // ... (resto de selectores y lógica de auth)
    onAuthStateChanged(auth, async (user) => { 
        if (user) {
            currentUserId = user.uid; 
            await loadUserVocabularyFromFirestore(currentUserId); 
            if (!window.dictationAppInitialized) {
                initializeDictationAppLogic(currentUserId); 
                window.dictationAppInitialized = true;
            } else {
                if (typeof updateButtonStates === "function") updateButtonStates("initial"); 
            }
        } else {
            // ... (lógica de logout) ...
        }
    });
} 

function initializeDictationAppLogic(userId) {
    console.log(`DEBUG: initializeDictationAppLogic para usuario: ${userId} - Asignando listeners.`);
    
    // ... (listeners para botones de dictado, modal, etc., como estaban) ...
    if (!startRecordBtn.dataset.listenerAttached) { /* ... */ }
    // ... etc. ...

    // --- Listener para el Atajo de Teclado Global (REPLICADO DE TU index (2).html) ---
    if (!document.dataset.dictationGlobalShortcutListenerAttached) {
        console.log("DEBUG: initializeDictationAppLogic - Añadiendo listener GLOBAL para atajo Shift+Cmd/Ctrl+Shift (estilo index(2).html)");

        document.addEventListener('keydown', function(event) {
            // Solo procesar si la app de dictado está inicializada (usuario logueado)
            if (!window.dictationAppInitialized) {
                return;
            }
            
            // Comprobar Shift + Cmd/Ctrl + Shift
            // La condición event.key === 'Shift' asegura que la *última* tecla presionada en la combinación
            // (o la tecla que genera el evento 'keydown' mientras las otras están mantenidas) sea Shift.
            if (event.shiftKey && (event.metaKey || event.ctrlKey) && event.key === 'Shift') {
                // Verificar si el target es un input o textarea para evitar interferencias.
                // Sin embargo, tu código original decía "SIN importar foco". Si es así, eliminamos esta comprobación.
                // const targetTagName = event.target.tagName.toLowerCase();
                // if (['input', 'textarea'].includes(targetTagName) && !event.target.readOnly) {
                //     console.log("DEBUG: Atajo detectado pero el foco está en un input/textarea editable. Ignorando.");
                //     return;
                // }

                event.preventDefault(); // Prevenir acciones por defecto SIEMPRE
                console.log("DEBUG: Atajo GLOBAL Shift+Cmd/Ctrl+Shift detectado (estilo index(2).html).");

                if (!startRecordBtn || startRecordBtn.disabled || isProcessingShortcut) {
                    console.warn("DEBUG: Atajo ignorado (Botón deshabilitado o atajo en proceso).");
                    return;
                }
                
                isProcessingShortcut = true;
                console.log("DEBUG: Atajo - llamando a toggleRecordingState()");
                toggleRecordingState(); // Llama a la misma función que el botón
                
                setTimeout(() => {
                    isProcessingShortcut = false;
                }, SHORTCUT_DEBOUNCE_MS);
            }
        });
        document.dataset.dictationGlobalShortcutListenerAttached = 'true';
    }
    
    updateButtonStates("initial"); 
    console.log("DEBUG: Lógica de la app de dictado inicializada y listeners (incluyendo atajo) asignados.");
} 

// YA NO NECESITAMOS resetShortcutState, firstShiftDown, cmdCtrlDown, shortcutTimeoutId, SHORTCUT_WINDOW_MS
// para esta versión simplificada del atajo.

// --- Funciones de la App de Dictado ---
// ... (TODAS las demás funciones: applyTheme, setAccentRGB, setStatus, timer, volume meter, 
//      toggleRecordingState, startActualRecording, handlePauseResume, processAudioBlob, 
//      updateButtonStates, handleCorrectTextSelection, vocabulario, API calls, etc.
//      PERMANECEN IGUAL que en la respuesta anterior completa donde todo funcionaba) ...
// ... (Pega aquí el resto de las funciones desde la respuesta anterior) ...

// Ejemplo de cómo se vería el inicio de las funciones que debes mantener:
function applyTheme(theme) { /* ...código de applyTheme... */ }
function setAccentRGB() { /* ...código de setAccentRGB... */ }
function setStatus(message, type = "idle", duration = 0) { /* ...código de setStatus... */ }
// ... y así sucesivamente para TODAS las funciones que ya tenías.
// Me centraré en mostrar solo el bloque del atajo y las variables que se eliminan.

// FUNCIONES COMPLETAS (para evitar dudas, aquí están de nuevo, pero la única diferencia real
// con la respuesta anterior es la eliminación de las variables de estado del atajo más complejo
// y la nueva lógica del listener de 'keydown' para el atajo)

function applyTheme(theme) { document.body.setAttribute('data-theme', theme); localStorage.setItem('theme', theme); if (themeSwitch) themeSwitch.checked = theme === 'dark'; if (mainTitleImage && mainTitleImageDark) { mainTitleImage.style.display = theme === 'light' ? 'inline-block' : 'none'; mainTitleImageDark.style.display = theme === 'dark' ? 'inline-block' : 'none'; } }
function setAccentRGB() { try { const bS = getComputedStyle(document.body); if (!bS) return; const aC = bS.getPropertyValue('--accent-color').trim(); if (aC.startsWith('#')) { const r = parseInt(aC.slice(1,3),16), g = parseInt(aC.slice(3,5),16), b = parseInt(aC.slice(5,7),16); document.documentElement.style.setProperty('--accent-color-rgb',`${r},${g},${b}`); } else if (aC.startsWith('rgb')) { const p = aC.match(/[\d.]+/g); if (p && p.length >=3) document.documentElement.style.setProperty('--accent-color-rgb',`${p[0]},${p[1]},${p[2]}`);}} catch (e) { console.warn("Failed to set --accent-color-rgb:", e); }}
function setStatus(message, type = "idle", duration = 0) { if (!statusDiv) return; statusDiv.textContent = message; statusDiv.className = ''; statusDiv.classList.add(`status-${type}`); if (duration > 0) { setTimeout(() => { if (statusDiv.textContent === message) updateButtonStates("initial"); }, duration); }}
function startRecordingTimer() { stopRecordingTimer(); updateRecordingTimeDisplay(); recordingTimerInterval = setInterval(() => { if (!isPaused) { recordingSeconds++; updateRecordingTimeDisplay();}}, 1000); }
function stopRecordingTimer() { clearInterval(recordingTimerInterval); }
function updateRecordingTimeDisplay() { const m=Math.floor(recordingSeconds/60), s=recordingSeconds%60; recordingTimeDisplay.textContent = isRecording||isPaused ? `Tiempo: ${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}` : ""; }
function resetRecordingTimerDisplay() { recordingTimeDisplay.textContent = ""; recordingSeconds = 0; }
function setupVolumeMeter(stream) { volumeMeterContainer.style.display='block'; if(!audioContext) audioContext=new(window.AudioContext||window.webkitAudioContext)(); if(audioContext.state==='suspended') audioContext.resume(); analyser=audioContext.createAnalyser(); microphoneSource=audioContext.createMediaStreamSource(stream); microphoneSource.connect(analyser); analyser.fftSize=256; analyser.smoothingTimeConstant=0.3; const l=analyser.frequencyBinCount, d=new Uint8Array(l); function draw(){if(!isRecording||isPaused){if(isPaused){volumeMeterBar.classList.add('paused'); volumeMeterBar.style.background='var(--button-default-bg)';}else{volumeMeterBar.classList.remove('paused'); volumeMeterBar.style.background='var(--volume-bar-gradient)';} animationFrameId=requestAnimationFrame(draw); return;} animationFrameId=requestAnimationFrame(draw); analyser.getByteFrequencyData(d); let s=0; for(let i=0;i<l;i++){s+=d[i];} let a=s/l; let v=(a/130)*100; v=Math.min(100,Math.max(0,v)); volumeMeterBar.style.width=v+'%'; volumeMeterBar.classList.remove('paused'); volumeMeterBar.style.background='var(--volume-bar-gradient)';} draw(); }
function stopVolumeMeter() { if(animationFrameId) cancelAnimationFrame(animationFrameId); if(microphoneSource){microphoneSource.disconnect(); microphoneSource=null;} volumeMeterBar.style.width='0%'; volumeMeterBar.classList.remove('paused'); volumeMeterContainer.style.display='none';}
function toggleRecordingState() { if(isRecording){if(mediaRecorder&&(mediaRecorder.state==="recording"||mediaRecorder.state==="paused")){mediaRecorder.stop();setStatus("Deteniendo...","processing");}else{isRecording=false;isPaused=false;updateButtonStates("initial");}}else{startActualRecording();}}
async function startActualRecording() { setStatus("Permiso...","processing");isPaused=false;polishedTextarea.value='';audioChunks=[];currentAudioBlob=null;recordingSeconds=0;audioPlaybackSection.style.display='none';if(audioPlayback.src){URL.revokeObjectURL(audioPlayback.src);audioPlayback.src='';audioPlayback.removeAttribute('src');}if(!userApiKey){alert('API Key?');setStatus("Error Key","error");updateButtonStates("initial");return;}try{const s=await navigator.mediaDevices.getUserMedia({audio:true});isRecording=true;setupVolumeMeter(s);startRecordingTimer();mediaRecorder=new MediaRecorder(s,{mimeType:'audio/webm'});window.currentMediaRecorder=mediaRecorder;mediaRecorder.ondataavailable=e=>{if(e.data.size>0)audioChunks.push(e.data);};mediaRecorder.onpause=()=>{setStatus('Pausada.','idle');isPaused=true;volumeMeterBar.classList.add('paused');volumeMeterBar.style.background='var(--button-default-bg)';updateButtonStates("paused");};mediaRecorder.onresume=()=>{setStatus('Grabando...','processing');isPaused=false;volumeMeterBar.classList.remove('paused');volumeMeterBar.style.background='var(--volume-bar-gradient)';updateButtonStates("recording");};mediaRecorder.onstop=async()=>{isRecording=false;isPaused=false;stopVolumeMeter();stopRecordingTimer();setStatus('Procesando...','processing');if(audioChunks.length===0){setStatus("No audio.","error",3000);updateButtonStates("stopped_error");return;}currentAudioBlob=new Blob(audioChunks,{type:'audio/webm'});if(currentAudioBlob.size===0){setStatus("Audio vacío.","error",3000);updateButtonStates("stopped_error");return;}const u=URL.createObjectURL(currentAudioBlob);audioPlayback.src=u;audioPlaybackSection.style.display='block';updateButtonStates("stopped_success");await processAudioBlob(currentAudioBlob);};mediaRecorder.onerror=e=>{isRecording=false;isPaused=false;stopVolumeMeter();stopRecordingTimer();resetRecordingTimerDisplay();setStatus(`Error MediaRec: ${e.error.name}`,"error",4000);updateButtonStates("error");};mediaRecorder.start();setStatus('Grabando...',"processing");updateButtonStates("recording");}catch(e){isRecording=false;isPaused=false;stopVolumeMeter();stopRecordingTimer();resetRecordingTimerDisplay();setStatus(`Error Mic: ${e.message}.`,"error",4000);updateButtonStates("initial");}}
function handlePauseResume() { if(!mediaRecorder||!isRecording)return;if(mediaRecorder.state==="recording"){mediaRecorder.pause();}else if(mediaRecorder.state==="paused"){mediaRecorder.resume();}}
async function processAudioBlob(audioBlob) { polishedTextarea.value='';setStatus('Preparando...','processing');updateButtonStates("processing_audio");try{const b=await blobToBase64(audioBlob);if(!b||b.length<100)throw new Error("Fallo Base64.");const pR=await transcribeAndPolishAudio(b);polishedTextarea.value=pR;setStatus('Completado.','success',3000);updateButtonStates("success_processing");}catch(e){setStatus(`Error Proc: ${e.message}`,"error",4000);polishedTextarea.value=`Error: ${e.message}`;updateButtonStates("error_processing");}}
function updateButtonStates(state) { startRecordBtn.disabled=true;pauseResumeBtn.disabled=true;retryProcessBtn.disabled=true;copyPolishedTextBtn.disabled=false;correctTextSelectionBtn.disabled=true;startRecordBtn.textContent="Empezar Dictado";startRecordBtn.classList.remove("stop-style");pauseResumeBtn.textContent="Pausar";let showPlayer=false;if(currentAudioBlob){if(["initial","stopped_success","error_processing","success_processing","stopped_error"].includes(state)){showPlayer=true;}}if(audioPlaybackSection)audioPlaybackSection.style.display=showPlayer?'block':'none';else console.warn("audioPlaybackSection null en updateButtonStates");switch(state){case "initial":startRecordBtn.disabled=false;if(statusDiv&&statusDiv.textContent.toLowerCase()!=="listo"&&!statusDiv.textContent.toLowerCase().includes("error")&&!statusDiv.textContent.toLowerCase().includes("pausada"))setStatus("Listo","idle");resetRecordingTimerDisplay();stopVolumeMeter();retryProcessBtn.disabled=!currentAudioBlob;correctTextSelectionBtn.disabled=polishedTextarea.value.trim()==="";break;case "recording":startRecordBtn.disabled=false;startRecordBtn.textContent="Detener Dictado";startRecordBtn.classList.add("stop-style");pauseResumeBtn.disabled=false;retryProcessBtn.disabled=true;correctTextSelectionBtn.disabled=true;break;case "paused":startRecordBtn.disabled=false;startRecordBtn.textContent="Detener Dictado";startRecordBtn.classList.add("stop-style");pauseResumeBtn.disabled=false;pauseResumeBtn.textContent="Reanudar";retryProcessBtn.disabled=true;correctTextSelectionBtn.disabled=polishedTextarea.value.trim()==="";break;case "stopped_success":startRecordBtn.disabled=false;retryProcessBtn.disabled=!currentAudioBlob;correctTextSelectionBtn.disabled=polishedTextarea.value.trim()==="";break;case "stopped_error":startRecordBtn.disabled=false;resetRecordingTimerDisplay();stopVolumeMeter();retryProcessBtn.disabled=!currentAudioBlob;correctTextSelectionBtn.disabled=true;break;case "processing_audio":startRecordBtn.disabled=true;pauseResumeBtn.disabled=true;retryProcessBtn.disabled=true;correctTextSelectionBtn.disabled=true;break;case "error_processing":startRecordBtn.disabled=false;retryProcessBtn.disabled=!currentAudioBlob;correctTextSelectionBtn.disabled=polishedTextarea.value.trim()==="";break;case "success_processing":startRecordBtn.disabled=false;retryProcessBtn.disabled=!currentAudioBlob;correctTextSelectionBtn.disabled=polishedTextarea.value.trim()==="";break;case "error":startRecordBtn.disabled=false;resetRecordingTimerDisplay();stopVolumeMeter();retryProcessBtn.disabled=!currentAudioBlob;correctTextSelectionBtn.disabled=true;break;default:startRecordBtn.disabled=false;resetRecordingTimerDisplay();stopVolumeMeter();retryProcessBtn.disabled=!currentAudioBlob;correctTextSelectionBtn.disabled=polishedTextarea.value.trim()==="";break;}}
async function handleCorrectTextSelection(){if(!polishedTextarea)return;const sS=polishedTextarea.selectionStart;const sE=polishedTextarea.selectionEnd;const sT=polishedTextarea.value.substring(sS,sE).trim();if(!sT){setStatus("Selecciona texto.","idle",3000);return;}const cTU=prompt(`Corregir:\n"${sT}"\n\nCorrección:` ,sT);if(cTU===null){setStatus("Cancelado.","idle",2000);return;}const fCT=cTU.trim();const ruleKey = sT.toLowerCase(); if(sT.toLowerCase()===fCT.toLowerCase()&&sT!==fCT){}else if(sT.toLowerCase()!==fCT.toLowerCase()||fCT==="" || !customVocabulary.hasOwnProperty(ruleKey) || customVocabulary[ruleKey] !== fCT ){customVocabulary[ruleKey]=fCT;await saveUserVocabularyToFirestore();setStatus(`Regla guardada: "${ruleKey}"➔"${fCT}"`,"success",3000);}else{setStatus("No cambios para guardar.","idle",2000);}const tB=polishedTextarea.value.substring(0,sS);const tA=polishedTextarea.value.substring(sE);polishedTextarea.value=tB+fCT+tA;polishedTextarea.selectionStart=polishedTextarea.selectionEnd=sS+fCT.length;polishedTextarea.focus();}
function blobToBase64(b){return new Promise((res,rej)=>{if(!b||b.size===0)return rej(new Error("Blob nulo"));const r=new FileReader();r.onloadend=()=>{if(r.result){const s=r.result.toString().split(',')[1];if(!s)return rej(new Error("Fallo Base64"));res(s);}else rej(new Error("FileReader sin resultado"));};r.onerror=e=>rej(e);r.readAsDataURL(b);});}
async function callGeminiAPI(p,isTxt=false){if(!userApiKey)throw new Error('No API Key');const u=`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${userApiKey}`;const t=isTxt?0.1:0.2;const y={contents:[{parts:p}],generationConfig:{temperature:t}};console.log(`Gemini (isTxt:${isTxt},temp:${t}). Prompt(inicio):`,JSON.stringify(p[0]).substring(0,200)+"...");const resp=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(y)});if(!resp.ok){const eD=await resp.json();console.error("Error Gemini API:",eD);throw new Error(`Error API:${eD.error?.message||resp.statusText}(${resp.status})`);}const d=await resp.json();if(d.candidates?.[0]?.content?.parts?.[0]?.text)return d.candidates[0].content.parts[0].text;if(d.promptFeedback?.blockReason)throw new Error(`Bloqueado:${d.promptFeedback.blockReason}.${d.promptFeedback.blockReasonMessage||''}`);if(d.candidates?.[0]?.finishReason&&d.candidates[0].finishReason!=="STOP")throw new Error(`Gemini fin:${d.candidates[0].finishReason}.`);if(d.candidates?.[0]?.finishReason==="STOP"&&!d.candidates?.[0]?.content?.parts?.[0]?.text)return"";throw new Error('Gemini respuesta inesperada.');}
function capitalizeSentencesProperly(t){if(!t||t.trim()==="")return"";let r=t.trimStart();if(r.length>0)r=r.charAt(0).toUpperCase()+r.slice(1);r=r.replace(/([.!?])(\s*\n*|\s+)([a-záéíóúüñ])/g,(m,p,w,l)=>p+w+l.toUpperCase());return r;}
async function transcribeAndPolishAudio(b){let tTxt='';try{setStatus('Transcribiendo...','processing');const tP=[{text:"Transcribe el audio a texto LITERALMENTE. No corrijas. Si dice 'coma', 'punto', transcribe 'coma', 'punto'."},{inline_data:{mime_type:"audio/webm",data:b}}];tTxt=await callGeminiAPI(tP,false);console.log("---Transcripción Original (Consola)---\n",tTxt,"\n-----------------------------------");}catch(e){console.error("Error transcripción:",e);throw new Error(`Fallo transcripción:${e.message}`);}if(!tTxt||tTxt.trim()==="")throw new Error("Transcripción vacía.");let pAI='';try{setStatus('Puliendo...','processing');const pP=[{text:`Revisa y pule. INSTRUCCIONES:\n1.Interpreta palabras dictadas como signos:\n'coma'➔, 'punto'➔. 'punto y aparte'➔.(salto línea único) 'nueva línea'➔(salto línea único) 'dos puntos'➔: 'punto y coma'➔; 'interrogación'➔? 'exclamación'➔!\n2.Corrige SOLO ortografía/gramática OBVIA.\n3.NO CAMBIES palabras/estructura si es OK.\n4.PRESERVA estilo.\n5.Si ya OK, cambios MÍNIMOS.\n6.Capitaliza inicio de frases.\n\nTexto:"${tTxt}"`}];pAI=await callGeminiAPI(pP,true);}catch(e){console.error("Error pulido IA:",e);setStatus(`Fallo pulido IA:${e.message}. Usando cruda.`,"error",4000);pAI=tTxt;}let cT=capitalizeSentencesProperly(pAI);let custT=applyAllUserCorrections(cT);let finT=custT.replace(/\.\s*\n\s*\n/g,'.\n').replace(/\n\s*\n/g,'\n');return finT;}
async function loadUserVocabularyFromFirestore(userId) { if (!userId || !window.db) { customVocabulary = {}; learnedCorrections = {}; commonMistakeNormalization = {}; return; } console.log(`DEBUG: Cargando vocabulario (estilo index(2).html) para usuario: ${userId}`); const vocabDocRef = window.doc(window.db, "userVocabularies", userId); try { const docSnap = await window.getDoc(vocabDocRef); if (docSnap.exists()) { const firestoreData = docSnap.data(); customVocabulary = firestoreData.rulesMap || {}; learnedCorrections = firestoreData.learnedMap || {}; commonMistakeNormalization = firestoreData.normalizations || {}; console.log("DEBUG: Vocabulario cargado. Reglas:", Object.keys(customVocabulary).length, "Aprendidas:", Object.keys(learnedCorrections).length, "Normaliz.:", Object.keys(commonMistakeNormalization).length); } else { customVocabulary = {}; learnedCorrections = {}; commonMistakeNormalization = {}; console.log("DEBUG: No doc de vocabulario. Usando vacíos."); } } catch (error) { console.error("Error cargando vocabulario:", error); customVocabulary = {}; learnedCorrections = {}; commonMistakeNormalization = {}; setStatus("Error al cargar personalizaciones.", "error", 3000); } }
async function saveUserVocabularyToFirestore() { if (!currentUserId || !window.db) { console.error("DEBUG: No hay userId o DB para guardar vocabulario."); return; } const vocabDocRef = window.doc(window.db, "userVocabularies", currentUserId); const dataToSave = { rulesMap: customVocabulary, learnedMap: learnedCorrections, normalizations: commonMistakeNormalization }; try { await window.setDoc(vocabDocRef, dataToSave, { merge: true }); console.log("DEBUG: Vocabulario del usuario guardado en Firestore."); } catch (error) { console.error("Error guardando vocabulario:", error); setStatus("Error al guardar personalizaciones.", "error", 3000); } }
function applyAllUserCorrections(text) { if (!text) return ""; let processedText = text; /* Lógica para commonMistakeNormalization (ADAPTAR) console.log("DEBUG: Aplicando normalizaciones..."); for (const mistakeKey in commonMistakeNormalization) { const normalizedForm = commonMistakeNormalization[mistakeKey]; try { const regex = new RegExp(`\\b${escapeRegExp(mistakeKey)}\\b`, 'gi'); processedText = processedText.replace(regex, normalizedForm); } catch (e) { console.error(`Error regex (norm): "${mistakeKey}"`, e); } } Lógica para learnedCorrections (ADAPTAR) const LEARNED_THRESHOLD = 2; console.log("DEBUG: Aplicando correcciones aprendidas..."); const sortedLearnedKeys = Object.keys(learnedCorrections).sort((a, b) => b.length - a.length); for (const learnedError of sortedLearnedKeys) { const correctionData = learnedCorrections[learnedError]; if (correctionData && correctionData.count >= LEARNED_THRESHOLD) { try { const regex = new RegExp(`\\b${escapeRegExp(learnedError)}\\b`, 'gi'); processedText = processedText.replace(regex, correctionData.correctKey); } catch (e) { console.error(`Error regex (learned): "${learnedError}"`, e); } } } */ if (Object.keys(customVocabulary).length > 0) { console.log("DEBUG: Aplicando vocabulario personalizado (rulesMap)..."); const sortedCustomKeys = Object.keys(customVocabulary).sort((a, b) => b.length - a.length); for (const errorKey of sortedCustomKeys) { const correctValue = customVocabulary[errorKey]; try { const regex = new RegExp(`\\b${escapeRegExp(errorKey)}\\b`, 'gi'); processedText = processedText.replace(regex, correctValue); } catch (e) { console.error(`Error regex (custom): "${errorKey}"`, e); } } } return processedText; }
function escapeRegExp(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function openVocabManager() { vocabManagerModal = vocabManagerModal || document.getElementById('vocabManagerModal'); if (!vocabManagerModal) { console.error("Modal de vocabulario no encontrado."); return; } populateVocabManagerList(); vocabManagerModal.style.display = 'flex'; }
function closeVocabManager() { vocabManagerModal = vocabManagerModal || document.getElementById('vocabManagerModal'); if (!vocabManagerModal) return; vocabManagerModal.style.display = 'none'; }
function populateVocabManagerList() { vocabManagerList = vocabManagerList || document.getElementById('vocabManagerList'); if (!vocabManagerList) { console.error("Lista del modal de vocabulario no encontrada."); return; } vocabManagerList.innerHTML = ''; const keys = Object.keys(customVocabulary).sort(); if (keys.length === 0) { vocabManagerList.innerHTML = '<li>No hay reglas personalizadas (rulesMap).</li>'; return; } keys.forEach(key => { const value = customVocabulary[key]; const listItem = document.createElement('li'); listItem.innerHTML = `<span class="vocab-key">${key}</span> <span class="vocab-arrow">➔</span> <span class="vocab-value">${value}</span> <div class="vocab-actions"><button class="edit-vocab-btn" data-key="${key}">Editar</button><button class="delete-vocab-btn" data-key="${key}">Borrar</button></div>`; listItem.querySelector('.edit-vocab-btn').addEventListener('click', () => handleEditVocabRule(key)); listItem.querySelector('.delete-vocab-btn').addEventListener('click', () => handleDeleteVocabRule(key)); vocabManagerList.appendChild(listItem); }); }
async function handleAddNewVocabRule() { const errorKeyRaw = prompt("Texto incorrecto (o palabra a reemplazar):"); if (!errorKeyRaw || errorKeyRaw.trim() === "") return; const errorKey = errorKeyRaw.trim().toLowerCase(); const correctValueRaw = prompt(`Corrección para "${errorKeyRaw}":`); if (correctValueRaw === null) return; const correctValue = correctValueRaw.trim(); if (customVocabulary[errorKey] === correctValue && correctValue !== "") { alert("Regla ya existe con el mismo valor."); return; } customVocabulary[errorKey] = correctValue; await saveUserVocabularyToFirestore(); populateVocabManagerList(); setStatus("Regla añadida/actualizada.", "success", 2000); }
async function handleEditVocabRule(keyToEdit) { const currentValue = customVocabulary[keyToEdit]; const newErrorKeyRaw = prompt(`Editar CLAVE (original: "${keyToEdit}"):\n(Dejar vacío para mantener)`, keyToEdit); if (newErrorKeyRaw === null) return; const newErrorKey = (newErrorKeyRaw.trim() === "" ? keyToEdit : newErrorKeyRaw.trim()).toLowerCase(); const newCorrectValueRaw = prompt(`Editar VALOR para "${newErrorKey}" (original: "${currentValue}"):`, currentValue); if (newCorrectValueRaw === null) return; const newCorrectValue = newCorrectValueRaw.trim(); if (newErrorKey !== keyToEdit && customVocabulary.hasOwnProperty(newErrorKey)) { alert(`La clave "${newErrorKey}" ya existe.`); return; } if (newErrorKey !== keyToEdit) delete customVocabulary[keyToEdit]; customVocabulary[newErrorKey] = newCorrectValue; await saveUserVocabularyToFirestore(); populateVocabManagerList(); setStatus("Regla actualizada.", "success", 2000); }
async function handleDeleteVocabRule(keyToDelete) { if (confirm(`¿Borrar la regla para "${keyToDelete}"?`)) { delete customVocabulary[keyToDelete]; await saveUserVocabularyToFirestore(); populateVocabManagerList(); setStatus("Regla borrada.", "success", 2000); } }

console.log("DEBUG: Script principal (fuera de DOMContentLoaded y firebaseReady) evaluado. Esperando firebaseReady...");
