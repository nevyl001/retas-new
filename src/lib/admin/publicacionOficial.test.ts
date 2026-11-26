import {
  controlPublicacionOficial,
  mensajePublicacionIndividual,
  mensajePublicacionMasiva,
  type PublicacionOficialEstado,
  type PublicacionOficialResult,
} from "./publicacionOficial";

function estado(
  patch: Partial<PublicacionOficialEstado> = {}
): PublicacionOficialEstado {
  return {
    rivieraId: "RIV-00000042",
    esCedido: false,
    publicadoGlobal: false,
    publicacionPropia: false,
    origenOrganizadorId: null,
    origenNombre: null,
    conflicto: false,
    puedePublicar: true,
    puedeRetirar: false,
    motivoBloqueo: null,
    ...patch,
  };
}

describe("controlPublicacionOficial", () => {
  it("deja publicar a un jugador propio que todavía no está en el sitio", () => {
    const control = controlPublicacionOficial(estado(), false);
    expect(control.checked).toBe(false);
    expect(control.disabled).toBe(false);
  });

  it("muestra publicado y permite retirarlo si la ficha es propia", () => {
    const control = controlPublicacionOficial(
      estado({
        publicadoGlobal: true,
        publicacionPropia: true,
        puedePublicar: false,
        puedeRetirar: true,
      }),
      false
    );
    expect(control.checked).toBe(true);
    expect(control.disabled).toBe(false);
    expect(control.nota).toBeNull();
  });

  it("marca al cedido ya publicado y bloquea una segunda ficha", () => {
    const control = controlPublicacionOficial(
      estado({
        esCedido: true,
        publicadoGlobal: true,
        publicacionPropia: false,
        puedePublicar: false,
        puedeRetirar: false,
        origenNombre: "Padelito Warehouse",
        motivoBloqueo: "Ya publicado en sitio oficial.",
      }),
      false
    );
    expect(control.checked).toBe(true);
    expect(control.disabled).toBe(true);
    expect(control.nota).toContain("Ya publicado en sitio oficial");
    expect(control.nota).toContain("Padelito Warehouse");
    expect(control.title).toContain("no una ficha oficial propia");
  });

  it("no deja que la cuenta receptora publique un cedido sin autorización", () => {
    const control = controlPublicacionOficial(
      estado({
        esCedido: true,
        puedePublicar: false,
        motivoBloqueo: "La cuenta propietaria publica esta identidad.",
      }),
      false
    );
    expect(control.checked).toBe(false);
    expect(control.disabled).toBe(true);
    expect(control.title).toContain("cuenta propietaria");
  });

  it("permite publicar la identidad global de un cedido cuando hay autorización", () => {
    const control = controlPublicacionOficial(
      estado({ esCedido: true, puedePublicar: true, origenNombre: "Hack Pádel" }),
      false
    );
    expect(control.checked).toBe(false);
    expect(control.disabled).toBe(false);
    expect(control.title).toContain("identidad global");
  });

  it("bloquea un conflicto sin ofrecer fusión", () => {
    const control = controlPublicacionOficial(
      estado({
        conflicto: true,
        publicadoGlobal: true,
        puedePublicar: false,
        puedeRetirar: false,
      }),
      false
    );
    expect(control.disabled).toBe(true);
    expect(control.nota).toBe("Conflicto de identidad");
    expect(control.title).toContain("No se eliminó ni se fusionó");
  });

  it("trata como personas distintas a dos fichas con el mismo nombre", () => {
    const alex = controlPublicacionOficial(
      estado({ rivieraId: "RIV-00000001", publicadoGlobal: true, puedeRetirar: true, publicacionPropia: true, puedePublicar: false }),
      false
    );
    const otroAlex = controlPublicacionOficial(
      estado({ rivieraId: "RIV-00000002" }),
      false
    );
    expect(alex.checked).toBe(true);
    expect(otroAlex.checked).toBe(false);
    expect(otroAlex.disabled).toBe(false);
  });

  it("no usa el checkbox de un jugador archivado", () => {
    const control = controlPublicacionOficial(estado({ puedePublicar: false }), true);
    expect(control.disabled).toBe(true);
  });
});

describe("mensajes de publicación", () => {
  it("explica un reintento y una acción masiva sin duplicar", () => {
    const ya: PublicacionOficialResult = {
      ok: true,
      code: "ya_publicado",
      publicado: true,
      perfilPublicadoId: "canon",
      origenNombre: "Hack Pádel",
      organizadorPublicadoId: "origen",
    };
    expect(mensajePublicacionIndividual("Alex", ya)).toContain("ya está publicado");
    expect(
      mensajePublicacionMasiva(
        {
          ok: true,
          publicados: 1,
          yaPublicados: 3,
          retirados: 0,
          conflictos: 1,
          bloqueados: 2,
          noAutorizados: 0,
        },
        true
      )
    ).toContain("no se duplicaron");
  });

  it("al retirar una cesión el mensaje no dice que se borró la ficha oficial", () => {
    expect(
      mensajePublicacionMasiva(
        {
          ok: true,
          publicados: 0,
          yaPublicados: 4,
          retirados: 2,
          conflictos: 0,
          bloqueados: 0,
          noAutorizados: 0,
        },
        false
      )
    ).toContain("siguen publicados en su identidad global");
  });
});
