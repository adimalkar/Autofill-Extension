/**
 * Background Service Worker for Resume Autofill Pro
 * 
 * Handles:
 * - State persistence (survives service worker restarts)
 * - API calls to OpenAI/Gemini (Tier 3)
 * - Chrome debugger API for isTrusted events
 * - Cross-tab coordination
 * 
 * IMPORTANT: Manifest V3 service workers are ephemeral and terminate after
 * ~30 seconds of inactivity. All state must be persisted to chrome.storage.
 */

// ========================================
// STORAGE KEYS
// ========================================

const STORAGE_KEYS = {
    USER_PROFILE: 'userProfile',
    API_KEYS: 'apiKeys',
    SETTINGS: 'settings',
    FILL_STATE: 'fillState',
    STATISTICS: 'statistics'
};

// ========================================
// DEFAULT SETTINGS
// ========================================

const DEFAULT_SETTINGS = {
    useHumanEmulation: true,
    autoFillOnPageLoad: false,
    showNotifications: true,
    highlightFilledFields: true,
    tier3Enabled: false, // Cloud LLM disabled by default
    preferredLLM: 'openai', // 'openai' or 'gemini'
    debugMode: false
};

// ========================================
// LOGGING
// ========================================

function log(...args) {
    console.log('[AutofillPro:BG]', ...args);
}

function error(...args) {
    console.error('[AutofillPro:BG]', ...args);
}

// ========================================
// STORAGE HELPERS
// ========================================

/**
 * Get data from storage
 */
async function getFromStorage(key, defaultValue = null) {
    try {
        const result = await chrome.storage.sync.get(key);
        return result[key] !== undefined ? result[key] : defaultValue;
    } catch (err) {
        error('Storage get error:', err);
        return defaultValue;
    }
}

/**
 * Save data to storage
 */
async function saveToStorage(key, value) {
    try {
        await chrome.storage.sync.set({ [key]: value });
        return true;
    } catch (err) {
        error('Storage set error:', err);
        return false;
    }
}

/**
 * Get session storage (survives service worker restarts, clears on browser close)
 */
async function getSessionStorage(key, defaultValue = null) {
    try {
        const result = await chrome.storage.session.get(key);
        return result[key] !== undefined ? result[key] : defaultValue;
    } catch (err) {
        error('Session storage get error:', err);
        return defaultValue;
    }
}

/**
 * Save to session storage
 */
async function saveSessionStorage(key, value) {
    try {
        await chrome.storage.session.set({ [key]: value });
        return true;
    } catch (err) {
        error('Session storage set error:', err);
        return false;
    }
}

// ========================================
// USER PROFILE
// ========================================

/**
 * Get user profile
 */
async function getUserProfile() {
    return await getFromStorage(STORAGE_KEYS.USER_PROFILE, {});
}

/**
 * Save user profile
 */
async function saveUserProfile(profile) {
    return await saveToStorage(STORAGE_KEYS.USER_PROFILE, profile);
}

// ========================================
// SETTINGS
// ========================================

/**
 * Get settings
 */
async function getSettings() {
    const stored = await getFromStorage(STORAGE_KEYS.SETTINGS, {});
    return { ...DEFAULT_SETTINGS, ...stored };
}

/**
 * Save settings
 */
async function saveSettings(settings) {
    const current = await getSettings();
    return await saveToStorage(STORAGE_KEYS.SETTINGS, { ...current, ...settings });
}

// ========================================
// API KEYS
// ========================================

/**
 * Get API keys (encrypted in production)
 */
async function getApiKeys() {
    return await getFromStorage(STORAGE_KEYS.API_KEYS, {});
}

/**
 * Save API keys
 */
async function saveApiKeys(keys) {
    return await saveToStorage(STORAGE_KEYS.API_KEYS, keys);
}

// ========================================
// TIER 3: CLOUD LLM INTEGRATION
// ========================================

/**
 * Call OpenAI API
 */
async function callOpenAI(prompt, options = {}) {
    const apiKeys = await getApiKeys();
    const apiKey = apiKeys.openai;
    
    if (!apiKey) {
        throw new Error('OpenAI API key not configured');
    }
    
    const {
        model = 'gpt-4o-mini',
        maxTokens = 500,
        temperature = 0.7
    } = options;
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: maxTokens,
            temperature
        })
    });
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenAI API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
    }
    
    const data = await response.json();
    return data.choices[0]?.message?.content || '';
}

