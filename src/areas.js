// The organisation's areas of expertise. The project survey suggests a broad list (AREAS), finer than the buckets:
// teams pick what they actually need, and the portal groups everything, these and the areas teams add, into the
// ten buckets the IC form asks about (src/buckets.js). Until a grouping is applied, the IC form and supply use
// DEFAULT_BUCKETS.
export const COP = "the community of practice";
const PLATFORM = "the platform team";
const LEGAL = "the legal and IT security team";
export const SUPPORT_KEY = { [PLATFORM]: "platform", [LEGAL]: "legal", [COP]: "cop" };
// Name, support the area can also draw on, and one example per working method.
export const AREAS = [
  ["Technical discovery", COP, ["Run technical spikes", "Map an existing system and its constraints", "Shape the technical approach, options and estimates for a new product", "Advise ministries on what is technically feasible before a project starts"]],
  ["Prototyping", COP, ["Build a clickable or working prototype", "Plan which assumptions a prototype should test", "Decide when a prototype becomes a product", "Shape how government tests ideas before procurement"]],
  ["Frontend development", COP, ["Build components and pages to the team's conventions", "Plan the structure of a new journey", "Set frontend standards across teams", "Shape frontend practice across government services"]],
  ["Design systems", COP, ["Build components to the design system", "Design new components with designers", "Own the design system's roadmap", "Shape the shared design system across government services"]],
  ["Backend development", COP, ["Build endpoints and services to the team's conventions", "Design the data model and service boundaries for a feature", "Set backend standards across teams, decide build or buy", "Shape backend practice across government services"]],
  ["APIs & integration", COP, ["Integrate an existing API", "Design an API or an integration with another agency", "Set API guidelines across teams", "Shape interoperability standards with other ministries"]],
  ["Software architecture", COP, ["Document and maintain existing decisions", "Design the architecture of a new component", "Own the system architecture and its trade-offs", "Align architecture with federal IT strategy and shared platforms"]],
  ["Legacy modernisation", COP, ["Change a legacy system safely", "Plan the migration of a legacy component", "Own a modernisation roadmap", "Shape how government retires legacy systems"]],
  ["Application security", COP, ["Patch dependencies, follow secure coding guidance", "Threat-model a new integration", "Own the security architecture and its trade-offs", "Shape secure development practice across government"]],
  ["Identity & access", COP, ["Add login and roles to a service", "Design authentication and authorisation for a product", "Decide identity providers and access policies", "Shape identity across government services"]],
  ["IT security compliance", LEGAL, ["Fill in security documentation", "Prepare a BSI IT-Grundschutz assessment", "Own the product's security concept and accreditation", "Align with BSI requirements and cross-government security developments"]],
  ["CI/CD", PLATFORM, ["Maintain build and deployment pipelines", "Design CI/CD and release processes for a new service", "Set delivery standards across teams", "Shape delivery practice across government"]],
  ["Cloud infrastructure", PLATFORM, ["Maintain environments and infrastructure as code", "Design hosting and environments for a new service", "Decide hosting choices and infrastructure standards", "Shape sovereign cloud and shared platform strategy"]],
  ["Containers & orchestration", PLATFORM, ["Run services in containers", "Design a cluster set-up for a product", "Own the container platform and its standards", "Shape shared container platforms across government"]],
  ["Observability", PLATFORM, ["Add logging, metrics and alerts", "Design monitoring and on-call for a service", "Set observability standards across teams", "Shape operations practice across government"]],
  ["Developer experience", PLATFORM, ["Improve the team's tooling and local set-up", "Design templates and paved roads for new services", "Own developer tooling across teams", "Shape engineering productivity across the organisation"]],
  ["Test automation", COP, ["Write automated tests", "Plan the test approach for a release", "Set testing standards across teams", "Shape quality practice across the organisation"]],
  ["Performance", COP, ["Find and fix a slow page or query", "Plan load tests before a launch", "Set performance budgets across teams", "Shape performance standards for government services"]],
  ["Technical documentation", COP, ["Keep developer and API documentation current", "Plan documentation for a handover", "Set documentation standards across teams", "Shape knowledge sharing across the organisation"]],
  ["Data engineering", COP, ["Build data pipelines and queries", "Design a data model or migration", "Own data architecture for a product", "Shape data sharing across government"]],
  ["Data analysis", COP, ["Answer questions with queries and dashboards", "Design metrics for a service", "Own a product's analytics approach", "Shape evidence-based policy with ministries"]],
  ["Search", COP, ["Tune an existing search", "Design search and relevance for a product", "Decide search technology and ranking approach", "Shape search across government information"]],
  ["Machine learning", COP, ["Train and evaluate a model", "Design a machine learning feature with evaluation", "Decide models, data and safeguards", "Shape responsible machine learning in government"]],
  ["AI engineering", COP, ["Integrate a language model, write and evaluate prompts", "Design an agent or retrieval workflow with evaluation", "Decide models, hosting and safeguards", "Shape responsible AI use across government"]],
  ["Data protection", LEGAL, ["Apply data protection requirements in code", "Design consent, retention and audit flows", "Own the product's GDPR and compliance approach", "Shape compliance practice with data protection officers across ministries"]],
  ["Accessibility", COP, ["Fix audit findings, test with assistive technology", "Plan accessible patterns for a new journey", "Define the product's accessibility strategy and BITV compliance route", "Influence accessibility standards across government services"]],
  ["Mobile", COP, ["Build features in a mobile app", "Design a mobile app's architecture", "Decide native, hybrid or web", "Shape mobile government services"]],
  ["Open source", COP, ["Contribute to an open-source dependency", "Plan publishing a product as open source", "Own the organisation's open-source practice", "Shape open-source policy across government"]],
  ["Feature development", COP, ["Build features to the team's conventions", "Plan how a feature is built and rolled out", "Set how teams deliver features end to end", "Shape product delivery practice across government"]],
  ["Operations", PLATFORM, ["Run and monitor a service in production", "Design how a service is operated and scaled", "Own operations for a product and its service levels", "Shape operations practice across government"]],
  ["Maintenance", COP, ["Update dependencies and fix bugs", "Plan maintenance work and technical debt", "Own a product's maintenance strategy and life cycle", "Shape how government keeps services maintained"]],
  ["Support", COP, ["Answer support requests and fix what users report", "Design support processes and escalation", "Own a product's support model", "Shape service support across government"]],
  ["On-call & incident response", PLATFORM, ["Take on-call shifts and handle incidents", "Design on-call rotas, runbooks and post-mortems", "Own incident management for a product", "Shape incident response across government services"]],
  ["Release management", COP, ["Ship releases to the team's process", "Plan release schedules and rollouts", "Own how a product releases and versions", "Shape release practice across teams"]],
];
export const AREA_NAMES = AREAS.map(([name]) => name);
// What the IC form asks about until the portal's grouping is applied.
export const DEFAULT_BUCKETS = [
  "Discovery & Inception", "Frontend", "Backend", "Architecture", "Security & Compliance",
  "DevOps, CI/CD & Infrastructure", "Quality & Documentation", "Data & AI", "Software lifecycle", "Accessibility",
];
// Which suggested areas each default bucket covered, for mapping answers given under the defaults to the buckets
// that replaced them (inferHistory in src/buckets.js).
export const DEFAULT_BUCKET_AREAS = {
  "Discovery & Inception": ["Technical discovery", "Prototyping"],
  Frontend: ["Frontend development", "Design systems", "Performance", "Mobile"],
  Backend: ["Backend development", "APIs & integration"],
  Architecture: ["Software architecture", "Legacy modernisation"],
  "Security & Compliance": ["Application security", "Identity & access", "Data protection", "IT security compliance"],
  "DevOps, CI/CD & Infrastructure": ["CI/CD", "Cloud infrastructure", "Containers & orchestration", "Observability", "Developer experience"],
  "Quality & Documentation": ["Test automation", "Technical documentation"],
  "Data & AI": ["Data engineering", "Data analysis", "Search", "Machine learning", "AI engineering"],
  "Software lifecycle": ["Feature development", "Operations", "Maintenance", "Support", "On-call & incident response", "Release management", "Open source"],
  Accessibility: ["Accessibility"],
};
// Default buckets that were later merged, kept so answers given under them still find their areas.
export const RETIRED_DEFAULT_AREAS = {
  Security: ["Application security", "Identity & access"],
  "Compliance & Privacy": ["Data protection", "IT security compliance"],
};
