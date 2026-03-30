/**
 * State Machine for Resume Autofill Pro
 * 
 * Manages application state across multi-step forms and service worker restarts.
 * 
 * Key insight: Manifest V3 service workers terminate after ~30 seconds of inactivity.
 * If we store state in memory, it's lost when the worker dies. Solution: persist
 * all state to chrome.storage.session (survives worker restarts but clears on browser close).
 */

/**
 * Application states
 */
export const STATES = {
    IDLE: 'idle',              // Not actively filling
    DETECTING: 'detecting',    // Scanning page for form fields
    FILLING: 'filling',        // Actively filling fields
    VALIDATING: 'validating',  // Checking if fields were filled correctly
    WAITING_NEXT: 'waiting_next', // Waiting for next page in multi-step form
    COMPLETE: 'complete',      // Finished filling all pages
    ERROR: 'error'            // An error occurred
};

/**
 * State transition rules
 */
const TRANSITIONS = {
    [STATES.IDLE]: [STATES.DETECTING],
    [STATES.DETECTING]: [STATES.FILLING, STATES.ERROR, STATES.IDLE],
    [STATES.FILLING]: [STATES.VALIDATING, STATES.ERROR],
    [STATES.VALIDATING]: [STATES.WAITING_NEXT, STATES.COMPLETE, STATES.FILLING, STATES.ERROR],
    [STATES.WAITING_NEXT]: [STATES.DETECTING, STATES.ERROR, STATES.IDLE],
    [STATES.COMPLETE]: [STATES.IDLE],
    [STATES.ERROR]: [STATES.IDLE, STATES.DETECTING]
};

/**
 * State storage keys
 */
const STORAGE_KEYS = {
    STATE: 'autofill_state',
    CONTEXT: 'autofill_context',
    HISTORY: 'autofill_history'
};

/**
 * Default state context
 */
const DEFAULT_CONTEXT = {
    status: STATES.IDLE,
    currentPage: 0,
    totalPages: null,
    filledFields: [],
    pendingFields: [],
    errors: [],
    startTime: null,
    lastUpdate: null,
    siteType: null,
    applicationUrl: null
};

/**
 * StateMachine class for managing autofill state
 */
export class StateMachine {
    constructor() {
        this.context = { ...DEFAULT_CONTEXT };
        this.listeners = new Set();
        this.initialized = false;
    }
    
    /**
     * Initialize state machine - load state from storage
     * 
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.initialized) return;
        
        try {
            const stored = await this.loadState();
            if (stored && this.isStateValid(stored)) {
                this.context = stored;
            }
            this.initialized = true;
        } catch (error) {
            console.error('[StateMachine] Failed to initialize:', error);
            this.context = { ...DEFAULT_CONTEXT };
            this.initialized = true;
        }
    }
    
    /**
     * Check if stored state is still valid (not expired)
     * 
     * @param {object} state - State to check
     * @returns {boolean} True if valid
     */
    isStateValid(state) {
        if (!state || !state.lastUpdate) return false;
        
        // State expires after 5 minutes of inactivity
        const MAX_AGE_MS = 5 * 60 * 1000;
        const age = Date.now() - state.lastUpdate;
        
        if (age > MAX_AGE_MS) {
            console.log('[StateMachine] State expired, resetting');
            return false;
        }
        
        return true;
    }
    
    /**
     * Get current state
     * 
     * @returns {object} Current state context
     */
    getState() {
        return { ...this.context };
    }
    
    /**
     * Get current status
     * 
     * @returns {string} Current status
     */
    getStatus() {
        return this.context.status;
    }
    
    /**
     * Check if a transition to a new state is valid
     * 
     * @param {string} newStatus - Target state
     * @returns {boolean} True if transition is valid
     */
    canTransitionTo(newStatus) {
        const currentStatus = this.context.status;
        const allowedTransitions = TRANSITIONS[currentStatus] || [];
        return allowedTransitions.includes(newStatus);
    }
    
    /**
     * Transition to a new state
     * 
     * @param {string} newStatus - Target state
     * @param {object} contextUpdates - Additional context updates
     * @returns {Promise<boolean>} True if transition succeeded
     */
    async transition(newStatus, contextUpdates = {}) {
        if (!this.canTransitionTo(newStatus)) {
            console.warn(`[StateMachine] Invalid transition: ${this.context.status} -> ${newStatus}`);
            return false;
        }
        
        const oldStatus = this.context.status;
        
        this.context = {
            ...this.context,
            ...contextUpdates,
            status: newStatus,
            lastUpdate: Date.now()
        };
        
        // Set start time when beginning a new fill
        if (oldStatus === STATES.IDLE && newStatus === STATES.DETECTING) {
            this.context.startTime = Date.now();
        }
        
        // Clear start time when complete or error
        if (newStatus === STATES.COMPLETE || newStatus === STATES.IDLE) {
            this.context.startTime = null;
        }
        
        // Persist state
        await this.saveState();
        
        // Notify listeners
        this.notifyListeners(oldStatus, newStatus);
        
        console.log(`[StateMachine] Transition: ${oldStatus} -> ${newStatus}`);
        return true;
    }
    
