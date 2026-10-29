use server_rs::content::mmorpg::{
    base_exp_to_next_level, job_exp_to_next_level, simulate_castle_siege, simulate_job_vs_mob,
    MMORPG_CATALOG,
};
use server_rs::storage::PrimaryStats;

fn main() {
    println!("================================================================================");
    println!("  ATLAS WORLD — SERVER-RS HEADLESS MMORPG GROWTH, JOB & GVG SIEGE SIMULATOR");
    println!("================================================================================");
    println!(
        "Loaded Catalogs: {} Jobs | {} Mobs | {} Cards | {} Quests | {} Castles\n",
        MMORPG_CATALOG.jobs.len(),
        MMORPG_CATALOG.mobs.len(),
        MMORPG_CATALOG.cards.len(),
        MMORPG_CATALOG.quests.len(),
        MMORPG_CATALOG.castles.len()
    );

    println!("--- 1. DUAL-TRACK EXP CURVE (BASE LV 1..99 & JOB LV 1..50) ---");
    for &(blv, jlv, tier) in &[
        (1, 1, 0),
        (10, 10, 0),
        (20, 15, 1),
        (40, 40, 1),
        (60, 30, 2),
        (99, 50, 2),
    ] {
        println!(
            "  Base Lv {:>2} -> {:>3} BaseEXP | Job Lv {:>2} (Tier {}) -> {:>4} JobEXP",
            blv,
            base_exp_to_next_level(blv),
            jlv,
            tier,
            job_exp_to_next_level(jlv, tier)
        );
    }

    println!("\n--- 2. PVE JOB PROGRESSION & ZONE LEVELING PACING ---");
    println!(
        "{:<12} {:<6} {:<18} {:>8} {:>8} {:>7} {:>8} {:>10}",
        "Job", "Lv/JLv", "Target Mob", "PlayerDPS", "TTK(s)", "R-Ratio", "Verdict", "Min/Level"
    );
    println!("{}", "-".repeat(84));

    let scenarios = [
        (
            "novice",
            6,
            5,
            PrimaryStats {
                str: 8,
                agi: 6,
                vit: 6,
                int: 1,
                dex: 6,
                luk: 1,
            },
            Some("dagger"),
            0,
            "forest_slime",
        ),
        (
            "swordman",
            19,
            15,
            PrimaryStats {
                str: 28,
                agi: 15,
                vit: 24,
                int: 1,
                dex: 15,
                luk: 1,
            },
            Some("basic_sword"),
            3,
            "boar",
        ),
        (
            "mage",
            19,
            15,
            PrimaryStats {
                str: 1,
                agi: 12,
                vit: 12,
                int: 34,
                dex: 20,
                luk: 1,
            },
            Some("magic_staff"),
            3,
            "boar",
        ),
        (
            "archer",
            33,
            28,
            PrimaryStats {
                str: 10,
                agi: 35,
                vit: 18,
                int: 5,
                dex: 45,
                luk: 1,
            },
            Some("great_bow"),
            5,
            "skeleton_soldier",
        ),
        (
            "knight",
            63,
            35,
            PrimaryStats {
                str: 72,
                agi: 40,
                vit: 68,
                int: 10,
                dex: 42,
                luk: 1,
            },
            Some("scythe"),
            9,
            "orc_warlord",
        ),
    ];

    for (job_id, blv, jlv, alloc, weapon, refine, mob_id) in scenarios {
        if let Some(res) = simulate_job_vs_mob(job_id, blv, jlv, &alloc, weapon, refine, mob_id) {
            println!(
                "{:<12} {:>2}/{:<3} {:<18} {:>8.1} {:>8.2} {:>7.2} {:>8} {:>9.1}m",
                res.job_id,
                res.base_level,
                res.job_level,
                res.mob_id,
                res.player_dps,
                res.ttk_seconds,
                res.r_ratio,
                res.verdict,
                res.minutes_to_next_base_level
            );
        }
    }

    println!("\n--- 3. WAR OF EMPERIUM (GVG CASTLE SIEGE) BREACH SIMULATION ---");
    for &attackers in &[5_u32, 15, 30, 50] {
        if let Some(siege) = simulate_castle_siege("castle_valkyrie_01", attackers, 65) {
            println!(
                "  Castle: {} | Attackers: {:>2} | Barricades: {:>5.1}s | Emperium TTK: {:>5.1}s | Total Breach: {:>4.2} min",
                siege.castle_id,
                siege.attacker_count,
                siege.barricade_clear_seconds,
                siege.emperium_ttk_seconds,
                siege.total_siege_breach_minutes
            );
        }
    }
}
