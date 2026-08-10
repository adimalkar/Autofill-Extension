/**
 * Core utility library for penetrating and interacting with deeply nested Shadow DOM boundaries.
 * Modern Applicant Tracking Systems (e.g., SmartRecruiters, Workday) heavily rely on encapsulated web components.
 * Standard document.querySelector() fails here. This library provides recursive traversal mechanisms.
 */

export class ShadowDomEngine {
  /**
   * Recursively discovers all interactable form inputs within the entire document tree,
   * bypassing any open Shadow DOM encapsulation boundaries.
   *
   * @param {Element|Document} rootNode - The starting node for traversal (usually document.body)
   * @returns {Array<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>} Flat array of all input fields
   */
  static extractAllInputs(rootNode = document.body) {
    const inputs = [];
    
    // Safety check
    if (!rootNode) return inputs;

    // Fast-path: query all native inputs in current root
    const localInputs = rootNode.querySelectorAll('input, textarea, select');
    inputs.push(...Array.from(localInputs));

    // Discover all elements in current root to check for shadow hosts
    const allElements = rootNode.querySelectorAll('*');
    
    for (const element of allElements) {
      if (element.shadowRoot) {
        // Recursively dig into the shadow root
        inputs.push(...this.extractAllInputs(element.shadowRoot));
      }
    }

    return inputs;
  }

  /**
   * Dispatches synthetic events to satisfy modern React/Vue state managers.
   * Directly modifying input.value often fails to trigger underlying synthetic event listeners.
   * 
   * @param {HTMLInputElement} element - The target input field
   * @param {string} value - The value to inject
   */
  static injectValueSecurely(element, value) {
    // Save previous value for backup tracking if needed
    const lastValue = element.value;
    element.value = value;
    
    // Simulate natural user typing sequence for state management listeners
    const events = ['input', 'change', 'blur'];
    
    events.forEach(eventType => {
      const event = new Event(eventType, {
        bubbles: true,
        cancelable: true,
      });
      element.dispatchEvent(event);
    });

    // React 16+ specific override: bypass property descriptor hijacking
    try {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      ).set;
      
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } catch (e) {
      console.warn('React property descriptor override failed:', e);
    }
  }
}