/**
 * Call Google Gemini API
 */
async function callGemini(prompt, options = {}) {
    const apiKeys = await getApiKeys();
    const apiKey = apiKeys.gemini;
    
    if (!apiKey) {
        throw new Error('Gemini API key not configured');
    }
    
    const {
        model = 'gemini-1.5-flash',
        maxTokens = 500
    } = options;
    
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    maxOutputTokens: maxTokens
                }
            })
        }
    );
    
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Gemini API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
    }
    
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/**
 * Generate content using preferred LLM
 */
async function generateContent(prompt, options = {}) {
    const settings = await getSettings();
    
    if (!settings.tier3Enabled) {
        throw new Error('Cloud LLM is disabled in settings');
    }
    
    if (settings.preferredLLM === 'gemini') {
        return await callGemini(prompt, options);
    } else {
        return await callOpenAI(prompt, options);
    }
}

/**
 * Generate a cover letter
 */
async function generateCoverLetter(jobInfo) {
    const profile = await getUserProfile();
    
    const prompt = `Write a professional cover letter for the following job application.

Job Title: ${jobInfo.title || 'Not specified'}
Company: ${jobInfo.company || 'Not specified'}
Job Description: ${jobInfo.description || 'Not provided'}

Applicant Background:
- Name: ${profile.firstName || ''} ${profile.lastName || ''}
- Current Role: ${profile.currentJobTitle || 'Not specified'}
- Skills: ${profile.skills || 'Not specified'}
- Summary: ${profile.coverLetterTemplate || profile.additionalInfo || 'Not provided'}

Requirements:
- Keep it under 300 words
- Professional but personable tone
- Highlight relevant experience
- Show enthusiasm for the role
- Do not make up specific achievements not mentioned above

Generate only the cover letter text, no additional commentary.`;

    return await generateContent(prompt, { maxTokens: 800 });
}

/**
 * Generate answer for "Why do you want to work here?"
 */
async function generateWhyWorkHere(jobInfo) {
    const profile = await getUserProfile();
    
    const prompt = `Generate a concise answer for the job application question: "Why do you want to work here?"

Company: ${jobInfo.company || 'this company'}
Role: ${jobInfo.title || 'this position'}
Company Description: ${jobInfo.companyDescription || 'Not provided'}

Applicant Background:
- Current Role: ${profile.currentJobTitle || 'Not specified'}
- Experience: ${profile.currentEmployer || 'Various companies'}

Requirements:
- 2-3 sentences maximum
- Professional tone
- Connect applicant's background to the opportunity
- Be genuine, not generic

Generate only the answer, no additional commentary.`;

    return await generateContent(prompt, { maxTokens: 200 });
}

// ========================================
// STATISTICS
// ========================================

/**
 * Update fill statistics
 */
async function updateStatistics(filled, total) {
    const stats = await getFromStorage(STORAGE_KEYS.STATISTICS, {
        totalFieldsFilled: 0,
        totalApplications: 0,
        lastFillDate: null
    });
    
    stats.totalFieldsFilled += filled;
    stats.totalApplications += 1;
    stats.lastFillDate = new Date().toISOString();
    
    await saveToStorage(STORAGE_KEYS.STATISTICS, stats);
}

// ========================================
// CHROME DEBUGGER API (for isTrusted events)
// ========================================

/**
 * Perform a trusted click using Chrome Debugger API
 * This creates events with isTrusted: true
 */
async function trustedClick(tabId, selector) {
    try {
        // Attach debugger
        await chrome.debugger.attach({ tabId }, '1.3');
        log('Debugger attached to tab', tabId);
        
        // Get element coordinates
        const evalResult = await chrome.debugger.sendCommand(
            { tabId },
            'Runtime.evaluate',
            {
                expression: `
                    (function() {
                        const el = document.querySelector('${selector}');
                        if (!el) return null;
                        const rect = el.getBoundingClientRect();
                        return { x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
                    })()
                `,
                returnByValue: true
            }
        );
        
        const coords = evalResult.result?.value;
        if (!coords) {
            throw new Error('Element not found: ' + selector);
        }
        
        // Perform click
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x: coords.x,
            y: coords.y,
            button: 'left',
            clickCount: 1
        });
        
        await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x: coords.x,
            y: coords.y,
            button: 'left'
        });
        
        log('Trusted click performed at', coords);
        
        // Detach debugger
        await chrome.debugger.detach({ tabId });
        
        return { success: true };
    } catch (err) {
        error('Trusted click failed:', err);
        
        // Try to detach debugger even on error
        try {
            await chrome.debugger.detach({ tabId });
        } catch (e) { /* ignore */ }
        
        return { success: false, error: err.message };
    }
}

