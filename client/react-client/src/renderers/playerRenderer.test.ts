import {
  drawPlayers,
  drawRacePaperdoll,
  drawWeaponEnchantGlow,
  getRaceScaleFactor,
} from "./playerRenderer";
import { Race, EnchantVisualGlow } from "../protocol/BinaryDeltaDecoder";

const makeCtx = () => ({
  save: jest.fn(),
  restore: jest.fn(),
  beginPath: jest.fn(),
  closePath: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  arc: jest.fn(),
  ellipse: jest.fn(),
  stroke: jest.fn(),
  fill: jest.fn(),
  fillRect: jest.fn(),
  strokeRect: jest.fn(),
  fillText: jest.fn(),
  strokeText: jest.fn(),
  fillStyle: "",
  strokeStyle: "",
  lineWidth: 1,
  globalAlpha: 1,
  font: "",
  textAlign: "",
  textBaseline: "",
  lineCap: "butt",
});

const asCtx = (c: ReturnType<typeof makeCtx>) =>
  c as unknown as CanvasRenderingContext2D;

describe("playerRenderer", () => {
  describe("getRaceScaleFactor", () => {
    it("returns miniature scale for Dwarf (Tontatta micro-titan)", () => {
      expect(getRaceScaleFactor(Race.Dwarf)).toBe(0.82);
    });

    it("returns enlarged scale for Ogre/Orc (Crucible vanguard)", () => {
      expect(getRaceScaleFactor(Race.OgreOrc)).toBe(1.25);
    });

    it("returns 1.0 for Human and default races", () => {
      expect(getRaceScaleFactor(Race.HumanDemiHuman)).toBe(1.0);
      expect(getRaceScaleFactor(Race.Furral)).toBe(1.0);
      expect(getRaceScaleFactor(Race.Lunar)).toBe(1.0);
      expect(getRaceScaleFactor(Race.DarkLunar)).toBe(1.0);
      expect(getRaceScaleFactor(undefined)).toBe(1.0);
    });
  });

  describe("drawRacePaperdoll", () => {
    it("renders Dwarf forge and apron components", () => {
      const ctx = makeCtx();
      drawRacePaperdoll(asCtx(ctx), 100, 100, 20, Race.Dwarf, 0, false, 1, 1000);
      expect(ctx.fill).toHaveBeenCalled();
      expect(ctx.arc).toHaveBeenCalled();
      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
    });

    it("renders Ogre/Orc dual basalt pauldrons and blood-fury core", () => {
      const ctx = makeCtx();
      drawRacePaperdoll(asCtx(ctx), 100, 100, 25, Race.OgreOrc, Math.PI / 2, false, 1, 1000);
      expect(ctx.arc).toHaveBeenCalledTimes(3); // 2 pauldrons + 1 blood-fury core
      expect(ctx.stroke).toHaveBeenCalled();
    });

    it("renders Furral beast ears and electric bio-static sparks", () => {
      const ctx = makeCtx();
      drawRacePaperdoll(asCtx(ctx), 100, 100, 20, Race.Furral, 0, false, 1, 1000);
      expect(ctx.arc).toHaveBeenCalled();
      expect(ctx.stroke).toHaveBeenCalled();
    });

    it("renders Lunar starlight mantle and elongated elven ears", () => {
      const ctx = makeCtx();
      drawRacePaperdoll(asCtx(ctx), 100, 100, 20, Race.Lunar, 0, false, 1, 1000);
      expect(ctx.ellipse).toHaveBeenCalledTimes(2);
      expect(ctx.stroke).toHaveBeenCalled();
    });

    it("renders Dark-Lunar umbral twilight aura and crescent circlet", () => {
      const ctx = makeCtx();
      drawRacePaperdoll(asCtx(ctx), 100, 100, 20, Race.DarkLunar, 0, false, 1, 1000);
      expect(ctx.arc).toHaveBeenCalled();
      expect(ctx.stroke).toHaveBeenCalled();
    });
  });

  describe("drawWeaponEnchantGlow", () => {
    it("renders base blade with no glow when EnchantVisualGlow is None", () => {
      const ctx = makeCtx();
      drawWeaponEnchantGlow(asCtx(ctx), 100, 100, 20, 0, EnchantVisualGlow.None, 1, 1000);
      expect(ctx.moveTo).toHaveBeenCalled();
      expect(ctx.lineTo).toHaveBeenCalled();
      expect(ctx.stroke).toHaveBeenCalledTimes(2); // guard + blade
    });

    it("renders FaintWhite (+4..+6) shimmer overlay", () => {
      const ctx = makeCtx();
      drawWeaponEnchantGlow(asCtx(ctx), 100, 100, 20, 0, EnchantVisualGlow.FaintWhite, 1, 1000);
      expect(ctx.stroke).toHaveBeenCalledTimes(3); // guard + blade + glow
    });

    it("renders LuminescentBlue (+7..+9) dual plasma aura and electric core", () => {
      const ctx = makeCtx();
      drawWeaponEnchantGlow(asCtx(ctx), 100, 100, 20, 0, EnchantVisualGlow.LuminescentBlue, 1, 1000);
      expect(ctx.stroke).toHaveBeenCalledTimes(4); // guard + blade + glow + core
    });

    it("renders RadiantRed (+10..+12) ruby flame flare", () => {
      const ctx = makeCtx();
      drawWeaponEnchantGlow(asCtx(ctx), 100, 100, 20, 0, EnchantVisualGlow.RadiantRed, 1, 1000);
      expect(ctx.stroke).toHaveBeenCalledTimes(4);
    });

    it("renders AbyssalPurple (+13..+15) void miasma", () => {
      const ctx = makeCtx();
      drawWeaponEnchantGlow(asCtx(ctx), 100, 100, 20, 0, EnchantVisualGlow.AbyssalPurple, 1, 1000);
      expect(ctx.stroke).toHaveBeenCalledTimes(4);
    });

    it("renders CelestialGold (+16..+20) divine sunburst with orbiting starlight sparkles", () => {
      const ctx = makeCtx();
      drawWeaponEnchantGlow(asCtx(ctx), 100, 100, 20, 0, EnchantVisualGlow.CelestialGold, 1, 1000);
      expect(ctx.stroke).toHaveBeenCalledTimes(4); // guard + blade + glow + core
      expect(ctx.fill).toHaveBeenCalledTimes(3); // 3 sparkles
    });
  });

  describe("drawPlayers", () => {
    it("renders players with level prefix and racial scale", () => {
      const ctx = makeCtx();
      const players = new Map<string, any>([
        [
          "p1",
          {
            id: "p1",
            x: 10,
            y: 20,
            radius: 2,
            name: "VesperKnight",
            level: 55,
            race: Race.Dwarf,
            enchantGlow: EnchantVisualGlow.CelestialGold,
            currentHealth: 1000,
            maxHealth: 1000,
          },
        ],
      ]);

      drawPlayers(asCtx(ctx), players, "p1", 10, 1);
      expect(ctx.fillText).toHaveBeenCalledWith(
        "[Lv.55] VesperKnight",
        expect.any(Number),
        expect.any(Number),
      );
    });
  });
});
