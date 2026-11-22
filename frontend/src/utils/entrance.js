// The welcome animation plays once, right after someone signs in (not when a saved session
// opens the app on load). The sign-in page marks the moment; the chat page asks whether it
// was just now. Reading doesn't clear it, so React's double render in development still sees it.
let signedInAt = 0;

export const markSignedIn = () => { signedInAt = Date.now(); };
export const justSignedIn = () => Date.now() - signedInAt < 2000;
