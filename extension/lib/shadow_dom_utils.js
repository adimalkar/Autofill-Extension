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
    const inputs = new Set();
    
    // Safety check
    if (!rootNode) return [];

    const traverse = (node) => {
      if (!node) return;
      const elements = node.querySelectorAll('input, textarea, select');
      for (const el of elements) {
        inputs.add(el);
      }

      const allNodes = node.querySelectorAll('*');
      for (const el of allNodes) {
        if (el.shadowRoot) {
          traverse(el.shadowRoot);
        }
      }
    };

    traverse(rootNode);
    return Array.from(inputs);
  }

  /**
   * Recursively finds the first element matching a CSS selector through any depth of open Shadow DOM roots.
   *
   * @param {string} selector - Standard CSS selector
   * @param {Element|Document} rootNode - Root node to begin deep search
   * @returns {Element|null} Found element or null
   */
  static querySelectorDeep(selector, rootNode = document.body) {
    if (!rootNode) return null;
    const localMatch = rootNode.querySelector(selector);
    if (localMatch) return localMatch;

    const allElements = rootNode.querySelectorAll('*');
    for (const el of allElements) {
      if (el.shadowRoot) {
        const shadowMatch = this.querySelectorDeep(selector, el.shadowRoot);
        if (shadowMatch) return shadowMatch;
      }
    }
    return null;
  }

  /**
   * Dispatches synthetic events to satisfy modern React/Vue/Angular state managers.
   * Dynamically handles HTMLInputElement, HTMLTextAreaElement, HTMLSelectElement,
   * and properly synchronizes both .value and .checked states with native prototypes.
   * 
   * @param {HTMLElement} element - The target input, textarea, or select field
   * @param {string|boolean} value - The value to inject
   */
  static injectValueSecurely(element, value) {
    if (!element) return;

    const isCheckable = element.type === 'checkbox' || element.type === 'radio';
    
    if (isCheckable) {
      const boolVal = typeof value === 'boolean' ? value : String(value).toLowerCase() === 'true' || value === '1';
      element.checked = boolVal;

      try {
        const nativeCheckedSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'checked'
        )?.set;
        if (nativeCheckedSetter) {
          nativeCheckedSetter.call(element, boolVal);
        }
      } catch (e) {
        console.warn('React checkbox descriptor override failed:', e);
      }
    } else {
      element.value = value;
      
      // Determine correct prototype based on tag name
      let proto = window.HTMLInputElement.prototype;
      if (element instanceof HTMLTextAreaElement) {
        proto = window.HTMLTextAreaElement.prototype;
      } else if (element instanceof HTMLSelectElement) {
        proto = window.HTMLSelectElement.prototype;
      }

      try {
        const nativeValueSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (nativeValueSetter) {
          nativeValueSetter.call(element, value);
        }
      } catch (e) {
        console.warn('React property descriptor override failed:', e);
      }
    }

    // Simulate natural user interaction event sequence for framework listeners
    const eventTypes = isCheckable ? ['click', 'input', 'change'] : ['focus', 'input', 'change', 'blur'];
    eventTypes.forEach(eventType => {
      const event = new Event(eventType, {
        bubbles: true,
        cancelable: true,
      });
      element.dispatchEvent(event);
    });
  }
}

