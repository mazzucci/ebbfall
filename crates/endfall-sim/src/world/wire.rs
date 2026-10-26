//! Commands on the wire: a compact list of numbers per command (`code`, then its fields; kinds, upgrades and
//! abilities as their table index, ids and tile coordinates as whole numbers, points as numbers; a list carries its
//! length first), so a command survives JSON exactly and the network layer never needs to know its shape. Decoding
//! is total: anything malformed (a bad code, a missing field, a fraction where a whole number belongs, an index past
//! the end of its table, a list too long) gives None, never a panic (a release build aborts on panic, and a bad command
//! would stop every client at once).

use super::*;

/// The most units one command may name (a selection is far smaller; this bounds what the wire can ask for).
pub const MAX_UNITS: usize = 255;

impl Command {
    /// The command as numbers: `[code, fields...]`.
    pub fn encode(&self) -> Vec<f64> {
        let id = |i: Id| i as f64;
        let opt = |i: Option<Id>| i.map_or(0.0, |i| i as f64);
        let list = |us: &[Id]| {
            let mut v = vec![us.len().min(MAX_UNITS) as f64];
            v.extend(us.iter().take(MAX_UNITS).map(|&u| u as f64));
            v
        };
        let mut out = vec![self.code() as f64];
        match self {
            Command::Move { unit, x, y } | Command::AttackMove { unit, x, y } => {
                out.extend([id(*unit), *x, *y])
            }
            Command::Attack { unit, target } => out.extend([id(*unit), id(*target)]),
            Command::Stop { unit } | Command::Hold { unit } => out.push(id(*unit)),
            Command::Gather { unit, node } => out.extend([id(*unit), id(*node)]),
            Command::Build { unit, bldg } | Command::Repair { unit, bldg } => {
                out.extend([id(*unit), id(*bldg)])
            }
            Command::Place {
                kind,
                tx,
                ty,
                builder,
            } => out.extend([kind.index() as f64, *tx as f64, *ty as f64, opt(*builder)]),
            Command::Queue { bldg, kind } => out.extend([id(*bldg), kind.index() as f64]),
            Command::CancelQueue { bldg, index } => out.extend([id(*bldg), *index as f64]),
            Command::Research { bldg, up } => out.extend([id(*bldg), up.index() as f64]),
            Command::CancelResearch { bldg } | Command::CancelConstruction { bldg } => {
                out.push(id(*bldg))
            }
            Command::Rally { bldg, x, y, node } => out.extend([id(*bldg), *x, *y, opt(*node)]),
            Command::Formation { units, x, y } | Command::GroupAttackMove { units, x, y } => {
                out.extend(list(units));
                out.extend([*x, *y]);
            }
            Command::Cast { units, ability } => {
                out.extend(list(units));
                out.push(ability.index() as f64);
            }
            Command::Concede => {}
        }
        out
    }

