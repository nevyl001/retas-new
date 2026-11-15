import {
  parsePrepFocusTopics,
  serializePrepFocusTopics,
  togglePrepFocusTopic,
} from "./prepFocusTopics";

describe("prepFocusTopics", () => {
  it("parses every joined topic", () => {
    expect(
      parsePrepFocusTopics(
        "Bandeja y víbora · Saque y resto · Físico y desplazamientos · Voleas"
      )
    ).toEqual([
      "Bandeja y víbora",
      "Saque y resto",
      "Físico y desplazamientos",
      "Voleas",
    ]);
  });

  it("keeps a single free-text focus as one topic", () => {
    expect(parsePrepFocusTopics("Trabajo de profundidad en bandeja")).toEqual([
      "Trabajo de profundidad en bandeja",
    ]);
  });

  it("serializes every topic", () => {
    expect(serializePrepFocusTopics(["A", "B", "C", "D"])).toBe("A · B · C · D");
    expect(serializePrepFocusTopics(["  ", ""])).toBeNull();
  });

  it("toggles any number of topics and removes one when selected again", () => {
    let topics: string[] = [];
    topics = togglePrepFocusTopic(topics, "A");
    topics = togglePrepFocusTopic(topics, "B");
    topics = togglePrepFocusTopic(topics, "C");
    topics = togglePrepFocusTopic(topics, "D");
    expect(topics).toEqual(["A", "B", "C", "D"]);
    expect(togglePrepFocusTopic(topics, "B")).toEqual(["A", "C", "D"]);
  });
});