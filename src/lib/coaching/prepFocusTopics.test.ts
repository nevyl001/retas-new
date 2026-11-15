import {
  PREP_FOCUS_MAX_TOPICS,
  parsePrepFocusTopics,
  serializePrepFocusTopics,
  togglePrepFocusTopic,
} from "./prepFocusTopics";

describe("prepFocusTopics", () => {
  it("parses joined focus into up to three topics", () => {
    expect(
      parsePrepFocusTopics("Bandeja y víbora · Saque y resto · Físico y desplazamientos")
    ).toEqual([
      "Bandeja y víbora",
      "Saque y resto",
      "Físico y desplazamientos",
    ]);
  });

  it("keeps a single free-text focus as one topic", () => {
    expect(parsePrepFocusTopics("Trabajo de profundidad en bandeja")).toEqual([
      "Trabajo de profundidad en bandeja",
    ]);
  });

  it("serializes and clamps to three topics", () => {
    expect(
      serializePrepFocusTopics([
        "A",
        "B",
        "C",
        "D",
      ])
    ).toBe("A · B · C");
    expect(serializePrepFocusTopics(["  ", ""])).toBeNull();
  });

  it("toggles topics and blocks a fourth selection", () => {
    let topics: string[] = [];
    topics = togglePrepFocusTopic(topics, "A");
    topics = togglePrepFocusTopic(topics, "B");
    topics = togglePrepFocusTopic(topics, "C");
    expect(topics).toHaveLength(PREP_FOCUS_MAX_TOPICS);
    expect(togglePrepFocusTopic(topics, "D")).toEqual(["A", "B", "C"]);
    expect(togglePrepFocusTopic(topics, "B")).toEqual(["A", "C"]);
  });
});