    /**
     * Update context without changing state
     * 
     * @param {object} updates - Context updates
     * @returns {Promise<void>}
     */
    async updateContext(updates) {
        this.context = {
            ...this.context,
            ...updates,
            lastUpdate: Date.now()
        };
        
        await this.saveState();
    }
    
    /**
     * Record a successfully filled field
     * 
     * @param {string} fieldId - Field identifier
     * @param {string} fieldType - Field type (firstName, email, etc.)
     * @param {string} value - Value that was filled
     */
    async recordFilledField(fieldId, fieldType, value) {
        const record = {
            fieldId,
            fieldType,
            value: value?.substring(0, 50), // Truncate for storage
            timestamp: Date.now()
        };
        
        this.context.filledFields = [
            ...this.context.filledFields,
            record
        ];
        
        // Remove from pending if present
        this.context.pendingFields = this.context.pendingFields.filter(
            f => f.fieldId !== fieldId
        );
        
        await this.saveState();
    }
    
    /**
     * Record an error
     * 
     * @param {string} message - Error message
     * @param {object} details - Additional details
     */
    async recordError(message, details = {}) {
        const error = {
            message,
            details,
            timestamp: Date.now()
        };
        
        this.context.errors = [
            ...this.context.errors.slice(-9), // Keep last 10 errors
            error
        ];
        
        await this.saveState();
    }
    
    /**
     * Reset state to initial values
     * 
     * @returns {Promise<void>}
     */
    async reset() {
        this.context = {
            ...DEFAULT_CONTEXT,
            lastUpdate: Date.now()
        };
        
        await this.saveState();
        this.notifyListeners(null, STATES.IDLE);
    }
    
    /**
     * Save state to chrome.storage.session
     * 
     * @returns {Promise<void>}
     */
    async saveState() {
        try {
            // Use session storage if available (MV3), fall back to local
            const storage = chrome.storage.session || chrome.storage.local;
            
            await storage.set({
                [STORAGE_KEYS.STATE]: this.context
            });
        } catch (error) {
            console.error('[StateMachine] Failed to save state:', error);
        }
    }
    
    /**
     * Load state from chrome.storage.session
     * 
     * @returns {Promise<object|null>} Stored state or null
     */
    async loadState() {
        try {
            const storage = chrome.storage.session || chrome.storage.local;
            const result = await storage.get(STORAGE_KEYS.STATE);
            return result[STORAGE_KEYS.STATE] || null;
        } catch (error) {
            console.error('[StateMachine] Failed to load state:', error);
            return null;
        }
    }
    
    /**
     * Subscribe to state changes
     * 
     * @param {function} callback - Callback function(oldStatus, newStatus, context)
     * @returns {function} Unsubscribe function
     */
    subscribe(callback) {
        this.listeners.add(callback);
        
        return () => {
            this.listeners.delete(callback);
        };
    }
    
    /**
     * Notify all listeners of state change
     * 
     * @param {string} oldStatus - Previous status
     * @param {string} newStatus - New status
     */
    notifyListeners(oldStatus, newStatus) {
        for (const listener of this.listeners) {
            try {
                listener(oldStatus, newStatus, this.context);
            } catch (error) {
                console.error('[StateMachine] Listener error:', error);
            }
        }
    }
    
    /**
     * Get a summary of the current fill session
     * 
     * @returns {object} Session summary
     */
    getSummary() {
        return {
            status: this.context.status,
            fieldsFilledCount: this.context.filledFields.length,
            fieldsPendingCount: this.context.pendingFields.length,
            errorsCount: this.context.errors.length,
            currentPage: this.context.currentPage,
            totalPages: this.context.totalPages,
            duration: this.context.startTime 
                ? Date.now() - this.context.startTime 
                : null
        };
    }
}

/**
 * Singleton instance for the content script
 */
let instance = null;

/**
 * Get the state machine instance
 * 
 * @returns {StateMachine}
 */
export function getStateMachine() {
    if (!instance) {
        instance = new StateMachine();
    }
    return instance;
}

/**
 * Helper function to run a state transition with error handling
 * 
 * @param {string} targetState - State to transition to
 * @param {function} action - Async function to run
 * @param {object} options - Options
 * @returns {Promise<any>} Result of action
 */
export async function withState(targetState, action, options = {}) {
    const sm = getStateMachine();
    await sm.initialize();
    
    const { errorState = STATES.ERROR, contextUpdates = {} } = options;
    
    // Transition to target state
    const transitioned = await sm.transition(targetState, contextUpdates);
    if (!transitioned) {
        throw new Error(`Failed to transition to ${targetState}`);
    }
    
    try {
        const result = await action(sm);
        return result;
    } catch (error) {
        await sm.recordError(error.message, { stack: error.stack });
        await sm.transition(errorState);
        throw error;
    }
}
