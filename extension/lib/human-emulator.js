/**
 * Human Emulation Module for Resume Autofill Pro
 * 
 * Prevents bot detection by emulating human-like behavior:
 * - Typing with variable delays (50-200ms between keystrokes)
 * - Mouse movement along Bézier curves (not teleportation)
 * - Random micro-delays and variations
 * 
 * This is critical because Simplify/JobRight get shadow-banned
 * for their machine-like instantaneous form filling.
 */

/**
 * Configuration for human emulation
 */
const CONFIG = {
    // Typing delays in milliseconds
    typing: {
        minDelay: 50,      // Minimum delay between keystrokes
        maxDelay: 150,     // Maximum delay between keystrokes
        mistakeChance: 0.02, // 2% chance of making a typo and correcting it
        pauseChance: 0.05,   // 5% chance of a longer pause (thinking)
        pauseMinMs: 200,
        pauseMaxMs: 500
    },
    
    // Mouse movement settings
    mouse: {
        minSteps: 15,      // Minimum steps for mouse movement
        maxSteps: 30,      // Maximum steps for mouse movement
        stepDelayMs: 10,   // Delay between movement steps
        curveVariation: 50 // Pixels of random curve variation
    },
    
    // General delays
    delays: {
        beforeTyping: { min: 100, max: 300 },
        afterTyping: { min: 50, max: 150 },
        beforeClick: { min: 50, max: 200 },
        afterClick: { min: 100, max: 300 },
        betweenFields: { min: 200, max: 500 }
    }
};

/**
 * Sleep for a random duration within a range
 * 
 * @param {number} min - Minimum milliseconds
 * @param {number} max - Maximum milliseconds
 * @returns {Promise<void>}
 */
export function randomDelay(min, max) {
    const delay = min + Math.random() * (max - min);
    return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Sleep for a fixed duration
 * 
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Type text into an input field with human-like timing
 * Includes variable delays, occasional mistakes, and pauses.
 * 
 * @param {HTMLInputElement|HTMLTextAreaElement} input - Input element
 * @param {string} text - Text to type
 * @param {object} options - Options
 * @returns {Promise<void>}
 */
export async function humanType(input, text, options = {}) {
    const {
        clearFirst = true,
        triggerFinalEvents = true
    } = options;
    
    // Focus the input first
    input.focus();
    await randomDelay(CONFIG.delays.beforeTyping.min, CONFIG.delays.beforeTyping.max);
    
    // Clear existing value if requested
    if (clearFirst && input.value) {
        await selectAllAndDelete(input);
    }
    
    // Type each character
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        
        // Occasional longer pause (simulating thinking)
        if (Math.random() < CONFIG.typing.pauseChance) {
            await randomDelay(CONFIG.typing.pauseMinMs, CONFIG.typing.pauseMaxMs);
        }
        
        // Simulate occasional typo (and correction)
        if (Math.random() < CONFIG.typing.mistakeChance && i < text.length - 1) {
            await typeCharacter(input, getRandomChar());
            await randomDelay(100, 200);
            await deleteLastCharacter(input);
            await randomDelay(50, 100);
        }
        
        // Type the actual character
        await typeCharacter(input, char);
        
        // Random delay between keystrokes
        await randomDelay(CONFIG.typing.minDelay, CONFIG.typing.maxDelay);
    }
    
    // Trigger final events after typing completes
    if (triggerFinalEvents) {
        await randomDelay(CONFIG.delays.afterTyping.min, CONFIG.delays.afterTyping.max);
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
    }
}

/**
 * Type a single character with proper keyboard events
 * 
 * @param {HTMLInputElement} input - Input element
 * @param {string} char - Character to type
 */
async function typeCharacter(input, char) {
    const keyCode = char.charCodeAt(0);
    
    // Key down
    input.dispatchEvent(new KeyboardEvent('keydown', {
        key: char,
        code: `Key${char.toUpperCase()}`,
        keyCode: keyCode,
        which: keyCode,
        bubbles: true,
        cancelable: true
    }));
    
    // Key press (deprecated but some sites still use it)
    input.dispatchEvent(new KeyboardEvent('keypress', {
        key: char,
        code: `Key${char.toUpperCase()}`,
        keyCode: keyCode,
        which: keyCode,
        charCode: keyCode,
        bubbles: true,
        cancelable: true
    }));
    
    // Update the value
    const start = input.selectionStart || input.value.length;
    const end = input.selectionEnd || input.value.length;
    const newValue = input.value.slice(0, start) + char + input.value.slice(end);
    
    // Use native setter for React compatibility
    const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
    )?.set;
    
    if (nativeSetter) {
        nativeSetter.call(input, newValue);
    } else {
        input.value = newValue;
    }
    
    // Update cursor position
    input.selectionStart = input.selectionEnd = start + 1;
    
    // Input event
    input.dispatchEvent(new InputEvent('input', {
        data: char,
        inputType: 'insertText',
        bubbles: true,
        cancelable: true
    }));
    
    // Key up
    input.dispatchEvent(new KeyboardEvent('keyup', {
        key: char,
        code: `Key${char.toUpperCase()}`,
        keyCode: keyCode,
        which: keyCode,
        bubbles: true,
        cancelable: true
    }));
}

