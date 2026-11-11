import {
  MENTALIDAD_RIVIERA_QUOTES,
  getDailyMentalidadRivieraQuote,
  getLocalDateKey,
} from "./mentalidadRivieraQuotes";

describe("mentalidadRivieraQuotes", () => {
  test("contiene al menos 60 frases únicas, naturales y sin emojis", () => {
    expect(MENTALIDAD_RIVIERA_QUOTES.length).toBeGreaterThanOrEqual(60);

    const uniqueQuotes = new Set(MENTALIDAD_RIVIERA_QUOTES);
    expect(uniqueQuotes.size).toBe(MENTALIDAD_RIVIERA_QUOTES.length);

    const emojiRegex = /[\p{Extended_Pictographic}]/u;
    for (const quote of MENTALIDAD_RIVIERA_QUOTES) {
      expect(quote.trim().length).toBeGreaterThan(25);
      expect(emojiRegex.test(quote)).toBe(false);
    }
  });

  test("es determinístico para la misma fecha local y no cambia al recargar", () => {
    const morning = new Date(2026, 10, 11, 8, 15, 0);
    const afternoon = new Date(2026, 10, 11, 16, 45, 30);
    const night = new Date(2026, 10, 11, 23, 59, 59);

    const q1 = getDailyMentalidadRivieraQuote(morning);
    const q2 = getDailyMentalidadRivieraQuote(afternoon);
    const q3 = getDailyMentalidadRivieraQuote(night);
    const qByKey = getDailyMentalidadRivieraQuote("2026-11-11");

    expect(q1.dateKey).toBe("2026-11-11");
    expect(q1.quote).toBe(q2.quote);
    expect(q2.quote).toBe(q3.quote);
    expect(q3.quote).toBe(qByKey.quote);
  });

  test("cambia automáticamente cada día y nunca repite en días consecutivos", () => {
    let previousQuote = "";
    const start = new Date(2026, 0, 1, 12, 0, 0);

    for (let offset = 0; offset < 400; offset++) {
      const current = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() + offset,
        12,
        0,
        0,
      );
      const { quote } = getDailyMentalidadRivieraQuote(current);
      expect(quote).not.toBe(previousQuote);
      previousQuote = quote;
    }
  });

  test("recorre toda la colección antes de repetir una frase", () => {
    const total = MENTALIDAD_RIVIERA_QUOTES.length;
    const seen = new Set<string>();
    const start = new Date(2026, 0, 1, 12, 0, 0);

    for (let offset = 0; offset < total; offset++) {
      const current = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() + offset,
        12,
        0,
        0,
      );
      seen.add(getDailyMentalidadRivieraQuote(current).quote);
    }

    expect(seen.size).toBe(total);
  });

  test("getLocalDateKey devuelve formato YYYY-MM-DD local", () => {
    const sample = new Date(2026, 2, 5, 9, 0, 0);
    expect(getLocalDateKey(sample)).toBe("2026-03-05");
  });
});
