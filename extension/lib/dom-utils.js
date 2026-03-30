/**
 * DOM Utilities for Resume Autofill Pro
 * 
 * Handles Shadow DOM traversal, element detection, and DOM manipulation
 * that standard methods fail to handle on modern ATS platforms.
 */

/**
 * Recursively query all elements matching a selector, including inside Shadow DOM
 * This is critical for LinkedIn, SmartRecruiters, and other Shadow DOM-heavy sites.
 * 
 * @param {Element|Document|ShadowRoot} root - Root element to search from
 * @param {string} selector - CSS selector to match
 * @returns {Element[]} Array of matching elements
 */
export function deepQuerySelectorAll(root, selector) {
    const results = [];
    
    // Get direct matches from this root
    try {
        const directMatches = root.querySelectorAll(selector);
        results.push(...directMatches);
    } catch (e) {
        // Invalid selector or root, skip
    }
    
    // Traverse all elements looking for shadow roots
    const allElements = root.querySelectorAll('*');
    for (const element of allElements) {
        // Check for open shadow root
        if (element.shadowRoot) {
            const shadowMatches = deepQuerySelectorAll(element.shadowRoot, selector);
            results.push(...shadowMatches);
        }
    }
    
    return results;
}

/**
 * Get a single element matching selector, searching through Shadow DOM
 * 
 * @param {Element|Document|ShadowRoot} root - Root element to search from
 * @param {string} selector - CSS selector to match
 * @returns {Element|null} First matching element or null
 */
export function deepQuerySelector(root, selector) {
    // Try direct match first (most common case)
    try {
        const direct = root.querySelector(selector);
        if (direct) return direct;
    } catch (e) {
        // Invalid selector, continue to shadow search
    }
    
    // Search through shadow roots
    const allElements = root.querySelectorAll('*');
    for (const element of allElements) {
        if (element.shadowRoot) {
            const shadowMatch = deepQuerySelector(element.shadowRoot, selector);
            if (shadowMatch) return shadowMatch;
        }
    }
    
    return null;
}

/**
 * Get ALL form fields on the page, including inside Shadow DOM and iframes
 * This is the primary method for discovering fillable fields.
 * 
 * @param {Element|Document} root - Root to search from (default: document)
 * @returns {Element[]} Array of input, textarea, and select elements
 */
export function getAllFormFields(root = document) {
    const selector = 'input, textarea, select';
    const fields = deepQuerySelectorAll(root, selector);
    
    // Filter out hidden, disabled, and non-fillable fields
    return fields.filter(field => {
        // Skip hidden inputs (except those that might be React-controlled)
        if (field.type === 'hidden') return false;
        
        // Skip submit/button/reset inputs
        if (['submit', 'button', 'reset', 'image'].includes(field.type)) return false;
        
        // Skip disabled fields
        if (field.disabled) return false;
        
        // Skip readonly fields (unless they're dropdowns which might be custom)
        if (field.readOnly && field.tagName !== 'SELECT') return false;
        
        // Check visibility
        if (!isElementVisible(field)) return false;
        
        return true;
    });
}

/**
 * Check if an element is visible on the page
 * Accounts for various ways elements can be hidden.
 * 
 * @param {Element} element - Element to check
 * @returns {boolean} True if element is visible
 */
export function isElementVisible(element) {
    if (!element) return false;
    
    // Check if element or ancestors have display:none or visibility:hidden
    const style = window.getComputedStyle(element);
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden') return false;
    if (style.opacity === '0') return false;
    
    // Check if element has zero dimensions
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    
    // Check if element is off-screen (but allow for scrollable areas)
    // We're lenient here because some forms are in scrollable containers
    if (rect.bottom < -1000 || rect.top > window.innerHeight + 1000) return false;
    
    return true;
}

/**
 * Find the label associated with a form field
 * Checks multiple association methods: for attribute, wrapping label, aria-label, etc.
 * 
 * @param {Element} field - Form field element
 * @returns {string} Label text or empty string
 */