/**
 * Delete the last character (for simulating typo correction)
 * 
 * @param {HTMLInputElement} input - Input element
 */
async function deleteLastCharacter(input) {
    const keyCode = 8; // Backspace
    
    input.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Backspace',
        code: 'Backspace',
        keyCode: keyCode,
        which: keyCode,
        bubbles: true
    }));
    
    // Update value
    const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
    )?.set;
    
    const newValue = input.value.slice(0, -1);
    if (nativeSetter) {
        nativeSetter.call(input, newValue);
    } else {
        input.value = newValue;
    }
    
    input.dispatchEvent(new InputEvent('input', {
        inputType: 'deleteContentBackward',
        bubbles: true
    }));
    
    input.dispatchEvent(new KeyboardEvent('keyup', {
        key: 'Backspace',
        code: 'Backspace',
        keyCode: keyCode,
        which: keyCode,
        bubbles: true
    }));
}

/**
 * Select all text and delete (Ctrl+A, Delete)
 * 
 * @param {HTMLInputElement} input - Input element
 */
async function selectAllAndDelete(input) {
    // Select all
    input.select();
    await randomDelay(50, 100);
    
    // Delete
    const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
    )?.set;
    
    if (nativeSetter) {
        nativeSetter.call(input, '');
    } else {
        input.value = '';
    }
    
    input.dispatchEvent(new InputEvent('input', {
        inputType: 'deleteContentBackward',
        bubbles: true
    }));
    
    await randomDelay(30, 80);
}

/**
 * Get a random character for simulating typos
 * 
 * @returns {string} Random character
 */
function getRandomChar() {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    return chars[Math.floor(Math.random() * chars.length)];
}

/**
 * Move mouse along a Bézier curve (human-like movement)
 * Humans don't move mice in straight lines - they use curved paths.
 * 
 * @param {number} fromX - Start X coordinate
 * @param {number} fromY - Start Y coordinate
 * @param {number} toX - End X coordinate
 * @param {number} toY - End Y coordinate
 * @returns {Promise<void>}
 */
export async function humanMouseMove(fromX, fromY, toX, toY) {
    const steps = CONFIG.mouse.minSteps + 
                  Math.floor(Math.random() * (CONFIG.mouse.maxSteps - CONFIG.mouse.minSteps));
    
    // Generate control points for quadratic Bézier curve
    // Add some randomness to make the curve more natural
    const controlX = (fromX + toX) / 2 + (Math.random() - 0.5) * CONFIG.mouse.curveVariation * 2;
    const controlY = (fromY + toY) / 2 + (Math.random() - 0.5) * CONFIG.mouse.curveVariation * 2;
    
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        
        // Quadratic Bézier formula
        const x = Math.pow(1 - t, 2) * fromX + 
                  2 * (1 - t) * t * controlX + 
                  Math.pow(t, 2) * toX;
        const y = Math.pow(1 - t, 2) * fromY + 
                  2 * (1 - t) * t * controlY + 
                  Math.pow(t, 2) * toY;
        
        // Add tiny random jitter for more realism
        const jitterX = (Math.random() - 0.5) * 2;
        const jitterY = (Math.random() - 0.5) * 2;
        
        // Dispatch mouse move event
        document.dispatchEvent(new MouseEvent('mousemove', {
            clientX: x + jitterX,
            clientY: y + jitterY,
            bubbles: true,
            cancelable: true,
            view: window
        }));
        
        // Small delay between steps (variable for more realism)
        await sleep(CONFIG.mouse.stepDelayMs + Math.random() * 5);
    }
}

/**
 * Human-like click on an element
 * Includes mouse movement, hover, and proper click events.
 * 
 * @param {HTMLElement} element - Element to click
 * @param {object} options - Click options
 * @returns {Promise<void>}
 */
