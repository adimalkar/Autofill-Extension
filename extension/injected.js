/**
 * Injected Script for Resume Autofill Pro
 * 
 * This script runs in the page's MAIN WORLD (not isolated extension context).
 * It has access to the page's JavaScript variables, including React internals.
 * 
 * This is necessary because:
 * 1. Content scripts run in an "isolated world" and can't access window.React
 * 2. React's Fiber tree is attached to DOM elements but only visible in main world
 * 3. Some frameworks expose state management through window objects
 * 
 * Communication with content script happens via window.postMessage()
 */

(function() {
    'use strict';
    
    const PREFIX = '[AutofillPro:Injected]';
    
    // ========================================
    // REACT UTILITIES
    // ========================================
    
    /**
     * Get React Fiber from a DOM element
     * React 16+ attaches fiber nodes with keys like __reactFiber$xxx
     */
    function getReactFiber(element) {
        if (!element) return null;
        
        const key = Object.keys(element).find(k => 
            k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
        );
        
        return key ? element[key] : null;
    }
    
    /**
     * Get React Props from a DOM element
     */
    function getReactProps(element) {
        if (!element) return null;
        
        const key = Object.keys(element).find(k => k.startsWith('__reactProps$'));
        return key ? element[key] : null;
    }
    
    /**
     * Get React Event Handlers from a DOM element
     */
    function getReactEventHandlers(element) {
        if (!element) return null;
        
        const key = Object.keys(element).find(k => k.startsWith('__reactEvents$'));
        return key ? element[key] : null;
    }
    
    /**
     * Trigger React's onChange handler directly
     * This bypasses the synthetic event system and directly calls the handler
     */
    function triggerReactOnChange(element, value) {
        const props = getReactProps(element);
        
        if (props && typeof props.onChange === 'function') {
            // Create a synthetic event-like object
            const syntheticEvent = {
                target: element,
                currentTarget: element,
                type: 'change',
                preventDefault: () => {},
                stopPropagation: () => {},
                nativeEvent: new Event('change'),
                // Include the value
                ...{ target: { ...element, value } }
            };
            
            try {
                props.onChange(syntheticEvent);
                console.log(PREFIX, 'Triggered React onChange');
                return true;
            } catch (err) {
                console.error(PREFIX, 'Error triggering onChange:', err);
                return false;
            }
        }
        
        return false;
    }
    
    /**
     * Trigger React's onBlur handler
     */
    function triggerReactOnBlur(element) {
        const props = getReactProps(element);
        
        if (props && typeof props.onBlur === 'function') {
            const syntheticEvent = {
                target: element,
                currentTarget: element,
                type: 'blur',
                preventDefault: () => {},
                stopPropagation: () => {}
            };
            
            try {
                props.onBlur(syntheticEvent);
                return true;
            } catch (err) {
                console.error(PREFIX, 'Error triggering onBlur:', err);
                return false;
            }
        }
        
        return false;
    }
    
    /**
     * Get the current value from React's internal state
     * Useful for debugging - shows what React thinks the value is
     */
    function getReactStateValue(element) {
        const fiber = getReactFiber(element);
        if (!fiber) return null;
        
        // Navigate the fiber tree to find state
        let current = fiber;
        while (current) {
            if (current.memoizedState && current.memoizedState.baseState !== undefined) {
                return current.memoizedState.baseState;
            }
            current = current.return;
        }
        
        return null;
    }
    
    /**
     * Check if React is present on the page
     */
    function isReactPage() {
        return !!(
            window.React ||
            window.__REACT_DEVTOOLS_GLOBAL_HOOK__ ||
            document.querySelector('[data-reactroot]') ||
            document.querySelector('[data-reactid]')
        );
    }
    
    /**
     * Get React version if available
     */
    function getReactVersion() {
        if (window.React && window.React.version) {
            return window.React.version;
        }
        
        // Try to get from devtools hook
        const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
        if (hook && hook.renderers) {
            for (const [, renderer] of hook.renderers) {
                if (renderer.version) return renderer.version;
            }
        }
        
        return null;
    }
    
    // ========================================
    // VUE UTILITIES
    // ========================================
    
    /**
     * Check if Vue is present
     */
    function isVuePage() {
        return !!(
            window.Vue ||
            document.querySelector('[data-v-]') ||
            document.body.__vue__
        );
    }
    
    /**
     * Get Vue instance from element
     */
    function getVueInstance(element) {
        return element.__vue__ || element.__vueParentComponent || null;
    }
    
    /**
     * Trigger Vue's v-model update
     */
    function triggerVueUpdate(element, value) {
        const vue = getVueInstance(element);
        if (!vue) return false;
        
        // For Vue 3 composition API
        if (vue.exposed && vue.exposed.modelValue !== undefined) {
            vue.exposed.modelValue = value;
            return true;
        }
        
        // For Vue 2 / Options API
        if (vue.$emit) {
            vue.$emit('input', value);
            vue.$emit('update:modelValue', value);
            return true;
        }
        
        return false;
    }
    
    // ========================================
    // ANGULAR UTILITIES
    // ========================================
    
    /**
     * Check if Angular is present
     */
    function isAngularPage() {
        return !!(
            window.angular ||
            window.ng ||
            document.querySelector('[ng-version]') ||
            document.querySelector('[_ngcontent]')
        );
    }
    
    /**
     * Get Angular scope/component
     */
    function getAngularScope(element) {
        // Angular 1.x
        if (window.angular) {
            return window.angular.element(element).scope();
        }
        
        // Angular 2+
        const ngDebug = window.ng;
        if (ngDebug && ngDebug.getComponent) {
            return ngDebug.getComponent(element);
        }
        
        return null;
    }
    
    // ========================================
    // UNIVERSAL SET VALUE
    // ========================================
    
    /**
     * Set value on an input element, handling all frameworks
     */
    function setValueWithFrameworkSupport(element, value) {
        const results = {
            success: false,
            framework: 'unknown',
            method: 'none'
        };
        
        if (!element) return results;
        
        // Try React first (most common in job sites)
        if (isReactPage()) {
            results.framework = 'react';
            
            // Method 1: Direct onChange trigger
            if (triggerReactOnChange(element, value)) {
                results.success = true;
                results.method = 'react-onChange';
                return results;
            }
            
            // Method 2: Native setter + events (fallback)
            const nativeSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                'value'
            )?.set;
            
            if (nativeSetter) {
                nativeSetter.call(element, value);
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
                results.success = true;
                results.method = 'native-setter';
                return results;
            }
        }
        
        // Try Vue
        if (isVuePage()) {
            results.framework = 'vue';
            
            if (triggerVueUpdate(element, value)) {
                results.success = true;
                results.method = 'vue-model';
                return results;
            }
        }
        
        // Angular or vanilla - just set value and dispatch events
        if (isAngularPage()) {
            results.framework = 'angular';
        } else {
            results.framework = 'vanilla';
        }
        
        element.value = value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        results.success = true;
        results.method = 'direct-assignment';
        
        return results;
    }
    
    // ========================================
    // MESSAGE HANDLING
    // ========================================
    
    /**
     * Handle messages from content script
     */
    window.addEventListener('message', (event) => {
        // Only accept messages from same window
        if (event.source !== window) return;
        
        const { type, payload } = event.data || {};
        
        // Only handle our messages
        if (!type || !type.startsWith('AUTOFILL_PRO_')) return;
        
        console.log(PREFIX, 'Received message:', type);
        
        switch (type) {
            case 'AUTOFILL_PRO_SET_VALUE': {
                const { selector, value, id } = payload;
                const element = document.querySelector(selector);
                
                if (element) {
                    const result = setValueWithFrameworkSupport(element, value);
                    
                    window.postMessage({
                        type: 'AUTOFILL_PRO_SET_VALUE_RESULT',
                        payload: { id, ...result }
                    }, '*');
                } else {
                    window.postMessage({
                        type: 'AUTOFILL_PRO_SET_VALUE_RESULT',
                        payload: { id, success: false, error: 'Element not found' }
                    }, '*');
                }
                break;
            }
            
            case 'AUTOFILL_PRO_GET_FRAMEWORK_INFO': {
                const info = {
                    react: isReactPage(),
                    reactVersion: getReactVersion(),
                    vue: isVuePage(),
                    angular: isAngularPage()
                };
                
                window.postMessage({
                    type: 'AUTOFILL_PRO_FRAMEWORK_INFO',
                    payload: info
                }, '*');
                break;
            }
            
            case 'AUTOFILL_PRO_TRIGGER_REACT_CHANGE': {
                const { selector, value, id } = payload;
                const element = document.querySelector(selector);
                
                if (element) {
                    const success = triggerReactOnChange(element, value);
                    triggerReactOnBlur(element);
                    
                    window.postMessage({
                        type: 'AUTOFILL_PRO_TRIGGER_RESULT',
                        payload: { id, success }
                    }, '*');
                }
                break;
            }
            
            case 'AUTOFILL_PRO_PING': {
                window.postMessage({
                    type: 'AUTOFILL_PRO_PONG',
                    payload: { 
                        loaded: true,
                        frameworks: {
                            react: isReactPage(),
                            vue: isVuePage(),
                            angular: isAngularPage()
                        }
                    }
                }, '*');
                break;
            }
        }
    });
    
    // ========================================
    // INITIALIZATION
    // ========================================
    
    console.log(PREFIX, 'Injected script loaded');
    console.log(PREFIX, 'Detected frameworks:', {
        react: isReactPage(),
        reactVersion: getReactVersion(),
        vue: isVuePage(),
        angular: isAngularPage()
    });
    
    // Signal that we're ready
    window.postMessage({
        type: 'AUTOFILL_PRO_INJECTED_READY',
        payload: { timestamp: Date.now() }
    }, '*');
    
})();
