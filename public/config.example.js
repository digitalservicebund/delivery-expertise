// Copy to config.js (git-ignored) and fill in from 1Password. On deploy, config.js is generated from the
// SHEETS_CONFIG secret, which holds this object as JSON. None of these values grant access on their own.
export default {
  clientId: "<oauth web client id>.apps.googleusercontent.com", // the client ID only, never the client secret
  pickerKey: "<google picker api key, restricted to this site's referrers and the Picker API>",
  sheets: { projects: "<sheet id>", discipline: "<sheet id>", icResponses: "<sheet id>", aggregate: "<sheet id>", prototype: "<sheet id>" },
  icFormId: "<form edit id, from docs.google.com/forms/d/<this>/edit>",
  icForm: "https://docs.google.com/forms/d/e/<form id>/viewform",
};
