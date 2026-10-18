use serde::{Deserialize, Serialize};

/// Canonical region width and height in world units (`4000 × 4000`), matching compiled zone maps.
pub const REGION_SIZE_UNITS: f32 = 4000.0;

/// Per-player Area-of-Interest (AOI) enter radius in world units (`1.5 × SERVER_RS_VIEWPORT`).
pub const AOI_ENTER_RADIUS_UNITS: f32 = 600.0;

/// Per-player Area-of-Interest (AOI) exit radius in world units (includes 40-unit hysteresis band).
pub const AOI_EXIT_RADIUS_UNITS: f32 = 640.0;

/// Distance from a region edge within which entities are replicated as border ghosts to the neighbour.
pub const BORDER_GHOST_BAND_UNITS: f32 = 250.0;

/// Hysteresis distance past a region border required to trigger seamless authority handoff.
pub const HANDOFF_HYSTERESIS_UNITS: f32 = 32.0;

/// Authoritative simulation tick rate in Hz.
pub const WORLD_TICK_RATE_HZ: u32 = 20;

/// Authoritative frame budget per tick in milliseconds (`1000 / 20 = 50 ms`).
pub const WORLD_TICK_BUDGET_MS: u64 = 50;

/// Target upper bound for simulation + serialization work per tick in milliseconds.
pub const SIM_WARN_BUDGET_MS: f64 = 15.0;

/// Identifier of the chosen world state persistence strategy (`E-004` Slice 2).
pub const WORLD_STATE_STORE_KIND: &str = "world-state-store-json-and-nakama";

/// Identifier of the chosen region border crossing mechanism (`E-004` Slice 2).
pub const CROSSING_MECHANISM: &str = "border-ghost-and-seamless-room-handoff";

/// Authoritative world model parameters shared across `E-004` Slices 3–10.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WorldModelConfig {
    pub region_size_units: f32,
    pub aoi_enter_radius_units: f32,
    pub aoi_exit_radius_units: f32,
    pub border_ghost_band_units: f32,
    pub handoff_hysteresis_units: f32,
    pub tick_rate_hz: u32,
    pub tick_budget_ms: u64,
    pub sim_warn_budget_ms: f64,
    pub store_kind: String,
    pub crossing_mechanism: String,
}

impl Default for WorldModelConfig {
    fn default() -> Self {
        Self {
            region_size_units: REGION_SIZE_UNITS,
            aoi_enter_radius_units: AOI_ENTER_RADIUS_UNITS,
            aoi_exit_radius_units: AOI_EXIT_RADIUS_UNITS,
            border_ghost_band_units: BORDER_GHOST_BAND_UNITS,
            handoff_hysteresis_units: HANDOFF_HYSTERESIS_UNITS,
            tick_rate_hz: WORLD_TICK_RATE_HZ,
            tick_budget_ms: WORLD_TICK_BUDGET_MS,
            sim_warn_budget_ms: SIM_WARN_BUDGET_MS,
            store_kind: WORLD_STATE_STORE_KIND.to_string(),
            crossing_mechanism: CROSSING_MECHANISM.to_string(),
        }
    }
}

impl WorldModelConfig {
    /// Validates geometric and timing invariants required by the continuous open world model.
    pub fn validate(&self) -> Result<(), String> {
        if self.region_size_units < 1000.0 {
            return Err("region_size_units must be at least 1000.0".to_string());
        }
        if self.aoi_enter_radius_units <= 200.0 {
            return Err(
                "aoi_enter_radius_units must exceed half of client viewport (200.0)".to_string(),
            );
        }
        if self.aoi_exit_radius_units <= self.aoi_enter_radius_units {
            return Err(
                "aoi_exit_radius_units must be greater than aoi_enter_radius_units for hysteresis"
                    .to_string(),
            );
        }
        if self.region_size_units < self.aoi_exit_radius_units * 2.0 {
            return Err("region_size_units must be at least 2x aoi_exit_radius_units".to_string());
        }
        if self.border_ghost_band_units <= self.handoff_hysteresis_units {
            return Err("border_ghost_band_units must exceed handoff_hysteresis_units".to_string());
        }
        if self.tick_rate_hz == 0 || self.tick_budget_ms == 0 {
            return Err("tick_rate_hz and tick_budget_ms must be positive".to_string());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_world_model_config_satisfies_all_invariants() {
        let cfg = WorldModelConfig::default();
        assert_eq!(cfg.validate(), Ok(()));
        assert_eq!(cfg.region_size_units, 4000.0);
        assert_eq!(cfg.aoi_enter_radius_units, 600.0);
        assert_eq!(cfg.aoi_exit_radius_units, 640.0);
        assert_eq!(cfg.border_ghost_band_units, 250.0);
        assert_eq!(cfg.handoff_hysteresis_units, 32.0);
        assert_eq!(cfg.tick_rate_hz, 20);
        assert_eq!(cfg.tick_budget_ms, 50);
    }

    #[test]
    fn decision_record_documents_region_size_store_crossing_budget_and_f027_f081_inputs() {
        let adr = include_str!(
            "../../../docs/superpowers/decisions/2026-10-18-e004-world-model-decision.md"
        );
        assert!(adr.contains("F-027"));
        assert!(adr.contains("F-081"));
        assert!(adr.contains("4000"));
        assert!(adr.contains("WorldStateStore"));
        assert!(adr.contains("AOI_ENTER_RADIUS_UNITS"));
        assert!(adr.contains("BORDER_GHOST_BAND_UNITS"));
        assert!(adr.contains("HANDOFF_HYSTERESIS_UNITS"));
    }
}