    /// One command from the front of `w`, and how many numbers it took; None if `w` does not start with a whole,
    /// valid command.
    pub fn decode(w: &[f64]) -> Option<(Command, usize)> {
        let mut r = Reader { w, at: 0 };
        let code = r.whole(Command::KINDS as u64 - 1)? as u8;
        let cmd = match code {
            0 => Command::Move {
                unit: r.id()?,
                x: r.num()?,
                y: r.num()?,
            },
            1 => Command::AttackMove {
                unit: r.id()?,
                x: r.num()?,
                y: r.num()?,
            },
            2 => Command::Attack {
                unit: r.id()?,
                target: r.id()?,
            },
            3 => Command::Stop { unit: r.id()? },
            4 => Command::Hold { unit: r.id()? },
            5 => Command::Gather {
                unit: r.id()?,
                node: r.id()?,
            },
            6 => Command::Build {
                unit: r.id()?,
                bldg: r.id()?,
            },
            7 => Command::Repair {
                unit: r.id()?,
                bldg: r.id()?,
            },
            8 => Command::Place {
                kind: *BLDG_KINDS.get(r.whole(u64::MAX)? as usize)?,
                tx: r.int()?,
                ty: r.int()?,
                builder: r.opt_id()?,
            },
            9 => Command::Queue {
                bldg: r.id()?,
                kind: *UNIT_KINDS.get(r.whole(u64::MAX)? as usize)?,
            },
            10 => Command::CancelQueue {
                bldg: r.id()?,
                index: r.whole(u32::MAX as u64)? as usize,
            },
            11 => Command::Research {
                bldg: r.id()?,
                up: *UPGRADES.get(r.whole(u64::MAX)? as usize)?,
            },
            12 => Command::CancelResearch { bldg: r.id()? },
            13 => Command::CancelConstruction { bldg: r.id()? },
            14 => Command::Rally {
                bldg: r.id()?,
                x: r.num()?,
                y: r.num()?,
                node: r.opt_id()?,
            },
            15 => Command::Formation {
                units: r.ids()?,
                x: r.num()?,
                y: r.num()?,
            },
            16 => Command::Cast {
                units: r.ids()?,
                ability: *ABILITIES.get(r.whole(u64::MAX)? as usize)?,
            },
            17 => Command::GroupAttackMove {
                units: r.ids()?,
                x: r.num()?,
                y: r.num()?,
            },
            18 => Command::Concede,
            _ => return None,
        };
        Some((cmd, r.at))
    }

    /// Every command in `w`, front to back; stops at the first that does not decode (the rest of a bad message
    /// cannot be trusted to line up).
    pub fn decode_all(mut w: &[f64]) -> Vec<Command> {
        let mut out = Vec::new();
        while !w.is_empty() {
            let Some((c, n)) = Command::decode(w) else {
                break;
            };
            out.push(c);
            w = &w[n..];
        }
        out
    }
}

/// Reads numbers off the front of a slice, each check failing with None.
struct Reader<'a> {
    w: &'a [f64],
    at: usize,
}