export function getFieldLabel(field) {
    const labels = [];
    
    // 1. Check for label with 'for' attribute matching field's ID
    if (field.id) {
        const forLabel = document.querySelector(`label[for="${field.id}"]`);
        if (forLabel) {
            labels.push(forLabel.textContent.trim());
        }
        
        // Also check in shadow roots
        const shadowLabel = deepQuerySelector(document, `label[for="${field.id}"]`);
        if (shadowLabel && shadowLabel !== forLabel) {
            labels.push(shadowLabel.textContent.trim());
        }
    }
    
    // 2. Check for wrapping label element
    let parent = field.parentElement;
    while (parent && parent !== document.body) {
        if (parent.tagName === 'LABEL') {
            // Get text content but exclude the input's value
            const labelText = parent.textContent.replace(field.value || '', '').trim();
            if (labelText) labels.push(labelText);
            break;
        }
        parent = parent.parentElement;
    }
    
    // 3. Check aria-label attribute
    const ariaLabel = field.getAttribute('aria-label');
    if (ariaLabel) labels.push(ariaLabel.trim());
    
    // 4. Check aria-labelledby
    const ariaLabelledBy = field.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
        const labelElement = document.getElementById(ariaLabelledBy) || 
                            deepQuerySelector(document, `#${ariaLabelledBy}`);
        if (labelElement) {
            labels.push(labelElement.textContent.trim());
        }
    }
    
    // 5. Check placeholder as fallback
    if (field.placeholder) {
        labels.push(field.placeholder.trim());
    }
    
    // 6. Check title attribute
    if (field.title) {
        labels.push(field.title.trim());
    }
    
    // 7. Look for nearby text (sibling or parent's previous sibling)
    const nearbyText = findNearbyLabelText(field);
    if (nearbyText) {
        labels.push(nearbyText);
    }
    
    // Return all found labels joined, prioritizing the first ones
    return labels.join(' | ');
}

/**
 * Find text near a field that might be its label
 * Useful when labels aren't properly associated.
 * 
 * @param {Element} field - Form field element
 * @returns {string|null} Nearby text or null
 */
function findNearbyLabelText(field) {
    // Check previous sibling
    let sibling = field.previousElementSibling;
    if (sibling) {
        // Skip non-text elements
        if (['SPAN', 'DIV', 'P', 'LABEL', 'STRONG', 'B'].includes(sibling.tagName)) {
            const text = sibling.textContent.trim();
            if (text && text.length < 100) return text;
        }
    }
    
    // Check parent's children for a label-like element before this field
    const parent = field.parentElement;
    if (parent) {
        const children = Array.from(parent.children);
        const fieldIndex = children.indexOf(field);
        
        // Look at elements before this field
        for (let i = fieldIndex - 1; i >= 0 && i >= fieldIndex - 3; i--) {
            const child = children[i];
            if (['SPAN', 'DIV', 'P', 'LABEL', 'STRONG', 'B'].includes(child.tagName)) {
                const text = child.textContent.trim();
                if (text && text.length < 100 && !text.includes('\n')) {
                    return text;
                }
            }
        }
    }
    
    return null;
}

/**
 * Get all identifying information about a field for matching
 * Returns a normalized string containing all identifiers.
 * 
 * @param {Element} field - Form field element
 * @returns {object} Field context object
 */
export function getFieldContext(field) {
    return {
        id: field.id || '',
        name: field.name || '',
        type: field.type || field.tagName.toLowerCase(),
        placeholder: field.placeholder || '',
        label: getFieldLabel(field),
        ariaLabel: field.getAttribute('aria-label') || '',
        autocomplete: field.getAttribute('autocomplete') || '',
        dataAttributes: getDataAttributes(field),
        className: field.className || '',
        // Workday-specific
        automationId: field.getAttribute('data-automation-id') || '',
        // Combined string for fuzzy matching
        searchString: ''
    };
}

/**
 * Get all data-* attributes from an element
 * Useful for Workday and other sites that use data attributes.
 * 
 * @param {Element} element - Element to get data attributes from
 * @returns {object} Object of data attribute key-value pairs
 */
export function getDataAttributes(element) {
    const dataAttrs = {};
    for (const attr of element.attributes) {
        if (attr.name.startsWith('data-')) {
            dataAttrs[attr.name] = attr.value;
        }
    }
    return dataAttrs;
}

/**
 * Build a searchable string from field context
 * Used for fuzzy matching.
 * 
 * @param {object} context - Field context from getFieldContext
 * @returns {string} Lowercase searchable string
 */
