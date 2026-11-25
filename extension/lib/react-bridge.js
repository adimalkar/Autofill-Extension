/**
 * React Bridge for Resume Autofill Pro
 * 
 * Handles React/Vue/Angular state synchronization.
 * The key insight: setting input.value doesn't update React's internal state,
 * causing "silent failures" where fields look filled but submit empty.
 * 
 * This module provides framework-aware value setting that properly triggers
 * state updates in React 16+, Vue 3, and Angular applications.
 */

/**
 * Resolve native property setter from the element's own realm so this module
 * works in main window, iframes, Shadow DOM, and non-window test environments.
 */
function getNativePropertySetter(element, propName, defaultTagName = 'INPUT') {
    const view = element?.ownerDocument?.defaultView || globalThis;
    const tagName = element?.tagName?.toUpperCase() || defaultTagName;

    let ctorName = 'HTMLInputElement';
    if (tagName === 'TEXTAREA') {
        ctorName = 'HTMLTextAreaElement';
    } else if (tagName === 'SELECT') {
        ctorName = 'HTMLSelectElement';
    }

    const proto = view?.[ctorName]?.prototype;
    return proto ? Object.getOwnPropertyDescriptor(proto, propName)?.set : undefined;
}

function createSyntheticEvent(element, type, init = { bubbles: true, cancelable: true }) {
    const view = element?.ownerDocument?.defaultView || globalThis;
    const EventCtor = view?.Event || globalThis.Event;
    return new EventCtor(type, init);
}

/**
 * Set input value in a React-compatible way
 * Uses the prototype hijack technique to ensure React's state updates.
 * 
 * @param {HTMLInputElement} input - Input element to set value on
 * @param {string} value - Value to set
 * @param {object} options - Options for setting value
 * @returns {boolean} True if value was set successfully
 */
export function setReactInputValue(input, value, options = {}) {
    const {
        dispatchEvents = true,
        useNativeSetter = true
    } = options;
    
    if (!input || value === undefined || value === null) {
        return false;
    }
    
    const previousValue = input.value;
    
    try {
        // Use native setter to bypass React's wrapper
        const nativeInputValueSetter = getNativePropertySetter(input, 'value', 'INPUT');
        if (useNativeSetter && nativeInputValueSetter) {
            nativeInputValueSetter.call(input, value);
        } else {
            // Fallback to direct assignment
            input.value = value;
        }
        
        if (dispatchEvents) {
            dispatchInputEvents(input, previousValue);
        }
        
        return true;
    } catch (error) {
        console.error('[ReactBridge] Failed to set input value:', error);
        return false;
    }
}

/**
 * Set textarea value in a React-compatible way
 * 
 * @param {HTMLTextAreaElement} textarea - Textarea element
 * @param {string} value - Value to set
 * @param {object} options - Options for setting value
 * @returns {boolean} True if value was set successfully
 */
export function setReactTextAreaValue(textarea, value, options = {}) {
    const {
        dispatchEvents = true,
        useNativeSetter = true
    } = options;
    
    if (!textarea || value === undefined || value === null) {
        return false;
    }
    
    const previousValue = textarea.value;
    
    try {
        const nativeTextAreaValueSetter = getNativePropertySetter(textarea, 'value', 'TEXTAREA');
        if (useNativeSetter && nativeTextAreaValueSetter) {
            nativeTextAreaValueSetter.call(textarea, value);
        } else {
            textarea.value = value;
        }
        
        if (dispatchEvents) {
            dispatchInputEvents(textarea, previousValue);
        }
        
        return true;
    } catch (error) {
        console.error('[ReactBridge] Failed to set textarea value:', error);
        return false;
    }
}

/**
 * Set select value in a React-compatible way
 * 
 * @param {HTMLSelectElement} select - Select element
 * @param {string} value - Value to set
 * @param {object} options - Options for setting value
 * @returns {boolean} True if value was set successfully
 */
