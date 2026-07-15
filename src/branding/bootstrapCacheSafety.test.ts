import { getClubExperienceCacheIfMatches } from "./organizerResolver";
import { CLUB_EXPERIENCE_CACHE_KEY } from "./constants";
import { resolveBootstrapOrganizadorId } from "./organizerResolver";

describe("bootstrap branding cache safety", () => {
  const originalPath = window.location.pathname;

  afterEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, "", originalPath);
  });

  it("ruta anónima de reta: bootstrap org es null (no usa caché premium)", () => {
    window.history.replaceState({}, "", "/reta/event-123");
    window.localStorage.setItem(
      CLUB_EXPERIENCE_CACHE_KEY,
      JSON.stringify({
        organizadorId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        brandingKey: "hack-padel",
      })
    );

    expect(resolveBootstrapOrganizadorId()).toBeNull();
    expect(getClubExperienceCacheIfMatches(null)).toBeNull();
  });

  it("ranking con org en path: bootstrap conoce el org y caché solo si coincide", () => {
    const org = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    window.history.replaceState({}, "", `/ranking/o/${org}`);
    window.localStorage.setItem(
      CLUB_EXPERIENCE_CACHE_KEY,
      JSON.stringify({
        organizadorId: org,
        brandingKey: "hack-padel",
      })
    );

    expect(resolveBootstrapOrganizadorId()).toBe(org);
    expect(getClubExperienceCacheIfMatches(org)?.brandingKey).toBe("hack-padel");
    expect(
      getClubExperienceCacheIfMatches("cccccccc-cccc-4ccc-8ccc-cccccccccccc")
    ).toBeNull();
  });
});
