import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { DungeonHUD } from "./DungeonHUD";
import { DungeonFloorProgress, BossEncounterHUD } from "../types/game";

describe("DungeonHUD", () => {
  it("renders nothing when neither dungeonProgress nor bossEncounter is present", () => {
    const { container } = render(<DungeonHUD />);
    expect(container.firstChild).toBeNull();
  });

  it("renders spire floor navigation and mob clearance progress", () => {
    const progress: DungeonFloorProgress = {
      dungeonId: "millcross-crypts",
      dungeonName: "Millcross Crypts",
      currentFloor: 2,
      totalFloors: 5,
      mobsKilled: 8,
      mobsRequired: 15,
      gateUnlocked: false,
      bossFloor: false,
    };

    render(<DungeonHUD dungeonProgress={progress} />);

    expect(screen.getByTestId("dungeon-hud")).toBeInTheDocument();
    expect(screen.getByText(/Millcross Crypts/i)).toBeInTheDocument();
    expect(screen.getByTestId("floor-indicator")).toHaveTextContent(
      "FLOOR 2 / 5",
    );
    expect(screen.getByTestId("mob-clear-count")).toHaveTextContent(
      "8 / 15 Mobs",
    );
    expect(screen.getByTestId("gate-status")).toHaveTextContent(/Gate Locked/i);
    expect(screen.queryByTestId("advance-floor-btn")).toBeNull();
  });

  it("renders unlocked gate and triggers onAdvanceFloor callback when clicked", () => {
    const progress: DungeonFloorProgress = {
      dungeonId: "gilded-flues-spire",
      dungeonName: "Gilded Flues Spire",
      currentFloor: 4,
      totalFloors: 5,
      mobsKilled: 20,
      mobsRequired: 20,
      gateUnlocked: true,
      bossFloor: false,
    };

    const handleAdvance = jest.fn();
    render(
      <DungeonHUD dungeonProgress={progress} onAdvanceFloor={handleAdvance} />,
    );

    expect(screen.getByTestId("gate-status")).toHaveTextContent(
      /Gate Unlocked/i,
    );
    const advanceBtn = screen.getByTestId("advance-floor-btn");
    expect(advanceBtn).toBeInTheDocument();

    fireEvent.click(advanceBtn);
    expect(handleAdvance).toHaveBeenCalledTimes(1);
  });

  it("renders boss encounter card with enrage countdown and phase transitions", () => {
    const boss: BossEncounterHUD = {
      bossId: "boss_drakon_lord",
      name: "Drakon Lord Ignis",
      currentHp: 1250000,
      maxHp: 2500000,
      phase: "phase2_empowered",
      isEnraged: false,
      enrageRemainingSecs: 145,
      empoweredSkillUnlocked: true,
    };

    render(<DungeonHUD bossEncounter={boss} />);

    expect(screen.getByTestId("boss-encounter-card")).toBeInTheDocument();
    expect(screen.getByTestId("boss-name")).toHaveTextContent(
      "Drakon Lord Ignis",
    );
    expect(screen.getByTestId("boss-phase-badge")).toHaveTextContent(
      "PHASE 2: EMPOWERED",
    );
    expect(screen.getByTestId("boss-hp-text")).toHaveTextContent(
      "1,250,000 / 2,500,000 (50.0%)",
    );
    expect(screen.getByTestId("enrage-timer")).toHaveTextContent(
      "Enrage in: 02:25",
    );
    expect(screen.getByTestId("empowered-indicator")).toBeInTheDocument();
  });

  it("renders enraged status when boss hits berserk enrage timer", () => {
    const boss: BossEncounterHUD = {
      bossId: "boss_drakon_lord",
      name: "Drakon Lord Ignis",
      currentHp: 350000,
      maxHp: 2500000,
      phase: "enraged",
      isEnraged: true,
      enrageRemainingSecs: 0,
      empoweredSkillUnlocked: true,
    };

    render(<DungeonHUD bossEncounter={boss} />);

    expect(screen.getByTestId("boss-phase-badge")).toHaveTextContent(
      "BERSERK / ENRAGED",
    );
    expect(screen.getByTestId("enrage-timer")).toHaveTextContent(
      /BOSS ENRAGED/i,
    );
  });
});