export function setReactSelectValue(select, value, options = {}) {
    const {
        dispatchEvents = true,
        useNativeSetter = true
    } = options;
    
    if (!select || value === undefined || value === null) {
        return false;
    }
    
    const previousValue = select.value;
    
    try {
        // For selects, we need to find the matching option
        const matchingOption = findMatchingOption(select, value);
        
        if (matchingOption) {
            const nativeSelectValueSetter = getNativePropertySetter(select, 'value', 'SELECT');
            if (useNativeSetter && nativeSelectValueSetter) {
                nativeSelectValueSetter.call(select, matchingOption.value);
            } else {
                select.value = matchingOption.value;
            }
            
            // Also set the selected property on the option
            matchingOption.selected = true;
            
            if (dispatchEvents) {
                dispatchSelectEvents(select, previousValue);
            }
            
            return true;
        } else {
            console.warn(`[ReactBridge] No matching option found for value: ${value}`);
            return false;
        }
    } catch (error) {
        console.error('[ReactBridge] Failed to set select value:', error);
        return false;
    }
}

/**
 * Universal value setter that handles any form field type
 * 
 * @param {HTMLElement} field - Form field element
 * @param {string} value - Value to set
 * @param {object} options - Options for setting value
 * @returns {boolean} True if value was set successfully
 */
export function setFieldValue(field, value, options = {}) {
    if (!field) return false;
    
    const tagName = field.tagName.toUpperCase();
    const inputType = field.type?.toLowerCase();
    
    switch (tagName) {
        case 'INPUT':
            if (inputType === 'checkbox') {
                return setCheckboxValue(field, value, options);
            } else if (inputType === 'radio') {
                return setRadioValue(field, value, options);
            } else if (inputType === 'file') {
                // File inputs cannot be programmatically filled (browser security)
                console.warn('[ReactBridge] File inputs cannot be auto-filled');
                return false;
            } else {
                return setReactInputValue(field, value, options);
            }
        
        case 'TEXTAREA':
            return setReactTextAreaValue(field, value, options);
        
        case 'SELECT':
            return setReactSelectValue(field, value, options);
        
        default:
            // Try contenteditable elements
            if (field.isContentEditable) {
                return setContentEditableValue(field, value, options);
            }
            return false;
    }
}

/**
 * Set checkbox value
 * 
 * @param {HTMLInputElement} checkbox - Checkbox element
 * @param {boolean|string} value - Value to set (truthy = checked)
 * @param {object} options - Options
 * @returns {boolean} Success
 */
function setCheckboxValue(checkbox, value, options = {}) {
    const shouldBeChecked = value === true || 
                           value === 'true' || 
                           value === '1' || 
                           value === 'yes' ||
                           value === checkbox.value;
    
    const previousChecked = Boolean(checkbox.checked);
    if (previousChecked !== shouldBeChecked) {
        const nativeCheckedSetter = options.useNativeSetter !== false
            ? getNativePropertySetter(checkbox, 'checked', 'INPUT')
            : null;
        if (nativeCheckedSetter) {
            nativeCheckedSetter.call(checkbox, shouldBeChecked);
        } else {
            checkbox.checked = shouldBeChecked;
        }
        
        if (options.dispatchEvents !== false) {
            triggerReactTracker(checkbox, previousChecked);
            checkbox.dispatchEvent(createSyntheticEvent(checkbox, 'change'));
            checkbox.dispatchEvent(createSyntheticEvent(checkbox, 'input'));
        }
    }
    
    return true;
}

/**
 * Set radio button value
 * 
 * @param {HTMLInputElement} radio - Radio element (or any radio in the group)
 * @param {string} value - Value to select
 * @param {object} options - Options
 * @returns {boolean} Success
 */
