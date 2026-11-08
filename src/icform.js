// The IC form's questions, how to bring an existing form in line with them without losing its response
// columns, and the aggregate sheet's supply formula over its responses. Pure, so it runs in tests.

export const WHOSE = "Whose expertise are you rating?";
export const MYSELF = "Myself";
export const COLLEAGUE = "A colleague";
export const GRID = "Expertise";
export const RATINGS = [
  "Not my area",
  "Learning",
  "Operative",
  "Conceptual",
  "Strategic",
  "Comprehensive",
];
// Levels counted as supply: everything but "Not my area".
export const SUPPLY_LEVELS = RATINGS.slice(1);
// Below this many people, a count is left blank so nobody can be singled out.
export const MIN_GROUP = 3;
const RATINGS_SECTION = "Your ratings";

export const FORM_INFO = {
  title: "Engineering expertise: self-assessment and peer validation",
  description:
    "Rate your own expertise, or a colleague's, in the organisation's top areas. Only the discipline head sees individual answers. Everyone else sees counts of 3 or more people at most.",
};

const radio = (values) => ({
  type: "RADIO",
  options: values.map((value) => ({ value })),
});
export function formItems(areas) {
  return [
    {
      title: WHOSE,
      questionItem: {
        question: {
          required: true,
          choiceQuestion: radio([MYSELF, COLLEAGUE]),
        },
      },
    },
    { title: "About your colleague", pageBreakItem: {} },
    {
      title: "Your colleague's email",
      description: "Their DigitalService email address.",
      questionItem: {
        question: { required: true, textQuestion: { paragraph: false } },
      },
    },
    {
      title: RATINGS_SECTION,
      pageBreakItem: {},
      description:
        "Learning: building it up. Operative: implementing, applying standard methods. Conceptual: planning, shaping and adapting methods. Strategic: innovating, setting guidelines, leading. Comprehensive: strategic across the wider ecosystem.",
    },
    {
      title: GRID,
      description: "How do you, or your colleague, work in each area today?",
      questionGroupItem: {
        grid: { columns: radio(RATINGS) },
        questions: areas.map((title) => ({
          required: true,
          rowQuestion: { title },
        })),
      },
    },
    {
      title: "Anything to add?",
      questionItem: {
        question: { required: false, textQuestion: { paragraph: true } },
      },
    },
  ];
}

const KINDS = [
  "questionItem",
  "questionGroupItem",
  "pageBreakItem",
  "textItem",
  "imageItem",
  "videoItem",
];
const kindOf = (item) => KINDS.find((k) => k in item);
const sameItem = (a, b) => a.title === b.title && kindOf(a) === kindOf(b);

// Carries the existing item's IDs over, so Forms keeps writing to the same response columns.
function withIds(want, have) {
  const item = structuredClone(want);
  item.itemId = have.itemId;
  if (item.questionItem)
    item.questionItem.question.questionId =
      have.questionItem.question.questionId;
  if (item.questionGroupItem) {
    const ids = new Map(
      have.questionGroupItem.questions.map((q) => [
        q.rowQuestion?.title,
        q.questionId,
      ]),
    );
    for (const q of item.questionGroupItem.questions)
      if (ids.has(q.rowQuestion.title))
        q.questionId = ids.get(q.rowQuestion.title);
  }
  return item;
}

// Requests for forms.batchUpdate that turn the existing items into the wanted ones: unknown items are
// deleted, matching ones (same title and kind) updated and moved in place, missing ones created.
export function formRequests(existing, wanted) {
  const matched = new Map();
  for (const want of wanted) {
    const have = existing.find(
      (e) => sameItem(e, want) && ![...matched.values()].includes(e),
    );
    if (have) matched.set(want, have);
  }
  const kept = new Set(matched.values());
  const requests = existing
    .map((e, index) => ({ e, index }))
    .filter(({ e }) => !kept.has(e))
    .reverse()
    .map(({ index }) => ({ deleteItem: { location: { index } } }));
  const order = existing.filter((e) => kept.has(e));
  wanted.forEach((want, index) => {
    const have = matched.get(want);
    if (!have) {
      requests.push({ createItem: { item: want, location: { index } } });
      order.splice(index, 0, want);
      return;
    }
    const from = order.indexOf(have);
    if (from !== index) {
      requests.push({
        moveItem: { originalLocation: { index: from }, newLocation: { index } },
      });
      order.splice(index, 0, ...order.splice(from, 1));
    }
    requests.push({
      updateItem: {
        item: withIds(want, have),
        location: { index },
        updateMask: `title,description,${kindOf(want)}`,
      },
    });
  });
  return requests;
}

// After the items exist: "Myself" skips the colleague section and goes straight to the ratings.
export function branchRequest(items) {
  const index = items.findIndex((i) => i.title === WHOSE);
  const section = items.find(
    (i) => i.title === RATINGS_SECTION && i.pageBreakItem,
  );
  const item = structuredClone(items[index]);
  // Forms wants a destination on every option or none, so "A colleague" says outright: the next section.
  item.questionItem.question.choiceQuestion.options = [
    { value: MYSELF, goToSectionId: section.itemId },
    { value: COLLEAGUE, goToAction: "NEXT_SECTION" },
  ];
  return {
    updateItem: { item, location: { index }, updateMask: "questionItem" },
  };
}

const quote = (s) => `"${s.replaceAll('"', '""')}"`;
const column = (values) => `{${values.map(quote).join(";")}}`;
const row = (values) => `{${values.map(quote).join(",")}}`;

// Self-assessments per area and level, from the response tab, found by header so the form can change.
// Raw rows never leave the formula. Counts below MIN_GROUP are blank. Output: area, then one column per level.
// Each person's latest self-assessment counts, once. Only an area without a column yet counts as 0: any other
// error shows, so an import that still needs "Allow access" displays its #REF! and button.
// aliases: area -> former bucket names that went into it (the bucket history). Their response columns count
// with it, so answers from before a regrouping stay counted: per person, the highest level across the columns.
export function supplyFormula(sheetId, tab, areas, aliases = {}) {
  const names = areas.map((a) => [a, ...(aliases[a] ?? [])].join("|"));
  return `=LET(
  d, IMPORTRANGE(${quote(sheetId)}, ${quote(`'${tab}'!A:ZZ`)}),
  h, CHOOSEROWS(d, 1),
  body, FILTER(d, SEQUENCE(ROWS(d)) > 1, CHOOSECOLS(d, XMATCH(${quote(WHOSE)}, h)) = ${quote(MYSELF)}),
  latest, SORTN(SORT(body, 1, FALSE), 9^9, 2, XMATCH("Email address", h), TRUE),
  areas, ${column(areas)},
  names, ${column(names)},
  levels, ${row(SUPPLY_LEVELS)},
  counts, MAKEARRAY(ROWS(areas), COLUMNS(levels), LAMBDA(i, j, LET(
    cols, MAP(SPLIT(INDEX(names, i, 1), "|", FALSE, FALSE), LAMBDA(a, IFNA(XMATCH(${quote(`${GRID} [`)} & a & "]", h), 0))),
    n, IF(MAX(cols) = 0, 0, SUM(--(BYROW(CHOOSECOLS(latest, FILTER(cols, cols > 0)), LAMBDA(r, MAX(IFNA(XMATCH(r, levels), 0)))) = j))),
    IF(n < ${MIN_GROUP}, "", n)))),
  VSTACK(HSTACK("area", levels), HSTACK(areas, counts))
)`;
}
