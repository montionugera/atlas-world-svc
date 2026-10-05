use criterion::{criterion_group, criterion_main, BenchmarkId, Criterion};
use server_rs::AtlasSimulation;
use std::time::Duration;

fn bench_sim_scale(c: &mut Criterion) {
    let mut group = c.benchmark_group("simulation_step");
    group.sample_size(20);
    group.measurement_time(Duration::from_secs(3));

    for &entity_count in &[1_000, 10_000, 20_000] {
        let player_count = entity_count / 10;
        let mob_count = entity_count - player_count;

        let mut sim =
            AtlasSimulation::with_arena(0x1337c0de, 2000.0, 2000.0, player_count, mob_count);

        group.bench_with_input(
            BenchmarkId::from_parameter(entity_count),
            &entity_count,
            |b, _| {
                b.iter(|| {
                    sim.step();
                });
            },
        );
    }

    group.finish();
}

criterion_group!(benches, bench_sim_scale);
criterion_main!(benches);