function setRadioValue(radio, value, options = {}) {
    const targetStr = String(value);
    const normalizedTarget = targetStr.toLowerCase();
    const applyChecked = (target) => {
        const previousChecked = Boolean(target.checked);
        const nativeCheckedSetter = options.useNativeSetter !== false
            ? getNativePropertySetter(target, 'checked', 'INPUT')
            : null;
        if (nativeCheckedSetter) {
            nativeCheckedSetter.call(target, true);
        } else {
            target.checked = true;
        }
        if (options.dispatchEvents !== false) {
            triggerReactTracker(target, previousChecked);
            target.dispatchEvent(createSyntheticEvent(target, 'change'));
            target.dispatchEvent(createSyntheticEvent(target, 'input'));
        }
    };

    // Find all radios in this group (supports Shadow DOM roots via getRootNode)
    const name = radio.name;
    if (!name) {
        applyChecked(radio);
        return true;
    }
    
    const root = typeof radio.getRootNode === 'function'
        ? radio.getRootNode()
        : (radio.ownerDocument || (typeof document !== 'undefined' ? document : null));
    const radios = root && typeof root.querySelectorAll === 'function'
        ? root.querySelectorAll(`input[type="radio"][name="${name}"]`)
        : [radio];
    
    for (const r of radios) {
        if (r.value === targetStr || String(r.value).toLowerCase() === normalizedTarget) {
            applyChecked(r);
            return true;
        }
    }
    
    return false;
}

/**
 * Set contenteditable element value
 * 
 * @param {HTMLElement} element - Contenteditable element
 * @param {string} value - Value to set
 * @param {object} options - Options
 * @returns {boolean} Success
 */
function setContentEditableValue(element, value, options = {}) {
    element.textContent = value;
    
    if (options.dispatchEvents !== false) {
        element.dispatchEvent(createSyntheticEvent(element, 'input'));
        element.dispatchEvent(createSyntheticEvent(element, 'change'));
    }
    
    return true;
}

/**
 * Dispatch all necessary events to trigger React/Vue/Angular updates
 * 
 * @param {HTMLElement} element - Element to dispatch events on
 * @param {string} previousValue - Previous value (for React tracker delta detection)
 */
function dispatchInputEvents(element, previousValue) {
    // Focus the element first (some frameworks need this)
    const doc = element?.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (doc && doc.activeElement !== element && typeof element.focus === 'function') {
        element.focus();
    }
    
    // Reset React's value tracker BEFORE dispatching events so React sees a delta
    triggerReactTracker(element, previousValue);
    
    // Input event - React listens to this
    element.dispatchEvent(createSyntheticEvent(element, 'input'));
    
    // Change event - Angular and vanilla JS listen to this
    element.dispatchEvent(createSyntheticEvent(element, 'change'));
    
    // Blur event - triggers validation in many frameworks
    element.dispatchEvent(createSyntheticEvent(element, 'blur'));
}

/**
 * Dispatch events for select elements
 * 
 * @param {HTMLSelectElement} select - Select element
 * @param {string} previousValue - Previous value
 */
function dispatchSelectEvents(select, previousValue) {
    // Reset React's value tracker BEFORE dispatching events so React sees a delta
    triggerReactTracker(select, previousValue);

    select.dispatchEvent(createSyntheticEvent(select, 'change'));
    select.dispatchEvent(createSyntheticEvent(select, 'input'));
}

/**
 * Trigger React's internal value tracker
 * React 16+ uses a tracker to detect if value "really" changed.
 * Must run BEFORE dispatching input/change events and set a value distinct
 * from the element's current value (including when clearing to '').
 * 
 * @param {HTMLElement} element - Form element
 * @param {string|boolean} previousValue - Previous value before setting
 */
function triggerReactTracker(element, previousValue) {
    // React attaches a tracker via a property like _valueTracker
    const tracker = element?._valueTracker;
    if (!tracker || typeof tracker.setValue !== 'function') {
        return;
    }

    const isCheckable = element.type === 'checkbox' || element.type === 'radio';
    if (isCheckable) {
        const current = Boolean(element.checked);
        const prevBool = previousValue !== undefined ? Boolean(previousValue) : !current;
        const tracked = prevBool !== current ? String(prevBool) : String(!current);
        tracker.setValue(tracked);
        return;
    }

    const current = element.value !== undefined && element.value !== null ? String(element.value) : '';
    const prev = previousValue !== undefined && previousValue !== null ? String(previousValue) : '';
    const tracked = prev !== current ? prev : (current === '' ? ' ' : '');
    tracker.setValue(tracked);
}