export async function humanClick(element, options = {}) {
    const {
        moveFromCurrent = true,
        addHoverDelay = true
    } = options;
    
    // Get element position
    const rect = element.getBoundingClientRect();
    const targetX = rect.left + rect.width / 2 + (Math.random() - 0.5) * 10;
    const targetY = rect.top + rect.height / 2 + (Math.random() - 0.5) * 10;
    
    // Move mouse to element (if enabled)
    if (moveFromCurrent) {
        // Start from a random position (simulating where mouse might be)
        const startX = Math.random() * window.innerWidth;
        const startY = Math.random() * window.innerHeight;
        
        await humanMouseMove(startX, startY, targetX, targetY);
    }
    
    // Hover delay
    if (addHoverDelay) {
        await randomDelay(CONFIG.delays.beforeClick.min, CONFIG.delays.beforeClick.max);
    }
    
    // Mouse over/enter events
    element.dispatchEvent(new MouseEvent('mouseover', {
        clientX: targetX,
        clientY: targetY,
        bubbles: true,
        cancelable: true,
        view: window
    }));
    
    element.dispatchEvent(new MouseEvent('mouseenter', {
        clientX: targetX,
        clientY: targetY,
        bubbles: true,
        cancelable: true,
        view: window
    }));
    
    await randomDelay(20, 50);
    
    // Mouse down
    element.dispatchEvent(new MouseEvent('mousedown', {
        clientX: targetX,
        clientY: targetY,
        button: 0,
        buttons: 1,
        bubbles: true,
        cancelable: true,
        view: window
    }));
    
    // Brief delay between down and up (human reaction time)
    await randomDelay(50, 120);
    
    // Mouse up
    element.dispatchEvent(new MouseEvent('mouseup', {
        clientX: targetX,
        clientY: targetY,
        button: 0,
        buttons: 0,
        bubbles: true,
        cancelable: true,
        view: window
    }));
    
    // Click event
    element.dispatchEvent(new MouseEvent('click', {
        clientX: targetX,
        clientY: targetY,
        button: 0,
        buttons: 0,
        bubbles: true,
        cancelable: true,
        view: window
    }));
    
    // Post-click delay
    await randomDelay(CONFIG.delays.afterClick.min, CONFIG.delays.afterClick.max);
}

/**
 * Human-like focus on an element
 * 
 * @param {HTMLElement} element - Element to focus
 * @returns {Promise<void>}
 */
export async function humanFocus(element) {
    await humanClick(element, { moveFromCurrent: false, addHoverDelay: false });
    element.focus();
    await randomDelay(50, 150);
}

/**
 * Fill a form field with human-like behavior
 * Combines mouse movement, click, and typing.
 * 
 * @param {HTMLElement} field - Form field to fill
 * @param {string} value - Value to fill
 * @param {object} options - Options
 * @returns {Promise<boolean>} Success
 */
export async function humanFillField(field, value, options = {}) {
    const {
        useTyping = true,  // If false, use instant fill (faster but more detectable)
        moveMouse = false  // Mouse movement is slow, disable by default
    } = options;
    
    try {
        // Scroll field into view if needed
        const rect = field.getBoundingClientRect();
        if (rect.top < 0 || rect.bottom > window.innerHeight) {
            field.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await sleep(300);
        }
        
        // Click/focus the field
        if (moveMouse) {
            await humanClick(field);
        } else {
            field.focus();
            await randomDelay(50, 150);
        }
        
        // Fill the value
        if (useTyping && field.tagName !== 'SELECT') {
            await humanType(field, value);
        } else {
            // Instant fill with events
            const nativeSetter = Object.getOwnPropertyDescriptor(
                field.tagName === 'TEXTAREA' ? 
                    window.HTMLTextAreaElement.prototype : 
                    window.HTMLInputElement.prototype,
                'value'
            )?.set;
            
            if (nativeSetter) {
                nativeSetter.call(field, value);
            } else {
                field.value = value;
            }
            
            // Still add small delays for realism
            await randomDelay(30, 80);
            
            field.dispatchEvent(new Event('input', { bubbles: true }));
            await randomDelay(20, 50);
            field.dispatchEvent(new Event('change', { bubbles: true }));
        }
        
        // Delay before moving to next field
        await randomDelay(CONFIG.delays.betweenFields.min, CONFIG.delays.betweenFields.max);
        
        return true;
    } catch (error) {
        console.error('[HumanEmulator] Failed to fill field:', error);
        return false;
    }
}

/**
 * Fill multiple fields with delays between them
 * 
 * @param {Array<{field: HTMLElement, value: string}>} fieldValues - Fields and values
 * @param {object} options - Options
 * @returns {Promise<number>} Number of successfully filled fields
 */
export async function humanFillMultipleFields(fieldValues, options = {}) {
    let successCount = 0;
    
    for (const { field, value } of fieldValues) {
        const success = await humanFillField(field, value, options);
        if (success) successCount++;
    }
    
    return successCount;
}

/**
 * Quickly fill a field (for when speed is more important than stealth)
 * Still dispatches proper events but without human-like delays.
 * 
 * @param {HTMLElement} field - Field to fill
 * @param {string} value - Value to set
 * @returns {boolean} Success
 */
export function quickFillField(field, value) {
    try {
        const tagName = field.tagName.toUpperCase();
        
        let nativeSetter;
        if (tagName === 'TEXTAREA') {
            nativeSetter = Object.getOwnPropertyDescriptor(
                window.HTMLTextAreaElement.prototype, 'value'
            )?.set;
        } else if (tagName === 'SELECT') {
            nativeSetter = Object.getOwnPropertyDescriptor(
                window.HTMLSelectElement.prototype, 'value'
            )?.set;
        } else {
            nativeSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype, 'value'
            )?.set;
        }
        
        if (nativeSetter) {
            nativeSetter.call(field, value);
        } else {
            field.value = value;
        }
        
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
        field.dispatchEvent(new Event('blur', { bubbles: true }));
        
        return true;
    } catch (error) {
        console.error('[HumanEmulator] Quick fill failed:', error);
        return false;
    }
}