// ========================================
// MESSAGE HANDLING
// ========================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    log('Message received:', request.action);
    
    const handleAsync = async () => {
        switch (request.action) {
            // Profile management
            case 'getProfile':
                return await getUserProfile();
            
            case 'saveProfile':
                await saveUserProfile(request.profile);
                return { success: true };
            
            // Settings management
            case 'getSettings':
                return await getSettings();
            
            case 'saveSettings':
                await saveSettings(request.settings);
                return { success: true };
            
            // API keys
            case 'getApiKeys':
                return await getApiKeys();
            
            case 'saveApiKeys':
                await saveApiKeys(request.keys);
                return { success: true };
            
            // Tier 3 LLM
            case 'generateCoverLetter':
                const coverLetter = await generateCoverLetter(request.jobInfo);
                return { content: coverLetter };
            
            case 'generateWhyWorkHere':
                const answer = await generateWhyWorkHere(request.jobInfo);
                return { content: answer };
            
            case 'generateContent':
                const content = await generateContent(request.prompt, request.options);
                return { content };
            
            // Statistics
            case 'getStatistics':
                return await getFromStorage(STORAGE_KEYS.STATISTICS, {});
            
            case 'updateStatistics':
                await updateStatistics(request.filled, request.total);
                return { success: true };
            
            // Trusted click (for protected sites)
            case 'trustedClick':
                return await trustedClick(sender.tab?.id || request.tabId, request.selector);
            
            // Inject script into page's main world
            case 'injectScript':
                await chrome.scripting.executeScript({
                    target: { tabId: sender.tab?.id || request.tabId },
                    files: ['injected.js'],
                    world: 'MAIN'
                });
                return { success: true };
            
            default:
                return { error: 'Unknown action: ' + request.action };
        }
    };
    
    handleAsync()
        .then(result => sendResponse(result))
        .catch(err => {
            error('Error handling message:', err);
            sendResponse({ error: err.message });
        });
    
    return true; // Keep message channel open for async response
});

// ========================================
// EXTENSION LIFECYCLE
// ========================================

// Handle extension install/update
chrome.runtime.onInstalled.addListener(async (details) => {
    log('Extension installed/updated:', details.reason);
    
    if (details.reason === 'install') {
        // Initialize default settings
        await saveSettings(DEFAULT_SETTINGS);
        
        // Open options page for first-time setup
        chrome.tabs.create({
            url: chrome.runtime.getURL('options.html')
        });
    }
});

// Handle extension startup
chrome.runtime.onStartup.addListener(() => {
    log('Extension started');
});

// Keep service worker alive during active operations
// (Not strictly necessary with proper state persistence, but can help)
let keepAliveInterval = null;

function startKeepAlive() {
    if (keepAliveInterval) return;
    
    keepAliveInterval = setInterval(() => {
        // Just access storage to keep worker alive
        chrome.storage.session.get('keepAlive');
    }, 20000); // Every 20 seconds
}

function stopKeepAlive() {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
    }
}

// ========================================
// CONTEXT MENU
// ========================================

// Only set up context menus if the API is fully available
if (chrome.contextMenus && chrome.contextMenus.onClicked) {
    // Create context menu on install
    chrome.runtime.onInstalled.addListener(() => {
        try {
            chrome.contextMenus.create({
                id: 'autofill-page',
                title: 'Autofill this page',
                contexts: ['page']
            });
            
            chrome.contextMenus.create({
                id: 'autofill-field',
                title: 'Autofill this field',
                contexts: ['editable']
            });
        } catch (e) {
            console.warn('[AutofillPro] Failed to create context menus:', e);
        }
    });

    // Handle context menu clicks
    chrome.contextMenus.onClicked.addListener((info, tab) => {
        if (info.menuItemId === 'autofill-page') {
            chrome.tabs.sendMessage(tab.id, { action: 'autofill' });
        } else if (info.menuItemId === 'autofill-field') {
            // Would need to identify the specific field that was right-clicked
            chrome.tabs.sendMessage(tab.id, { action: 'autofill' });
        }
    });
} else {
    console.warn('[AutofillPro] contextMenus API not available or incomplete');
}

log('Background service worker initialized');