/**
 * Find matching option in a select element
 * Uses fuzzy matching for better compatibility.
 * 
 * @param {HTMLSelectElement} select - Select element
 * @param {string} targetValue - Value to find
 * @returns {HTMLOptionElement|null} Matching option or null
 */
function findMatchingOption(select, targetValue) {
    const options = Array.from(select.options || []);
    const targetStr = String(targetValue);
    const normalizedTarget = targetStr.toLowerCase().trim();
    
    // 1. Exact value match
    let match = options.find(opt => opt.value === targetStr);
    if (match) return match;
    
    // 2. Case-insensitive value match
    match = options.find(opt => String(opt.value ?? '').toLowerCase() === normalizedTarget);
    if (match) return match;
    
    // 3. Exact text match
    match = options.find(opt => opt.text === targetStr);
    if (match) return match;
    
    // 4. Case-insensitive text match
    match = options.find(opt => String(opt.text ?? '').toLowerCase().trim() === normalizedTarget);
    if (match) return match;
    
    if (!normalizedTarget) {
        return null;
    }
    
    // 5. Partial text match (skip empty placeholder options)
    match = options.find(opt => {
        const optText = String(opt.text ?? '').toLowerCase().trim();
        if (!optText) return false;
        return optText.includes(normalizedTarget) || normalizedTarget.includes(optText);
    });
    if (match) return match;
    
    // 6. Partial value match (skip empty placeholder options)
    match = options.find(opt => {
        const optValue = String(opt.value ?? '').toLowerCase().trim();
        if (!optValue) return false;
        return optValue.includes(normalizedTarget) || normalizedTarget.includes(optValue);
    });
    
    return match || null;
}

/**
 * Detect what framework the page is using
 * 
 * @returns {string} Framework name: 'react', 'vue', 'angular', or 'unknown'
 */
export function detectFramework() {
    // React detection
    if (window.React || document.querySelector('[data-reactroot]') || 
        document.querySelector('[data-reactid]') ||
        Object.keys(document.body).some(k => k.startsWith('__react'))) {
        return 'react';
    }
    
    // Vue detection
    if (window.Vue || document.querySelector('[data-v-]') ||
        document.body.__vue__) {
        return 'vue';
    }
    
    // Angular detection
    if (window.angular || window.ng || 
        document.querySelector('[ng-version]') ||
        document.querySelector('[_ngcontent]')) {
        return 'angular';
    }
    
    return 'unknown';
}

/**
 * Check if an element is controlled by React
 * 
 * @param {HTMLElement} element - Element to check
 * @returns {boolean} True if React-controlled
 */
export function isReactControlled(element) {
    // Check for React fiber
    const hasReactFiber = Object.keys(element).some(k => 
        k.startsWith('__reactFiber') || k.startsWith('__reactProps')
    );
    
    // Check for React event handlers
    const hasReactEvents = Object.keys(element).some(k => 
        k.startsWith('__reactEvents')
    );
    
    return hasReactFiber || hasReactEvents;
}

/**
 * Get React fiber from an element (if available)
 * This is used by injected.js for direct React manipulation.
 * 
 * @param {HTMLElement} element - DOM element
 * @returns {object|null} React fiber or null
 */
export function getReactFiber(element) {
    const key = Object.keys(element).find(k => k.startsWith('__reactFiber$'));
    return key ? element[key] : null;
}

/**
 * Get React props from an element
 * 
 * @param {HTMLElement} element - DOM element
 * @returns {object|null} React props or null
 */
export function getReactProps(element) {
    const key = Object.keys(element).find(k => k.startsWith('__reactProps$'));
    return key ? element[key] : null;
}