export function buildSearchString(context) {
    const parts = [
        context.id,
        context.name,
        context.placeholder,
        context.label,
        context.ariaLabel,
        context.autocomplete,
        context.automationId,
        // Include data attribute values
        ...Object.values(context.dataAttributes)
    ];
    
    return parts
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .replace(/[_-]/g, ' '); // Normalize separators
}

/**
 * Wait for an element to appear in the DOM
 * Uses MutationObserver for efficiency.
 * 
 * @param {string} selector - CSS selector to wait for
 * @param {number} timeout - Max time to wait in ms (default: 10000)
 * @param {Element} root - Root to search in (default: document)
 * @returns {Promise<Element>} Resolves with element or rejects on timeout
 */
export function waitForElement(selector, timeout = 10000, root = document) {
    return new Promise((resolve, reject) => {
        // Check if element already exists
        const existing = deepQuerySelector(root, selector);
        if (existing) {
            resolve(existing);
            return;
        }
        
        const observer = new MutationObserver((mutations, obs) => {
            const element = deepQuerySelector(root, selector);
            if (element) {
                obs.disconnect();
                resolve(element);
            }
        });
        
        observer.observe(root === document ? document.body : root, {
            childList: true,
            subtree: true
        });
        
        // Timeout
        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Timeout waiting for element: ${selector}`));
        }, timeout);
    });
}

/**
 * Wait for the page to be "stable" (no DOM changes for a period)
 * Useful for waiting for React/SPA hydration to complete.
 * 
 * @param {number} stableTime - Time with no changes to consider stable (default: 500ms)
 * @param {number} maxWait - Maximum time to wait (default: 5000ms)
 * @returns {Promise<void>} Resolves when page is stable
 */
export function waitForPageStable(stableTime = 500, maxWait = 5000) {
    return new Promise((resolve) => {
        let lastChange = Date.now();
        let checkInterval;
        
        const observer = new MutationObserver(() => {
            lastChange = Date.now();
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true
        });
        
        checkInterval = setInterval(() => {
            const timeSinceChange = Date.now() - lastChange;
            const totalTime = Date.now() - (lastChange - stableTime);
            
            if (timeSinceChange >= stableTime || totalTime >= maxWait) {
                observer.disconnect();
                clearInterval(checkInterval);
                resolve();
            }
        }, 100);
        
        // Safety timeout
        setTimeout(() => {
            observer.disconnect();
            clearInterval(checkInterval);
            resolve();
        }, maxWait);
    });
}

/**
 * Detect if we're inside an iframe
 * 
 * @returns {boolean} True if in iframe
 */
export function isInIframe() {
    try {
        return window.self !== window.top;
    } catch (e) {
        // Cross-origin iframe will throw, which means we're in an iframe
        return true;
    }
}

/**
 * Get the current page's job site type
 * 
 * @returns {string|null} Site identifier or null if unknown
 */
export function detectJobSite() {
    const hostname = window.location.hostname.toLowerCase();
    
    if (hostname.includes('workday.com') || hostname.includes('myworkdayjobs.com')) {
        return 'workday';
    }
    if (hostname.includes('greenhouse.io')) {
        return 'greenhouse';
    }
    if (hostname.includes('lever.co')) {
        return 'lever';
    }
    if (hostname.includes('linkedin.com')) {
        return 'linkedin';
    }
    if (hostname.includes('indeed.com')) {
        return 'indeed';
    }
    if (hostname.includes('icims.com')) {
        return 'icims';
    }
    if (hostname.includes('smartrecruiters.com')) {
        return 'smartrecruiters';
    }
    if (hostname.includes('taleo.net')) {
        return 'taleo';
    }
    if (hostname.includes('brassring.com')) {
        return 'brassring';
    }
    if (hostname.includes('jobvite.com')) {
        return 'jobvite';
    }
    if (hostname.includes('ashbyhq.com')) {
        return 'ashby';
    }
    
    return null;
}

/**
 * Scroll an element into view with smooth animation
 * 
 * @param {Element} element - Element to scroll to
 */
export function scrollIntoViewIfNeeded(element) {
    const rect = element.getBoundingClientRect();
    const isInViewport = (
        rect.top >= 0 &&
        rect.bottom <= window.innerHeight
    );
    
    if (!isInViewport) {
        element.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
    }
}