impl Reader<'_> {
    fn next(&mut self) -> Option<f64> {
        let v = *self.w.get(self.at)?;
        self.at += 1;
        v.is_finite().then_some(v)
    }
    /// A finite number (a point).
    fn num(&mut self) -> Option<f64> {
        self.next()
    }
    /// A whole number from 0 to `max`.
    fn whole(&mut self, max: u64) -> Option<u64> {
        let v = self.next()?;
        (v >= 0.0 && v.fract() == 0.0 && v <= max as f64 && v <= u32::MAX as f64)
            .then_some(v as u64)
    }
    /// A whole number that fits an i32 (tile coordinates may be negative: `World::apply` checks the rest).
    fn int(&mut self) -> Option<i32> {
        let v = self.next()?;
        (v.fract() == 0.0 && v >= i32::MIN as f64 && v <= i32::MAX as f64).then_some(v as i32)
    }
    fn id(&mut self) -> Option<Id> {
        self.whole(u32::MAX as u64).map(|v| v as Id)
    }
    /// 0 for none.
    fn opt_id(&mut self) -> Option<Option<Id>> {
        self.id().map(|i| (i != 0).then_some(i))
    }
    fn ids(&mut self) -> Option<Vec<Id>> {
        let n = self.whole(MAX_UNITS as u64)? as usize;
        (0..n).map(|_| self.id()).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Mulberry32;

    /// One of every kind of command, with awkward values (big ids, negative tiles, fractional points, empty lists).
    fn samples() -> Vec<Command> {
        vec![
            Command::Move {
                unit: 7,
                x: 12.5,
                y: -0.25,
            },
            Command::AttackMove {
                unit: u32::MAX,
                x: 1e6,
                y: 3.0,
            },
            Command::Attack { unit: 1, target: 2 },
            Command::Stop { unit: 3 },
            Command::Hold { unit: 4 },
            Command::Gather { unit: 5, node: 6 },
            Command::Build { unit: 8, bldg: 9 },
            Command::Repair { unit: 10, bldg: 11 },
            Command::Place {
                kind: BLDG_KINDS[BLDG_KINDS.len() - 1],
                tx: -3,
                ty: 40,
                builder: None,
            },
            Command::Place {
                kind: BLDG_KINDS[0],
                tx: 5,
                ty: 6,
                builder: Some(12),
            },
            Command::Queue {
                bldg: 13,
                kind: UNIT_KINDS[UNIT_KINDS.len() - 1],
            },
            Command::CancelQueue { bldg: 14, index: 4 },
            Command::Research {
                bldg: 15,
                up: UPGRADES[UPGRADES.len() - 1],
            },
            Command::CancelResearch { bldg: 16 },
            Command::CancelConstruction { bldg: 17 },
            Command::Rally {
                bldg: 18,
                x: 100.0,
                y: 200.0,
                node: Some(19),
            },
            Command::Rally {
                bldg: 18,
                x: 100.0,
                y: 200.0,
                node: None,
            },
            Command::Formation {
                units: vec![1, 2, 3],
                x: 64.0,
                y: 96.0,
            },
            Command::Formation {
                units: vec![],
                x: 0.0,
                y: 0.0,
            },
            Command::Cast {
                units: vec![20, 21],
                ability: ABILITIES[ABILITIES.len() - 1],
            },
            Command::GroupAttackMove {
                units: vec![22],
                x: 5.5,
                y: 6.5,
            },
            Command::Concede,
        ]
    }

    #[test]
    fn every_command_round_trips_and_a_batch_decodes_in_order() {
        let all = samples();
        let mut seen = [false; Command::KINDS as usize];
        let mut batch = Vec::new();
        for c in &all {
            seen[c.code() as usize] = true;
            let w = c.encode();
            assert_eq!(Command::decode(&w), Some((c.clone(), w.len())), "{c:?}");
            // Through JSON text and back (what the wire does): the same numbers.
            let text = format!("{w:?}");
            let back: Vec<f64> = text
                .trim_matches(['[', ']'])
                .split(", ")
                .filter(|s| !s.is_empty())
                .map(|s| s.parse().unwrap())
                .collect();
            assert_eq!(back, w);
            batch.extend(w);
        }
        assert!(seen.iter().all(|&s| s), "a sample of every kind of command");
        assert_eq!(Command::decode_all(&batch), all);
    }

    #[test]
    fn malformed_input_is_refused_never_a_panic() {
        let bad: [&[f64]; 10] = [
            &[],
            &[99.0],                    // no such command
            &[0.5],                     // a fractional code
            &[0.0, 1.0, 2.0],           // a field missing
            &[0.0, f64::NAN, 1.0, 2.0], // not a number
            &[0.0, -1.0, 1.0, 2.0],     // a negative id
            &[0.0, 1.5, 1.0, 2.0],      // a fractional id
            &[9.0, 1.0, 1e9],           // a kind past the table
            &[15.0, 300.0],             // a list too long
            &[0.0, 1.0, f64::INFINITY, 2.0],
        ];
        for w in bad {
            assert_eq!(Command::decode(w), None, "{w:?}");
        }
        // Random numbers, and random small integers (which hit real codes): never a panic, and whatever decodes
        // encodes back to exactly what was read.
        let mut r = Mulberry32::new(7);
        for i in 0..20000 {
            let n = 1 + r.below(12) as usize;
            let w: Vec<f64> = (0..n)
                .map(|_| {
                    if i % 2 == 0 {
                        r.below(20) as f64
                    } else {
                        (r.next_u32() as f64 / u32::MAX as f64 - 0.3) * 1e5
                    }
                })
                .collect();
            if let Some((c, used)) = Command::decode(&w) {
                assert_eq!(c.encode(), w[..used].to_vec(), "{w:?}");
            }
            let _ = Command::decode_all(&w);
        }
    }
}
