// The engineer's own answers, kept in this browser by the self-assessment page (self-assessment.html) and read
// by their own view of the charts (ic.html). { ratings: area -> rating, submitted: boolean }.
// Storage can be unavailable (private windows, blocked site data): then nothing is kept beyond this visit.
const STORE = "ic-self-assessment";

export function restoreAssessment() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? "{}");
    return { ratings: saved.ratings ?? {}, submitted: Boolean(saved.submitted) };
  } catch {
    return { ratings: {}, submitted: false };
  }
}

export function saveAssessment(state) {
  try {
    localStorage.setItem(STORE, JSON.stringify({ ratings: state.ratings, submitted: state.submitted }));
  } catch {
    // Not kept: fine, the form is the record.
  }
}
