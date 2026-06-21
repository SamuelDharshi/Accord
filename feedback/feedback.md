# Accord Project Feedback & Suggestions

This document summarizes key technical and user experience observations identified during the development, testing, and deployment of the Accord platform.

## 1. Arca Verification & Notification Experience

### Observation

When the Arca AI agent returns a verdict such as **REVIEW** or **FAIL**, the frontend displays a message instructing users to "check notifications." However, there is currently no dedicated notifications interface. Users can only view the verdict through the status banner on the Covenant Details page.

### Suggestions

* Introduce a notification center accessible from the main navigation to surface agent decisions, milestone updates, payment releases, and dispute-related events.
* Display the verifier's detailed feedback directly within the milestone view. The Arca verification engine already generates a detailed explanation describing what requirements were satisfied or missing. Exposing this information would help contractors understand exactly what needs to be improved before resubmission.

## 2. Frontend Deployment Experience

### Observation

Deploying the frontend to Vercel can be challenging because dependencies from `@mysten/dapp-kit` rely on browser-specific APIs such as `window` and `localStorage`. This may cause failures during static generation.

### Current Workaround

Pages were configured as dynamic to avoid build-time rendering issues.

### Suggestions

Consider dynamically importing wallet-related components with server-side rendering disabled. This keeps browser-dependent logic on the client while preserving static optimization benefits for the rest of the application.

Benefits include:

* Improved deployment reliability
* Better performance through static generation where possible
* Cleaner separation between wallet functionality and page rendering

## 3. Developer & Demo Experience

### Suggestions

* Add a mock verification mode for local development and demonstrations. This would allow developers to quickly test milestone approval flows without relying on full AI verification.
* Allow simple text-based deliverables during testing to trigger successful verification when milestone requirements are met.
* Display estimated Sui gas fees before contract creation, milestone approval, or certificate generation so users better understand transaction costs before signing.

## Conclusion

The overall architecture and workflow are well designed. These improvements primarily focus on enhancing transparency, deployment reliability, and the developer experience, helping both users and contributors interact with the platform more effectively.
