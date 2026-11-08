// The organisation's areas of expertise, shared by the project survey and the IC form.
// Until the grouping from embeddings exists, these ten stand in for the top 10.
export const COP = "the community of practice";
export const SUPPORT_KEY = { "the platform team": "platform", "the legal and IT security team": "legal", [COP]: "cop" };
// Name, support the area can also draw on, and one example per working method.
export const AREAS = [
  ["Discovery & Inception", COP, ["Run technical spikes and prototypes", "Map an existing system and its constraints", "Shape the technical approach, options and estimates for a new product", "Advise ministries on what is technically feasible before a project starts"]],
  ["Frontend", COP, ["Build components to the design system", "Plan the structure of a new journey", "Set frontend standards across teams", "Shape the shared design system across government services"]],
  ["Backend", COP, ["Build endpoints to the team's conventions", "Design the data model and service boundaries for a feature", "Set API guidelines across teams, decide build or buy", "Shape interoperability standards with other ministries"]],
  ["Architecture", COP, ["Document and maintain existing decisions", "Design the architecture of a new component", "Own the system architecture and its trade-offs", "Align architecture with federal IT strategy and shared platforms"]],
  ["Security", COP, ["Patch dependencies, follow secure coding guidance", "Threat-model a new integration", "Own the security architecture and its trade-offs", "Align with BSI requirements and cross-government security developments"]],
  ["DevOps, CI/CD & Infrastructure", "the platform team", ["Maintain build and deployment pipelines, environments and monitoring", "Design CI/CD, environments and release processes for a new service", "Set infrastructure and delivery standards and hosting choices", "Shape sovereign cloud and shared platform strategy"]],
  ["Quality & Documentation", COP, ["Write automated tests, keep developer and API documentation current", "Plan the test and documentation approach for a release or handover", "Set quality and documentation standards across teams", "Shape quality and knowledge-sharing practice across the organisation"]],
  ["Data & AI", COP, ["Build data pipelines and queries, integrate a model, write and evaluate prompts", "Design a data model, migration, or agent and retrieval workflow with evaluation", "Own data architecture and governance, or decide models, hosting and safeguards", "Shape data sharing and responsible AI use across government"]],
  ["Compliance & Privacy", "the legal and IT security team", ["Apply data protection requirements in code", "Design consent, retention and audit flows", "Own the product's GDPR and compliance approach", "Shape compliance practice with data protection officers across ministries"]],
  ["Accessibility", COP, ["Fix audit findings, test with assistive technology", "Plan accessible patterns for a new journey", "Define the product's accessibility strategy and BITV compliance route", "Influence accessibility standards across government services"]],
];
export const AREA_NAMES = AREAS.map(([name]) => name);
