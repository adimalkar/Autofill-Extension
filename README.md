# Autofill-Extension: Next-Generation ATS Form Automation

An advanced, AI-powered browser extension engineered to autonomously navigate and complete highly complex Applicant Tracking System (ATS) workflows. 

While existing tools like *Simplify* or *Jobright* struggle with modern application platforms, this extension is purposefully designed to overcome structural DOM boundaries and proprietary component architectures.

## Core Engineering Objectives

1. **Deep Shadow DOM Penetration:**
   Standard DOM traversal (e.g., `document.querySelector()`) fails on modern platforms like *SmartRecruiters* due to nested, multi-layered Shadow DOMs. This extension employs recursive Shadow Root penetration algorithms to map, interact with, and autofill inputs that are normally encapsulated and isolated from the main document tree.

2. **Decoupled Label Association:**
   In complex component architectures, `<slot>` elements often render labels in completely different DOM branches from their corresponding form fields. The extension uses heuristics and structural proximity mapping to correctly pair labels to inputs regardless of framework isolation.

3. **Dynamic React/Vue State Injection:**
   Modifying an input's `value` property directly often fails to trigger React or Vue's synthetic event listeners (resulting in the ATS rejecting the field on blur). We utilize native DOM Event dispatchers (`InputEvent`, `ChangeEvent`) combined with React Fiber tree traversal to securely inject values into the underlying state management framework.

4. **Multi-Step Form Context Persistence:**
   Maintains intelligent context across multi-stage applications, preventing data collision when identical form schemas are presented repeatedly for different chronological entries (e.g., repeating work history panels).

## Technical Foundation

- **Environment:** Google Chrome Extension Manifest V3
- **Injection:** Content Scripts running in isolated execution environments
- **Traversal Engine:** Recursive Shadow Boundary Mapping

## Development Phase
This project is currently in the initial R&D and architectural design phase. See `Shortcomings of simplify and jobright ai autofill.md` for the technical gap analysis driving the extension's development roadmap.
