import { applyCachedClubExperienceIfSafe } from "./applyCachedClubExperience";
import { applyBrandingSyncForOrganizador } from "./BrandingService";
import { CLUB_EXPERIENCE_CACHE_KEY } from "./constants";

jest.mock("./BrandingService", () => ({
  applyBrandingSyncForOrganizador: jest.fn(),
}));

const applySyncMock = applyBrandingSyncForOrganizador as jest.Mock;

describe("applyCachedClubExperienceIfSafe", () => {
  const originalPath = window.location.pathname;

  afterEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, "", originalPath);
    jest.clearAllMocks();
  });

  it("aplica PCS desde caché en Home", () => {
    window.history.replaceState({}, "", "/");
    window.localStorage.setItem(
      CLUB_EXPERIENCE_CACHE_KEY,
      JSON.stringify({
        organizadorId: "35e31ab8-2a2f-4526-9e84-e130c85f8ca9",
        brandingKey: "padel-court-series",
      })
    );

    expect(applyCachedClubExperienceIfSafe()).toBe(true);
    expect(applySyncMock).toHaveBeenCalledWith(
      "35e31ab8-2a2f-4526-9e84-e130c85f8ca9"
    );
  });

  it("no aplica caché premium en ruta pública de evento", () => {
    window.history.replaceState({}, "", "/eventos/pcs-open-simulacion-completa");
    window.localStorage.setItem(
      CLUB_EXPERIENCE_CACHE_KEY,
      JSON.stringify({
        organizadorId: "35e31ab8-2a2f-4526-9e84-e130c85f8ca9",
        brandingKey: "padel-court-series",
      })
    );

    expect(applyCachedClubExperienceIfSafe()).toBe(false);
    expect(applySyncMock).not.toHaveBeenCalled();
  });

  it("no aplica si no hay caché", () => {
    window.history.replaceState({}, "", "/");
    expect(applyCachedClubExperienceIfSafe()).toBe(false);
    expect(applySyncMock).not.toHaveBeenCalled();
  });
});
