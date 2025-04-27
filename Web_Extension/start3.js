// VTO Widget - Unpacked Extension Content Script (start.js) - Final Version v1.2
'use strict';

console.log("VTO Extension Script: start.js loading...");

// --- Helper function for localStorage ---
function getLocalStorageJson(key, defaultValue) {
    const item = localStorage.getItem(key);
    if (item === null) return defaultValue;
    try {
        // Basic check if it looks like an array before parsing
        if (typeof item === 'string' && item.trim().startsWith('[')) {
            return JSON.parse(item);
        } else {
            console.warn("VTO Extension: localStorage item doesn't look like JSON array, returning default:", key);
            return defaultValue;
        }
    } catch (e) {
        console.error("VTO Extension: Error parsing localStorage item:", key, e);
        // Attempt to remove corrupted item to prevent future errors
        try { localStorage.removeItem(key); } catch(removeErr) { console.error("Failed to remove corrupted key:", key, removeErr); }
        return defaultValue;
    }
}

// --- Main Function to Run After DOM is Ready ---
function runVtoWidget() {

    console.log("VTO Extension Script: Running runVtoWidget()...");

    // --- Configuration ---
    // <<< --- IMPORTANT: UPDATE THIS URL IF YOUR NGROK TUNNEL CHANGES --- >>>
    const GRADIO_APP_BASE_URL = "https://dc3e-35-225-160-255.ngrok-free.app/"; // <<<--- UPDATE IF NEEDED (Example URL from previous logs)
    // --- End Configuration ---

    const GRADIO_API_ENDPOINT = GRADIO_APP_BASE_URL.replace(/\/$/, '') + "/run/tryon";
    const API_DEFAULTS = { is_checked: true, is_checked_crop: true, denoise_steps: 30, is_randomize_seed: false, seed: 42 };
    const HISTORY_STORAGE_KEY = "vtoWidgetHistory_Extension";
    const REQUEST_TIMEOUT_MS = 180000; // 180 seconds

    // --- Basic URL Check ---
     if (!GRADIO_APP_BASE_URL || GRADIO_APP_BASE_URL.includes("YOUR-") || GRADIO_APP_BASE_URL === "https://") {
         console.error("VTO Extension ERROR: GRADIO_APP_BASE_URL is not configured correctly!");
         alert("VTO Extension ERROR: Gradio App URL is not configured!");
         return;
     }
     console.log("VTO Extension: Using API Endpoint:", GRADIO_API_ENDPOINT);

    // --- State Variables ---
    let humanFileDataUrl = null; let garmentFileDataUrl = null; let currentAbortController = null;

    // --- Create Widget Container & HTML ---
    if (document.getElementById("virtualTryOnWidget")) { console.warn("VTO Extension: Widget container already exists. Removing old one."); document.getElementById("virtualTryOnWidget").remove(); }
    const widgetContainer = document.createElement("div"); widgetContainer.id = "virtualTryOnWidget";
    Object.assign(widgetContainer.style, { position: "fixed", top: "80px", right: "10px", background: "white", border: "1px solid #ccc", padding: "15px", boxShadow: "0 4px 8px rgba(0,0,0,0.2)", zIndex: "10000", fontFamily: "Arial, sans-serif", width: "320px", maxHeight: "85vh", overflowY: "auto", color: "#333" });
    // --- Full HTML Structure ---
    widgetContainer.innerHTML = `
      <div id="vtoInitialChoice"> <h4 style="margin-top: 0; margin-bottom: 10px; text-align: center; color: #111;">Virtual Try-On (Ext)</h4> <button id="vtoChoiceNew" style="width: 100%; padding: 10px; margin-bottom: 5px; background-color: #f0f0f0; border: 1px solid #ccc; cursor: pointer;">New Try-On</button> <button id="vtoChoiceHistory" style="width: 100%; padding: 10px; background-color: #f0f0f0; border: 1px solid #ccc; cursor: pointer;">View History</button> </div> <div id="vtoMainContent" style="display: none;"> <button id="vtoBackButton" style="margin-bottom: 10px; background: #eee; border: 1px solid #ccc; padding: 3px 8px; cursor: pointer;">< Back</button> <!-- Human Photo --> <div style="margin-bottom: 15px;"> <label style="display: block; margin-bottom: 5px; font-weight: bold;">1. Your Photo:</label> <button id="vtoUploadHumanBtn" style="width: 100%; padding: 8px; margin-bottom: 5px; background-color: #e7f3ff; border: 1px solid #b3d7ff; cursor: pointer;">Upload Photo</button> <input type="file" id="vtoHumanInput" accept="image/*" style="display: none;"> <img id="vtoHumanPreview" src="#" alt="Your Photo" style="max-width: 100%; display: none; margin-top: 5px; border: 1px solid #ddd;"> <button id="vtoRemoveHumanBtn" style="display: none; margin-top: 5px; font-size: 12px; color: red; background: none; border: none; cursor: pointer;">Remove</button> </div> <!-- Garment Photo --> <div style="margin-bottom: 15px;"> <label style="display: block; margin-bottom: 5px; font-weight: bold;">2. Garment Photo:</label> <button id="vtoUploadGarmentBtn" style="width: 100%; padding: 8px; background-color: #e7f3ff; border: 1px solid #b3d7ff; cursor: pointer;">Upload or Drag Garment</button> <input type="file" id="vtoGarmentInput" accept="image/*" style="display: none;"> <div id="vtoGarmentDropZone" style="border: 2px dashed #ccc; padding: 15px; text-align: center; margin-top: 5px; cursor: pointer; font-size: 14px; color: #666;">Drag & Drop Garment Here</div> <img id="vtoGarmentPreview" src="#" alt="Garment Preview" style="max-width: 100%; display: none; margin-top: 5px; border: 1px solid #ddd;"> <button id="vtoRemoveGarmentBtn" style="display: none; margin-top: 5px; font-size: 12px; color: red; background: none; border: none; cursor: pointer;">Remove</button> </div> <!-- Details --> <div style="margin-bottom: 15px;"> <label for="vtoGarmentDesc" style="display: block; margin-bottom: 5px; font-weight: bold;">3. Garment Description:</label> <input type="text" id="vtoGarmentDesc" placeholder="e.g., a red t-shirt" style="width: calc(100% - 12px); padding: 6px; margin-bottom: 10px; border: 1px solid #ccc;"> <label for="vtoCategory" style="display: block; margin-bottom: 5px; font-weight: bold;">4. Category:</label> <select id="vtoCategory" style="width: 100%; padding: 6px; margin-bottom: 10px; border: 1px solid #ccc;"> <option value="upper_body">Upper Body</option><option value="lower_body">Lower Body</option><option value="dress">Dress</option><option value="others">Others</option> </select> <label for="vtoNumImages" style="display: block; margin-bottom: 5px; font-weight: bold;">5. Number of Images:</label> <input type="number" id="vtoNumImages" value="1" min="1" max="4" style="width: 60px; padding: 6px; border: 1px solid #ccc;"> </div> <!-- Action Buttons --> <button id="vtoTryOnBtn" style="width: 100%; padding: 12px; margin-top: 10px; background-color: #007bff; color: white; border: none; font-weight: bold; cursor: pointer;">Try It On!</button> <button id="vtoCancelBtn" style="width: 100%; padding: 8px; margin-top: 5px; background-color: #ffc107; color: black; border: none; cursor: pointer; display: none;">Cancel Request</button> <!-- Status and Result Area --> <div id="vtoStatus" style="margin-top: 15px; text-align: center; font-size: 14px; min-height: 20px; word-wrap: break-word;"></div> <div id="vtoResultArea" style="margin-top: 15px; border-top: 1px solid #eee; padding-top: 15px;"></div> </div> <!-- History View --> <div id="vtoHistoryContent" style="display: none;"> <button id="vtoHistoryBackButton" style="margin-bottom: 10px; background: #eee; border: 1px solid #ccc; padding: 3px 8px; cursor: pointer;">< Back</button> <h5 style="margin-top: 0; margin-bottom: 10px; text-align: center;">Try-On History</h5> <div id="vtoHistoryList" style="font-size: 13px;">History is empty.</div> <button id="vtoClearHistoryBtn" style="width: 100%; padding: 8px; margin-top: 15px; background-color: #dc3545; color: white; border: none; cursor: pointer;">Clear History</button> </div>
    `;
    if (document.body) { document.body.appendChild(widgetContainer); console.log("VTO Extension: Widget container appended."); }
    else { console.error("VTO Extension: document.body not found!"); return; }

    // --- Get UI Element References ---
    const initialChoiceDiv=document.getElementById("vtoInitialChoice"),mainContentDiv=document.getElementById("vtoMainContent"),historyContentDiv=document.getElementById("vtoHistoryContent"),choiceNewBtn=document.getElementById("vtoChoiceNew"),choiceHistoryBtn=document.getElementById("vtoChoiceHistory"),backButton=document.getElementById("vtoBackButton"),historyBackButton=document.getElementById("vtoHistoryBackButton"),historyListDiv=document.getElementById("vtoHistoryList"),clearHistoryBtn=document.getElementById("vtoClearHistoryBtn"),uploadHumanBtn=document.getElementById("vtoUploadHumanBtn"),humanInput=document.getElementById("vtoHumanInput"),humanPreview=document.getElementById("vtoHumanPreview"),removeHumanBtn=document.getElementById("vtoRemoveHumanBtn"),uploadGarmentBtn=document.getElementById("vtoUploadGarmentBtn"),garmentInput=document.getElementById("vtoGarmentInput"),garmentDropZone=document.getElementById("vtoGarmentDropZone"),garmentPreview=document.getElementById("vtoGarmentPreview"),removeGarmentBtn=document.getElementById("vtoRemoveGarmentBtn"),garmentDescInput=document.getElementById("vtoGarmentDesc"),categorySelect=document.getElementById("vtoCategory"),numImagesInput=document.getElementById("vtoNumImages"),tryOnBtn=document.getElementById("vtoTryOnBtn"),cancelBtn=document.getElementById("vtoCancelBtn"),statusDiv=document.getElementById("vtoStatus"),resultArea=document.getElementById("vtoResultArea");
    if (!initialChoiceDiv || !mainContentDiv || !historyContentDiv || !tryOnBtn || !choiceNewBtn || !choiceHistoryBtn) { console.error("VTO FATAL: Could not find essential elements!"); alert("VTO FATAL: Widget UI elements not found."); return; }

    // --- Helper Functions ---
    const handleFileSelect = (file, previewElement, removeBtnElement, fileVarSetter) => { if (file && file.type.startsWith("image/")) { const reader = new FileReader(); reader.onload = (event) => { const dataUrl = event.target.result; if(previewElement) { previewElement.src = dataUrl; previewElement.style.display = "block"; } if(removeBtnElement) removeBtnElement.style.display = "inline-block"; fileVarSetter(dataUrl); }; reader.onerror = (err) => { console.error("FileReader error:", err); if(statusDiv) { statusDiv.textContent = "Error reading file."; statusDiv.style.color = "red"; } }; reader.readAsDataURL(file); } else { alert("Please select a valid image file."); } };
    const handleFileRemove = (previewElement, removeBtnElement, inputElement, fileVarSetter) => { if(previewElement) { previewElement.src = "#"; previewElement.style.display = "none"; } if(removeBtnElement) removeBtnElement.style.display = "none"; if(inputElement) inputElement.value = ""; fileVarSetter(null); };
    function handleFileSelectFromDataUrl(dataUrl, previewElement, removeBtnElement, fileVarSetter) { if(previewElement) { previewElement.src = dataUrl; previewElement.style.display = "block"; } if(removeBtnElement) removeBtnElement.style.display = "inline-block"; fileVarSetter(dataUrl); }
    function fetchImageAsDataUrl(url) { return new Promise((resolve, reject) => { const img = new Image(); img.crossOrigin = "Anonymous"; img.onload = () => { const canvas = document.createElement("canvas"); canvas.width = img.width; canvas.height = img.height; const ctx = canvas.getContext("2d"); ctx.drawImage(img, 0, 0); try { const dataUrl = canvas.toDataURL("image/png"); resolve(dataUrl); } catch (e) { console.error("Canvas toDataURL error:", e); reject(new Error("Could not convert canvas to Data URL")); } }; img.onerror = (err) => { console.error("Image loading error for URL:", url, err); reject(err); }; img.src = url; }); }
    const resetMainForm = () => { console.log("VTO Extension: Resetting main form."); humanFileDataUrl = null; garmentFileDataUrl = null; if(humanPreview && removeHumanBtn && humanInput) handleFileRemove(humanPreview, removeHumanBtn, humanInput, () => {}); if(garmentPreview && removeGarmentBtn && garmentInput) handleFileRemove(garmentPreview, removeGarmentBtn, garmentInput, () => {}); if(garmentDropZone) { garmentDropZone.textContent = "Drag & Drop Garment Here"; garmentDropZone.style.background = "transparent"; } if(garmentDescInput) garmentDescInput.value = ''; if(categorySelect) categorySelect.value = 'upper_body'; if(numImagesInput) numImagesInput.value = 1; if(statusDiv) statusDiv.textContent = ''; if(resultArea) resultArea.innerHTML = ''; if(tryOnBtn) tryOnBtn.disabled = false; if(cancelBtn) cancelBtn.style.display = 'none'; if (currentAbortController) { currentAbortController.abort("Form Reset"); currentAbortController = null; } };

    // --- UI Switching Functions ---
    function showInitialChoice() { console.log("VTO Extension: Switching to Initial Choice view."); if (initialChoiceDiv) initialChoiceDiv.style.display = "block"; if (mainContentDiv) mainContentDiv.style.display = "none"; if (historyContentDiv) historyContentDiv.style.display = "none"; resetMainForm(); }
    function showMainContent() { console.log("VTO Extension: Switching to Main Content view."); if (initialChoiceDiv) initialChoiceDiv.style.display = "none"; if (mainContentDiv) mainContentDiv.style.display = "block"; if (historyContentDiv) historyContentDiv.style.display = "none"; }
    function showHistoryContent() { console.log("VTO Extension: Switching to History view."); if (initialChoiceDiv) initialChoiceDiv.style.display = "none"; if (mainContentDiv) mainContentDiv.style.display = "none"; if (historyContentDiv) historyContentDiv.style.display = "block"; loadHistory(); }

    // --- History Handling (localStorage) ---
    function loadHistory() {
        console.log("VTO Extension: Loading history from localStorage"); // <<< DEBUG LOG
        try {
            const history = getLocalStorageJson(HISTORY_STORAGE_KEY, []);
            console.log(`VTO Extension: Loaded ${history.length} history items.`, history); // <<< DEBUG LOG
            if (!historyListDiv) { console.error("VTO: historyListDiv not found!"); return; }
            historyListDiv.innerHTML = '';
            if (history.length === 0) { historyListDiv.textContent = "History is empty."; return; }
            history.forEach((item, itemIndex) => {
                 console.log(`VTO Extension: Rendering history item ${itemIndex}`, item); // <<< DEBUG LOG
                 const entryDiv=document.createElement('div'); Object.assign(entryDiv.style, {borderBottom:"1px solid #eee",marginBottom:"10px",paddingBottom:"10px"});
                 const previewsDiv=document.createElement('div'); Object.assign(previewsDiv.style, {display:'flex',gap:'5px',marginBottom:'5px'});
                 if(item.humanPreviewSrc){ const img=document.createElement('img'); img.src=item.humanPreviewSrc; Object.assign(img.style, {width:'40px',border:'1px solid #ccc'}); previewsDiv.appendChild(img); } else { console.log(`History item ${itemIndex}: No human preview src.`); }
                 if(item.garmentPreviewSrc){ const img=document.createElement('img'); img.src=item.garmentPreviewSrc; Object.assign(img.style, {width:'40px',border:'1px solid #ccc'}); previewsDiv.appendChild(img); } else { console.log(`History item ${itemIndex}: No garment preview src.`); }
                 entryDiv.appendChild(previewsDiv);
                 const paramsDiv=document.createElement('div'); Object.assign(paramsDiv.style, {fontSize:'11px',color:'#555'}); paramsDiv.textContent=`Desc: ${item.params?.desc||'N/A'}, Cat: ${item.params?.category||'N/A'}, Num: ${item.params?.numImages||'N/A'}`; entryDiv.appendChild(paramsDiv);
                 const resultsDiv=document.createElement('div'); Object.assign(resultsDiv.style, {marginTop:'5px',display:'flex',flexWrap:'wrap',gap:'5px'});
                 if (item.resultImages && Array.isArray(item.resultImages)) { item.resultImages.forEach((imgDataUrl, imgIndex)=>{ const img=document.createElement('img'); img.src=imgDataUrl; Object.assign(img.style, {maxWidth:'80px',border:'1px solid #ccc'}); resultsDiv.appendChild(img); }); }
                 else { console.log(`History item ${itemIndex}: No result images array found.`); }
                 entryDiv.appendChild(resultsDiv);
                 historyListDiv.appendChild(entryDiv);
             });
        } catch(e) { console.error("VTO Extension: Cannot load history", e); if(historyListDiv) historyListDiv.textContent = "Cannot load history (script error)."; }
    };
    function saveToHistory(humanSrc, garmentSrc, params, resultImagesBase64) { // Expects base64 now
        console.log("VTO Extension: Saving to history in localStorage"); // <<< DEBUG LOG
        try {
            let history = getLocalStorageJson(HISTORY_STORAGE_KEY, []);
            const newEntry = { timestamp: Date.now(), humanPreviewSrc: humanSrc, garmentPreviewSrc: garmentSrc, params: params, resultImages: resultImagesBase64 };
            console.log("VTO Extension: New history entry:", newEntry); // <<< DEBUG LOG
            history.unshift(newEntry);
            if (history.length > 20) { history = history.slice(0, 20); }
            localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
            console.log(`VTO Extension: History saved. Total items: ${history.length}`); // <<< DEBUG LOG
        }
        catch(e) { console.error("VTO Extension: Cannot save history", e);}
    };

    // --- Event Listeners Setup ---
    function setupEventListeners() {
        console.log("VTO Extension: Setting up event listeners.");
        if (choiceNewBtn) choiceNewBtn.addEventListener("click", showMainContent); else console.error("VTO ERROR: choiceNewBtn not found!");
        if (choiceHistoryBtn) choiceHistoryBtn.addEventListener("click", showHistoryContent); else console.error("VTO ERROR: choiceHistoryBtn not found!");
        if (backButton) backButton.addEventListener("click", showInitialChoice); else console.error("VTO ERROR: backButton not found!");
        if (historyBackButton) historyBackButton.addEventListener("click", showInitialChoice); else console.error("VTO ERROR: historyBackButton not found!");
        if (clearHistoryBtn) clearHistoryBtn.addEventListener("click", () => { if (confirm("Clear history?")) { localStorage.removeItem(HISTORY_STORAGE_KEY); loadHistory(); } });
        if (uploadHumanBtn) uploadHumanBtn.addEventListener("click", () => humanInput?.click());
        if (humanInput) humanInput.addEventListener("change", (e) => { handleFileSelect(e.target.files[0], humanPreview, removeHumanBtn, (data) => humanFileDataUrl = data); });
        if (removeHumanBtn) removeHumanBtn.addEventListener("click", () => { handleFileRemove(humanPreview, removeHumanBtn, humanInput, (data) => humanFileDataUrl = data); });
        if (uploadGarmentBtn) uploadGarmentBtn.addEventListener("click", () => garmentInput?.click());
        if (garmentInput) garmentInput.addEventListener("change", (e) => { handleFileSelect(e.target.files[0], garmentPreview, removeGarmentBtn, (data) => garmentFileDataUrl = data); });
        if (removeGarmentBtn) removeGarmentBtn.addEventListener("click", () => { handleFileRemove(garmentPreview, removeGarmentBtn, garmentInput, (data) => garmentFileDataUrl = data); });
        if (garmentDropZone) { console.log("VTO Extension: Attaching drag/drop listeners."); garmentDropZone.addEventListener("dragover", (e) => { e.preventDefault(); garmentDropZone.style.background = "#e0e0e0"; }); garmentDropZone.addEventListener("dragleave", (e) => { e.preventDefault(); garmentDropZone.style.background = "transparent"; }); garmentDropZone.addEventListener("drop", async (e) => { e.preventDefault(); console.log("VTO DEBUG: drop event fired!"); garmentDropZone.style.background = "transparent"; garmentDropZone.textContent = "Processing drop..."; try { let file = e.dataTransfer.files[0]; if (file && file.type.startsWith("image/")) { console.log("VTO DEBUG: Drop contains a file:", file.name); handleFileSelect(file, garmentPreview, removeGarmentBtn, (data) => garmentFileDataUrl = data); garmentDropZone.textContent = "Drag & Drop Garment Here"; return; } let imageUrl = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain"); if (imageUrl) { imageUrl = imageUrl.trim(); console.log("VTO DEBUG: Drop contains a URL:", imageUrl); if (statusDiv) statusDiv.textContent = "Fetching image from URL..."; const dataUrl = await fetchImageAsDataUrl(imageUrl); if (dataUrl) { handleFileSelectFromDataUrl(dataUrl, garmentPreview, removeGarmentBtn, (data) => garmentFileDataUrl = data); if (statusDiv) statusDiv.textContent = ""; } else { if(statusDiv) { statusDiv.textContent = "Failed to load dropped image URL."; statusDiv.style.color = "red"; } } } else { console.log("VTO DEBUG: Drop contains no usable file or URL."); garmentDropZone.textContent = "Drop image file or URL!"; if(statusDiv) { statusDiv.textContent = "Couldn't get image from drop."; statusDiv.style.color = "orange"; } } } catch (dropError) { console.error("VTO Extension ERROR inside drop handler:", dropError); if(statusDiv) { statusDiv.textContent = "Error processing dropped item."; statusDiv.style.color = "red"; } } finally { if (garmentDropZone && garmentDropZone.textContent.includes("Processing")) { garmentDropZone.textContent = "Drag & Drop Garment Here"; } } }); } else { console.error("VTO Extension ERROR: garmentDropZone element NOT FOUND!"); }

        // --- Try On Button Listener (Using fetch + Base64 Conversion + Ngrok Header) ---
        if (tryOnBtn) tryOnBtn.addEventListener("click", async () => {
             console.log("VTO Extension: 'Try It On!' button clicked (fetch + base64).");
             if (!humanFileDataUrl) { alert("Please upload your photo."); return; } if (!garmentFileDataUrl) { alert("Please upload or drag & drop a garment photo."); return; } const garmentDesc = garmentDescInput?.value.trim() ?? ""; if (!garmentDesc) { alert("Please enter a garment description."); return; } if (!GRADIO_APP_BASE_URL || GRADIO_APP_BASE_URL.includes("YOUR-")) { alert("VTO Extension ERROR: Gradio App URL is not configured!"); return; }
             const category = categorySelect?.value ?? 'upper_body'; const numberOfImages = parseInt(numImagesInput?.value ?? "1", 10);
             const payloadData = [ humanFileDataUrl, garmentFileDataUrl, garmentDesc, category, API_DEFAULTS.is_checked, API_DEFAULTS.is_checked_crop, API_DEFAULTS.denoise_steps, API_DEFAULTS.is_randomize_seed, API_DEFAULTS.seed, numberOfImages ]; const payload = { data: payloadData };
             if(statusDiv) { statusDiv.textContent = "Sending request..."; statusDiv.style.color = "blue"; } if(resultArea) resultArea.innerHTML = ""; if(tryOnBtn) tryOnBtn.disabled = true; if(cancelBtn) cancelBtn.style.display = 'block';
             currentAbortController = new AbortController(); const signal = currentAbortController.signal; const timeoutId = setTimeout(() => { if(currentAbortController) currentAbortController.abort(`Timeout after ${REQUEST_TIMEOUT_MS}ms`); }, REQUEST_TIMEOUT_MS);
             console.log("VTO Extension: Sending fetch request to:", GRADIO_API_ENDPOINT);
             try {
                 const response = await fetch(GRADIO_API_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: signal }); clearTimeout(timeoutId);
                 console.log("VTO Extension: Received fetch response:", response.status);

                 // --- Process API Response ---
                 if (response.ok) {
                    const apiResponse = await response.json(); console.log("VTO Extension: Parsed API Response:", apiResponse);
                    if (apiResponse.data && Array.isArray(apiResponse.data) && apiResponse.data.length >= 1) {
                        const galleryData = apiResponse.data[0]; let imageUrls = []; let finalBase64Images = [];
                        // --- Extract Image URLs ---
                        if (Array.isArray(galleryData) && galleryData.length > 0) { console.log("VTO DEBUG: Inspecting first gallery item object:", JSON.stringify(galleryData[0], null, 2)); galleryData.forEach((item, index) => { if (item && typeof item === 'object') { let relativePath = null; if (item.url && typeof item.url === 'string') { relativePath = item.url; } else if (item.path && typeof item.path === 'string') { relativePath = "/file=" + item.path; } else if (item.name && typeof item.name === 'string') { relativePath = "/file=" + item.name; } else { console.warn(`VTO WARNING: Cannot find 'url'/'path'/'name' in item[${index}]`); } if (relativePath) { try { const baseUrl = GRADIO_APP_BASE_URL.replace(/\/$/, ''); const pathPart = relativePath.startsWith('/') ? relativePath : '/' + relativePath; const imageUrl = baseUrl + pathPart; if (imageUrl.startsWith("http")) { console.log(`VTO DEBUG: Constructed URL[${index}]: ${imageUrl}`); imageUrls.push(imageUrl); } else { console.warn(`VTO WARNING: Invalid URL[${index}]: ${imageUrl}`); } } catch(urlError) { console.error(`VTO ERROR: Failed to construct URL[${index}]:`, urlError); } } } else { console.warn(`VTO WARNING: Expected object in galleryData[${index}], got:`, typeof item); } }); } else { console.warn("VTO: gallery data (data[0]) not a non-empty array"); }
                        // --- Mask Image ---
                        let maskImageBase64 = null; if (apiResponse.data.length >= 2 && typeof apiResponse.data[1] === 'string' && apiResponse.data[1].startsWith("data:image")) { maskImageBase64 = apiResponse.data[1]; console.log("VTO: Found mask image (base64)."); } else { console.log("VTO: No valid mask image (base64) found."); }

                        // --- Fetch Images, Convert to Base64, Display ---
                        if (imageUrls.length > 0) {
                            if(statusDiv) { statusDiv.textContent = `Success! Processing ${imageUrls.length} image(s)...`; statusDiv.style.color = "green"; }
                            if(resultArea) resultArea.innerHTML = '';

                            // Create promises to fetch and convert all images
                            const imagePromises = imageUrls.map((url, index) =>
                                new Promise(async (resolve, reject) => {
                                    const img = document.createElement("img"); img.alt = `Loading result ${index + 1}...`; Object.assign(img.style, { maxWidth: "100%", display: 'block', margin: "10px auto", border: "1px solid #ccc" });
                                    if(resultArea) resultArea.appendChild(img); // Append placeholder immediately
                                    try { console.log(`VTO: Fetching image data for URL: ${url}`);
                                        const imgResponse = await fetch(url, { headers: { 'ngrok-skip-browser-warning': 'true' } }); // Add Ngrok header
                                        if (imgResponse.ok) { const blob = await imgResponse.blob(); const reader = new FileReader();
                                            reader.onloadend = () => { const base64data = reader.result; console.log(`VTO: Base64 DataURL created for result ${index + 1}`); console.log(`VTO DEBUG: Base64 String (first 100 chars): `, base64data ? base64data.substring(0, 100) + "..." : "null/undefined"); if (base64data && typeof base64data === 'string' && base64data.startsWith('data:image')) { img.src = base64data; img.alt = `Try-on Result ${index + 1}`; resolve(base64data); /* Resolve promise with base64 */ } else { console.error(`VTO ERROR: Generated base64 data is invalid for result ${index + 1}!`); img.alt = `Failed generate valid data ${index + 1}`; img.style.border = "1px solid purple"; reject(new Error('Invalid base64 data generated')); } };
                                            reader.onerror = (err) => { console.error(`VTO ERROR: FileReader error for result ${index + 1}:`, err); img.alt = `Failed read image data ${index + 1}`; img.style.border = "1px solid red"; reject(err); };
                                            reader.readAsDataURL(blob); // Start conversion
                                        } else { console.error(`VTO: Failed fetch image from URL (${imgResponse.status}): ${url}`); img.alt = `Failed load result ${index + 1} (HTTP ${imgResponse.status})`; img.style.border = "1px solid orange"; reject(new Error(`HTTP ${imgResponse.status}`)); }
                                    } catch (imgFetchError) { console.error(`VTO: Network error fetching image URL: ${url}`, imgFetchError); img.alt = `Failed load result ${index + 1} (Network Error)`; img.style.border = "1px solid red"; reject(imgFetchError); }
                                }) // End Promise
                            ); // End map

                            // --- Wait for all image processing and Save History ---
                            const settledResults = await Promise.allSettled(imagePromises);
                            // Collect successfully generated base64 strings
                            finalBase64Images = settledResults
                                .filter(result => result.status === 'fulfilled' && result.value)
                                .map(result => result.value);

                            console.log(`VTO: Finished processing. Successfully converted ${finalBase64Images.length} images.`);
                            // Update status based on successful conversions
                            if(statusDiv && statusDiv.textContent.includes("Processing")) {
                                statusDiv.textContent = `Success! Generated ${finalBase64Images.length} image(s).`;
                            }

                            // Save history only if images were successfully converted
                            if (finalBase64Images.length > 0) {
                                const historyParams = { desc: garmentDesc, category: category, numImages: finalBase64Images.length };
                                saveToHistory(humanFileDataUrl, garmentFileDataUrl, historyParams, finalBase64Images); // Save base64
                            } else {
                                console.log("VTO Extension: No images successfully converted to base64 for history.");
                                if(statusDiv && statusDiv.textContent.includes("Success")) { // If initial success message was shown but no images converted
                                     statusDiv.textContent = "API Success, but failed to process/display images.";
                                     statusDiv.style.color = "orange";
                                }
                            }

                        } else { // No image URLs constructed
                            if(statusDiv) { statusDiv.textContent = "API Success, but failed to construct valid image URLs."; statusDiv.style.color = "orange"; }
                        }
                    } else { // API response data missing or invalid structure
                        if(statusDiv) { statusDiv.textContent = "API Error: Unexpected response data structure."; statusDiv.style.color = "red"; }
                        console.error("VTO ERROR: API response .data missing or invalid:", apiResponse.data);
                    }
                 } else { // HTTP error from initial API call
                     const errorText = await response.text(); console.error(`VTO Extension: API Error ${response.status}`, errorText); if(statusDiv) { statusDiv.textContent = `API Error: ${response.status}. Check console.`; statusDiv.style.color = "red"; }
                 }
             } catch (error) { // Network/Fetch error from initial API call or AbortError
                  clearTimeout(timeoutId); if (error.name === 'AbortError') { console.log('VTO Extension: Fetch aborted.', error); if(statusDiv && (statusDiv.textContent.includes("Sending") || statusDiv.textContent.includes("cancelling"))) { statusDiv.textContent = `Error: Request ${signal.reason || 'timed out / cancelled'}.`; statusDiv.style.color = "red"; } } else { console.error("VTO Extension: Fetch Error:", error); if(statusDiv) { statusDiv.textContent = `Network/CORS Error: Could not reach API. Check console/server.`; statusDiv.style.color = "red"; } }
             } finally { // Reset UI state regardless of success/error
                  if(tryOnBtn) tryOnBtn.disabled = false; if(cancelBtn) cancelBtn.style.display = 'none'; currentAbortController = null; console.log("VTO Extension: Fetch attempt finished.");
             }
        }); // End tryOnBtn click handler

        // --- Cancel Button Listener ---
        if (cancelBtn) cancelBtn.addEventListener("click", () => { if (currentAbortController) { console.log("VTO Extension: Cancel button clicked."); if(statusDiv) { statusDiv.textContent = "Request cancelling..."; statusDiv.style.color = "orange"; } currentAbortController.abort("Cancelled by user"); } else { console.warn("VTO Extension: Cancel clicked, but no active request."); } }); else { console.warn("VTO Extension WARNING: cancelBtn not found!"); }

        console.log("VTO Extension: Event listeners setup complete.");
    } // End of setupEventListeners function

    // --- Initialize Widget ---
    try { setupEventListeners(); showInitialChoice(); console.log("VTO Extension: Initialized Successfully."); }
    catch (initError) { console.error("VTO Extension: Error during final initialization steps:", initError); alert("VTO Extension Error: Failed during final setup. Check console."); }

} // End of runVtoWidget

// --- Run the main function only after the DOM is ready ---
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', runVtoWidget); }
else { runVtoWidget(); }