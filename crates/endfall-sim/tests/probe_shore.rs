use endfall_sim::data::*;
use endfall_sim::map::{Foot, Ground, MapKind, MapSize};
use endfall_sim::path::{PathScratch, astar};
use endfall_sim::world::World;
#[test]
#[ignore]
fn probe_shore() {
    let seed: u32 = std::env::var("SEED").ok().and_then(|s| s.parse().ok()).unwrap_or(1);
    let w = World::with_size(seed, 1, MapKind::Shore, MapSize::DUEL, 0, &[&HUMANS, &VAEL]);
    let m = &w.map;
    for y in 0..m.h {
        let row: String = (0..m.w).map(|x| {
            let i = m.idx(x, y);
            let core = |b: &(i32, i32)| x >= b.0 && x < b.0 + 4 && y >= b.1 && y < b.1 + 4;
            if w.bldgs.iter().any(|b| x >= b.tx && x < b.tx + b.w && y >= b.ty && y < b.ty + b.h) { return if w.bldgs.iter().any(|b| b.team == 1 && x >= b.tx && x < b.tx + b.w && y >= b.ty && y < b.ty + b.h) { 'V' } else { 'H' }; }
            if m.basins.iter().any(core) { return 'b'; }
            if m.bases.iter().any(core) { return 'c'; }
            if m.occ[i] < 0 { return if m.nodes.iter().any(|n| n.ether && -(n.id as i32) == m.occ[i]) { 'E' } else { '*' }; }
            if m.rock[i] != 0 { return '#'; }
            match m.ground(x, y, 0) { Ground::Land => '.', Ground::Shallow => '-', Ground::Deep => '~' }
        }).collect();
        println!("{row}");
    }
    println!("bases {:?} basins {:?} expansions {}", m.bases, m.basins, m.expansions.len());
    let mut s = PathScratch::new(m.rock.len());
    let len = |p: &Option<Vec<endfall_sim::path::Pt>>, from: (i32, i32)| p.as_ref().map(|p| { let mut l = 0.0; let mut a = (from.0 as f64 * 32.0 + 16.0, from.1 as f64 * 32.0 + 16.0); for q in p { l += ((q.x - a.0).powi(2) + (q.y - a.1).powi(2)).sqrt(); a = (q.x, q.y); } l / 32.0 });
    let side = |b: (i32, i32)| (b.0 - 1, b.1 + 1);
    let walk = Foot { class: Move::Walk, water: 0 };
    let amph = Foot { class: Move::Amph, water: 0 };
    let (cove0, cove1) = (side(m.bases[0]), (m.bases[1].0 + 5, m.bases[1].1 + 1));
    let basin1 = (m.basins[1].0 + 1, m.basins[1].1 - 1);
    let basin0 = (m.basins[0].0 + 1, m.basins[0].1 - 1);
    for (name, from, to) in [("cove0 -> cove1", cove0, cove1), ("cove0 -> basin(seat1)", cove0, (m.bases[1].0, m.bases[1].1)), ("basin(seat1) -> cove0", (m.bases[1].0, m.bases[1].1), cove0), ("own cove -> own basin", cove0, basin0), ("basin1 probe", cove0, basin1)] {
        let wp = astar(m, walk, &mut s, from.0, from.1, to.0, to.1);
        let ap = astar(m, amph, &mut s, from.0, from.1, to.0, to.1);
        println!("{name}: walk {:?} tiles, amph {:?} tiles, straight {:.1}", len(&wp, from), len(&ap, from), (((to.0 - from.0).pow(2) + (to.1 - from.1).pow(2)) as f64).sqrt());
    }
}
