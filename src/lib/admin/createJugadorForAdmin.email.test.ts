import { createJugadorForAdmin } from "./accountControls";
import { createRivieraJugador } from "../rivieraJugadores/rivieraJugadoresService";
import {
  EMAIL_INVALID_MESSAGE,
  EMAIL_REQUIRED_MESSAGE,
} from "../rivieraJugadores/emailValidation";

// jest.mock se hoistea automáticamente por encima de los imports (Jest +
// babel-plugin-jest-hoist), así que escribirlo después de los imports es
// equivalente en tiempo de ejecución y respeta la regla import/first.
jest.mock("../supabaseClient", () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

jest.mock("../rivieraJugadores/rivieraJugadoresService", () => ({
  createRivieraJugador: jest.fn().mockResolvedValue({ id: "jugador-admin-1" }),
}));

const ORG = "org-admin-1";
const mockCreate = createRivieraJugador as jest.Mock;

describe("createJugadorForAdmin — correo obligatorio", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("crea el jugador con correo válido normalizado", async () => {
    await createJugadorForAdmin(ORG, {
      nombre: "Jugador Admin",
      email: "  Admin@EXAMPLE.com  ",
    });

    expect(mockCreate).toHaveBeenCalledWith(ORG, {
      nombre: "Jugador Admin",
      email: "admin@example.com",
      categoria: "3ra_fuerza",
    });
  });

  it("rechaza sin correo, sin llamar a createRivieraJugador", async () => {
    await expect(
      createJugadorForAdmin(ORG, { nombre: "Sin Correo", email: "" })
    ).rejects.toThrow(EMAIL_REQUIRED_MESSAGE);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rechaza correo inválido, sin llamar a createRivieraJugador", async () => {
    await expect(
      createJugadorForAdmin(ORG, { nombre: "Correo Malo", email: "invalido" })
    ).rejects.toThrow(EMAIL_INVALID_MESSAGE);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rechaza sin nombre", async () => {
    await expect(
      createJugadorForAdmin(ORG, { nombre: "   ", email: "valido@example.com" })
    ).rejects.toThrow("El nombre es obligatorio");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
