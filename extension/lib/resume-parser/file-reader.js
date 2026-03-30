/**
 * File Reader for Resume Parsing
 * 
 * Reads and extracts text from various resume file formats:
 * - PDF (using pdf.js - bundled locally)
 * - DOCX (using mammoth.js - bundled locally)
 * - DOC (limited support, prompts for DOCX conversion)
 * - TXT (direct reading)
 * 
 * Libraries are bundled in lib/vendor/ to comply with Chrome Extension CSP.
 */

/**
 * Library loading state
 */
let pdfjsLoaded = false;
let mammothLoaded = false;

/**
 * Get the URL for a bundled resource
 * @param {string} path - Relative path from extension root
 * @returns {string} Full URL to the resource
 */
function getBundledURL(path) {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        return chrome.runtime.getURL(path);
    }
    // Fallback for testing outside extension context
    return path;
}

/**
 * Load a bundled script
 * @param {string} path - Path relative to extension root
 * @returns {Promise<void>}
 */
async function loadBundledScript(path) {
    const url = getBundledURL(path);
    
    return new Promise((resolve, reject) => {
        // Check if already loaded
        const existing = document.querySelector(`script[data-src="${path}"]`);
        if (existing) {
            resolve();
            return;
        }
        
        const script = document.createElement('script');
        script.src = url;
        script.dataset.src = path; // Mark for duplicate detection
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load bundled library: ${path}`));
        document.head.appendChild(script);
    });
}

/**
 * Load PDF.js library from bundled files
 * @returns {Promise<void>}
 */
async function loadPdfJs() {
    if (pdfjsLoaded && window.pdfjsLib) {
        return;
    }
    
    try {
        await loadBundledScript('lib/vendor/pdf.min.js');
        
        if (window.pdfjsLib) {
            // Configure worker - use bundled worker
            const workerUrl = getBundledURL('lib/vendor/pdf.worker.min.js');
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
            pdfjsLoaded = true;
            console.log('[FileReader] PDF.js loaded successfully');
        } else {
            throw new Error('PDF.js library not found after loading');
        }
    } catch (err) {
        console.error('[FileReader] Failed to load PDF.js:', err);
        throw new Error(
            'PDF.js library failed to load. Please ensure the extension is properly installed. ' +
            'You can also try converting your resume to DOCX or TXT format.'
        );
    }
}

/**
 * Load Mammoth.js library from bundled files
 * @returns {Promise<void>}
 */
async function loadMammoth() {
    if (mammothLoaded && window.mammoth) {
        return;
    }
    
    try {
        await loadBundledScript('lib/vendor/mammoth.browser.min.js');
        
        if (window.mammoth) {
            mammothLoaded = true;
            console.log('[FileReader] Mammoth.js loaded successfully');
        } else {
            throw new Error('Mammoth.js library not found after loading');
        }
    } catch (err) {
        console.error('[FileReader] Failed to load Mammoth.js:', err);
        throw new Error(
            'Mammoth.js library failed to load. Please ensure the extension is properly installed. ' +
            'You can also try converting your resume to TXT format.'
        );
    }
}

/**
 * Get file extension from filename
 * @param {string} filename - File name
 * @returns {string} Lowercase extension without dot
 */
export function getFileExtension(filename) {
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

/**
 * Check if file type is supported
 * @param {string} filename - File name
 * @returns {boolean}
 */
export function isSupported(filename) {
    const ext = getFileExtension(filename);
    return ['pdf', 'docx', 'doc', 'txt', 'text'].includes(ext);
}

/**
 * Get MIME type from file extension
 * @param {string} ext - File extension
 * @returns {string} MIME type
 */
function getMimeType(ext) {
    const mimeTypes = {
        'pdf': 'application/pdf',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'doc': 'application/msword',
        'txt': 'text/plain',
        'text': 'text/plain'
    };
    return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Read text from a PDF file
 * @param {File|ArrayBuffer} file - PDF file or ArrayBuffer
 * @returns {Promise<string>} Extracted text
 */
export async function readPDF(file) {
    // Load PDF.js if not already loaded
    await loadPdfJs();
    
    // Get ArrayBuffer from file if needed
    let arrayBuffer;
    if (file instanceof File) {
        arrayBuffer = await file.arrayBuffer();
    } else {
        arrayBuffer = file;
    }
    
    // Load the PDF document
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    const textParts = [];
    
    // Extract text from each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        // Combine text items
        const pageText = textContent.items
            .map(item => item.str)
            .join(' ');
        
        textParts.push(pageText);
    }
    
    // Join all pages with newlines
    return textParts.join('\n\n');
}

/**
 * Read text from a DOCX file
 * @param {File|ArrayBuffer} file - DOCX file or ArrayBuffer
 * @returns {Promise<string>} Extracted text
 */
export async function readDOCX(file) {
    // Load Mammoth if not already loaded
    await loadMammoth();
    
    // Get ArrayBuffer from file if needed
    let arrayBuffer;
    if (file instanceof File) {
        arrayBuffer = await file.arrayBuffer();
    } else {
        arrayBuffer = file;
    }
    
    // Extract text using Mammoth
    const result = await window.mammoth.extractRawText({ arrayBuffer });
    
    return result.value;
}

/**
 * Read text from a TXT file
 * @param {File} file - TXT file
 * @returns {Promise<string>} File text content
 */
export async function readTXT(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (event) => {
            resolve(event.target.result);
        };
        
        reader.onerror = () => {
            reject(new Error('Failed to read text file'));
        };
        
        reader.readAsText(file);
    });
}

/**
 * Read text from a DOC file (legacy format)
 * Note: DOC support is limited. Best to prompt user to convert to DOCX.
 * @param {File} file - DOC file
 * @returns {Promise<string>} Extracted text (may be incomplete)
 */
export async function readDOC(file) {
    // DOC files are complex binary format
    // Try to extract using mammoth (limited support)
    try {
        return await readDOCX(file);
    } catch (error) {
        // If mammoth fails, try to read as binary and extract visible text
        console.warn('DOC file reading has limited support:', error);
        
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        
        // Try to extract ASCII text from binary
        let text = '';
        let currentWord = '';
        
        for (const byte of bytes) {
            // Check if it's a printable ASCII character
            if (byte >= 32 && byte <= 126) {
                currentWord += String.fromCharCode(byte);
            } else {
                if (currentWord.length > 2) {
                    text += currentWord + ' ';
                }
                currentWord = '';
            }
        }
        
        if (currentWord.length > 2) {
            text += currentWord;
        }
        
        // Clean up the extracted text
        text = text.replace(/\s+/g, ' ').trim();
        
        if (text.length < 100) {
            throw new Error('Could not extract meaningful text from DOC file. Please convert to DOCX or PDF format.');
        }
        
        return text;
    }
}

/**
 * Read resume file and extract text
 * @param {File} file - Resume file (PDF, DOCX, DOC, or TXT)
 * @param {function} onProgress - Progress callback (optional)
 * @returns {Promise<{text: string, format: string, pages: number}>}
 */
export async function readResumeFile(file, onProgress) {
    const extension = getFileExtension(file.name);
    
    if (!isSupported(file.name)) {
        throw new Error(`Unsupported file format: .${extension}. Please use PDF, DOCX, DOC, or TXT.`);
    }
    
    if (onProgress) {
        onProgress({ status: 'loading', message: `Reading ${extension.toUpperCase()} file...` });
    }
    
    let text = '';
    let pages = 1;
    
    try {
        switch (extension) {
            case 'pdf':
                if (onProgress) {
                    onProgress({ status: 'loading', message: 'Loading PDF library...' });
                }
                await loadPdfJs();
                
                if (onProgress) {
                    onProgress({ status: 'parsing', message: 'Extracting text from PDF...' });
                }
                
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                pages = pdf.numPages;
                
                const textParts = [];
                for (let pageNum = 1; pageNum <= pages; pageNum++) {
                    if (onProgress) {
                        onProgress({ 
                            status: 'parsing', 
                            message: `Reading page ${pageNum} of ${pages}...`,
                            progress: pageNum / pages
                        });
                    }
                    
                    const page = await pdf.getPage(pageNum);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(' ');
                    textParts.push(pageText);
                }
                text = textParts.join('\n\n');
                break;
                
            case 'docx':
                if (onProgress) {
                    onProgress({ status: 'loading', message: 'Loading DOCX library...' });
                }
                text = await readDOCX(file);
                break;
                
            case 'doc':
                if (onProgress) {
                    onProgress({ status: 'loading', message: 'Reading DOC file (limited support)...' });
                }
                text = await readDOC(file);
                break;
                
            case 'txt':
            case 'text':
                text = await readTXT(file);
                break;
                
            default:
                throw new Error(`Unsupported format: ${extension}`);
        }
        
        if (onProgress) {
            onProgress({ status: 'complete', message: 'File read successfully' });
        }
        
        // Clean up the text
        text = cleanText(text);
        
        return {
            text,
            format: extension,
            pages,
            fileName: file.name,
            fileSize: file.size
        };
        
    } catch (error) {
        if (onProgress) {
            onProgress({ status: 'error', message: error.message });
        }
        throw error;
    }
}

/**
 * Clean up extracted text
 * @param {string} text - Raw text
 * @returns {string} Cleaned text
 */
function cleanText(text) {
    return text
        // Normalize whitespace
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        // Remove excessive newlines (more than 2 in a row)
        .replace(/\n{3,}/g, '\n\n')
        // Remove excessive spaces
        .replace(/[ \t]+/g, ' ')
        // Remove leading/trailing whitespace from lines
        .split('\n')
        .map(line => line.trim())
        .join('\n')
        // Final trim
        .trim();
}

/**
 * Validate file before processing
 * @param {File} file - File to validate
 * @returns {{valid: boolean, error: string|null}}
 */
export function validateFile(file) {
    // Check if file exists
    if (!file) {
        return { valid: false, error: 'No file provided' };
    }
    
    // Check file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
        return { valid: false, error: 'File is too large. Maximum size is 10MB.' };
    }
    
    // Check file size (min 100 bytes - likely empty)
    if (file.size < 100) {
        return { valid: false, error: 'File appears to be empty or too small.' };
    }
    
    // Check file type
    if (!isSupported(file.name)) {
        const ext = getFileExtension(file.name);
        return { 
            valid: false, 
            error: `Unsupported file format: .${ext}. Please use PDF, DOCX, DOC, or TXT.` 
        };
    }
    
    return { valid: true, error: null };
}
