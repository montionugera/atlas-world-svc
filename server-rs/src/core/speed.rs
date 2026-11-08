//! F-184 + F-185: the one place the game's pace and unit are set. 1 game unit = 1 m. The
//! player runs at 3 m/s (was 20); every other speed (mobs, dash, projectiles, knockback,
//! steering caps) is multiplied by the same factor so relative feel is unchanged. Distances,
//! damage, cooldowns and the tick rate are NOT scaled. Write speeds as
//! `scaled_speed(<pre-F-184 value in 0.1 m units/s>)`; the guard test below fails on a bare
//! speed literal in the movement path.

/// F-184 pace factor: 20 -> 3.
pub const PACE_SCALE: f32 = 0.15;

/// F-185: old server units were 0.1 m, so lengths and speeds are divided by 10.
pub const UNIT_SCALE: f32 = 0.1;

/// Old speed (0.1 m units/s) -> m/s: 200 -> 3.0 m/s (0.015 per old unit).
pub const SPEED_SCALE: f32 = PACE_SCALE * UNIT_SCALE;

/// Convert a pre-F-184 speed (any unit) into the live pace.
pub fn scaled_speed(old: f32) -> f32 {
    old * SPEED_SCALE
}

/// A projectile lifetime that was sized for a pre-F-184 speed, stretched so the
/// slower projectile still covers the same range before despawning. Only the pace
/// factor applies: the unit change shrinks speed and range together.
pub fn scaled_lifetime(old_sec: f32) -> f32 {
    old_sec / PACE_SCALE
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Non-test source of every file where speeds enter the simulation.
    const MOVEMENT_FILES: &[(&str, &str)] = &[
        ("ecs/components.rs", include_str!("../ecs/components.rs")),
        ("content/stats.rs", include_str!("../content/stats.rs")),
        (
            "content/bestiary.rs",
            include_str!("../content/bestiary.rs"),
        ),
        (
            "systems/steering.rs",
            include_str!("../systems/steering.rs"),
        ),
        ("systems/live.rs", include_str!("../systems/live.rs")),
        (
            "systems/skill_execution.rs",
            include_str!("../systems/skill_execution.rs"),
        ),
        ("systems/mob_ai.rs", include_str!("../systems/mob_ai.rs")),
        (
            "systems/mob_lifecycle.rs",
            include_str!("../systems/mob_lifecycle.rs"),
        ),
        (
            "systems/player_input.rs",
            include_str!("../systems/player_input.rs"),
        ),
        ("systems/combat.rs", include_str!("../systems/combat.rs")),
        (
            "systems/projectile.rs",
            include_str!("../systems/projectile.rs"),
        ),
        (
            "systems/separation.rs",
            include_str!("../systems/separation.rs"),
        ),
    ];

    #[test]
    fn scale_maps_old_player_speed_to_3_mps() {
        assert!((scaled_speed(200.0) - 3.0).abs() < 1e-6);
        assert!((scaled_lifetime(0.15) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn no_raw_speed_literal_in_movement_path() {
        let mut bad = Vec::new();
        for (name, src) in MOVEMENT_FILES {
            let prod = src.split("#[cfg(test)]").next().unwrap();
            for (i, line) in prod.lines().enumerate() {
                let l = line.trim();
                if l.starts_with("//") {
                    continue;
                }
                let lower = l.to_lowercase();
                let speedy = lower.contains("speed") || lower.contains("lifetime");
                if !speedy
                    || lower.contains("scaled_")
                    || lower.contains("melee_swing")
                    || lower.contains("multiplier")
                {
                    continue;
                }
                // A bare non-zero numeric literal assigned/defaulted on a speed line.
                let has_literal = l
                    .split(|c: char| !(c.is_ascii_digit() || c == '.'))
                    .any(|t| t.parse::<f32>().is_ok_and(|v| v > 1.0) && t.contains('.'));
                if has_literal {
                    bad.push(format!("{name}:{}: {l}", i + 1));
                }
            }
        }
        assert!(
            bad.is_empty(),
            "raw speed literals (wrap in scaled_speed): {bad:#?}"
        );
    }
}
