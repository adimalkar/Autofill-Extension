/**
 * Content Script for Resume Autofill Pro
 * 
 * This is the main orchestration script that runs on every page.
 * It coordinates between:
 * - DOM utilities (Shadow DOM traversal)
 * - React bridge (framework state sync)
 * - Human emulator (anti-bot evasion)
 * - State machine (multi-step form handling)
 * - Background worker (API calls, storage)
 */

// Since we can't use ES modules in content scripts directly,
// we'll use a bundled approach or inline the essential functionality

(function() {
    'use strict';
    
    // ========================================
    // CONFIGURATION
    // ========================================
    
    const CONFIG = {
        // Whether to use human-like typing (slower but stealthier)
        useHumanEmulation: true,
        
        // Delay before starting autofill (ms) - lets page fully load
        initialDelay: 500,
        
        // Delay to avoid Chrome autofill race condition
        chromeAutofillDelay: 500,
        
        // Visual feedback colors
        colors: {
            filled: '#e0f2fe',      // Light blue for filled fields
            filledBorder: '#3b82f6', // Blue border
            pending: '#fef3c7',      // Light yellow for pending
            pendingBorder: '#f59e0b', // Orange border
            error: '#fee2e2',        // Light red for errors
            errorBorder: '#ef4444',  // Red border
            aiGenerated: '#f3e8ff',  // Light purple for AI content
            aiGeneratedBorder: '#a855f7' // Purple border
        },
        
        // Debug mode
        debug: true
    };
    
    // ========================================
    // LOGGING
    // ========================================
    
    function log(...args) {
        if (CONFIG.debug) {
            console.log('[AutofillPro]', ...args);
        }
    }
    
    function warn(...args) {
        console.warn('[AutofillPro]', ...args);
    }
    
    function error(...args) {
        console.error('[AutofillPro]', ...args);
    }
    
    // ========================================
    // DOM UTILITIES (Inline for content script)
    // ========================================
    
    /**
     * Recursively query all elements matching a selector, including inside Shadow DOM
     */
    function deepQuerySelectorAll(root, selector) {
        const results = [];
        
        try {
            const directMatches = root.querySelectorAll(selector);
            results.push(...directMatches);
        } catch (e) { /* ignore */ }
        
        const allElements = root.querySelectorAll('*');
        for (const element of allElements) {
            if (element.shadowRoot) {
                const shadowMatches = deepQuerySelectorAll(element.shadowRoot, selector);
                results.push(...shadowMatches);
            }
        }
        
        return results;
    }
    
    /**
     * Get ALL form fields on the page, including inside Shadow DOM
     */
    function getAllFormFields(root = document) {
        const selector = 'input, textarea, select';
        const fields = deepQuerySelectorAll(root, selector);
        
        return fields.filter(field => {
            if (field.type === 'hidden') return false;
            if (['submit', 'button', 'reset', 'image'].includes(field.type)) return false;
            if (field.disabled) return false;
            if (field.readOnly && field.tagName !== 'SELECT') return false;
            if (!isElementVisible(field)) return false;
            return true;
        });
    }
    
    /**
     * Check if an element is visible
     */
    function isElementVisible(element) {
        if (!element) return false;
        
        const style = window.getComputedStyle(element);
        if (style.display === 'none') return false;
        if (style.visibility === 'hidden') return false;
        if (style.opacity === '0') return false;
        
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return false;
        
        return true;
    }
    
    /**
     * Get field label and context for matching
     */
    function getFieldContext(field) {
        const context = {
            id: field.id || '',
            name: field.name || '',
            type: field.type || field.tagName.toLowerCase(),
            placeholder: field.placeholder || '',
            ariaLabel: field.getAttribute('aria-label') || '',
            autocomplete: field.getAttribute('autocomplete') || '',
            automationId: field.getAttribute('data-automation-id') || '',
            label: ''
        };
        
        // Find associated label
        if (field.id) {
            const label = document.querySelector(`label[for="${field.id}"]`);
            if (label) context.label = label.textContent.trim();
        }
        
        // Check parent label
        let parent = field.parentElement;
        while (parent && parent !== document.body) {
            if (parent.tagName === 'LABEL') {
                context.label = parent.textContent.replace(field.value || '', '').trim();
                break;
            }
            parent = parent.parentElement;
        }
        
        // Check aria-labelledby
        const labelledBy = field.getAttribute('aria-labelledby');
        if (labelledBy) {
            const labelEl = document.getElementById(labelledBy);
            if (labelEl) context.label = labelEl.textContent.trim();
        }
        
        // Build search string
        context.searchString = [
            context.id,
            context.name,
            context.placeholder,
            context.label,
            context.ariaLabel,
            context.autocomplete,
            context.automationId
        ].filter(Boolean).join(' ').toLowerCase().replace(/[_-]/g, ' ');
        
        return context;
    }
    
    /**
     * Detect which job site we're on
     */
    function detectJobSite() {
        const hostname = window.location.hostname.toLowerCase();
        
        if (hostname.includes('workday.com') || hostname.includes('myworkdayjobs.com')) return 'workday';
        if (hostname.includes('greenhouse.io')) return 'greenhouse';
        if (hostname.includes('lever.co')) return 'lever';
        if (hostname.includes('linkedin.com')) return 'linkedin';
        if (hostname.includes('indeed.com')) return 'indeed';
        if (hostname.includes('icims.com')) return 'icims';
        if (hostname.includes('smartrecruiters.com')) return 'smartrecruiters';
        if (hostname.includes('taleo.net')) return 'taleo';
        
        return null;
    }
    
    /**
     * Check if we're in an iframe
     */
    function isInIframe() {
        try {
            return window.self !== window.top;
        } catch (e) {
            return true;
        }
    }
    
    // ========================================
    // REACT BRIDGE (Inline for content script)
    // ========================================
    
    /**
     * Set input value with React compatibility
     */
    function setReactInputValue(input, value) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
            input.tagName === 'TEXTAREA' 
                ? window.HTMLTextAreaElement.prototype 
                : window.HTMLInputElement.prototype,
            'value'
        )?.set;
        
        if (nativeSetter) {
            nativeSetter.call(input, value);
        } else {
            input.value = value;
        }
        
        // Dispatch events
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
        
        // Trigger React tracker
        if (input._valueTracker) {
            input._valueTracker.setValue('');
        }
    }
    
    /**
     * Set select value with fuzzy matching
     */
    function setSelectValue(select, targetValue) {
        const options = Array.from(select.options);
        const normalized = targetValue.toLowerCase().trim();
        
        // Try exact match first
        let match = options.find(o => o.value === targetValue || o.text === targetValue);
        
        // Try case-insensitive
        if (!match) {
            match = options.find(o => 
                o.value.toLowerCase() === normalized || 
                o.text.toLowerCase() === normalized
            );
        }
        
        // Try partial match
        if (!match) {
            match = options.find(o => 
                o.text.toLowerCase().includes(normalized) || 
                normalized.includes(o.text.toLowerCase())
            );
        }
        
        if (match) {
            const nativeSetter = Object.getOwnPropertyDescriptor(
                window.HTMLSelectElement.prototype,
                'value'
            )?.set;
            
            if (nativeSetter) {
                nativeSetter.call(select, match.value);
            } else {
                select.value = match.value;
            }
            
            select.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        }
        
        return false;
    }
    
    // ========================================
    // HUMAN EMULATION (Simplified inline version)
    // ========================================
    
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    function randomDelay(min, max) {
        const delay = min + Math.random() * (max - min);
        return new Promise(resolve => setTimeout(resolve, delay));
    }
    
    /**
     * Type text with human-like delays
     */
    async function humanType(input, text) {
        input.focus();
        await randomDelay(100, 200);
        
        // Clear existing value
        if (input.value) {
            input.select();
            await sleep(50);
            setReactInputValue(input, '');
            await sleep(50);
        }
        
        // Type each character
        for (const char of text) {
            const current = input.value;
            setReactInputValue(input, current + char);
            await randomDelay(50, 150);
        }
        
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
    }
    
    // ========================================
    // FIELD MATCHING (Tier 1 - Regex/Fuzzy)
    // ========================================
    
    /**
     * Field patterns for matching
     * Maps regex patterns to user profile field names
     */
    const FIELD_PATTERNS = {
        // Personal Info
        firstName: /first\s*name|fname|given\s*name|first$/i,
        lastName: /last\s*name|lname|surname|family\s*name|last$/i,
        middleName: /middle\s*name|mname/i,
        preferredName: /preferred\s*name|nickname/i,
        fullName: /full\s*name|name$/i,
        
        // Contact
        email: /email|e-mail/i,
        phone: /phone|mobile|tel|cell/i,
        countryCode: /country\s*code|dial\s*code/i,
        
        // Location
        currentCity: /city|town/i,
        currentState: /state|province|region/i,
        zipCode: /zip|postal\s*code|postcode/i,
        country: /country(?!\s*code)/i,
        address: /address|street/i,
        
        // Professional Links
        linkedinUrl: /linkedin/i,
        githubUrl: /github/i,
        portfolioWebsite: /portfolio|website|personal\s*site|url/i,
        
        // Education
        schoolName: /school|university|college|institution/i,
        degreeType: /degree|education\s*level/i,
        major: /major|field\s*of\s*study|concentration/i,
        gpa: /gpa|grade\s*point/i,
        graduationDate: /graduation|grad\s*date|completion/i,
        
        // Work Experience
        currentEmployer: /current\s*employer|company|organization/i,
        currentJobTitle: /job\s*title|position|role|title/i,
        startDate: /start\s*date|from\s*date|begin/i,
        endDate: /end\s*date|to\s*date/i,
        
        // Skills
        skills: /skills|expertise|competencies/i,
        certifications: /certification|certificate|credential/i,
        
        // Legal/Compliance
        workAuthorization: /work\s*auth|authorized\s*to\s*work|legally\s*authorized|eligibility/i,
        sponsorship: /sponsor|visa\s*sponsor/i,
        
        // Demographics (EEO)
        race: /race/i,
        ethnicity: /ethnic/i,
        gender: /gender|sex/i,
        veteranStatus: /veteran/i,
        disabilityStatus: /disab/i,
        
        // Application Preferences
        desiredSalary: /salary|compensation|pay/i,
        noticePeriod: /notice\s*period|availability|start\s*date/i,
        relocationPreference: /relocation|relocate|willing\s*to\s*move/i,
        howDidYouHear: /how\s*did\s*you\s*(hear|find|learn)/i,
        
        // Long-form
        coverLetter: /cover\s*letter|letter\s*of\s*interest/i,
        whyWorkHere: /why\s*(do\s*you\s*)?(want|interested)|why\s*this\s*(company|role|position)/i,
        additionalInfo: /additional\s*info|anything\s*else|other\s*info/i
    };
    
    /**
     * Match a field to a user profile property
     * Returns { fieldType, confidence } or null
     */
    function matchField(context) {
        const searchStr = context.searchString;
        
        for (const [fieldType, pattern] of Object.entries(FIELD_PATTERNS)) {
            if (pattern.test(searchStr)) {
                // Calculate confidence based on match specificity
                const confidence = calculateMatchConfidence(searchStr, pattern, fieldType);
                return { fieldType, confidence };
            }
        }
        
        return null;
    }
    
    /**
     * Calculate match confidence score (0-1)
     */
    function calculateMatchConfidence(searchStr, pattern, fieldType) {
        // Base confidence
        let confidence = 0.7;
        
        // Higher confidence for ID/name attribute matches
        if (pattern.test(searchStr.split(' ')[0])) {
            confidence += 0.2;
        }
        
        // Higher confidence for autocomplete attribute
        if (searchStr.includes('autocomplete')) {
            confidence += 0.1;
        }
        
        return Math.min(confidence, 1.0);
    }
    
    // ========================================
    // VISUAL FEEDBACK
    // ========================================
    
    /**
     * Highlight a field to show it was filled
     */
    function highlightField(field, type = 'filled') {
        const colors = CONFIG.colors;
        
        let bgColor, borderColor;
        switch (type) {
            case 'filled':
                bgColor = colors.filled;
                borderColor = colors.filledBorder;
                break;
            case 'pending':
                bgColor = colors.pending;
                borderColor = colors.pendingBorder;
                break;
            case 'error':
                bgColor = colors.error;
                borderColor = colors.errorBorder;
                break;
            case 'ai':
                bgColor = colors.aiGenerated;
                borderColor = colors.aiGeneratedBorder;
                break;
            default:
                return;
        }
        
        field.style.backgroundColor = bgColor;
        field.style.borderColor = borderColor;
        field.style.borderWidth = '2px';
        field.style.borderStyle = 'solid';
        field.style.transition = 'all 0.3s ease';
    }
    
    /**
     * Show a notification toast
     */
    function showNotification(message, type = 'info') {
        // Remove existing notification
        const existing = document.getElementById('autofill-pro-notification');
        if (existing) existing.remove();
        
        const notification = document.createElement('div');
        notification.id = 'autofill-pro-notification';
        notification.textContent = message;
        
        const colors = {
            info: '#3b82f6',
            success: '#10b981',
            warning: '#f59e0b',
            error: '#ef4444'
        };
        
        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '12px 20px',
            backgroundColor: colors[type] || colors.info,
            color: 'white',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: '999999',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: '14px',
            fontWeight: '500',
            animation: 'slideIn 0.3s ease'
        });
        
        document.body.appendChild(notification);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
    
    // Add animation styles
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
    `;
    document.head.appendChild(style);
    
    // ========================================
    // MAIN AUTOFILL LOGIC
    // ========================================
    
    /**
     * Get user profile data from storage
     */
    async function getUserProfile() {
        return new Promise((resolve) => {
            chrome.storage.sync.get(['userProfile'], (result) => {
                resolve(result.userProfile || {});
            });
        });
    }
    
    /**
     * Fill a single field
     */
    async function fillField(field, value, useHumanEmulation = false) {
        if (!field || !value) return false;
        
        try {
            // Wait for Chrome autofill race condition
            await sleep(CONFIG.chromeAutofillDelay);
            
            // Scroll into view if needed
            const rect = field.getBoundingClientRect();
            if (rect.top < 0 || rect.bottom > window.innerHeight) {
                field.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await sleep(300);
            }
            
            // Fill based on field type
            if (field.tagName === 'SELECT') {
                const success = setSelectValue(field, value);
                if (success) highlightField(field, 'filled');
                return success;
            } else if (useHumanEmulation && CONFIG.useHumanEmulation) {
                await humanType(field, value);
                highlightField(field, 'filled');
                return true;
            } else {
                setReactInputValue(field, value);
                highlightField(field, 'filled');
                return true;
            }
        } catch (err) {
            error('Failed to fill field:', err);
            highlightField(field, 'error');
            return false;
        }
    }
    
    /**
     * Main autofill function
     */
    async function autofillPage(options = {}) {
        const {
            useHumanEmulation = false,
            fieldsToFill = null // null = all fields
        } = options;
        
        log('Starting autofill...');
        const startTime = Date.now();
        
        // Get user profile
        const profile = await getUserProfile();
        if (!profile || Object.keys(profile).length === 0) {
            showNotification('No profile data found. Please set up your profile first.', 'warning');
            return { success: false, filled: 0, total: 0 };
        }
        
        // Detect site for potential site-specific handling
        const site = detectJobSite();
        log('Detected site:', site || 'generic');
        
        // Wait for page to stabilize (especially for SPAs)
        await sleep(CONFIG.initialDelay);
        
        // Get all form fields
        const fields = getAllFormFields();
        log(`Found ${fields.length} fillable fields`);
        
        if (fields.length === 0) {
            showNotification('No fillable fields found on this page.', 'info');
            return { success: false, filled: 0, total: 0 };
        }
        
        // Match and fill fields
        let filledCount = 0;
        let skippedCount = 0;
        
        for (const field of fields) {
            // Skip if already has a value (don't overwrite)
            if (field.value && field.value.trim()) {
                skippedCount++;
                continue;
            }
            
            // Get field context
            const context = getFieldContext(field);
            
            // Match field to profile property
            const match = matchField(context);
            
            if (match && match.confidence > 0.5) {
                const { fieldType } = match;
                const value = profile[fieldType];
                
                if (value) {
                    log(`Filling ${fieldType} (confidence: ${match.confidence.toFixed(2)})`);
                    const success = await fillField(field, value, useHumanEmulation);
                    if (success) filledCount++;
                } else {
                    log(`No value for ${fieldType}`);
                    highlightField(field, 'pending');
                }
            }
            
            // Small delay between fields for human-like behavior
            if (useHumanEmulation) {
                await randomDelay(200, 400);
            }
        }
        
        const duration = Date.now() - startTime;
        log(`Autofill complete: ${filledCount}/${fields.length} fields filled in ${duration}ms`);
        
        // Show result notification
        if (filledCount > 0) {
            showNotification(`Filled ${filledCount} fields successfully!`, 'success');
        } else {
            showNotification('No matching fields found to fill.', 'info');
        }
        
        return {
            success: filledCount > 0,
            filled: filledCount,
            total: fields.length,
            skipped: skippedCount,
            duration
        };
    }
    
    // ========================================
    // MESSAGE HANDLING
    // ========================================
    
    /**
     * Listen for messages from popup/background
     */
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        log('Received message:', request.action);
        
        switch (request.action) {
            case 'autofill':
                autofillPage(request.options || {})
                    .then(result => sendResponse(result))
                    .catch(err => {
                        error('Autofill error:', err);
                        sendResponse({ success: false, error: err.message });
                    });
                return true; // Keep channel open for async response
            
            case 'getFields':
                const fields = getAllFormFields();
                const fieldData = fields.map(f => ({
                    tagName: f.tagName,
                    type: f.type,
                    id: f.id,
                    name: f.name,
                    ...getFieldContext(f)
                }));
                sendResponse({ fields: fieldData });
                break;
            
            case 'ping':
                sendResponse({ status: 'ok', site: detectJobSite(), inIframe: isInIframe() });
                break;
            
            default:
                sendResponse({ error: 'Unknown action' });
        }
    });
    
    // ========================================
    // INITIALIZATION
    // ========================================
    
    /**
     * Initialize content script
     */
    function init() {
        log('Content script loaded');
        log('Site:', detectJobSite() || 'generic');
        log('In iframe:', isInIframe());
        
        // Don't auto-fill, wait for user action via popup
        // But we can set up observers for dynamic content if needed
    }
    
    // Run initialization when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
})();
