import {
  clearCareerIdentityCache,
  getOrLoadCareerIdentityBundle,
  invalidateCareerIdentityCache,
  invalidateCareerIdentityCacheForPlayer,
  type CareerIdentityBundle,
} from "./careerIdentityCache";

function bundle(tag: string): CareerIdentityBundle {
  return {
    identity: { canonicalJugadorId: tag } as unknown as CareerIdentityBundle["identity"],
    participaciones: [],
  };
}

describe("careerIdentityCache", () => {
  beforeEach(() => {
    clearCareerIdentityCache();
  });

  it("cache miss llama al loader una vez", async () => {
    const loader = jest.fn().mockResolvedValue(bundle("a"));
    const result = await getOrLoadCareerIdentityBundle("org-1", "j1", loader);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(result).toEqual(bundle("a"));
  });

  it("cache hit no vuelve a llamar al loader", async () => {
    const loader = jest.fn().mockResolvedValue(bundle("a"));
    await getOrLoadCareerIdentityBundle("org-1", "j1", loader);
    const second = await getOrLoadCareerIdentityBundle("org-1", "j1", loader);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(second).toEqual(bundle("a"));
  });

  it("dos solicitudes concurrentes reutilizan la misma promesa (in-flight dedupe)", async () => {
    let resolveLoader: (value: CareerIdentityBundle) => void = () => {};
    const loader = jest.fn(
      () =>
        new Promise<CareerIdentityBundle>((resolve) => {
          resolveLoader = resolve;
        })
    );

    const p1 = getOrLoadCareerIdentityBundle("org-1", "j1", loader);
    const p2 = getOrLoadCareerIdentityBundle("org-1", "j1", loader);

    expect(loader).toHaveBeenCalledTimes(1);

    resolveLoader(bundle("a"));
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual(bundle("a"));
    expect(r2).toEqual(bundle("a"));
  });

  it("una promesa rechazada no queda cacheada", async () => {
    const failingLoader = jest.fn().mockRejectedValue(new Error("boom"));
    await expect(
      getOrLoadCareerIdentityBundle("org-1", "j1", failingLoader)
    ).rejects.toThrow("boom");

    const okLoader = jest.fn().mockResolvedValue(bundle("a"));
    const result = await getOrLoadCareerIdentityBundle("org-1", "j1", okLoader);
    expect(okLoader).toHaveBeenCalledTimes(1);
    expect(result).toEqual(bundle("a"));
  });

  it("no cachea resultados null (sin identidad)", async () => {
    const nullLoader = jest.fn().mockResolvedValue(null);
    const first = await getOrLoadCareerIdentityBundle("org-1", "j1", nullLoader);
    expect(first).toBeNull();

    const okLoader = jest.fn().mockResolvedValue(bundle("a"));
    const second = await getOrLoadCareerIdentityBundle("org-1", "j1", okLoader);
    expect(okLoader).toHaveBeenCalledTimes(1);
    expect(second).toEqual(bundle("a"));
  });

  it("al expirar el TTL se vuelve a cargar", async () => {
    const nowSpy = jest.spyOn(Date, "now");
    nowSpy.mockReturnValue(1_000_000);

    const loader = jest.fn().mockResolvedValue(bundle("a"));
    await getOrLoadCareerIdentityBundle("org-1", "j1", loader);
    expect(loader).toHaveBeenCalledTimes(1);

    // Dentro del TTL (75s): sigue siendo hit.
    nowSpy.mockReturnValue(1_000_000 + 30_000);
    await getOrLoadCareerIdentityBundle("org-1", "j1", loader);
    expect(loader).toHaveBeenCalledTimes(1);

    // Fuera del TTL: se recarga.
    nowSpy.mockReturnValue(1_000_000 + 80_000);
    await getOrLoadCareerIdentityBundle("org-1", "j1", loader);
    expect(loader).toHaveBeenCalledTimes(2);

    nowSpy.mockRestore();
  });

  it("dos organizadores no comparten entradas", async () => {
    const loaderOrg1 = jest.fn().mockResolvedValue(bundle("org1"));
    const loaderOrg2 = jest.fn().mockResolvedValue(bundle("org2"));

    const r1 = await getOrLoadCareerIdentityBundle("org-1", "j1", loaderOrg1);
    const r2 = await getOrLoadCareerIdentityBundle("org-2", "j1", loaderOrg2);

    expect(loaderOrg1).toHaveBeenCalledTimes(1);
    expect(loaderOrg2).toHaveBeenCalledTimes(1);
    expect(r1).toEqual(bundle("org1"));
    expect(r2).toEqual(bundle("org2"));
  });

  it("dos jugadores no comparten entradas", async () => {
    const loaderJ1 = jest.fn().mockResolvedValue(bundle("j1"));
    const loaderJ2 = jest.fn().mockResolvedValue(bundle("j2"));

    const r1 = await getOrLoadCareerIdentityBundle("org-1", "j1", loaderJ1);
    const r2 = await getOrLoadCareerIdentityBundle("org-1", "j2", loaderJ2);

    expect(loaderJ1).toHaveBeenCalledTimes(1);
    expect(loaderJ2).toHaveBeenCalledTimes(1);
    expect(r1).toEqual(bundle("j1"));
    expect(r2).toEqual(bundle("j2"));
  });

  it("límite de tamaño elimina la entrada más antigua", async () => {
    const nowSpy = jest.spyOn(Date, "now");
    let clock = 0;
    nowSpy.mockImplementation(() => clock);

    // Llenar hasta el límite (500) con timestamps crecientes.
    for (let i = 0; i < 500; i++) {
      clock = i;
      // eslint-disable-next-line no-await-in-loop -- test secuencial intencional
      await getOrLoadCareerIdentityBundle(
        "org-1",
        `j${i}`,
        jest.fn().mockResolvedValue(bundle(`j${i}`))
      );
    }

    // La entrada más antigua (j0, cachedAt=0) debe seguir presente justo antes del desalojo.
    const stillThere = jest.fn().mockResolvedValue(bundle("j0"));
    clock = 499;
    await getOrLoadCareerIdentityBundle("org-1", "j0", stillThere);
    expect(stillThere).not.toHaveBeenCalled();

    // Una entrada 501 debe desalojar la más antigua (j0, la única con cachedAt=0
    // ya que j0 no se re-escribió arriba porque fue hit, no nueva escritura).
    clock = 500;
    await getOrLoadCareerIdentityBundle(
      "org-1",
      "j500",
      jest.fn().mockResolvedValue(bundle("j500"))
    );

    const reloadJ0 = jest.fn().mockResolvedValue(bundle("j0-reloaded"));
    clock = 501;
    await getOrLoadCareerIdentityBundle("org-1", "j0", reloadJ0);
    expect(reloadJ0).toHaveBeenCalledTimes(1);

    nowSpy.mockRestore();
  });

  it("invalidateCareerIdentityCacheForPlayer limpia el jugador en todos los organizadores", async () => {
    await getOrLoadCareerIdentityBundle(
      "org-1",
      "j1",
      jest.fn().mockResolvedValue(bundle("a"))
    );
    await getOrLoadCareerIdentityBundle(
      "org-2",
      "j1",
      jest.fn().mockResolvedValue(bundle("b"))
    );

    invalidateCareerIdentityCacheForPlayer("j1");

    const loaderOrg1 = jest.fn().mockResolvedValue(bundle("a2"));
    const loaderOrg2 = jest.fn().mockResolvedValue(bundle("b2"));
    await getOrLoadCareerIdentityBundle("org-1", "j1", loaderOrg1);
    await getOrLoadCareerIdentityBundle("org-2", "j1", loaderOrg2);
    expect(loaderOrg1).toHaveBeenCalledTimes(1);
    expect(loaderOrg2).toHaveBeenCalledTimes(1);
  });

  it("invalidateCareerIdentityCache limpia solo el organizador indicado", async () => {
    await getOrLoadCareerIdentityBundle(
      "org-1",
      "j1",
      jest.fn().mockResolvedValue(bundle("a"))
    );
    await getOrLoadCareerIdentityBundle(
      "org-2",
      "j1",
      jest.fn().mockResolvedValue(bundle("b"))
    );

    invalidateCareerIdentityCache("org-1");

    const loaderOrg1 = jest.fn().mockResolvedValue(bundle("a2"));
    const loaderOrg2 = jest.fn().mockResolvedValue(bundle("b2"));
    await getOrLoadCareerIdentityBundle("org-1", "j1", loaderOrg1);
    await getOrLoadCareerIdentityBundle("org-2", "j1", loaderOrg2);
    expect(loaderOrg1).toHaveBeenCalledTimes(1);
    expect(loaderOrg2).not.toHaveBeenCalled();
  });

  it("clearCareerIdentityCache vacía toda la caché", async () => {
    await getOrLoadCareerIdentityBundle(
      "org-1",
      "j1",
      jest.fn().mockResolvedValue(bundle("a"))
    );
    clearCareerIdentityCache();

    const loader = jest.fn().mockResolvedValue(bundle("a2"));
    await getOrLoadCareerIdentityBundle("org-1", "j1", loader);
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
